// FROZEN interface (coordinator). The data agent implements these in this file; the UI agent only imports them.
import type { ActivityRecord, CellsFile, Manifest, Region, SnapshotIndex, DisplayState } from '../types';
import {
  B0WeightsSchema, B1FeaturesSchema, B1WeightsSchema, DataValidationError, ManifestSchema, RegionSchema, parseCellsFile,
  SnapshotIndexSchema, SourceEntrySchema, parseActivityFile, zodIssues,
  type B0Weights, type B1Features, type B1Weights, type SourceEntry
} from './schemas';
import { parseCsv, parseUtcMonth } from './format';
import type { z } from 'zod';

export interface DataApi {
  loadIndex(): Promise<SnapshotIndex>;
  loadManifest(snapshotId: string): Promise<Manifest>;
  loadRegions(snapshotId: string): Promise<Region[]>;
  loadGeo(snapshotId: string, region: Region): Promise<GeoJSON.FeatureCollection | GeoJSON.Feature>;
  loadActivity(snapshotId: string, aoiId: string, year: number): Promise<ActivityRecord[] | null>; // null if file absent
  loadActivityRange(snapshotId: string, aoiId: string, years: number[]): Promise<Map<number, ActivityRecord[] | null>>;
  loadCells(snapshotId: string, aoiId: string, year: number): Promise<CellsFile | null>;
  loadComparisonCsv(snapshotId: string): Promise<Record<string, string>[]>;
  loadModelCard(snapshotId: string, modelId: string): Promise<Record<string, unknown> | null>;
}

/** Extra loaders (superset of the frozen DataApi; UI may use them, nothing in DataApi changes). */
export interface LumosDataApi extends DataApi {
  loadSources(snapshotId: string): Promise<SourceEntry[]>;
  loadMetrics(snapshotId: string): Promise<Record<string, unknown> | null>;
  loadFeatures(snapshotId: string, aoiId: string, year: number): Promise<B1Features | null>;
  loadB0Weights(snapshotId: string): Promise<B0Weights | null>;
  loadB1Weights(snapshotId: string): Promise<B1Weights | null>;
  loadRecent(snapshotId: string, aoiId: string): Promise<Record<string, unknown> | null>;
  /** Absolute-ish URL of a file inside a snapshot (for links, e.g. figures/*.png). */
  fileUrl(snapshotId: string, relPath: string): string;
  /** Per-year activity outcomes (ok / absent / error) — never rejects (H1). */
  loadActivityYears(snapshotId: string, aoiId: string, years: number[]): Promise<Map<number, YearLoad>>;
  /** Whether manifest.files lists relPath (undefined until the manifest is loaded or if it has no files map). */
  isListed(snapshotId: string, relPath: string): boolean | undefined;
  /** Number of parsed cells/features files held in the bounded LRU (H4). */
  readonly heavyCacheSize: number;
  clearCache(): void;
}

export class HttpError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

/** Network-level failure (offline, DNS, CORS, aborted, timed out). `friendly` is safe to show in the UI. */
export class FetchError extends Error {
  constructor(public readonly url: string, public readonly kind: 'timeout' | 'network', public readonly friendly: string) {
    super(`${friendly} (${url})`);
    this.name = 'FetchError';
  }
}

/** Per-year load outcome for activity files (H1/H2). */
export type YearLoad =
  | { status: 'ok'; records: ActivityRecord[] }
  /** Genuinely absent from the snapshot (manifest does not list the file). */
  | { status: 'absent' }
  /** Listed but could not be loaded: offline/not cached, HTTP error, HTML fallback, timeout or invalid data. */
  | { status: 'error'; error: string; offline: boolean };

export const FETCH_TIMEOUT_MS = 15_000;
/** Max parsed cells/features files kept in memory (H4). */
export const HEAVY_CACHE_MAX = 12;

