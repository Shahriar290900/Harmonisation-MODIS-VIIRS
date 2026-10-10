// "Harmonize in your browser": recompute an AOI's 12 monthly estimates from exported weights and compare with the bundle.
import type { ActivityRecord, CellsFile } from '../types';
import type { B0Weights, B1Features, B1Weights } from '../data/schemas';
import type { LumosDataApi } from '../data/api';
import { parseUtcMonth } from '../data/format';
import { b0FromCells, b0FromRecords } from './b0';
import { b1FromFeatures } from './b1';

export type BrowserModelId = 'B0_month_ratio' | 'B1_poisson';
export const BROWSER_MODELS: BrowserModelId[] = ['B0_month_ratio', 'B1_poisson'];
export const PARITY_TOLERANCE = 1e-3;

export interface RecomputeInputs {
  aoiId: string;
  /** If given and ≤ 2002, every month is null (CONTRACT §3: no Aqua protocol → unsupported). */
  year?: number;
  b0Weights?: B0Weights | null;
  b1Weights?: B1Weights | null;
  /** B0 from cells (preferred, cell-level like the notebook). */
  cells?: CellsFile | null;
  /** B0 fallback from AOI-level Aqua counts when cells are not exported (e.g. whole AUS). */
  records?: ActivityRecord[] | null;
  /** B1 inputs. */
  features?: B1Features | null;
}

export interface RecomputeResult {
  modelId: BrowserModelId;
  /** index 0 = Jan; null where it cannot be computed */
  months: (number | null)[];
  inputs: 'cells' | 'records' | 'features';
}

/** Recompute the 12 AOI-month values for one model. Throws if required inputs are absent. */
export function recomputeAoiMonth(modelId: BrowserModelId, inp: RecomputeInputs): RecomputeResult {
  const r = recomputeRaw(modelId, inp);
  if (inp.year !== undefined && inp.year <= 2002) r.months = r.months.map(() => null);
  return r;
}

function recomputeRaw(modelId: BrowserModelId, inp: RecomputeInputs): RecomputeResult {
  if (modelId === 'B0_month_ratio') {
    if (!inp.b0Weights) throw new Error('B0_month_ratio weights not available');
    if (inp.cells) return { modelId, months: maskUnknown(b0FromCells(inp.b0Weights, inp.aoiId, inp.cells), inp.records), inputs: 'cells' };
    if (inp.records) return { modelId, months: maskUnknown(b0FromRecords(inp.b0Weights, inp.aoiId, inp.records), inp.records), inputs: 'records' };
    throw new Error('B0_month_ratio needs cells or activity records');
  }
  if (modelId === 'B1_poisson') {
    if (!inp.b1Weights) throw new Error('B1_poisson weights not available');
    if (!inp.features) throw new Error('B1_poisson needs features/<aoi>/<year>.json (exported for BGD and AUS-NSW only)');
    return { modelId, months: b1FromFeatures(inp.b1Weights, inp.features).months, inputs: 'features' };
  }
  throw new Error(`Model ${modelId as string} cannot be recomputed in the browser`);
}

/**
 * REVIEW M1: a month is unknown (null), never 0, when its inputs are missing or the bundle itself exports no estimate:
 * no record for the month, Aqua count null, extract 'missing', or estimated_viirs_reference_detections null
 * (e.g. 2025-09 partial months). Without records nothing is masked beyond what the model itself returns.
 */
function maskUnknown(months: (number | null)[], records?: ActivityRecord[] | null): (number | null)[] {
  if (!records) return months;
  const byMonth = new Map<number, ActivityRecord>();
  for (const r of records) {
    const p = parseUtcMonth(r.period_start_utc);
    if (p) byMonth.set(p.month, r);
  }
  return months.map((v, k) => {
    const r = byMonth.get(k + 1);
    if (!r || r.raw_modis_detections == null || r.extract_status === 'missing' || r.estimated_viirs_reference_detections == null) return null;
    return v;
  });
}

/** Exported per-month estimates from activity records (index 0 = Jan). */
export function exportedEstimates(records: ActivityRecord[] | null | undefined): (number | null)[] {
  const out: (number | null)[] = Array(12).fill(null);
  for (const r of records ?? []) {
    const p = parseUtcMonth(r.period_start_utc);
    if (p) out[p.month - 1] = r.estimated_viirs_reference_detections;
  }
  return out;
}

