'use strict';
const assert = require('assert');
const c = require('../lib/core');
const T = (n) => c.parseTech(n).join(' · ');

assert.strictEqual(T('Carrie.2024.S01E01.1080p.WEB-DL.H264.DDP5.1.mkv'), 'WEB-DL · H.264 · DD+ 5.1');
assert.strictEqual(T('Avengers_Endgame_2019_2160p_BluRay_x265_HDR_10bit_DD+_5.1'), 'BluRay · HEVC · HDR · 10-bit · DD+ 5.1');
assert.strictEqual(T('Movie-2020-1080p-BDRemux-AVC-TrueHD-7.1-Atmos'), 'REMUX · H.264 · Atmos 7.1');
assert.strictEqual(T('Movie.RM4K.WEBRip.AAC2.0'), 'WEBRip · AAC 2.0');
assert.strictEqual(T('Show.S01E02.DV.HDR10+.DTS-HD.MA.5.1.x265'), 'HEVC · DV · HDR10+ · DTS-HD 5.1');
assert.strictEqual(T('Some Random Name'), '');
assert.strictEqual(c.parseRes('Movie.RM4K.1080p'), '1080p');
assert.strictEqual(c.parseRes('RM4K only'), null);
assert.strictEqual(c.parseRes('4KHDHub'), null);
assert.strictEqual(c.parseRes('Movie 2160p'), '4k');
assert.strictEqual(c.parseRes('Movie 4K HDR'), '4k');
assert.strictEqual(c.fmtSize(1.08 * 1024 ** 3), '1.08 GB');
assert.strictEqual(c.fmtSize(561 * 1024 ** 2), '561 MB');
assert.strictEqual(c.fmtSize(0), '?');
assert.strictEqual(c.guessProvider({ name: 'MovieBox 1080p' }), 'MovieBox');
assert.strictEqual(c.guessProvider({ name: '4KHDHub\n2160p' }), '4KHDHub');
assert.strictEqual(c.guessProvider({ name: '1080p' }, 'Fallback'), 'Fallback');

const cfg = { u: 'https://x.io', n: 'Prism', q: ['4k', '1080p', 'others'], o: ['1080p', '4k'], s: 'desc' };
const S = (name, description, size) => ({ name, description, url: 'https://v/' + name, behaviorHints: size ? { videoSize: size * 1024 ** 3 } : {} });
const out = c.processStreams([
  S('MovieBox 720p', 'x.720p.WEB-DL', 1), S('VegaMovies 1080p', 'a.1080p.WEB-DL.H264.DDP5.1\n💾 1.08 GB'), S('MovieBox 1080p', 'b.1080p.BluRay.x265', 6.91),
  S('4KHDHub', 'c.2160p.BluRay.x265.HDR.10bit', 20), S('Other', 'nothing here', 3), { name: 'T', infoHash: 'abc', title: '1080p' },
], cfg, { title: 'Carrie', se: [1, 1], upstreamName: 'Up' });
console.log(out.map((s) => s.name).join('\n'));
assert.deepStrictEqual(out.map((s) => s.name), ['Prism - 1080p - MovieBox', 'Prism - 1080p - VegaMovies', 'T', 'Prism - 4K - 4KHDHub', 'Prism - Unknown - Other']);
assert.strictEqual(out[0].description, '🎬 Carrie · S01E01\n📺 BluRay · HEVC\n💾 6.91 GB  ·  ⚡ Direct\n🔑 MovieBox');
assert.ok(!('title' in out[0]), 'must not add title when upstream used description only');
assert.strictEqual(out.some((s) => s.name === 'Prism - 720p - MovieBox'), false);
assert.strictEqual(out.find((s) => s.infoHash).name, 'T');
console.log(out[1].description);
console.log('ALL TESTS PASSED');
