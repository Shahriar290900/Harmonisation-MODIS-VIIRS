// Goal: the 3D Earth dashboard (docs/EARTH_SPEC.md) shows real satellites in real time on a textured Earth with the real sun.
// Contract (dev + prod): window.__earth.debug() -> { ready, textures:{day,night,bump}, frames, hotspots,
//   sats:[{name, lat, lon, altKm}], sun:{lat, lon} }
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
import * as sat from 'satellite.js';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const fails = [], errs = [];
const subsolar = (d) => { const start = Date.UTC(d.getUTCFullYear(), 0, 0); const n = (d - start) / 864e5; const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (n + 10));
  const B = (2 * Math.PI * (n - 81)) / 364; const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; let lon = -(h - 12) * 15 - eot / 4; lon = ((lon + 540) % 360) - 180; return { lat: decl, lon }; };
const dLon = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const b = await launch();
for (const vp of [{ w: 1440, h: 760, tag: 'laptop' }, { w: 390, h: 844, tag: 'phone' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage(); watch(p, errs, vp.tag + ' ');
  await p.goto(BASE + '#/live?aoi=BGD&y=2024&m=3&notour=1', { waitUntil: 'load' });
  const ok = await p.waitForFunction(() => window.__earth && window.__earth.debug && window.__earth.debug().ready, null, { timeout: 45000 }).then(() => true).catch(() => false);
  if (!ok) { fails.push(`${vp.tag}: window.__earth.debug().ready never became true on #/live`); await ctx.close(); continue; }
  await p.waitForTimeout(6000);
  const d1 = await p.evaluate(() => window.__earth.debug()); const t1 = new Date();
  await p.waitForTimeout(3000);
  const d2 = await p.evaluate(() => window.__earth.debug());
  const cv = await p.evaluate(() => { const c = document.querySelector('[data-earth] canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  if (!cv) fails.push(`${vp.tag}: no canvas inside [data-earth]`); else if (cv.w < vp.w * (vp.w < 700 ? 0.85 : 0.55) || cv.h < 320) fails.push(`${vp.tag}: Earth view too small (${Math.round(cv.w)}x${Math.round(cv.h)})`);
  for (const k of ['day', 'night', 'bump']) if (!d1.textures || !d1.textures[k]) fails.push(`${vp.tag}: ${k} texture not loaded`);
  if (!(d2.frames > d1.frames + 20)) fails.push(`${vp.tag}: not animating (frames ${d1.frames} -> ${d2.frames} in 3 s)`);
  const want = ['Terra', 'Aqua', 'Suomi NPP', 'NOAA-20', 'NOAA-21'];
  const names = (d1.sats || []).map((s) => s.name);
  if (want.filter((n) => names.includes(n)).length < 4) fails.push(`${vp.tag}: satellites shown: ${names.join(', ') || 'none'} (expected the five fire satellites)`);
  // independent propagation from the same orbit records the site serves
  let tles = null; try { const r = await p.evaluate(async () => (await fetch('/api/sats')).json()); tles = r.tles; } catch { /* checked below */ }
  if (!tles || !tles.length) fails.push(`${vp.tag}: /api/sats gave no orbit records to check against`);
  for (const s of d1.sats || []) {
    if (!(s.altKm > 600 && s.altKm < 950)) fails.push(`${vp.tag}: ${s.name} altitude ${s.altKm} km is implausible`);
    const t = tles && tles.find((x) => x.name === s.name); if (!t) continue;
    const rec = sat.twoline2satrec(t.line1, t.line2); const pv = sat.propagate(rec, t1); const g = sat.eciToGeodetic(pv.position, sat.gstime(t1));
    const lat = sat.degreesLat(g.latitude), lon = sat.degreesLong(g.longitude);
    if (Math.abs(lat - s.lat) > 2.5 || dLon(lon, s.lon) > 4) fails.push(`${vp.tag}: ${s.name} drawn at ${s.lat.toFixed(1)},${s.lon.toFixed(1)} but its orbit puts it at ${lat.toFixed(1)},${lon.toFixed(1)} now`);
    const s2 = (d2.sats || []).find((x) => x.name === s.name); if (s2 && Math.abs(s2.lat - s.lat) + dLon(s2.lon, s.lon) < 0.05) fails.push(`${vp.tag}: ${s.name} did not move in 3 s`);
  }
  const ss = subsolar(t1);
  if (!d1.sun || Math.abs(d1.sun.lat - ss.lat) > 3 || dLon(d1.sun.lon, ss.lon) > 4) fails.push(`${vp.tag}: sun at ${JSON.stringify(d1.sun)} but the real subsolar point is ${ss.lat.toFixed(1)},${ss.lon.toFixed(1)}`);
  if (!(d1.hotspots > 1000)) fails.push(`${vp.tag}: only ${d1.hotspots} hot spots drawn on the Earth (feed has tens of thousands)`);
  // the detailed flat map is still one tap away
  try { await p.click('[data-live-view="map"]', { timeout: 3000 }); await p.waitForTimeout(5000); if (!(await p.evaluate(() => !!document.querySelector('.maplibregl-canvas')))) fails.push(`${vp.tag}: map view has no map`); } catch { fails.push(`${vp.tag}: no [data-live-view="map"] button`); }
  if (out) { fs.mkdirSync(out, { recursive: true }); await p.click('[data-live-view="earth"]').catch(() => {}); await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/${vp.tag}-earth.jpg`, type: 'jpeg', quality: 70 }); }
  await ctx.close();
}
await b.close();
finish('earth', [...new Set(fails)].concat([...new Set(errs)]));
