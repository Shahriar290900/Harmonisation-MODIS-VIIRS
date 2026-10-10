// B0_month_ratio in the browser: est = ratios[`${ISO3}-${MM}`] × aqua_count per cell-month, summed over the AOI's cells.
// Mirrors notebooks/tests/check_bundle.py (weights.json + cells/<aoi>/<year>.json).
import type { ActivityRecord, CellsFile } from '../types';
import type { B0Weights } from '../data/schemas';
import { parseUtcMonth } from '../data/format';
import { iso3Of } from '../data/regions';

/** 'BGD-A' → 'BGD', 'AUS-NSW' → 'AUS', 'USA-CA' → 'USA' (ratios are per country). */
export function iso3OfAoi(aoiId: string): string {
  return iso3Of(aoiId);
}

/**
 * Months (1-12) for which weights.json has no own `${ISO3}-MM` ratio for this AOI's country, i.e. where b0Ratio uses
 * fallback_global_r (or nothing). Never silent: callers surface this as a visible label (e.g. a snapshot whose
 * weights predate the USA addition has no `USA-MM` keys).
 */
export function b0FallbackMonths(w: B0Weights, aoiId: string): number[] {
  const iso = iso3OfAoi(aoiId), out: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const r = w.ratios[`${iso}-${String(m).padStart(2, '0')}`];
    if (!(typeof r === 'number' && Number.isFinite(r))) out.push(m);
  }
  return out;
}

/** Human-readable label for a B0 fallback, or null when the country has its own ratios for every month. */
export function b0FallbackNote(w: B0Weights, aoiId: string): string | null {
  const months = b0FallbackMonths(w, aoiId);
  if (!months.length) return null;
  const iso = iso3OfAoi(aoiId);
  const g = typeof w.fallback_global_r === 'number' && Number.isFinite(w.fallback_global_r);
  return g
    ? `No ${iso} ratios in weights.json for ${months.length === 12 ? 'any month' : `${months.length} month${months.length > 1 ? 's' : ''}`}: the global fallback ratio (${w.fallback_global_r!.toFixed(2)}) is used instead. It is not a ${iso}-specific ratio.`
    : `No ${iso} ratios and no global fallback in weights.json for ${months.length === 12 ? 'any month' : `${months.length} month${months.length > 1 ? 's' : ''}`}: those months have no estimate (shown as missing, not zero).`;
}

/** Ratio for an AOI's country and calendar month (1-12); falls back to fallback_global_r, else null. */
export function b0Ratio(w: B0Weights, aoiId: string, month: number): number | null {
  const key = `${iso3OfAoi(aoiId)}-${String(month).padStart(2, '0')}`;
  const r = w.ratios[key];
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  return typeof w.fallback_global_r === 'number' && Number.isFinite(w.fallback_global_r) ? w.fallback_global_r : null;
}

/** Per-month (index 0 = Jan) AOI sums from the cell file. Months with no aqua rows sum to 0. */
export function b0FromCells(w: B0Weights, aoiId: string, cells: CellsFile): (number | null)[] {
  const ci = cells.columns.indexOf('month'), ai = cells.columns.indexOf('aqua');
  if (ci < 0 || ai < 0) throw new Error('cells file lacks month/aqua columns');
  const out: (number | null)[] = Array.from({ length: 12 }, (_, k) => (b0Ratio(w, aoiId, k + 1) == null ? null : 0));
  for (const row of cells.rows) {
    const mo = Number(row[ci]), aq = row[ai];
    if (typeof aq !== 'number' || !aq || mo < 1 || mo > 12) continue;
    const r = b0Ratio(w, aoiId, mo);
    if (r == null) continue;
    out[mo - 1] = (out[mo - 1] as number) + r * aq;
  }
  return out;
}

/** Per-month from AOI-level Aqua counts in activity records (ratio × raw_modis_detections; null where aqua is null). */
export function b0FromRecords(w: B0Weights, aoiId: string, records: ActivityRecord[]): (number | null)[] {
  const out: (number | null)[] = Array(12).fill(null);
  for (const rec of records) {
    const p = parseUtcMonth(rec.period_start_utc);
    if (!p) continue;
    const r = b0Ratio(w, aoiId, p.month), aq = rec.raw_modis_detections;
    out[p.month - 1] = r != null && typeof aq === 'number' ? r * aq : null;
  }
  return out;
}
