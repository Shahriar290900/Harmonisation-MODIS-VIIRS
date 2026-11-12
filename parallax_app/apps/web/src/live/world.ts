// Turns the packed worldwide detections into something MapLibre can draw smoothly: grouped into grid squares when zoomed out
// (the square's point is the average position of its detections), individual detections when zoomed in.
import type { WorldKey, WorldSource } from '../data/live';

export type Group = 'modis' | 'viirs';
export const GROUP_OF: Record<WorldKey, Group> = { modis: 'modis', noaa20: 'viirs', noaa21: 'viirs', snpp: 'viirs' };
export const SENSOR_NAME: Record<WorldKey, string> = { modis: 'MODIS (Terra or Aqua)', noaa20: 'NOAA-20 VIIRS', noaa21: 'NOAA-21 VIIRS', snpp: 'Suomi NPP VIIRS' };

const RAW_ZOOM = 6.5;
const RAW_CAP = 40_000;
export const cellFor = (zoom: number) => (zoom < 2 ? 2 : zoom < 3.5 ? 1 : zoom < 5 ? 0.5 : 0.2);

/** Date (YYYY-MM-DD) and HH:MM UTC of a packed row, from the file's newest timestamp. */
export function rowTime(meta: Pick<WorldSource, 'newest_utc'>, packed: number): { date: string; hhmm: string } {
  const minute = packed & 2047, back = (packed >> 11) & 3;
  const base = Date.parse((meta.newest_utc ?? '1970-01-01').slice(0, 10) + 'T00:00:00Z');
  return { date: new Date(base - back * 86_400_000).toISOString().slice(0, 10), hhmm: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` };
}

type Fc = GeoJSON.FeatureCollection<GeoJSON.Point>;
const fc = (features: GeoJSON.Feature<GeoJSON.Point>[]): Fc => ({ type: 'FeatureCollection', features });

/** `bounds` = [west, south, east, north] of the view (only used when zoomed in). */
export function buildHotspots(sources: WorldSource[], zoom: number, bounds: [number, number, number, number] | null): Record<Group, Fc> {
  const out: Record<Group, GeoJSON.Feature<GeoJSON.Point>[]> = { modis: [], viirs: [] };
  const raw = zoom >= RAW_ZOOM && bounds;
  let inView = 0;
  if (raw) {
    const [w, s, e, n] = bounds;
    const pad = Math.max(0.2, (e - w) * 0.1), padLat = Math.max(0.2, (n - s) * 0.1);
    for (const src of sources) if (src.raw) {
      const r = src.raw;
      for (let i = 0; i < r.length; i += 4) {
        const lon = r[i] / 100, lat = r[i + 1] / 100;
        if (lon < w - pad || lon > e + pad || lat < s - padLat || lat > n + padLat) continue;
        inView++;
      }
    }
  }
  const asRaw = !!raw && inView <= RAW_CAP;
  const cs = asRaw ? 0 : raw ? 0.05 : cellFor(zoom);
  for (const src of sources) {
    const r = src.raw; if (!r) continue;
    const g = GROUP_OF[src.key];
    if (asRaw) {
      const [w, s, e, n] = bounds!;
      const pad = Math.max(0.2, (e - w) * 0.1), padLat = Math.max(0.2, (n - s) * 0.1);
      for (let i = 0; i < r.length; i += 4) {
        const lon = r[i] / 100, lat = r[i + 1] / 100;
        if (lon < w - pad || lon > e + pad || lat < s - padLat || lat > n + padLat) continue;
        const t = rowTime(src, r[i + 3] & 0xffff);
        out[g].push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { n: 1, k: src.key, frp: r[i + 2] < 0 ? null : r[i + 2] / 10, t: t.hhmm, d: t.date, dn: (r[i + 3] >> 13) & 1 } });
      }
    } else {
      const bins = new Map<number, { n: number; sx: number; sy: number; mx: number }>();
      for (let i = 0; i < r.length; i += 4) {
        const lon = r[i] / 100, lat = r[i + 1] / 100;
        if (raw) { const [w, s, e, n] = bounds!; if (lon < w || lon > e || lat < s || lat > n) continue; }
        const key = Math.floor((lon + 180) / cs) * 100_000 + Math.floor((lat + 90) / cs);
        const f = r[i + 2] < 0 ? 0 : r[i + 2] / 10;
        const b = bins.get(key);
        if (b) { b.n++; b.sx += lon; b.sy += lat; if (f > b.mx) b.mx = f; } else bins.set(key, { n: 1, sx: lon, sy: lat, mx: f });
      }
      for (const b of bins.values()) out[g].push({ type: 'Feature', geometry: { type: 'Point', coordinates: [b.sx / b.n, b.sy / b.n] }, properties: { n: b.n, k: g, frp: b.mx || null } });
    }
  }
  return { modis: fc(out.modis), viirs: fc(out.viirs) };
}

export interface Strongest { key: WorldKey; lon: number; lat: number; frp: number; date: string; hhmm: string }
/** The strongest detections of the last 24 h (largest heat output), one per place (about 1 degree apart). */
export function strongest(sources: WorldSource[], count = 6): Strongest[] {
  const all: Strongest[] = [];
  for (const src of sources) {
    const r = src.raw; if (!r) continue;
    const best: { i: number; f: number }[] = [];
    for (let i = 0; i < r.length; i += 4) {
      const f = r[i + 2]; if (f < 0) continue;
      if (best.length < 40 || f > best[best.length - 1].f) {
        best.push({ i, f }); best.sort((a, b) => b.f - a.f); if (best.length > 40) best.pop();
      }
    }
    for (const b of best) { const t = rowTime(src, r[b.i + 3] & 0xffff); all.push({ key: src.key, lon: r[b.i] / 100, lat: r[b.i + 1] / 100, frp: b.f / 10, date: t.date, hhmm: t.hhmm }); }
  }
  all.sort((a, b) => b.frp - a.frp);
  const picked: Strongest[] = [];
  for (const a of all) {
    if (picked.every((p) => Math.abs(p.lon - a.lon) > 1 || Math.abs(p.lat - a.lat) > 1)) picked.push(a);
    if (picked.length >= count) break;
  }
  return picked;
}
