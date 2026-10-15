'use strict';
const core = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const out = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
  const base = core.cleanBase(req.query.url);
  if (!base) return out(400, { ok: false, error: 'Paste a full http(s) manifest link.' });
  if (core.isPrivateHost(base)) return out(400, { ok: false, error: 'Local addresses cannot be used.' });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(base + '/manifest.json', { signal: ac.signal, headers: { 'User-Agent': 'Prism-Stremio/1.0' } });
    if (!r.ok) return out(200, { ok: false, error: `The addon answered with HTTP ${r.status}.` });
    const m = await r.json();
    if (!m || !m.id || !m.name) return out(200, { ok: false, error: 'That link is not a Stremio manifest.' });
    if (!core.streamInfo(m)) return out(200, { ok: false, error: `${m.name} does not provide streams.` });
    return out(200, { ok: true, base, name: m.name, version: m.version || '' });
  } catch (e) {
    return out(200, { ok: false, error: e.name === 'AbortError' ? 'The addon took too long to respond.' : 'Could not reach that link.' });
  } finally { clearTimeout(timer); }
};