export interface DataApiOptions {
  /** Injected fetch (tests / SSR). Defaults to globalThis.fetch. */
  fetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  /** Abort a request after this many ms (default 15 s; WATCHDOG F1). */
  timeoutMs?: number;
}

function joinUrl(base: string, rel: string): string {
  if (!base) return rel;
  return base.endsWith('/') ? base + rel.replace(/^\/+/, '') : `${base}/${rel.replace(/^\/+/, '')}`;
}

function defaultBase(): string {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  } catch {
    return './';
  }
}

const looksLikeHtml = (t: string) => /^\s*<(!doctype|html)/i.test(t);

/** Is this failure most likely "offline / not cached" rather than bad data? */
export function isOfflineError(e: unknown): boolean {
  if (e instanceof FetchError) return true;
  if (e instanceof HttpError) return e.status === 0 || e.status === 503 || e.status === 504;
  return false;
}

/** Short, human message for a load failure. */
export function friendlyError(e: unknown): string {
  if (e instanceof FetchError) return e.friendly;
  if (e instanceof HttpError) return e.status === 404 ? 'File not found on the server (deploy mismatch?)' : `Server answered HTTP ${e.status}`;
  if (e instanceof DataValidationError) return 'The file failed validation';
  return String((e as Error)?.message ?? e);
}

