import type { DistrictYear } from '../data/admin2';
import { fmtNum } from '../data/format';
import { valueColor } from './scale';
import type { MapSeries } from './MapPanel';

export interface DistrictBuild {
  fc: GeoJSON.FeatureCollection; max: number; used: MapSeries; active: number; total: number;
}

/** Join district polygons with one month of per-district sums. null stays null (missing); a district with no row simply had no active cells. */
export function buildDistricts(geo: GeoJSON.FeatureCollection, file: DistrictYear | null, month: number, series: MapSeries, allowed: Set<string> | null): DistrictBuild {
  const ci = (n: string) => (file ? file.columns.indexOf(n) : -1);
  const [iD, iM, iA, iV, iE, iN] = ['district_id', 'month', 'aqua', 'viirs', 'est', 'n_cells'].map(ci);
  const rows = file?.rows ?? [];
  const anyViirs = rows.some((r) => r[iV] != null);
  const used: MapSeries = series === 'auto' ? (anyViirs ? 'viirs' : 'est') : series;
  const col = used === 'viirs' ? iV : used === 'aqua' ? iA : iE;
  let max = 0;
  const byId = new Map<string, (string | number | null)[]>();
  for (const r of rows) {
    const v = r[col]; if (typeof v === 'number' && v > max) max = v;
    if (r[iM] === month) byId.set(String(r[iD]), r);
  }
  let active = 0;
  const features: GeoJSON.Feature[] = [];
  for (const f of geo.features) {
    const p = f.properties as { id: string; name: string };
    if (allowed && !allowed.has(p.id)) continue;
    const r = byId.get(p.id);
    const props: Record<string, unknown> = { id: p.id, name: p.name };
    if (r) {
      const num = (k: number) => (typeof r[k] === 'number' ? (r[k] as number) : null);
      const v = num(col);
      if (iA >= 0 && num(iA) != null) props.aqua = num(iA);
      if (iV >= 0 && num(iV) != null) props.viirs = num(iV);
      if (iE >= 0 && num(iE) != null) props.est = num(iE);
      if (iN >= 0 && num(iN) != null) props.n = num(iN);
      if (v != null) props.v = v;
      if (v != null && v > 0) { props.c = valueColor(v, max); active++; }
    }
    features.push({ type: 'Feature', geometry: f.geometry, properties: props });
  }
  return { fc: { type: 'FeatureCollection', features }, max, used, active, total: features.length };
}

export function districtPopup(p: Record<string, unknown>, seriesLabel: string): HTMLElement {
  const root = document.createElement('div');
  const t = document.createElement('b'); t.textContent = String(p.name ?? 'District');
  const has = p.n != null || p.v != null;
  const l1 = document.createElement('div');
  l1.textContent = has ? `Aqua ${fmtNum(num(p.aqua))} · VIIRS ${fmtNum(num(p.viirs))}` : 'No active cells recorded this month';
  root.append(t, l1);
  if (has) {
    const l2 = document.createElement('div'); l2.textContent = `Estimate ${fmtNum(num(p.est))} · ${String(p.n ?? '—')} active cells`;
    const l3 = document.createElement('div'); l3.className = 'muted'; l3.textContent = `Map colour: ${seriesLabel}. Sum of 5 km cells in the district.`;
    root.append(l2, l3);
  }
  return root;
}
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Representative label position: centre of the bbox of the district's largest polygon part. */
export function labelPoint(f: GeoJSON.Feature): [number, number] | null {
  const g = f.geometry;
  const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best: number[][] | null = null, bestN = -1;
  for (const p of parts) if (p[0].length > bestN) { best = p[0]; bestN = p[0].length; }
  if (!best) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of best) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [(w + e) / 2, (s + n) / 2];
}
