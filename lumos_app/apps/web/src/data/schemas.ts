// Zod schemas for the app bundle (CONTRACT.md §6 + v1.1). Derived from activity.schema.json, but tolerant of
// extra keys (consumers ignore unknown keys, §7). Owned by the data agent.
import { z } from 'zod';
import type { CellsFile } from '../types';

const count = z.number().int().nonnegative().nullable();
const nonNegNum = z.number().nonnegative().nullable();
const monthStart = z.string().regex(/^\d{4}-\d{2}-01T00:00:00Z$/, 'expected YYYY-MM-01T00:00:00Z');

export const AnomalySchema = z
  .object({
    baseline_years: z.number().int().nonnegative().nullable(),
    rank: z.number().int().min(1).nullable(),
    zscore_log: z.number().nullable(),
    flag: z.enum(['high', 'normal', 'low', 'insufficient']).nullable()
  })
  .passthrough();

export const ActivityRecordSchema = z
  .object({
    schema_version: z.literal('1.0'),
    snapshot_id: z.string().min(1),
    aoi_id: z.string().min(1),
    period_start_utc: monthStart,
    period_end_utc_exclusive: monthStart,
    source_platform: z.string(),
    reference_platform: z.string(),
    source_product: z.string(),
    reference_product: z.string(),
    raw_modis_detections: count,
    raw_modis_terra_detections: count,
    raw_viirs_reference_detections: count,
    static_source_detections_modis: count,
    static_source_detections_viirs: count,
    estimated_viirs_reference_detections: nonNegNum,
    estimate_interval_low: nonNegNum,
    estimate_interval_high: nonNegNum,
    interval_nominal_level: z.number().min(0).max(1).nullable(),
    interval_empirical_holdout_coverage: z.number().min(0).max(1).nullable(),
    extract_status: z.enum(['complete', 'partial', 'missing']),
    coverage_status: z.string(),
    coverage_fraction: z.null(),
    value_status: z.enum(['observed', 'estimated', 'unsupported', 'demo']),
    split: z.enum(['train', 'val', 'test', 'backcast', 'none']),
    anomaly: AnomalySchema.nullable(),
    model_id: z.string().nullable(),
    provenance_ids: z.array(z.string()),
    reason: z.string()
  })
  .passthrough()
  .superRefine((r, ctx) => {
    if (r.period_end_utc_exclusive <= r.period_start_utc)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_end_utc_exclusive must be after period_start_utc' });
    const lo = r.estimate_interval_low, hi = r.estimate_interval_high;
    if (lo != null && hi != null && lo > hi + 1e-9)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'estimate_interval_low > estimate_interval_high' });
  });

/** activity/<aoi>/<year>.json may be a bare list or an object with `records`. */
export const ActivityFileSchema = z.union([
  z.array(ActivityRecordSchema),
  z.object({ records: z.array(ActivityRecordSchema) }).passthrough()
]);

export const ManifestSchema = z
  .object({
    schema_version: z.string(),
    snapshot_id: z.string(),
    created_utc: z.string(),
    release_stage: z.enum(['ui_prototype', 'observed_comparison', 'validated_calibration']),
    selected_model_id: z.string(),
    aois: z.array(z.string()),
    years: z.array(z.number().int()),
    synthetic: z.boolean().optional(),
    release_reason: z.string().optional(),
    value_status_default: z.string().optional(),
    files: z.record(z.string()).optional()
  })
  .passthrough();

export const RegionSchema = z
  .object({
    aoi_id: z.string(),
    name: z.string(),
    country: z.string(),
    kind: z.enum(['country', 'admin1']),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    geometry_path: z.string(),
    supported_calibration: z.boolean(),
    iso_3166_2: z.string().nullable().default(null),
    note: z.string().nullable().default(null),
    cells_exported: z.boolean().optional(),
    features_exported: z.boolean().optional()
  })
  .passthrough();

export const SnapshotIndexSchema = z.object({
  snapshots: z.array(z.object({ snapshot_id: z.string(), path: z.string(), synthetic: z.boolean().optional() }).passthrough()),
  default: z.string()
});

/** Header-only schema for cells files: rows are checked by parseCellsFile (sampled), not row-by-row in Zod (H4). */
export const CellsFileSchema = z
  .object({
    cell_size_m: z.number(),
    proj: z.string(),
    est_min: z.number().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.unknown())
  })
  .passthrough();

export const CELLS_REQUIRED_COLUMNS = ['cell_id', 'lon', 'lat', 'month', 'aqua'] as const;
/** Rows type-checked per file: head, tail and an even stride through the middle. */
export const CELLS_SAMPLE_ROWS = 256;

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a cells/<aoi>/<year>.json payload cheaply: Zod on the header, an O(n) shape loop (every row is an array of
 * the right width) and full type checks on a sample of rows. ~1–2 ms for a 200 KB file instead of a full Zod pass.
 */
