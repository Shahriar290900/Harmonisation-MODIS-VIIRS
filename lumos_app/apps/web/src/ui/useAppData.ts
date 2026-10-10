import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityRecord, CellsFile, Manifest, Region, SnapshotIndex } from '../types';
import { createDataApi, friendlyError, isOfflineError, type SourceEntry } from './bridge';

export const api = createDataApi();
export type { SourceEntry };

export interface Core { index: SnapshotIndex; snapshotId: string; snapshotPath: string; manifest: Manifest; regions: Region[]; sources: Map<string, SourceEntry> }

export function useCore() {
  const [core, setCore] = useState<Core | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; // WATCHDOG F3
    (async () => {
      try {
        const index = await api.loadIndex();
        const snapshotId = index.default;
        const snapshotPath = api.fileUrl(snapshotId, '');
        const [manifest, regions, srcList] = await Promise.all([
          api.loadManifest(snapshotId), api.loadRegions(snapshotId), api.loadSources(snapshotId).catch(() => [] as SourceEntry[])
        ]);
        const sources = new Map<string, SourceEntry>(srcList.map((s) => [s.id, s]));
        if (alive) setCore({ index, snapshotId, snapshotPath, manifest, regions, sources });
      } catch (e) {
        if (alive) setError(friendlyError(e));
      }
    })();
    return () => { alive = false; };
  }, []);
  return { core, error };
}

/** Per-year load status: 'absent' = genuinely not in the snapshot; 'error' = listed but could not be loaded. */
export type YearStatus = 'loading' | 'ok' | 'absent' | 'error';

export interface ActivityState {
  /** year → records (null when absent, failed or still loading) */
  map: Map<number, ActivityRecord[] | null>;
  status: Map<number, YearStatus>;
  errors: Map<number, string>;
  /** true when every failure looks like "offline / not cached" */
  offline: boolean;
  loading: boolean;
  retry: () => void;
}

/** Activity for one AOI over `years`, with per-year outcomes (REVIEW H1/H2, E2E B1). */
export function useActivity(snapshotId: string | undefined, aoiId: string, years: number[]): ActivityState {
  const [data, setData] = useState<{ k: string; map: Map<number, ActivityRecord[] | null>; status: Map<number, YearStatus>; errors: Map<number, string>; offline: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  const yk = years.join(',');
  const k = `${snapshotId}|${aoiId}|${yk}`;
  useEffect(() => {
    if (!snapshotId) return;
    let alive = true;
    api.loadActivityYears(snapshotId, aoiId, years).then((res) => {
      if (!alive) return;
      const map = new Map<number, ActivityRecord[] | null>(), status = new Map<number, YearStatus>(), errors = new Map<number, string>();
      let offline = true, nErr = 0;
      for (const [y, r] of res) {
        status.set(y, r.status);
        map.set(y, r.status === 'ok' ? r.records : null);
        if (r.status === 'error') { errors.set(y, r.error); nErr++; if (!r.offline) offline = false; }
      }
      setData({ k, map, status, errors, offline: nErr > 0 && offline });
    }).catch((e) => {
      // loadActivityYears never rejects; belt and braces: mark every year unavailable.
      if (!alive) return;
      const status = new Map<number, YearStatus>(years.map((y) => [y, 'error']));
      setData({ k, map: new Map(), status, errors: new Map(years.map((y) => [y, friendlyError(e)])), offline: isOfflineError(e) });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return useMemo(() => {
    if (data && data.k === k) return { map: data.map, status: data.status, errors: data.errors, offline: data.offline, loading: false, retry };
    return { map: new Map(), status: new Map(years.map((y) => [y, 'loading' as YearStatus])), errors: new Map(), offline: false, loading: true, retry };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, k, retry]);
}

export interface CellsState { loaded: boolean; file: CellsFile | null; error: string | null; retry: () => void }

export function useCells(snapshotId: string | undefined, region: Region | undefined, year: number): CellsState {
  const [cells, setCells] = useState<{ k: string; f: CellsFile | null; err: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const k = `${region?.aoi_id}:${year}`;
  useEffect(() => {
    if (!snapshotId || !region) return;
    if (region.cells_exported === false) { setCells({ k, f: null, err: null }); return; }
    let alive = true;
    api.loadCells(snapshotId, region.aoi_id, year)
      .then((f) => alive && setCells({ k, f, err: null }))
      .catch((e) => alive && setCells({ k, f: null, err: friendlyError(e) }));
    return () => { alive = false; };
  }, [snapshotId, region, year, k, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return cells && cells.k === k ? { loaded: true, file: cells.f, error: cells.err, retry } : { loaded: false, file: null, error: null, retry };
}

export function useGeo(snapshotId: string | undefined, region: Region | undefined) {
  const [geo, setGeo] = useState<{ id: string; g: GeoJSON.FeatureCollection | GeoJSON.Feature } | null>(null);
  useEffect(() => {
    if (!snapshotId || !region) return;
    let alive = true;
    api.loadGeo(snapshotId, region).then((g) => alive && setGeo({ id: region.aoi_id, g })).catch(() => { /* outline is decorative */ });
    return () => { alive = false; };
  }, [snapshotId, region]);
  return geo && geo.id === region?.aoi_id ? geo.g : null;
}

/** Flatten year→records into chronological list with (year, month) keys; missing files become null entries. */
export function useFlat(map: Map<number, ActivityRecord[] | null> | null, years: number[]) {
  return useMemo(() => {
    const out: { year: number; month: number; r: ActivityRecord | null }[] = [];
    if (!map) return out;
    for (const y of years) {
      const recs = map.get(y) ?? null;
      for (let m = 1; m <= 12; m++) out.push({ year: y, month: m, r: recs?.find((x) => +x.period_start_utc.slice(5, 7) === m) ?? null });
    }
    return out;
  }, [map, years]);
}
