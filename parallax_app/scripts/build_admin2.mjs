#!/usr/bin/env node
// Aggregate the default snapshot's 5 km cells (cells/<AOI>/<year>.json) to ADM2 districts.
// Usage: node scripts/build_admin2.mjs [AOI=BGD] [snapshot_id]
// Reads  apps/web/public/geo-admin2/<AOI>.geojson  (properties {id, name})
// Writes apps/web/public/data/<snapshot>/admin2/<AOI>/<year>.json and index.json (new files only).
// Sums treat null as missing: a sum is null only when every contributing value is null. Nothing is invented.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/public');
const aoi = process.argv[2] || 'BGD';
const idx = JSON.parse(fs.readFileSync(path.join(web, 'data/index.json'), 'utf8'));
const snap = process.argv[3] || idx.default;
const snapDir = path.join(web, 'data', snap);
const geo = JSON.parse(fs.readFileSync(path.join(web, 'geo-admin2', `${aoi}.geojson`), 'utf8'));

// Prepare polygons with bbox prefilter.
const polys = [];
for (const f of geo.features) {
  const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of parts) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of rings[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    polys.push({ id: f.properties.id, rings, w, s, e, n });
  }
}
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function locate(x, y) {
  for (const p of polys) {
    if (x < p.w || x > p.e || y < p.s || y > p.n) continue;
    if (!inRing(x, y, p.rings[0])) continue;
    let hole = false;
    for (let k = 1; k < p.rings.length; k++) if (inRing(x, y, p.rings[k])) { hole = true; break; }
    if (!hole) return p.id;
  }
  return null;
}

// A cell centre just outside every polygon (coast, border, simplification) is snapped to the nearest district
// when within SNAP_DEG (~one 5 km cell width); anything farther (open water, other countries) stays unassigned.
const SNAP_DEG = 0.045;
function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const u = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
  return Math.hypot(x - ax - u * dx, y - ay - u * dy);
}
function nearest(x, y) {
  let best = null, bd = SNAP_DEG;
  for (const p of polys) {
    if (x < p.w - SNAP_DEG || x > p.e + SNAP_DEG || y < p.s - SNAP_DEG || y > p.n + SNAP_DEG) continue;
    const r = p.rings[0];
    for (let i = 1; i < r.length; i++) { const d = segDist(x, y, r[i - 1], r[i]); if (d < bd) { bd = d; best = p.id; } }
  }
  return best;
}
let snapped = 0;

const cellsDir = path.join(snapDir, 'cells', aoi);
const outDir = path.join(snapDir, 'admin2', aoi);
fs.mkdirSync(outDir, { recursive: true });
const years = fs.readdirSync(cellsDir).filter((f) => /^\d{4}\.json$/.test(f)).map((f) => +f.slice(0, 4)).sort();
const cache = new Map(); // cell_id -> district id | null (cell grid is fixed across years)
let unassigned = 0; const unassignedIds = new Set(); const used = new Set();
const sum = (a, v) => (v == null ? a : (a == null ? 0 : a) + v);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const summary = {};

for (const y of years) {
  const f = JSON.parse(fs.readFileSync(path.join(cellsDir, `${y}.json`), 'utf8'));
  const c = Object.fromEntries(f.columns.map((n, i) => [n, i]));
  const acc = new Map();
  let tot = { aqua: null, viirs: null, est: null }, totA = { aqua: null, viirs: null, est: null };
  for (const r of f.rows) {
    const id = r[c.cell_id];
    let d = cache.get(id);
    if (d === undefined) { d = locate(r[c.lon], r[c.lat]); if (d == null) { d = nearest(r[c.lon], r[c.lat]); if (d != null) snapped++; } cache.set(id, d); if (d == null) unassignedIds.add(id); }
    for (const k of ['aqua', 'viirs', 'est']) tot[k] = sum(tot[k], r[c[k]]);
    if (d == null) continue;
    used.add(d);
    const key = d + '|' + r[c.month];
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { d, m: r[c.month], aqua: null, viirs: null, est: null, n: 0 }));
    a.aqua = sum(a.aqua, r[c.aqua]); a.viirs = sum(a.viirs, r[c.viirs]); a.est = sum(a.est, r[c.est]); a.n++;
    for (const k of ['aqua', 'viirs', 'est']) totA[k] = sum(totA[k], r[c[k]]);
  }
  const rows = [...acc.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.m - b.m)).map((a) => [a.d, a.m, a.aqua, a.viirs, r2(a.est), a.n]);
  fs.writeFileSync(path.join(outDir, `${y}.json`), JSON.stringify({ columns: ['district_id', 'month', 'aqua', 'viirs', 'est', 'n_cells'], rows }));
  summary[y] = { cells_rows: f.rows.length, cells_total: { ...tot, est: r2(tot.est) }, districts_total: { ...totA, est: r2(totA.est) } };
}
for (const id of cache.values()) if (id == null) unassigned++;
const names = geo.features.map((g) => ({ id: g.properties.id, name: g.properties.name }));
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({
  aoi, snapshot_id: snap, geometry: `geo-admin2/${aoi}.geojson`, districts: names, years,
  unassigned_cells: unassigned, snapped_cells: snapped, snap_distance_deg: SNAP_DEG, assigned_cells: cache.size - unassigned,
  note: 'Cells assigned to the district containing the 5 km cell centre; cells whose centre is outside every polygon are snapped to the nearest district if within snap_distance_deg (about one cell width), otherwise excluded (open water / outside Bangladesh). null = missing, never zero.'
}));
console.log(`snapshot ${snap}\nyears ${years[0]}-${years.at(-1)}; districts with data ${used.size}/${names.length}; unique cells ${cache.size}; unassigned ${unassigned}; snapped ${snapped}`);
for (const y of [2012, 2020, 2024]) if (summary[y]) console.log(y, JSON.stringify(summary[y]));