export interface ParityResult {
  /** months compared (both finite) */
  n: number;
  /** months where exactly one side is null/non-finite (REVIEW M1: counts as a parity failure) */
  nullMismatch: number;
  /** 1-based months with a null-pattern mismatch */
  mismatchMonths: number[];
  /** max relative difference after allowing for the export's rounding (|a−b| − quantum/2, floored at 0) / max(1, |b|).
   *  Denominator max(1,|b|) is the same as notebooks/tests/check_bundle.py. */
  maxRelDiff: number;
  /** same without the rounding allowance */
  maxRelDiffRaw: number;
  perMonth: (number | null)[];
  ok: boolean;
  tolerance: number;
  quantum: number;
}

/** Activity estimates are exported rounded to 2 decimals; features check sums to 4. */
export const EXPORT_QUANTUM = { activity_estimate: 0.01, features_check: 0.0001 } as const;

export function parity(
  recomputed: (number | null)[], exported: (number | null)[], tolerance = PARITY_TOLERANCE, quantum: number = EXPORT_QUANTUM.activity_estimate
): ParityResult {
  const perMonth: (number | null)[] = [];
  let n = 0, worst = 0, worstRaw = 0;
  const mismatchMonths: number[] = [];
  const allow = quantum / 2 + 1e-9;
  const len = Math.max(recomputed.length, exported.length);
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  for (let k = 0; k < len; k++) {
    const a = recomputed[k], b = exported[k];
    if (!fin(a) || !fin(b)) { perMonth.push(null); if (fin(a) !== fin(b)) mismatchMonths.push(k + 1); continue; }
    const den = Math.max(1, Math.abs(b)), ad = Math.abs(a - b);
    const d = Math.max(0, ad - allow) / den;
    perMonth.push(d); n++; worst = Math.max(worst, d); worstRaw = Math.max(worstRaw, ad / den);
  }
  const nullMismatch = mismatchMonths.length;
  return { n, nullMismatch, mismatchMonths, maxRelDiff: worst, maxRelDiffRaw: worstRaw, perMonth, ok: n > 0 && worst <= tolerance && nullMismatch === 0, tolerance, quantum };
}

export interface BrowserHarmonization {
  modelId: BrowserModelId;
  recomputed: RecomputeResult;
  /** What the recomputation is compared against: the activity estimates (if this model is the selected one)
   *  or, for B1 when not selected, the notebook's own `features.check.b1_sum_by_month`. */
  exported: (number | null)[];
  exportedSource: 'activity_estimate' | 'features_check';
  parity: ParityResult;
}

/** One-call helper for the UI toggle. Returns null if the model's inputs are not exported for this AOI-year. */
export async function harmonizeInBrowser(
  api: LumosDataApi, snapshotId: string, modelId: BrowserModelId, aoiId: string, year: number, selectedModelId?: string | null
): Promise<BrowserHarmonization | null> {
  const records = await api.loadActivity(snapshotId, aoiId, year);
  if (modelId === 'B0_month_ratio') {
    const [w, cells] = await Promise.all([api.loadB0Weights(snapshotId), api.loadCells(snapshotId, aoiId, year)]);
    if (!w || (!cells && !records)) return null;
    const rec = recomputeAoiMonth(modelId, { aoiId, year, b0Weights: w, cells, records });
    const exported = selectedModelId === undefined || selectedModelId === modelId ? exportedEstimates(records) : Array(12).fill(null);
    return { modelId, recomputed: rec, exported, exportedSource: 'activity_estimate', parity: parity(rec.months, exported, PARITY_TOLERANCE, EXPORT_QUANTUM.activity_estimate) };
  }
  const [w, f] = await Promise.all([api.loadB1Weights(snapshotId), api.loadFeatures(snapshotId, aoiId, year)]);
  if (!w || !f) return null;
  const rec = recomputeAoiMonth(modelId, { aoiId, year, b1Weights: w, features: f });
  const useActivity = selectedModelId === modelId && records;
  const exported = useActivity ? exportedEstimates(records) : (f.check?.b1_sum_by_month ?? Array(12).fill(null));
  const src = useActivity ? 'activity_estimate' : 'features_check';
  return { modelId, recomputed: rec, exported, exportedSource: src, parity: parity(rec.months, exported, PARITY_TOLERANCE, EXPORT_QUANTUM[src]) };
}
