// Live NASA FIRMS near-real-time layer (Netlify function /api/firms-live). Not part of the calendar or the model.
import { useCallback, useEffect, useState } from 'react';

/** [lon, lat, acq_date, acq_time, frp, confidence, daynight] */
export type LiveRow = [number, number, string, string, number | null, string | number | null, string];
export interface LiveRegion { modis: LiveRow[]; viirs: LiveRow[] }
export interface LiveData {
  fetched_utc: string; source_urls: string[]; viirs_source?: string | null; note: string;
  regions: Record<string, LiveRegion>; counts?: Record<string, { modis: number; viirs: number }>; warnings?: string[];
}

export const LIVE_NOTE = 'Near-real-time, may be revised. A hotspot is not a confirmed wildfire. Not part of the calendar or the model.';

/** Which live bucket covers an AOI (the function only serves BGD, USA-CA and AUS-NSW). */
export function liveKeyFor(aoiId: string | undefined): 'BGD' | 'USA-CA' | 'AUS-NSW' | null {
  if (!aoiId) return null;
  if (aoiId === 'BGD' || aoiId.startsWith('BGD-')) return 'BGD';
  if (aoiId === 'USA-CA') return 'USA-CA';
  if (aoiId === 'AUS-NSW') return 'AUS-NSW';
  return null;
}

let cached: { at: number; data: LiveData } | null = null;

/** Returns null when the endpoint is not available (local dev, GitHub Pages, offline, 5xx, bad payload). */
export async function fetchLive(timeoutMs = 8000): Promise<LiveData | null> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/firms-live', { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<LiveData>;
    if (!j || typeof j.fetched_utc !== 'string' || !j.regions || typeof j.regions !== 'object') return null;
    cached = { at: Date.now(), data: j as LiveData };
    return cached.data;
  } catch { return null; } finally { clearTimeout(t); }
}

export type LiveStatus = 'idle' | 'loading' | 'ok' | 'unavailable';
export function useLive(enabled: boolean): { status: LiveStatus; data: LiveData | null; retry: () => void } {
  const [state, setState] = useState<{ status: LiveStatus; data: LiveData | null }>({ status: 'idle', data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    setState((s) => ({ status: 'loading', data: s.data }));
    fetchLive().then((d) => { if (!off) setState(d ? { status: 'ok', data: d } : { status: 'unavailable', data: null }); });
    return () => { off = true; };
  }, [enabled, tick]);
  const retry = useCallback(() => { cached = null; setTick((x) => x + 1); }, []);
  return { ...state, retry };
}

/** Rows of one region/instrument, clipped to a bbox (needed for BGD divisions, which share the BGD bucket). */
export function clipRows(rows: LiveRow[], bbox: [number, number, number, number] | undefined): LiveRow[] {
  if (!bbox) return rows;
  const [w, s, e, n] = bbox;
  return rows.filter((r) => r[0] >= w && r[0] <= e && r[1] >= s && r[1] <= n);
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

const worldCache = new Map<string, { at: number; fetched: string; sources: WorldSource[] }>();
/** One request for some of the sources. Never throws: a source that cannot be read comes back as state "failed" with the reason. */
export async function fetchWorld(keys: WorldKey[], timeoutMs = 90_000): Promise<{ fetched_utc: string | null; sources: WorldSource[] }> {
  const ck = keys.join(',');
  const hit = worldCache.get(ck);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { fetched_utc: hit.fetched, sources: hit.sources };
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
  const t = setTimeout(() => ctl.abort(), 45_000);
  try {
    const r = await fetch('/api/sats', { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json() as SatsFile;
    if (!Array.isArray(j?.tles) || !j.tles.length) return null;
    satsCache = { at: Date.now(), v: j };
    return j;
  } catch { return null; } finally { clearTimeout(t); }
}
