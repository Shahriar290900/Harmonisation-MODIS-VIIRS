// Pure helpers for the worldwide 24 h hot-spot feed (scope=world). No I/O, smoke-testable with node.
// Each detection is packed into 4 little-endian Int16 values (8 bytes) and the whole array is base64 encoded,
// because 230k detections as JSON would be about 5.8 MB, close to the 6 MB function response limit.
//   [0] longitude x 100   [1] latitude x 100   [2] heat output (FRP, MW) x 10, clamped to 32767, -1 = not given
//   [3] bits 0-10 minute of the UTC day (0-1439), bits 11-12 days before the newest date in this file (0-3), bit 13 = day (1) / night (0)
import { splitCsvLine } from './firms.mts';

export type SourceState = 'ok' | 'empty' | 'failed';
export interface PackedSource { state: SourceState; count: number; newest_utc: string | null; oldest_utc: string | null; data: string; error?: string }

export const WORLD_LAYOUT = ['lon_x100', 'lat_x100', 'frp_mw_x10', 'minute_of_day | days_before_newest << 11 | is_day << 13'];

export function emptySource(state: SourceState, error?: string): PackedSource {
  return { state, count: 0, newest_utc: null, oldest_utc: null, data: '', ...(error ? { error } : {}) };
}

const DAY = 86_400_000;

/** Parse one FIRMS global CSV into the packed form, keeping only detections of the 24 hours before `nowMs` (the files named "24h" can hold
 *  about two UTC days). Header-only files give state "empty" (never a zero count presented as data). */
export function packWorldCsv(csv: string, nowMs: number = Date.now()): PackedSource {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return emptySource('empty');
  const head = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const iLat = head.indexOf('latitude'), iLon = head.indexOf('longitude'), iDate = head.indexOf('acq_date'), iTime = head.indexOf('acq_time');
  const iFrp = head.indexOf('frp'), iDn = head.indexOf('daynight');
  if (iLat < 0 || iLon < 0 || iDate < 0 || iTime < 0) return emptySource('failed', 'unexpected file layout');
  const rows: { lon: number; lat: number; frp: number; min: number; date: string; day: number }[] = [];
  let newest = '', oldest = '9999';
  const since = nowMs - DAY, dayMs = new Map<string, number>();
  let parsed = 0;
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k];
    if (!line) continue;
    const c = line.split(',');
    const lat = Number(c[iLat]), lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = (c[iTime] ?? '').padStart(4, '0');
    const min = Number(t.slice(0, 2)) * 60 + Number(t.slice(2));
    if (!Number.isFinite(min) || min > 1439) continue;
    const date = c[iDate];
    let base = dayMs.get(date);
    if (base === undefined) { base = Date.parse(date + 'T00:00:00Z'); dayMs.set(date, base); }
    parsed++;
    if (base + min * 60_000 < since) continue;
    const f = iFrp >= 0 && c[iFrp] !== '' ? Number(c[iFrp]) : NaN;
    if (date > newest) newest = date;
    if (date < oldest) oldest = date;
    rows.push({ lon, lat, frp: Number.isFinite(f) ? f : -1, min, date, day: iDn >= 0 && c[iDn] === 'D' ? 1 : 0 });
  }
  if (!rows.length) return parsed ? emptySource('failed', 'every detection in the file is more than 24 hours old') : emptySource('empty');
  const newestMs = Date.parse(newest + 'T00:00:00Z');
  const back = new Map<string, number>();
  const buf = new ArrayBuffer(rows.length * 8);
  const dv = new DataView(buf);
  let newestMin = 0, oldestKey = Infinity;
  rows.forEach((r, i) => {
    let b = back.get(r.date);
    if (b === undefined) { b = Math.min(3, Math.max(0, Math.round((newestMs - Date.parse(r.date + 'T00:00:00Z')) / DAY))); back.set(r.date, b); }
    const o = i * 8;
    dv.setInt16(o, Math.round(r.lon * 100), true);
    dv.setInt16(o + 2, Math.round(r.lat * 100), true);
    dv.setInt16(o + 4, r.frp < 0 ? -1 : Math.min(32767, Math.round(r.frp * 10)), true);
    dv.setUint16(o + 6, r.min | (b << 11) | (r.day << 13), true);
    if (r.date === newest && r.min > newestMin) newestMin = r.min;
    const key = -b * 1440 + r.min;
    if (key < oldestKey) oldestKey = key;
  });
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const oldestDay = oldestKey < 0 ? Math.floor(oldestKey / 1440) : 0;
  const oldestDate = new Date(newestMs + oldestDay * DAY).toISOString().slice(0, 10);
  return {
    state: 'ok', count: rows.length,
    newest_utc: `${newest}T${hhmm(newestMin)}Z`, oldest_utc: `${oldestDate}T${hhmm(oldestKey - oldestDay * 1440)}Z`,
    data: Buffer.from(buf).toString('base64')
  };
}

/** Inverse of the packing, used by the smoke test (the browser has its own decoder in src/live). */
export function unpackWorld(b64: string): { lon: number; lat: number; frp: number | null; minute: number; daysBack: number; day: boolean }[] {
  const u = Buffer.from(b64, 'base64');
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const out = [];
  for (let o = 0; o + 8 <= u.byteLength; o += 8) {
    const m = dv.getUint16(o + 6, true), f = dv.getInt16(o + 4, true);
    out.push({ lon: dv.getInt16(o, true) / 100, lat: dv.getInt16(o + 2, true) / 100, frp: f < 0 ? null : f / 10, minute: m & 2047, daysBack: (m >> 11) & 3, day: !!((m >> 13) & 1) });
  }
  return out;
}
