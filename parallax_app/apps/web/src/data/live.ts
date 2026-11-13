// Live NASA FIRMS near-real-time layer (Netlify function /api/firms-live, worldwide). Not part of the calendar or the model.
import { useCallback, useEffect, useState } from 'react';
import { rowTime } from '../live/world';

/** [lon, lat, acq_date, acq_time(HHMM), frp, confidence, daynight] */
export type LiveRow = [number, number, string, string, number | null, string | number | null, string];

export const LIVE_NOTE = 'Near-real-time, may be revised. A hotspot is not a confirmed wildfire. Not part of the calendar or the model.';

/** Which of the three regions a place belongs to (used to pick the Live page's starting view). */
export function liveKeyFor(aoiId: string | undefined): 'BGD' | 'USA-CA' | 'AUS-NSW' | null {
  if (!aoiId) return null;
  if (aoiId === 'BGD' || aoiId.startsWith('BGD-')) return 'BGD';
  if (aoiId === 'USA-CA') return 'USA-CA';
  if (aoiId === 'AUS-NSW') return 'AUS-NSW';
  return null;
}

export type LiveStatus = 'idle' | 'loading' | 'ok' | 'unavailable';
export interface LiveData { fetched_utc: string | null; sources: WorldSource[] }

/** The worldwide feed (same requests and CDN cache as the Live page), loaded one source at a time. */
export function useLive(enabled: boolean): { status: LiveStatus; data: LiveData | null; retry: () => void } {
  const [state, setState] = useState<{ status: LiveStatus; data: LiveData | null }>({ status: 'idle', data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    setState((s) => ({ status: 'loading', data: s.data }));
    (async () => {
      let fetched: string | null = null; const got: WorldSource[] = [];
      for (const group of [['modis', 'snpp'], ['noaa20'], ['noaa21']] as WorldKey[][]) {
        const r = await fetchWorld(group);
        if (off) return;
        got.push(...r.sources); if (r.fetched_utc && (!fetched || r.fetched_utc > fetched)) fetched = r.fetched_utc;
      }
      setState(got.some((x) => x.state === 'ok' || x.state === 'empty') ? { status: 'ok', data: { fetched_utc: fetched, sources: got } } : { status: 'unavailable', data: null });
    })();
    return () => { off = true; };
  }, [enabled, tick]);
  const retry = useCallback(() => { worldCache.clear(); setTick((x) => x + 1); }, []);
  return { ...state, retry };
}

/** Detections of the worldwide feed inside a bbox, as the old row shape the map layer draws. VIIRS = NOAA-20 + NOAA-21 (+ Suomi NPP when it has data). */
export function rowsInBbox(sources: WorldSource[], bbox: [number, number, number, number] | undefined): { modis: LiveRow[]; viirs: LiveRow[] } {
  const out = { modis: [] as LiveRow[], viirs: [] as LiveRow[] };
  for (const s of sources) {
    const r = s.raw; if (!r) continue;
    const g = s.key === 'modis' ? out.modis : out.viirs;
    for (let i = 0; i < r.length; i += 4) {
      const lon = r[i] / 100, lat = r[i + 1] / 100;
      if (bbox && (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3])) continue;
      const t = rowTime(s, r[i + 3] & 0xffff);
      g.push([lon, lat, t.date, t.hhmm.replace(':', ''), r[i + 2] < 0 ? null : r[i + 2] / 10, null, (r[i + 3] >> 13) & 1 ? 'D' : 'N']);
    }
  }
  return out;
}