export function parseCellsFile(payload: unknown, url = 'cells'): CellsFile {
  const h = CellsFileSchema.safeParse(payload);
  if (!h.success) throw new DataValidationError(url, zodIssues(h.error));
  const f = h.data as unknown as CellsFile;
  const cols = f.columns;
  const missing = CELLS_REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
  if (missing.length) throw new DataValidationError(url, [`columns: missing ${missing.join(', ')}`]);
  const w = cols.length, rows = f.rows as unknown[];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length !== w) throw new DataValidationError(url, [`rows.${i}: expected an array of ${w} values`]);
  }
  const ix = Object.fromEntries(cols.map((c, i) => [c, i])) as Record<string, number>;
  const n = rows.length, k = Math.min(n, CELLS_SAMPLE_ROWS);
  const issues: string[] = [];
  for (let j = 0; j < k && issues.length < 5; j++) {
    const i = n <= CELLS_SAMPLE_ROWS ? j : Math.round((j * (n - 1)) / (k - 1));
    const r = rows[i] as unknown[];
    const id = r[ix.cell_id], mo = r[ix.month];
    if (typeof id !== 'string' && !isFiniteNum(id)) issues.push(`rows.${i}.cell_id: expected string`);
    if (!isFiniteNum(r[ix.lon]) || !isFiniteNum(r[ix.lat])) issues.push(`rows.${i}: lon/lat must be numbers`);
    if (!Number.isInteger(mo) || (mo as number) < 1 || (mo as number) > 12) issues.push(`rows.${i}.month: expected 1–12`);
    for (const c of ['aqua', 'viirs', 'est']) {
      if (!(c in ix)) continue;
      const v = r[ix[c]];
      if (v !== null && (!isFiniteNum(v) || v < 0)) issues.push(`rows.${i}.${c}: expected a non-negative number or null`);
    }
  }
  if (issues.length) throw new DataValidationError(url, issues);
  return f;
}

export const B0WeightsSchema = z
  .object({
    ratios: z.record(z.number()),
    fallback_global_r: z.number().nullable().optional(),
    key_format: z.string().optional(),
    countries: z.record(z.string()).optional()
  })
  .passthrough();

export const B1WeightsSchema = z
  .object({
    feature_names: z.array(z.string()),
    transform: z.array(z.enum(['log1p', 'identity'])).optional(),
    mean: z.array(z.number()),
    scale: z.array(z.number()),
    coef: z.array(z.number()),
    intercept: z.number(),
    link: z.literal('log')
  })
  .passthrough()
  .refine((w) => [w.mean, w.scale, w.coef].every((a) => a.length === w.feature_names.length), 'weights arrays length mismatch');

export const B1FeaturesSchema = z
  .object({
    schema: z.literal('lumos-b1-features-1'),
    aoi_id: z.string(),
    year: z.number().int(),
    feature_order: z.array(z.string()),
    cells_columns: z.array(z.string()),
    cells: z.array(z.tuple([z.string(), z.number(), z.array(z.number().nullable())])),
    rows_columns: z.array(z.string()),
    rows: z.array(z.array(z.number())),
    derived: z.object({ country_onehot: z.record(z.number()) }).passthrough(),
    unavailable_months: z.array(z.number().int()),
    check: z.object({ b1_sum_by_month: z.array(z.number().nullable()) }).passthrough().optional()
  })
  .passthrough();

export const SourceEntrySchema = z
  .object({
    id: z.string(),
    url: z.string().nullable().optional(),
    sensor: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    sha256: z.string().nullable().optional(),
    rows: z.number().nullable().optional(),
    status: z.string().optional(),
    retrieved_utc: z.string().nullable().optional()
  })
  .passthrough();

export type B0Weights = z.infer<typeof B0WeightsSchema>;
export type B1Weights = z.infer<typeof B1WeightsSchema>;
export type B1Features = z.infer<typeof B1FeaturesSchema>;
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export class DataValidationError extends Error {
  constructor(public readonly url: string, public readonly issues: string[]) {
    super(`Invalid data in ${url}: ${issues.slice(0, 5).join('; ')}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ''}`);
    this.name = 'DataValidationError';
  }
}

export function zodIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

/** Validate an activity file payload (list or {records}) and return records. Throws DataValidationError. */
export function parseActivityFile(payload: unknown, url = 'activity'): z.infer<typeof ActivityRecordSchema>[] {
  const res = ActivityFileSchema.safeParse(payload);
  if (!res.success) throw new DataValidationError(url, zodIssues(res.error));
  return Array.isArray(res.data) ? res.data : res.data.records;
}
