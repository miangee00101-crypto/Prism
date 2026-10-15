'use strict';
const core = require('../lib/core');

const cache = new Map();
const hit = (k) => { const v = cache.get(k); return v && v.exp > Date.now() ? v.val : undefined; };
const put = (k, val, ttl) => { if (cache.size > 500) cache.clear(); cache.set(k, { val, exp: Date.now() + ttl }); };

async function getJson(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Prism-Stremio/1.0', Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

const upstreamManifest = async (base) => {
  const k = 'm:' + base;
  let m = hit(k);
  if (!m) { m = await getJson(base + '/manifest.json', 8000); put(k, m, 10 * 60 * 1000); }
  return m;
};

async function titleOf(type, id) {
  const imdb = id.split(':')[0];
  if (!/^tt\d+$/.test(imdb) || !['movie', 'series'].includes(type)) return null;
  const k = 't:' + type + imdb;
  let t = hit(k);
  if (t === undefined) {
    try { t = (await getJson(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`, 3500)).meta?.name || null; } catch { t = null; }
    if (t) put(k, t, 6 * 3600 * 1000);
  }
  return t;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, body, cacheCtl) => { res.statusCode = code; res.setHeader('Cache-Control', cacheCtl || 'no-store'); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204, {});

  const { cfg: raw, r, type, file } = req.query;
  const cfg = core.decodeConfig(raw);
  if (!cfg) return send(400, { error: 'Invalid Prism configuration link.' });

  if (r === 'manifest') {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let info = null, up = null;
    try { up = await upstreamManifest(cfg.u); info = core.streamInfo(up); } catch { /* fall back below */ }
    const m = {
      id: core.addonId(raw),
      version: '1.0.0',
      name: cfg.n,
      description: `Sorted and cleaned streams from ${up?.name || 'another addon'}, powered by Prism.`,
      logo: `https://${host}/logo.png`,
      resources: ['stream'],
      types: info?.types || ['movie', 'series'],
      catalogs: [],
      behaviorHints: { configurable: false },
    };
    const ip = info ? info.idPrefixes : ['tt'];
    if (ip) m.idPrefixes = ip;
    return send(200, m, 'public, max-age=300');
  }

  if (r === 'stream') {
    let id = String(file || '').replace(/\.json$/, '');
    try { id = decodeURIComponent(id); } catch { /* already decoded */ }
    const [data, title, up] = await Promise.all([
      getJson(`${cfg.u}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, 9000).catch(() => null),
      titleOf(type, id),
      upstreamManifest(cfg.u).catch(() => null),
    ]);
    if (!data || !Array.isArray(data.streams)) return send(200, { streams: [] });
    const p = id.split(':');
    const se = type === 'series' && p.length >= 3 && /^\d+$/.test(p[1]) && /^\d+$/.test(p[2]) ? [Number(p[1]), Number(p[2])] : null;
    const streams = core.processStreams(data.streams, cfg, { title, se, upstreamName: up?.name });
    return send(200, { streams }, 'public, max-age=300, stale-while-revalidate=600');
  }
  return send(404, { error: 'Not found' });
};