export function fmtUtc(iso: string): { utc: string; local: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { utc: iso, local: '' };
  return { utc: d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', local: d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) };
}

/* ---------- Worldwide last 24 h (Live page): /api/firms-live?scope=world, packed binary rows (see netlify/functions/lib/world.mts) ---------- */
export type WorldKey = 'modis' | 'noaa20' | 'noaa21' | 'snpp';
export type WorldState = 'loading' | 'ok' | 'empty' | 'failed';
export interface WorldSource {
  key: WorldKey; label: string; state: WorldState; count: number; newest_utc: string | null; oldest_utc: string | null; error?: string;
  /** 4 Int16 per detection: lon x100, lat x100, heat output x10 (-1 = not given), minute | daysBack << 11 | isDay << 13. */
  raw: Int16Array | null;
}
export const WORLD_LABEL: Record<WorldKey, string> = { modis: 'MODIS (Terra and Aqua)', noaa20: 'NOAA-20 VIIRS', noaa21: 'NOAA-21 VIIRS', snpp: 'Suomi NPP VIIRS' };
export const WORLD_KEYS: WorldKey[] = ['modis', 'noaa20', 'noaa21', 'snpp'];

function decodeB64(b64: string): Int16Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Int16Array(u.buffer, 0, Math.floor(u.length / 8) * 4);
}

export const worldCache = new Map<string, { at: number; fetched: string; sources: WorldSource[] }>();
/** One request for some of the sources. Never throws: a source that cannot be read comes back as state "failed" with the reason. */
type WorldAnswer = { fetched_utc: string | null; sources: WorldSource[] };
const worldInflight = new Map<string, Promise<WorldAnswer>>();
/** Same request from two views at once (Earth and Map) is made only once. */
export function fetchWorld(keys: WorldKey[], timeoutMs = 30_000): Promise<WorldAnswer> {
  const ck = keys.join(',');
  const hit = worldCache.get(ck);
  if (hit && Date.now() - hit.at < 10 * 60_000) return Promise.resolve({ fetched_utc: hit.fetched, sources: hit.sources });
  let p = worldInflight.get(ck);
  if (!p) { p = fetchWorldNow(keys, timeoutMs).finally(() => worldInflight.delete(ck)); worldInflight.set(ck, p); }
  return p;
}
async function fetchWorldNow(keys: WorldKey[], timeoutMs: number): Promise<WorldAnswer> {
  const ck = keys.join(',');
  const failed = (why: string): WorldSource[] => keys.map((key) => ({ key, label: WORLD_LABEL[key], state: 'failed', count: 0, newest_utc: null, oldest_utc: null, error: why, raw: null }));
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`/api/firms-live?scope=world&src=${ck}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return { fetched_utc: null, sources: failed(r.status === 404 ? 'feed is not available on this site' : 'the feed answered with an error') };
    const j = await r.json() as { fetched_utc?: string; sources?: Record<string, { state: WorldState; count: number; newest_utc: string | null; oldest_utc: string | null; data: string; error?: string }> };
    if (!j?.sources || typeof j.fetched_utc !== 'string') return { fetched_utc: null, sources: failed('unexpected answer from the feed') };
    const sources = keys.map((key): WorldSource => {
      const s = j.sources![key];
      if (!s) return failed('missing from the answer')[0];
      return { key, label: WORLD_LABEL[key], state: s.state, count: s.count, newest_utc: s.newest_utc, oldest_utc: s.oldest_utc, error: s.error, raw: s.state === 'ok' && s.data ? decodeB64(s.data) : null };
    });
    if (sources.every((s) => s.state !== 'failed')) worldCache.set(ck, { at: Date.now(), fetched: j.fetched_utc, sources });
    return { fetched_utc: j.fetched_utc, sources };
  } catch (e) {
    return { fetched_utc: null, sources: failed((e as Error)?.name === 'AbortError' ? 'the feed took too long' : 'the feed could not be reached') };
  } finally { clearTimeout(t); }
}

/** TLE records for the satellites (/api/sats). Null when unavailable. */
export interface SatTle { key: string; name: string; norad: number; line1: string; line2: string; epoch_utc: string | null }
export interface SatsFile { fetched_utc: string; tles: SatTle[]; failed: { name: string; error: string }[] }
let satsCache: { at: number; v: SatsFile } | null = null;
export async function fetchSats(): Promise<SatsFile | null> {
  if (satsCache && Date.now() - satsCache.at < 30 * 60_000) return satsCache.v;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch('/api/sats', { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json() as SatsFile;
    if (!Array.isArray(j?.tles) || !j.tles.length) return null;
    satsCache = { at: Date.now(), v: j };
    return j;
  } catch { return null; } finally { clearTimeout(t); }
}
