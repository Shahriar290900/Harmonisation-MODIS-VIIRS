// Where the satellites are: SGP4 propagation (satellite.js) of the orbit records from /api/sats.
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from 'satellite.js';
import type { SatTle } from '../data/live';

export interface Sat { key: string; name: string; epoch_utc: string | null; rec: SatRec; /** half of the sensor swath on the ground, km (MODIS 2330 km wide, VIIRS 3060 km wide) */ halfSwathKm: number }
export const SAT_COLORS: Record<string, string> = { terra: '#F59E0B', aqua: '#00B4D8', snpp: '#9A72F7', noaa20: '#22C55E', noaa21: '#38BDF8' };

export function makeSats(tles: SatTle[]): Sat[] {
  return tles.map((t) => ({ key: t.key, name: t.name, epoch_utc: t.epoch_utc, rec: twoline2satrec(t.line1, t.line2), halfSwathKm: t.key === 'terra' || t.key === 'aqua' ? 1165 : 1530 }));
}

export interface SubPoint { lon: number; lat: number; altKm: number }
export function subPoint(s: Sat, at: Date): SubPoint | null {
  const pv = propagate(s.rec, at);
  if (!pv || typeof pv.position !== 'object' || !pv.position) return null;
  const g = eciToGeodetic(pv.position, gstime(at));
  const lat = degreesLat(g.latitude), lon = degreesLong(g.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lon, lat, altKm: g.height } : null;
}

/** Ground track for the next `minutes`, split where it crosses the date line so no line is drawn across the map. */
export function groundTrack(s: Sat, from: Date, minutes = 100, stepS = 60): [number, number][][] {
  const lines: [number, number][][] = [];
  let cur: [number, number][] = [];
  let prev: number | null = null;
  for (let t = 0; t <= minutes * 60; t += stepS) {
    const p = subPoint(s, new Date(from.getTime() + t * 1000));
    if (!p) continue;
    if (prev !== null && Math.abs(p.lon - prev) > 180) { if (cur.length > 1) lines.push(cur); cur = []; }
    cur.push([p.lon, p.lat]); prev = p.lon;
  }
  if (cur.length > 1) lines.push(cur);
  return lines;
}

export function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Pass { inViewNow: boolean; startMs: number; endMs: number }
/** First time in the next `hours` when the place centre is inside the strip the satellite's sensor sees (half swath), 30 s steps. Null = none found. */
export function nextPass(s: Sat, place: { lat: number; lon: number }, from: Date, hours = 24): Pass | null {
  const step = 30_000, end = from.getTime() + hours * 3_600_000;
  let start = -1, last = -1;
  for (let t = from.getTime(); t <= end; t += step) {
    const p = subPoint(s, new Date(t));
    const inside = !!p && distKm(p.lat, p.lon, place.lat, place.lon) <= s.halfSwathKm;
    if (inside) { if (start < 0) start = t; last = t; }
    else if (start >= 0) break;
  }
  return start < 0 ? null : { inViewNow: start === from.getTime(), startMs: start, endMs: last };
}
