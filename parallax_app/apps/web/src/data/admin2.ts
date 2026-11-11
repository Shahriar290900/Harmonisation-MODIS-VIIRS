// District (ADM2) choropleth data: geoBoundaries polygons + per-district monthly sums built by scripts/build_admin2.mjs.
import { useEffect, useState } from 'react';

export interface District { id: string; name: string }
export interface DistrictIndex { aoi: string; snapshot_id: string; geometry: string; districts: District[]; years: number[]; unassigned_cells: number; note?: string }
export interface DistrictYear { columns: string[]; rows: (string | number | null)[][] }
export type Bbox = [number, number, number, number];

const BASE = (() => { const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './'; return b.endsWith('/') ? b : b + '/'; })();
const memo = new Map<string, Promise<unknown>>();
function getJson<T>(url: string): Promise<T | null> {
  let p = memo.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
    memo.set(url, p);
    p.then((v) => { if (v == null) memo.delete(url); });
  }
  return p;
}

let snapP: Promise<string | null> | null = null;
function defaultSnapshot(): Promise<string | null> {
  return (snapP ??= getJson<{ default?: string }>(BASE + 'data/index.json').then((j) => j?.default ?? null));
}

/** Which AOIs have a district layer (Bangladesh and its divisions). */
export function admin2KeyFor(aoiId: string | undefined): string | null {
  return aoiId && (aoiId === 'BGD' || aoiId.startsWith('BGD-')) ? 'BGD' : null;
}

export async function loadAdmin2Index(aoi: string): Promise<DistrictIndex | null> {
  const s = await defaultSnapshot(); if (!s) return null;
  return getJson<DistrictIndex>(`${BASE}data/${s}/admin2/${aoi}/index.json`);
}
export async function loadAdmin2Year(aoi: string, year: number): Promise<DistrictYear | null> {
  const s = await defaultSnapshot(); if (!s) return null;
  return getJson<DistrictYear>(`${BASE}data/${s}/admin2/${aoi}/${year}.json`);
}
export function loadAdmin2Geo(aoi: string): Promise<GeoJSON.FeatureCollection | null> {
  return getJson<GeoJSON.FeatureCollection>(`${BASE}geo-admin2/${aoi}.geojson`);
}

function polysOf(g: GeoJSON.Geometry | undefined): number[][][][] {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function inRing(x: number, y: number, ring: number[][]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function featureBbox(f: GeoJSON.Feature): Bbox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polysOf(f.geometry)) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

/** Ids of districts belonging to a region: all for the country; for a division, those with most outline vertices inside it. */
export function districtsInRegion(districts: GeoJSON.FeatureCollection, regionId: string, regionBbox: Bbox | undefined, regionGeo: GeoJSON.FeatureCollection | GeoJSON.Feature | null): Set<string> {
  const all = districts.features.map((f) => String((f.properties as { id: string }).id));
  if (regionId === 'BGD') return new Set(all);
  const rf: GeoJSON.Feature[] = !regionGeo ? [] : regionGeo.type === 'FeatureCollection' ? regionGeo.features : [regionGeo];
  const rp = rf.flatMap((f) => polysOf(f.geometry));
  const out = new Set<string>();
  for (const f of districts.features) {
    const id = String((f.properties as { id: string }).id);
    if (rp.length) {
      let tot = 0, inside = 0;
      for (const p of polysOf(f.geometry)) for (const pt of p[0]) { tot++; if (rp.some((q) => inRing(pt[0], pt[1], q[0]))) inside++; }
      if (tot && inside / tot > 0.5) out.add(id);
    } else if (regionBbox) {
      const [w, s, e, n] = featureBbox(f);
      const cx = (w + e) / 2, cy = (s + n) / 2;
      if (cx >= regionBbox[0] && cx <= regionBbox[2] && cy >= regionBbox[1] && cy <= regionBbox[3]) out.add(id);
    }
  }
  return out;
}

export interface Admin2State { loaded: boolean; available: boolean; geo: GeoJSON.FeatureCollection | null; index: DistrictIndex | null }
/** Probes (once per AOI) whether a district layer exists. */
export function useAdmin2(aoi: string | null): Admin2State {
  const [st, setSt] = useState<Admin2State & { aoi: string | null }>({ aoi: null, loaded: false, available: false, geo: null, index: null });
  useEffect(() => {
    if (!aoi) return;
    let off = false;
    Promise.all([loadAdmin2Index(aoi), loadAdmin2Geo(aoi)]).then(([index, geo]) => {
      if (!off) setSt({ aoi, loaded: true, available: !!(index && geo), geo, index });
    });
    return () => { off = true; };
  }, [aoi]);
  return aoi && st.aoi === aoi ? st : { loaded: !aoi, available: false, geo: null, index: null };
}

export function useAdmin2Year(aoi: string | null, year: number, enabled: boolean): { loaded: boolean; file: DistrictYear | null } {
  const [st, setSt] = useState<{ key: string; file: DistrictYear | null } | null>(null);
  const key = `${aoi}|${year}`;
  useEffect(() => {
    if (!aoi || !enabled) return;
    let off = false;
    loadAdmin2Year(aoi, year).then((file) => { if (!off) setSt({ key, file }); });
    return () => { off = true; };
  }, [aoi, year, enabled, key]);
  return { loaded: st?.key === key, file: st?.key === key ? st.file : null };
}