/** Small LRU over promises (Map keeps insertion order; re-insert on hit). */
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) { this.m.delete(k); this.m.set(k, v); }
    return v;
  }
  set(k: string, v: V) {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  delete(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
}

export function createDataApi(baseUrl: string = defaultBase(), opts: DataApiOptions = {}): LumosDataApi {
  const rawFetch = opts.fetch ?? ((u: string, init?: { signal?: AbortSignal }) => globalThis.fetch(u, init));
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const cache = new Map<string, Promise<unknown>>();
  const heavy = new Lru<Promise<unknown>>(HEAVY_CACHE_MAX);
  const manifests = new Map<string, Manifest>();
  let indexCache: SnapshotIndex | null = null;

  /** fetch with AbortController timeout and friendly network errors (F1). */
  async function doFetch(url: string) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => {
        ctl?.abort();
        rej(new FetchError(url, 'timeout', `The request timed out after ${Math.round(timeoutMs / 1000)} s — the network is slow or unavailable`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        rawFetch(url, ctl ? { signal: ctl.signal } : undefined).catch((e: unknown) => {
          if (e instanceof FetchError) throw e;
          throw new FetchError(url, 'network', 'Could not reach the server — you may be offline and this file is not cached');
        }),
        timeout
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function snapBase(snapshotId: string): string {
    const s = indexCache?.snapshots.find((x) => x.snapshot_id === snapshotId);
    const p = s?.path ?? `data/${snapshotId}/`;
    return joinUrl(baseUrl, p.endsWith('/') ? p : `${p}/`);
  }
  const fileUrl = (snapshotId: string, rel: string) => joinUrl(snapBase(snapshotId), rel);

  /** true/false when the snapshot's manifest.files is known; undefined when it cannot tell (H2). */
  function isListed(snapshotId: string, rel: string): boolean | undefined {
    const files = manifests.get(snapshotId)?.files;
    if (!files || typeof files !== 'object' || !Object.keys(files).length) return undefined;
    return Object.prototype.hasOwnProperty.call(files, rel);
  }

  /**
   * Fetch text (not cached itself — getJson caches the parsed result, so raw text is dropped after parsing; H4).
   * mode 'optional': 404/410 and SPA-HTML fallback → null. mode 'required': any of those → error.
   */
  async function fetchText(url: string, optional: boolean): Promise<string | null> {
    const res = await doFetch(url);
    if (!res.ok) {
      if (optional && (res.status === 404 || res.status === 410)) return null;
      throw new HttpError(url, res.status);
    }
    const t = await res.text();
    if (looksLikeHtml(t)) {
      // Dev servers / stale deploys answer missing files with index.html (SPA fallback).
      if (optional) return null;
      throw new DataValidationError(url, ['received an HTML page instead of JSON (file missing on the server or SPA fallback)']);
    }
    return t;
  }

  function getJson<T>(url: string, optional: true, parse?: (v: unknown) => T, store?: 'heavy'): Promise<T | null>;
  function getJson<T>(url: string, optional: false, parse?: (v: unknown) => T, store?: 'heavy'): Promise<T>;
  function getJson<T>(url: string, optional: boolean, parse?: (v: unknown) => T, store?: 'heavy'): Promise<T | null> {
    const key = `j:${optional ? 'o' : 'r'}:${url}`;
    const c = store === 'heavy' ? heavy : cache;
    let p = c.get(key) as Promise<T | null> | undefined;
    if (!p) {
      p = fetchText(url, optional).then((t) => {
        if (t == null) return null;
        let v: unknown;
        try {
          v = JSON.parse(t);
        } catch (e) {
          throw new DataValidationError(url, [`JSON parse error: ${(e as Error).message}`]);
        }
        return parse ? parse(v) : (v as T);
      });
      c.set(key, p);
      p.catch(() => c.delete(key));
    }
    return p;
  }

  function zparse<S extends z.ZodTypeAny>(schema: S, url: string) {
    return (v: unknown): z.infer<S> => {
      const r = schema.safeParse(v);
      if (!r.success) throw new DataValidationError(url, zodIssues(r.error));
      return r.data;
    };
  }

  /** Listed → required; not listed → absent (null, no request); unknown → optional (404 → null). */
  function listedJson<T>(snapshotId: string, rel: string, parse: (v: unknown) => T, store?: 'heavy'): Promise<T | null> {
    const l = isListed(snapshotId, rel);
    if (l === false) return Promise.resolve(null);
    const url = fileUrl(snapshotId, rel);
    return l ? getJson(url, false, parse, store) : getJson(url, true, parse, store);
  }

  const api: LumosDataApi = {
    async loadIndex() {
      const url = joinUrl(baseUrl, 'data/index.json');
      const idx = await getJson(url, false, zparse(SnapshotIndexSchema, url));
      indexCache = idx;
      return idx;
    },
    async loadManifest(snapshotId) {
      const url = fileUrl(snapshotId, 'manifest.json');
      const m = (await getJson(url, false, zparse(ManifestSchema, url))) as Manifest;
      manifests.set(snapshotId, m);
      return m;
    },
    async loadRegions(snapshotId) {
      const url = fileUrl(snapshotId, 'regions.json');
      return getJson(url, false, (v) => {
        const arr = Array.isArray(v) ? v : (v as { regions?: unknown })?.regions;
        return zparse(RegionSchema.array(), url)(arr) as Region[];
      });
    },
    async loadGeo(snapshotId, region) {
      const url = fileUrl(snapshotId, region.geometry_path);
      return getJson<GeoJSON.FeatureCollection | GeoJSON.Feature>(url, false);
    },
    async loadActivity(snapshotId: string, aoiId: string, year: number) {
      const rel = `activity/${aoiId}/${year}.json`;
      const url = fileUrl(snapshotId, `activity/${encodeURIComponent(aoiId)}/${year}.json`);
      return listedJson(snapshotId, rel, (v) => sortRecords(parseActivityFile(v, url) as ActivityRecord[]));
    },
    /** Rejects if any year fails (frozen contract); the UI uses loadActivityYears for per-year outcomes. */
    async loadActivityRange(snapshotId: string, aoiId: string, years: number[]) {
      const out = new Map<number, ActivityRecord[] | null>();
      const res = await Promise.all(years.map((y) => api.loadActivity(snapshotId, aoiId, y)));
      years.forEach((y, i) => out.set(y, res[i]));
      return out;
    },
    /** Per-year outcome with error capture (Promise.allSettled): one bad year never blanks the AOI (H1). */
    async loadActivityYears(snapshotId: string, aoiId: string, years: number[]) {
      const out = new Map<number, YearLoad>();
      const res = await Promise.allSettled(years.map((y) => api.loadActivity(snapshotId, aoiId, y)));
      years.forEach((y, i) => {
        const r = res[i];
        if (r.status === 'fulfilled') out.set(y, r.value ? { status: 'ok', records: r.value } : { status: 'absent' });
        else out.set(y, { status: 'error', error: friendlyError(r.reason), offline: isOfflineError(r.reason) });
      });
      return out;
    },
    async loadCells(snapshotId: string, aoiId: string, year: number) {
      const rel = `cells/${aoiId}/${year}.json`;
      const url = fileUrl(snapshotId, `cells/${encodeURIComponent(aoiId)}/${year}.json`);
      return listedJson(snapshotId, rel, (v) => parseCellsFile(v, url), 'heavy') as Promise<CellsFile | null>;
    },
    async loadComparisonCsv(snapshotId) {
      const t = await fetchText(fileUrl(snapshotId, 'comparison.csv'), true);
      return t == null ? [] : parseCsv(t);
    },
    async loadModelCard(snapshotId, modelId) {
      return getJson<Record<string, unknown>>(fileUrl(snapshotId, `models/${encodeURIComponent(modelId)}/model_card.json`), true);
    },
    async loadSources(snapshotId) {
      const url = fileUrl(snapshotId, 'sources.json');
      const v = await getJson<unknown>(url, true);
      if (v == null) return [];
      const arr = Array.isArray(v) ? v : (v as { sources?: unknown[] }).sources ?? [];
      return zparse(SourceEntrySchema.array(), url)(arr);
    },
    async loadMetrics(snapshotId) {
      return getJson<Record<string, unknown>>(fileUrl(snapshotId, 'metrics.json'), true);
    },
    async loadFeatures(snapshotId: string, aoiId: string, year: number) {
      const rel = `features/${aoiId}/${year}.json`;
      const url = fileUrl(snapshotId, `features/${encodeURIComponent(aoiId)}/${year}.json`);
      return listedJson(snapshotId, rel, zparse(B1FeaturesSchema, url), 'heavy');
    },
    async loadB0Weights(snapshotId) {
      const url = fileUrl(snapshotId, 'models/B0_month_ratio/weights.json');
      return getJson(url, true, zparse(B0WeightsSchema, url));
    },
    async loadB1Weights(snapshotId) {
      const url = fileUrl(snapshotId, 'models/B1_poisson/weights.json');
      return getJson(url, true, zparse(B1WeightsSchema, url));
    },
    async loadRecent(snapshotId, aoiId) {
      return getJson<Record<string, unknown>>(fileUrl(snapshotId, `recent/${encodeURIComponent(aoiId)}.json`), true);
    },
    fileUrl,
    isListed,
    get heavyCacheSize() { return heavy.size; },
    clearCache() {
      cache.clear();
      heavy.clear();
    }
  };
  return api;
}

/** Records sorted by UTC month (Jan..Dec). */
export function sortRecords(recs: ActivityRecord[]): ActivityRecord[] {
  return [...recs].sort((a, b) => a.period_start_utc.localeCompare(b.period_start_utc));
}

/** 1-12 from period_start_utc (UTC). */
export function recordMonth(r: ActivityRecord): number {
  return parseUtcMonth(r.period_start_utc)?.month ?? NaN;
}
export function recordYear(r: ActivityRecord): number {
  return parseUtcMonth(r.period_start_utc)?.year ?? NaN;
}
/** Record for month 1-12 from a year's list (null if absent). */
export function recordForMonth(recs: ActivityRecord[] | null | undefined, month: number): ActivityRecord | null {
  return recs?.find((r) => recordMonth(r) === month) ?? null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** CONTRACT §3: 2001–2002 have no full-year Aqua protocol → harmonised estimate unsupported. */
export const UNSUPPORTED_YEAR_MAX = 2002;

/** Platforms that B's `reason` notes as missing/partial/error for this month (e.g. ['Terra MODIS']). */
export function platformIssues(reason: string | null | undefined): string[] {
  if (!reason) return [];
  const out = new Set<string>();
  const re = /(Aqua MODIS|Terra MODIS|S-NPP VIIRS|NOAA-20 VIIRS)\s+(missing|partial|error)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reason))) out.add(m[1]);
  return [...out];
}

/**
 * extract_status as it matters for the *display* (REVIEW M6): extract_status pools Aqua, Terra and S-NPP, but Terra is
 * never part of the target or the estimate. A month that is 'partial' only because of Terra is treated as complete
 * for the headline/state; the Terra field itself stays null and is noted in the evidence drawer.
 */
export function effectiveExtract(r: ActivityRecord): ActivityRecord['extract_status'] {
  if (r.extract_status !== 'partial') return r.extract_status;
  const p = platformIssues(r.reason);
  return p.length > 0 && p.every((x) => x === 'Terra MODIS') ? 'complete' : 'partial';
}

/** True when only Terra MODIS is missing/partial for this record (UI notes it on the Terra field only). */
export function terraOnlyIssue(r: ActivityRecord | null | undefined): boolean {
  return !!r && r.extract_status === 'partial' && effectiveExtract(r) === 'complete';
}

/**
 * Display state (glyph) for a calendar cell. Rules, in order:
 *  1. no record, or extract_status 'missing' → missing
 *  2. pre-2003 month with no estimate (CONTRACT §3: 2001–2002 have no Aqua protocol) → unsupported
 *  3. both raw VIIRS and estimate null → missing (missing ≠ zero)
 *  4. value_status 'unsupported' → unsupported
 *  5. effective extract 'partial' → partial (Terra-only partial months are not downgraded; REVIEW M6)
 *  6. observed VIIRS non-null and extract complete → observed
 *  7. estimate non-null → estimated.
 * value_status 'demo' never changes the state (UI shows a DEMO banner from manifest.synthetic).
 */
export function deriveDisplayState(r: ActivityRecord | null | undefined): DisplayState {
  if (!r || r.extract_status === 'missing') return 'missing';
  const viirs = r.raw_viirs_reference_detections, est = r.estimated_viirs_reference_detections;
  const yr = recordYear(r);
  if (isNum(yr) && yr <= UNSUPPORTED_YEAR_MAX && !isNum(est)) return 'unsupported';
  if (!isNum(viirs) && !isNum(est)) return 'missing';
  if (r.value_status === 'unsupported') return 'unsupported';
  const ex = effectiveExtract(r);
  if (ex === 'partial') return 'partial';
  if (isNum(viirs) && ex === 'complete') return 'observed';
  return isNum(est) ? 'estimated' : 'missing';
}

/** Value shown in calendar: observed VIIRS if (effective) extract complete & non-null, else estimate if present, else null. */
export function headlineValue(r: ActivityRecord | null | undefined): { value: number | null; kind: 'viirs_observed' | 'estimate' | 'none' } {
  if (!r) return { value: null, kind: 'none' };
  const viirs = r.raw_viirs_reference_detections, est = r.estimated_viirs_reference_detections;
  if (effectiveExtract(r) === 'complete' && isNum(viirs)) return { value: viirs, kind: 'viirs_observed' };
  if (isNum(est)) return { value: est, kind: 'estimate' };
  return { value: null, kind: 'none' };
}

/** REVIEW M7: anomaly triangles are only shown for months whose display state is complete (observed/estimated). */
export function shownAnomalyFlag(r: ActivityRecord | null | undefined, state: DisplayState | string = deriveDisplayState(r)): 'high' | 'low' | null {
  const f = r?.anomaly?.flag;
  if (f !== 'high' && f !== 'low') return null;
  return state === 'observed' || state === 'estimated' ? f : null;
}
