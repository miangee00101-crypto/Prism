'use strict';
const crypto = require('crypto');

const KEYS = ['4k', '1440p', '1080p', '720p', '576p', '480p', '360p', 'others'];
const LABEL = { '4k': '4K', '1440p': '1440p', '1080p': '1080p', '720p': '720p', '576p': '576p', '480p': '480p', '360p': '360p', others: 'Unknown' };
const ALIAS = { '2160p': '4k', uhd: '4k', '536p': '576p', other: 'others', unknown: 'others' };

const normKey = (s) => {
  s = String(s || '').trim().toLowerCase().replace(/\s+/g, '');
  s = ALIAS[s] || s;
  return KEYS.includes(s) ? s : null;
};

// ---------- config ----------
function cleanBase(u) {
  u = String(u || '').trim().replace(/^stremio:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) return null;
  u = u.split('#')[0].split('?')[0].replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
  try { new URL(u); } catch { return null; }
  return u;
}

function isPrivateHost(base) {
  const h = new URL(base).hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h === '[::1]' ||
    /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

function decodeConfig(str) {
  try {
    const c = JSON.parse(Buffer.from(String(str), 'base64url').toString('utf8'));
    const u = cleanBase(c.u);
    if (!u || isPrivateHost(u)) return null;
    const uniq = (a) => [...new Set(a)];
    return {
      u,
      n: String(c.n || '').trim().slice(0, 60) || 'Prism',
      q: uniq((Array.isArray(c.q) ? c.q : []).map(normKey).filter(Boolean)),
      o: uniq((Array.isArray(c.o) ? c.o : []).map(normKey).filter(Boolean)),
      s: ['asc', 'desc', 'off'].includes(c.s) ? c.s : 'desc',
    };
  } catch { return null; }
}

const addonId = (str) => 'community.prism.' + crypto.createHash('sha1').update(String(str)).digest('hex').slice(0, 12);

function streamInfo(m) {
  const r = (m.resources || []).find((x) => (typeof x === 'string' ? x : x && x.name) === 'stream');
  if (!r) return null;
  const obj = typeof r === 'object' ? r : {};
  return { types: obj.types || m.types || ['movie', 'series'], idPrefixes: obj.idPrefixes || m.idPrefixes || null };
}

// ---------- parsing ----------
const L = '(?<![A-Za-z0-9])';
const R = '(?![A-Za-z0-9])';
const rx = (p, post = R) => new RegExp(L + '(?:' + p + ')' + post, 'i');

const RES = [['4k', rx('2160p|4k')], ['1440p', rx('1440p')], ['1080p', rx('1080p')], ['720p', rx('720p')], ['576p', rx('576p')], ['480p', rx('480p')], ['360p', rx('360p')]];
const SRC = [
  ['REMUX', rx('(?:bd)?remux')], ['BluRay', rx('blu[-. _]?ray|bdrip|brrip')], ['WEB-DL', rx('web[-. _]?dl')],
  ['WEBRip', rx('web[-. _]?rip')], ['WEB', rx('web')], ['HDTV', rx('hdtv')], ['DVD', rx('dvd(?:rip|scr)?')], ['CAM', rx('cam(?:rip)?|hdcam')],
];
const CODEC = [['HEVC', rx('x265|hevc|h[ ._-]?265')], ['H.264', rx('x264|h[ ._-]?264|avc')], ['AV1', rx('av1')]];
const NOLET = '(?![A-Za-z])';
const AUDIO = [
  ['Atmos', rx('atmos', NOLET)], ['TrueHD', rx('true[-. _]?hd', NOLET)], ['DTS-HD', rx('dts[-. _]?hd', NOLET)], ['DTS', rx('dts', NOLET)],
  ['DD+', rx('ddp|dd\\+|e[-. _]?ac[-. _]?3|dolby[ ._-]?digital[ ._-]?plus', NOLET)],
  ['DD', rx('dd|ac[-. _]?3|dolby[ ._-]?digital', '(?![A-Za-z+])')], ['AAC', rx('aac', NOLET)],
];
const DV = rx('dolby[ ._-]?vision|dovi|dv');
const HDR10P = rx('hdr10(?:\\+|plus)');
const HDR = rx('hdr(?:10)?', '(?![A-Za-z0-9+])');
const BIT = rx('(10|12)[ ._-]?bit');
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*([TGMK])i?B\b/i;
const SIZE_G = new RegExp(SIZE_RE.source, 'gi');
const EMOJI = /[\u{1F000}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200d]/gu;
const FACTOR = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

const stripSize = (t) => String(t || '').replace(SIZE_G, ' ');
const first = (list, t) => { for (const [k, r] of list) if (r.test(t)) return k; return null; };
const parseRes = (t) => first(RES, t);

function parseAudio(t) {
  for (const [lab, r] of AUDIO) {
    const m = r.exec(t);
    if (!m) continue;
    const after = t.slice(m.index + m[0].length);
    const ch = /^[ ._-]?(7[. ]1|5[. ]1|2[. ]0)(?![0-9])/.exec(after) || /(?<![0-9])(7\.1|5\.1|2\.0)(?![0-9])/.exec(t);
    return lab + (ch ? ' ' + ch[1].replace(' ', '.') : '');
  }
  return null;
}

function parseTech(t) {
  const hdr = [];
  if (DV.test(t)) hdr.push('DV');
  if (HDR10P.test(t)) hdr.push('HDR10+'); else if (HDR.test(t)) hdr.push('HDR');
  const bit = BIT.exec(t);
  return [first(SRC, t), first(CODEC, t), ...hdr, bit ? bit[1] + '-bit' : null, parseAudio(t)].filter(Boolean);
}

const LANGS = [['ENG', 'eng(?:lish)?'], ['HIN', 'hin(?:di)?'], ['URD', 'urd(?:u)?'], ['TAM', 'tam(?:il)?'], ['TEL', 'tel(?:ugu)?'], ['KOR', 'kor(?:ean)?'],
  ['JPN', 'jap(?:anese)?|jpn'], ['SPA', 'spa(?:nish)?'], ['FRE', 'fre(?:nch)?'], ['Multi', 'multi'], ['Dual', 'dual[ ._-]?audio']];
const SUBS_MULTI = rx('multi[ ._-]?subs?|msubs?');
const SUBS_ENG = rx('(?:eng(?:lish)?|e)[ ._-]?subs?');
const SUBS_ANY = rx('subs?|subtitles?');
const SUBS_ALL = new RegExp([SUBS_MULTI, SUBS_ENG, SUBS_ANY].map((r) => r.source).join('|'), 'gi');

function parseLang(t) {
  const em = /🌐\s*([^\n·|]+)/.exec(t);
  if (em) return em[1].trim();
  const clean = t.replace(SUBS_ALL, ' ');
  const out = LANGS.filter(([, p]) => rx(p).test(clean)).map(([k]) => k);
  return out.length ? out.slice(0, 3).join('/') : null;
}

function parseSubs(t, s) {
  if (SUBS_MULTI.test(t)) return 'Multi Subs';
  if (SUBS_ENG.test(t)) return 'Eng Subs';
  if (SUBS_ANY.test(t)) return 'Subs';
  const n = Array.isArray(s.subtitles) ? s.subtitles.length : 0;
  return n > 1 ? 'Multi Subs' : n === 1 ? 'Subs' : null;
}

function getSize(s, text) {
  const v = s.behaviorHints && Number(s.behaviorHints.videoSize);
  if (v > 0) return v;
  const m = SIZE_RE.exec(text);
  return m ? parseFloat(m[1].replace(',', '.')) * FACTOR[m[2].toUpperCase()] : 0;
}

const fmtSize = (b) => (!b ? '?' : b / 1073741824 >= 1 ? (b / 1073741824).toFixed(2) + ' GB' : Math.round(b / 1048576) + ' MB');

function guessProvider(s, fallback) {
  let n = stripSize(String(s.name || '').split('\n')[0].replace(EMOJI, ' '));
  for (const [, r] of [...RES, ...SRC]) n = n.replace(new RegExp(r.source, 'gi'), ' ');
  n = n.replace(/[\[\](){}|•·:,_]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
  return n || fallback || 'Direct';
}

// ---------- format one stream ----------
function formatStream(s, it, cfg, ctx) {
  const t = it.body;
  const se = ctx.se ? `S${String(ctx.se[0]).padStart(2, '0')}E${String(ctx.se[1]).padStart(2, '0')}` : null;
  const head = [ctx.title, se].filter(Boolean);
  const tech = parseTech(t);
  const lang = parseLang(t), subs = parseSubs(t, s);
  const src = guessProvider(s, ctx.upstreamName);
  const lines = [];
  if (head.length) lines.push('🎬 ' + head.join(' · '));
  lines.push('📺 ' + (tech.length ? tech.join(' · ') : 'No tech info'));
  lines.push(`💾 ${fmtSize(it.size)}  ·  ⚡ Direct`);
  lines.push('🔑 ' + [src, lang && '🌐 ' + lang, subs && '💬 ' + subs].filter(Boolean).join('  ·  '));
  const text = lines.join('\n');
  const out = { ...s, name: `${cfg.n} - ${LABEL[it.key]} - ${src}` };
  const hasD = !!s.description, hasT = !!s.title;
  if (hasD) out.description = text;
  if (hasT || !hasD) out.title = text; // never add a field the upstream doesn't already use, except title when it uses neither
  return out;
}

// ---------- filter + sort + format ----------
function processStreams(streams, cfg, ctx) {
  const sel = cfg.q.length ? cfg.q : KEYS;
  const order = [...new Set([...cfg.o.filter((k) => sel.includes(k)), ...KEYS.filter((k) => sel.includes(k))])];
  const items = streams.filter((s) => s && typeof s === 'object').map((s, i) => {
    const bh = s.behaviorHints || {};
    const rest = [s.title, s.description, bh.filename].filter(Boolean).join('\n');
    const body = stripSize([s.name, rest].filter(Boolean).join('\n'));
    const key = parseRes(stripSize(s.name)) || parseRes(stripSize(rest)) || 'others';
    return { s, i, key, body, size: getSize(s, [s.name, rest].join('\n')) };
  }).filter((it) => sel.includes(it.key));

  items.sort((a, b) => {
    const d = order.indexOf(a.key) - order.indexOf(b.key);
    if (d) return d;
    if (cfg.s !== 'off' && a.size !== b.size) {
      if (!a.size) return 1;
      if (!b.size) return -1;
      return cfg.s === 'desc' ? b.size - a.size : a.size - b.size;
    }
    return a.i - b.i;
  });
  return items.map((it) => (it.s.url ? formatStream(it.s, it, cfg, ctx) : it.s));
}

module.exports = { KEYS, normKey, cleanBase, isPrivateHost, decodeConfig, addonId, streamInfo, processStreams, parseTech, parseRes, parseLang, parseSubs, fmtSize, guessProvider, formatStream };
