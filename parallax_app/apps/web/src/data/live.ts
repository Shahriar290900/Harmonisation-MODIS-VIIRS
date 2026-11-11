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
