// Shared snapshot + selection for every page. The provider loads the snapshot once and keeps the selection
// (place, year, month) valid; pages call useMonthData() for the monthly series of the selected place.
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ActivityRecord, Region } from '../types';
import { useCore, useActivity, useCells, useGeo, useFlat, type Core, type YearStatus } from '../ui/useAppData';
import { deriveDisplayState, headlineValue, setSelection, useSelection } from '../ui/bridge';
import { cellStateFor } from '../ui/Calendar';
import { DEFAULT_AOI } from '../data/regions';
import { WsContext as Ctx, type Ws } from './wsContext';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { core, error } = useCore();
  const sel = useSelection();
  const allYears = core?.manifest.years ?? [];
  const aoiOk = !!core && core.regions.some((r) => r.aoi_id === sel.aoiId) && (core.manifest.aois.length === 0 || core.manifest.aois.includes(sel.aoiId));
  const yearOk = allYears.includes(sel.year);
  // A bogus place or year (pasted link, old storage) is replaced by a valid one before anything is fetched.
  useEffect(() => {
    if (!core) return;
    if (!aoiOk) {
      const first = core.regions.find((r) => r.aoi_id === DEFAULT_AOI && core.manifest.aois.includes(r.aoi_id)) ?? core.regions.find((r) => core.manifest.aois.includes(r.aoi_id)) ?? core.regions[0];
      setSelection({ aoiId: first?.aoi_id ?? DEFAULT_AOI });
    }
    if (!yearOk && allYears.length) setSelection({ year: allYears.includes(2016) ? 2016 : allYears[allYears.length - 1] });
  }, [core, sel.aoiId, sel.year, aoiOk, yearOk]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="boot boot--err"><h1>Could not load the data snapshot</h1><p>{error}</p></div>;
  if (!core) return <div className="boot" aria-busy="true"><div className="boot__spin" /><p>Opening the data…</p></div>;
  const region = core.regions.find((r) => r.aoi_id === sel.aoiId);
  return <Ctx.Provider value={{ core, sel, region, allYears, ready: aoiOk && yearOk }}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Ws {
  const w = useContext(Ctx);
  if (!w) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return w;
}

/** Monthly records of the selected place over a year range, plus the selected month's record and display state. */
export function useMonthData(initialRange?: [number, number]) {
  const { core, sel, region, allYears, ready } = useWorkspace();
  const [range, setRange] = useState<[number, number] | null>(initialRange ?? null);
  const [from, to] = range ?? [allYears[0] ?? 2001, allYears[allYears.length - 1] ?? 2025];
  const years = useMemo(() => allYears.filter((y) => y >= from && y <= to), [allYears, from, to]);
  const act = useActivity(ready ? core.snapshotId : undefined, sel.aoiId, allYears);
  const flatAll = useFlat(act.map, allYears);
  const flat = useMemo(() => flatAll.filter((p) => p.year >= from && p.year <= to), [flatAll, from, to]);
  const cells = useCells(core.snapshotId, region, sel.year);
  const geo = useGeo(core.snapshotId, region);
  const max = useMemo(() => {
    let m = 1;
    for (const p of flatAll) {
      const st = deriveDisplayState(p.r);
      if (st === 'missing' || st === 'unsupported') continue;
      const v = headlineValue(p.r).value; if (v != null && v > m) m = v;
    }
    return m;
  }, [flatAll]);
  const record = flatAll.find((p) => p.year === sel.year && p.month === sel.month)?.r ?? null;
  const yearStatus: YearStatus = act.status.get(sel.year) ?? (act.loading ? 'loading' : 'ok');
  const monthState = cellStateFor(record, yearStatus);
  const errorYears = useMemo(() => [...act.status].filter(([, st]) => st === 'error').map(([y]) => y), [act.status]);
  const allRecords = useMemo(() => flat.map((p) => p.r).filter(Boolean) as ActivityRecord[], [flat]);
  const setYears = (f: number, t: number) => {
    setRange([f, t]);
    if (sel.year < f || sel.year > t) setSelection({ year: Math.max(f, Math.min(t, sel.year)) });
  };
  return { from, to, years, setYears, act, flatAll, flat, cells, geo, max, record, monthState, errorYears, allRecords, yearStatus };
}
