// Landing data layer: thin wrapper over createDataApi (same loaders/caches as the workspace).
import { useEffect, useState } from 'react';
import { createDataApi, deriveDisplayState, headlineValue } from '../../data/api';
import type { ActivityRecord, DisplayState, Manifest, Region } from '../../types';

export const api = createDataApi();
export const BASE_URL: string = (import.meta.env?.BASE_URL as string | undefined) ?? './';

export interface Core { snapshotId: string; manifest: Manifest; regions: Region[] }

export interface MonthCell {
  month: number;
  aqua: number | null;
  viirs: number | null;
  est: number | null;
  lo: number | null;
  hi: number | null;
  value: number | null;
  kind: 'viirs_observed' | 'estimate' | 'none';
  state: DisplayState;
  flag: string | null;
}
export interface YearRow { year: number; months: MonthCell[]; mean: number | null; status: 'ok' | 'absent' | 'error' }
export interface AoiSeries {
  aoiId: string;
  rows: YearRow[];
  max: number;
  /** Usual peak: 1-12, by mean headline value over the years in `peakSpan` (observed/estimated months only). */
  peakMonth: number;
  /** First/last year contributing to the all-year mean behind `peakMonth`. */
  peakSpan: [number, number] | null;
  /** Usual season around `peakMonth`: contiguous months whose mean is ≥ half the peak mean (start, end; may wrap). */
  season: [number, number];
  /** Each year's own peak month (argmax over its observed/estimated months), or null when the year has none. */
  peakByYear: Record<number, number | null>;
  bestYear: number; // latest year whose usual peak month is observed/estimated
  /** The month deep links open at: bestYear's own peak month (REVIEW M4 — not the all-year mean month). */
  openMonth: number;
  observedYears: [number, number] | null;
  estimatedYears: [number, number] | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function cellOf(month: number, r: ActivityRecord | null): MonthCell {
  const hv = headlineValue(r);
  return {
    month,
    aqua: num(r?.raw_modis_detections),
    viirs: num(r?.raw_viirs_reference_detections),
    est: num(r?.estimated_viirs_reference_detections),
    lo: num(r?.estimate_interval_low),
    hi: num(r?.estimate_interval_high),
    value: hv.value,
    kind: hv.kind,
    state: deriveDisplayState(r),
    flag: (r?.anomaly as { flag?: string } | null | undefined)?.flag ?? null
  };
}

let corePromise: Promise<Core> | null = null;
export function loadCore(): Promise<Core> {
  if (!corePromise) {
    corePromise = (async () => {
      const idx = await api.loadIndex();
      const snapshotId = idx.default ?? idx.snapshots[0]?.snapshot_id;
      if (!snapshotId) throw new Error('No snapshot in data/index.json');
      const [manifest, regions] = await Promise.all([api.loadManifest(snapshotId), api.loadRegions(snapshotId)]);
      return { snapshotId, manifest, regions: regions.filter((r) => !manifest.aois.length || manifest.aois.includes(r.aoi_id)) };
    })();
    corePromise.catch(() => { corePromise = null; });
  }
  return corePromise;
}

const seriesCache = new Map<string, Promise<AoiSeries>>();
let queue: Promise<unknown> = Promise.resolve();

/** Activity for every manifest year of one AOI (queued: one AOI at a time, years in parallel). */
export function loadSeries(core: Core, aoiId: string): Promise<AoiSeries> {
  let p = seriesCache.get(aoiId);
  if (!p) {
    const run = async (): Promise<AoiSeries> => {
      const years = core.manifest.years;
      const res = await api.loadActivityYears(core.snapshotId, aoiId, years);
      const rows: YearRow[] = years.map((year) => {
        const o = res.get(year);
        const recs = o?.status === 'ok' ? o.records : [];
        const months = Array.from({ length: 12 }, (_, i) => {
          const r = recs.find((x) => Number(x.period_start_utc.slice(5, 7)) === i + 1) ?? null;
          return cellOf(i + 1, r);
        });
        const vals = months.filter((m) => m.state !== 'missing' && m.state !== 'unsupported' && m.value != null).map((m) => m.value!);
        return { year, months, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, status: o?.status ?? 'error' };
      });
      return summarize(aoiId, rows);
    };
    p = queue.then(run, run);
    queue = p.catch(() => undefined);
    seriesCache.set(aoiId, p);
    p.catch(() => seriesCache.delete(aoiId));
  }
  return p;
}

function summarize(aoiId: string, rows: YearRow[]): AoiSeries {
  let max = 1;
  const sums = new Array(12).fill(0), ns = new Array(12).fill(0);
  let obs: [number, number] | null = null, est: [number, number] | null = null, span: [number, number] | null = null;
  const peakByYear: Record<number, number | null> = {};
  for (const r of rows) {
    let yBest = -1, yPeak: number | null = null;
    for (const m of r.months) {
      if (m.value == null || m.state === 'missing' || m.state === 'unsupported') continue;
      if (m.value > max) max = m.value;
      if (m.state === 'observed' || m.state === 'estimated') {
        sums[m.month - 1] += m.value; ns[m.month - 1]++;
        span = span ? [Math.min(span[0], r.year), Math.max(span[1], r.year)] : [r.year, r.year];
        if (m.value > yBest) { yBest = m.value; yPeak = m.month; }
      }
      if (m.state === 'observed') obs = obs ? [Math.min(obs[0], r.year), Math.max(obs[1], r.year)] : [r.year, r.year];
      if (m.state === 'estimated') est = est ? [Math.min(est[0], r.year), Math.max(est[1], r.year)] : [r.year, r.year];
    }
    peakByYear[r.year] = yPeak;
  }
  const means = sums.map((s2, i) => (ns[i] ? s2 / ns[i] : -1));
  let peakMonth = 1, best = -1;
  means.forEach((v, i) => { if (v > best) { best = v; peakMonth = i + 1; } });
  let bestYear = rows[rows.length - 1]?.year ?? 2016;
  for (let i = rows.length - 1; i >= 0; i--) {
    const st = rows[i].months[peakMonth - 1].state;
    if (st === 'observed' || st === 'estimated') { bestYear = rows[i].year; break; }
  }
  const openMonth = peakByYear[bestYear] ?? peakMonth;
  return { aoiId, rows, max, peakMonth, peakSpan: span, season: seasonOf(means, peakMonth), peakByYear, bestYear, openMonth, observedYears: obs, estimatedYears: est };
}

/** Contiguous months around the peak whose mean is at least half the peak mean (at most 11 months wide). */
export function seasonOf(means: number[], peakMonth: number): [number, number] {
  const p = peakMonth - 1, thr = means[p] * 0.5;
  if (!(means[p] > 0)) return [peakMonth, peakMonth];
  let a = 0, b = 0;
  while (a + b < 11 && means[(p - a - 1 + 12) % 12] >= thr) a++;
  while (a + b < 11 && means[(p + b + 1) % 12] >= thr) b++;
  return [((p - a + 12) % 12) + 1, ((p + b) % 12) + 1];
}

/** "ten", "seven"… for small counts (copy derived from data, REVIEW L5); digits above twenty-nine. */
export function countWord(n: number): string {
  const W = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  if (n < 20) return W[n] ?? String(n);
  if (n < 30) return n === 20 ? 'twenty' : `twenty-${W[n - 20]}`;
  return String(n);
}

export const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
/** Honest text for a section whose data could not load. */
export const unavailableText = (what: string) => `${what} ${offline() ? 'unavailable offline — open it once online to cache it' : 'could not be loaded'}.`;

export function workspaceHash(aoiId: string, year: number, month: number): string {
  return `#aoi=${encodeURIComponent(aoiId)}&y=${year}&m=${month}`;
}

export function useCore(): { core: Core | null; error: string | null } {
  const [s, set] = useState<{ core: Core | null; error: string | null }>({ core: null, error: null });
  useEffect(() => {
    let live = true;
    loadCore().then((core) => live && set({ core, error: null }), (e) => live && set({ core: null, error: String(e?.message ?? e) }));
    return () => { live = false; };
  }, []);
  return s;
}

/** Load a set of AOI series; `enabled` lets sections defer until they approach the viewport. */
export function useSeries(core: Core | null, aoiIds: string[], enabled = true): Map<string, AoiSeries> {
  return useSeriesStatus(core, aoiIds, enabled).map;
}

/**
 * Same as useSeries, plus the ids whose load failed (e.g. offline and not cached) so sections can say so
 * instead of "Loading…" forever. Failed ids are retried when the browser comes back online.
 */
export function useSeriesStatus(core: Core | null, aoiIds: string[], enabled = true): { map: Map<string, AoiSeries>; failed: ReadonlySet<string> } {
  const [map, setMap] = useState<Map<string, AoiSeries>>(new Map());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [retry, setRetry] = useState(0);
  const key = aoiIds.join(',');
  useEffect(() => {
    if (!core || !enabled) return;
    let live = true;
    for (const id of aoiIds) {
      loadSeries(core, id).then((s) => {
        if (!live) return;
        setMap((m) => (m.get(id) === s ? m : new Map(m).set(id, s)));
        setFailed((f) => { if (!f.has(id)) return f; const n = new Set(f); n.delete(id); return n; });
      }, () => {
        if (live) setFailed((f) => (f.has(id) ? f : new Set(f).add(id)));
      });
    }
    return () => { live = false; };
  }, [core, key, enabled, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyFailed = failed.size > 0;
  useEffect(() => {
    if (!anyFailed) return;
    const on = () => setRetry((r) => r + 1);
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [anyFailed]);
  return { map, failed };
}

/** True once the element is within `margin` of the viewport (sticky). */
export function useNear(ref: React.RefObject<Element>, margin = '800px'): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}

/** Mean monthly values per year for each series (for the 2012 jump chart). */
export function annualMeans(s: AoiSeries, fromYear = 2003) {
  const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return s.rows.filter((r) => r.year >= fromYear).map((r) => {
    const ok = r.months.filter((m) => m.state !== 'missing' && m.state !== 'unsupported');
    return {
      year: r.year,
      aqua: mean(ok.map((m) => m.aqua)),
      viirs: mean(ok.map((m) => m.viirs)),
      est: mean(ok.map((m) => m.est)),
      lo: mean(ok.map((m) => m.lo)),
      hi: mean(ok.map((m) => m.hi)),
      partial: r.months.some((m) => m.state === 'partial' || m.state === 'missing')
    };
  });
}
