// Every number the March 2024 story shows is computed here from the snapshot (Bangladesh activity files). Nothing is typed in.
import { useMemo } from 'react';
import type { ActivityRecord } from '../types';
import { useActivity, useFlat } from '../ui/useAppData';
import { headlineValue } from '../ui/bridge';
import { useWorkspace } from '../shell/workspace';

export const STORY_AOI = 'BGD', STORY_YEAR = 2024, STORY_MONTH = 3;
export const fmt = (v: number) => Math.round(v).toLocaleString('en-US');

export function useStoryData() {
  const { core, allYears } = useWorkspace();
  const act = useActivity(core.snapshotId, STORY_AOI, allYears);
  const flat = useFlat(act.map, allYears);
  return useMemo(() => {
    const loading = act.loading;
    const rec = flat.find((p) => p.year === STORY_YEAR && p.month === STORY_MONTH)?.r ?? null;
    const region = core.regions.find((r) => r.aoi_id === STORY_AOI);
    // Share of the sharper satellite's detections that fall in March + April, over the years it has flown (complete months only).
    const sharp = flat.filter((p) => p.r && p.r.extract_status === 'complete' && p.r.raw_viirs_reference_detections != null);
    const yrs = [...new Set(sharp.map((p) => p.year))];
    const tot = sharp.reduce((a, p) => a + p.r!.raw_viirs_reference_detections!, 0);
    const ma = sharp.filter((p) => p.month === 3 || p.month === 4).reduce((a, p) => a + p.r!.raw_viirs_reference_detections!, 0);
    const share = tot > 0 ? ma / tot : null;
    // How March 2024 ranks among every March in the record (lowest = 1), using the best available value of each.
    const marches = flat.filter((p) => p.month === STORY_MONTH && p.r).map((p) => ({ y: p.year, v: headlineValue(p.r).value })).filter((x): x is { y: number; v: number } => x.v != null);
    const mine = marches.find((x) => x.y === STORY_YEAR);
    const lowRank = mine ? marches.filter((x) => x.v < mine.v).length + 1 : null;
    let max = 1;
    for (const p of flat) { const v = headlineValue(p.r).value; if (v != null && v > max) max = v; }
    return { loading, act, flat, rec: rec as ActivityRecord | null, region, share, shareFrom: yrs.length ? Math.min(...yrs) : null, shareTo: yrs.length ? Math.max(...yrs) : null, lowRank, marchCount: marches.length, max, allYears };
  }, [act, flat, core]);
}
