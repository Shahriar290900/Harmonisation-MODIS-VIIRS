// Smoke test of the pure function logic against ONE real download each (no network here).
// Usage: node netlify/functions/lib/smoke.mjs <samples dir containing modis.csv j1.csv j2.csv snpp.csv caps.xml tle-*.txt>
// The .mts modules are loaded through Vite (node 20 cannot import .mts directly).
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = process.argv[2];
const here = path.dirname(fileURLToPath(import.meta.url));
const vs = await createServer({ configFile: false, root: here, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let bad = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) bad++; };
try {
  const world = await vs.ssrLoadModule(path.join(here, 'world.mts'));
  for (const f of ['modis', 'j1', 'j2', 'snpp']) {
    const csv = fs.readFileSync(path.join(dir, f + '.csv'), 'utf8');
    const NOW = Date.parse('2026-11-12T00:40:00Z');   // when the samples were downloaded
    const rowsAll = csv.split('\n').filter(Boolean).slice(1).map((l) => l.split(','));
    const hdr = csv.split('\n')[0].split(',');
    const [iD, iT] = [hdr.indexOf('acq_date'), hdr.indexOf('acq_time')];
    const lines = rowsAll.filter((c) => Date.parse(c[iD] + 'T' + c[iT].padStart(4, '0').replace(/(..)(..)/, '$1:$2') + ':00Z') >= NOW - 86_400_000).length;
    const p = world.packWorldCsv(csv, NOW);
    if (f === 'snpp') { check('snpp header-only file is state empty, not zero data', p.state === 'empty' && p.count === 0); continue; }
    const rows = world.unpackWorld(p.data);
    check(`${f}: ${p.count} detections = ${lines} CSV rows inside the 24 h window (of ${rowsAll.length})`, p.state === 'ok' && p.count === lines && rows.length === lines, `newest ${p.newest_utc} oldest ${p.oldest_utc} base64 ${(p.data.length / 1e6).toFixed(2)} MB`);
    check(`${f}: oldest kept detection is inside the window`, Date.parse(p.oldest_utc) >= NOW - 86_400_000);
    check(`${f}: stale file is reported failed, not empty`, world.packWorldCsv(csv, NOW + 40 * 86_400_000).state === 'failed');
    check(`${f}: coordinates in range`, rows.every((r) => Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180));
    check(`${f}: frp known for most rows`, rows.filter((r) => r.frp != null).length / rows.length > 0.99);
  }
  const sats = await vs.ssrLoadModule(path.join(here, 'sats.mts'));
  for (const s of sats.SATS) {
    const f = path.join(dir, `tle-${s.id}.txt`);
    if (!fs.existsSync(f)) { check(`tle ${s.name}: sample present`, false); continue; }
    const t = sats.parseTle(fs.readFileSync(f, 'utf8'), s);
    check(`tle ${s.name}: valid checksum, id ${s.id}`, !!t, t ? `epoch ${t.epoch_utc}` : '');
  }
  check('tle: wrong catalogue number rejected', sats.parseTle(fs.readFileSync(path.join(dir, 'tle-25994.txt'), 'utf8'), { id: 27424, key: 'x', name: 'x' }) === null);
  const gibs = await vs.ssrLoadModule(path.join(here, 'gibs.mts'));
  const t = gibs.buildTimes(fs.readFileSync(path.join(dir, 'caps.xml'), 'utf8'));
  console.log(JSON.stringify(t));
  check('gibs: every daily layer has a latest date', Object.values(t.daily).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.latest)));
  check('gibs: geostationary layers have a timestamp', Object.values(t.geo).every((g) => g.time));
  const fb = gibs.buildTimes(null, new Date('2026-11-12T10:00:00Z'));
  check('gibs: fallback = yesterday for daily, null for geostationary', fb.state === 'fallback' && fb.daily.terra.yesterday === '2026-11-11' && fb.geo.goes_east.time === null);
} finally { await vs.close(); }
process.exit(bad ? 1 : 0);
