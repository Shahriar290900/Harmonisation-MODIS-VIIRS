// B1_poisson in the browser. Per cell-month: z_j = transform_j(x_j); eta = intercept + Σ coef_j (z_j − mean_j)/scale_j;
// rate = exp(clip(eta, −30, 30)); AOI-month = Σ cells. Inputs from features/<aoi>/<year>.json (schema lumos-b1-features-1).
// Mirrors notebooks/tests/check_bundle.py exactly (absent rows = 0 dynamic features; aqua_count_raw = aqua_count).
import type { B1Features, B1Weights } from '../data/schemas';
import { iso3Of } from '../data/regions';

const TWO_PI = 2 * Math.PI;

function applyTransform(t: string | undefined, x: number): number {
  return t === 'log1p' ? Math.log1p(Math.max(x, 0)) : x;
}

export interface B1Result {
  /** AOI-month sums, index 0 = Jan; null for unavailable months or non-finite inputs. */
  months: (number | null)[];
  /** Optional per-cell rates [cellIndex][month0] when requested. */
  cellRates?: Float64Array[];
  /** Visible labels for any silent-looking substitution (e.g. a country with no `country_<ISO3>` term in the weights). */
  fallbackNotes: string[];
}

/** Country-term fallbacks for one AOI: the AOI's own country absent from the weights, or one-hot entries absent from the file. */
export function b1FallbackNotes(w: B1Weights, f: B1Features): string[] {
  const iso = iso3Of(f.aoi_id), onehot = f.derived.country_onehot as Record<string, number>, notes: string[] = [];
  if (!w.feature_names.includes(`country_${iso}`))
    notes.push(`weights.json has no country_${iso} term: ${iso} is scored with the all-zero country baseline, not a ${iso}-trained effect.`);
  const absent = w.feature_names.filter((n) => n.startsWith('country_') && !(n in onehot));
  if (absent.length) notes.push(`${absent.join(', ')} missing from the features file: set to 0.`);
  return notes;
}

export function b1FromFeatures(w: B1Weights, f: B1Features, opts: { keepCells?: boolean } = {}): B1Result {
  const names = w.feature_names;
  if (f.feature_order.length !== names.length || f.feature_order.some((n, i) => n !== names[i]))
    throw new Error('features/*.json feature_order does not match weights.feature_names');
  // REVIEW low: never guess transforms (a log1p default would zero negative lat and distort month_sin/cos).
  if (!w.transform || w.transform.length !== names.length) throw new Error('B1 weights.json lacks a per-feature transform list');
  const transforms = w.transform;
  const nc = f.cells.length;
  const dyn = f.rows_columns.slice(2);
  // Dense dynamic features: dynVals[d][cell*12 + m]
  const dynVals = dyn.map(() => new Float64Array(nc * 12));
  for (const r of f.rows) {
    const c = r[0] | 0, m = (r[1] | 0) - 1;
    if (c < 0 || c >= nc || m < 0 || m > 11) continue;
    for (let d = 0; d < dyn.length; d++) dynVals[d][c * 12 + m] = r[2 + d];
  }
  const dynIdx = new Map(dyn.map((n, i) => [n, i]));
  const onehot = f.derived.country_onehot as Record<string, number>;
  // Pre-resolve how to read each feature.
  type Getter = (c: number, m: number) => number;
  const getters: Getter[] = names.map((n): Getter => {
    if (dynIdx.has(n)) { const a = dynVals[dynIdx.get(n)!]; return (c, m) => a[c * 12 + m]; }
    if (n === 'aqua_count_raw') { const a = dynVals[dynIdx.get('aqua_count')!]; if (!a) throw new Error('aqua_count missing'); return (c, m) => a[c * 12 + m]; }
    if (n === 'lat') return (c) => f.cells[c][1];
    if (n === 'aqua_clim') return (c, m) => { const v = f.cells[c][2][m]; return v == null ? NaN : v; };
    if (n === 'month_sin') return (_c, m) => Math.sin((TWO_PI * m) / 12);
    if (n === 'month_cos') return (_c, m) => Math.cos((TWO_PI * m) / 12);
    if (n in onehot) { const v = onehot[n]; return () => v; }
    if (n.startsWith('country_')) return () => 0;
    throw new Error(`B1 feature '${n}' cannot be derived from features file`);
  });
  const sums = new Float64Array(12);
  const bad = new Uint8Array(12);
  const cellRates = opts.keepCells ? Array.from({ length: nc }, () => new Float64Array(12)) : undefined;
  for (let c = 0; c < nc; c++) {
    for (let m = 0; m < 12; m++) {
      let eta = w.intercept;
      for (let j = 0; j < names.length; j++) {
        const z = applyTransform(transforms[j], getters[j](c, m));
        eta += (w.coef[j] * (z - w.mean[j])) / w.scale[j];
      }
      const rate = Math.exp(Math.min(30, Math.max(-30, eta)));
      if (!Number.isFinite(rate)) { bad[m] = 1; continue; }
      sums[m] += rate;
      if (cellRates) cellRates[c][m] = rate;
    }
  }
  const unavailable = new Set(f.unavailable_months);
  const months = Array.from(sums, (v, m) => (unavailable.has(m + 1) || bad[m] ? null : v));
  return { months, cellRates, fallbackNotes: b1FallbackNotes(w, f) };
}
