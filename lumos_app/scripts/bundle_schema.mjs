// Minimal Zod schemas used by the importer to sanity-check a bundle before it can become the app default.
// Mirrors apps/web/src/data/schemas.ts (ManifestSchema, RegionSchema, ActivityRecordSchema core fields). Keep in sync.
import { z } from 'zod';

const count = z.number().int().nonnegative().nullable();
const nonNegNum = z.number().nonnegative().nullable();
const monthStart = z.string().regex(/^\d{4}-\d{2}-01T00:00:00Z$/, 'expected YYYY-MM-01T00:00:00Z');

export const ManifestSchema = z
  .object({
    schema_version: z.string(),
    snapshot_id: z.string(),
    created_utc: z.string(),
    release_stage: z.enum(['ui_prototype', 'observed_comparison', 'validated_calibration']),
    selected_model_id: z.string(),
    aois: z.array(z.string()).min(1),
    years: z.array(z.number().int()).min(1),
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
    supported_calibration: z.boolean()
  })
  .passthrough();

export const ActivityRecordSchema = z
  .object({
    schema_version: z.literal('1.0'),
    snapshot_id: z.string().min(1),
    aoi_id: z.string().min(1),
    period_start_utc: monthStart,
    period_end_utc_exclusive: monthStart,
    raw_modis_detections: count,
    raw_modis_terra_detections: count,
    raw_viirs_reference_detections: count,
    estimated_viirs_reference_detections: nonNegNum,
    extract_status: z.enum(['complete', 'partial', 'missing']),
    value_status: z.enum(['observed', 'estimated', 'unsupported', 'demo']),
    split: z.enum(['train', 'val', 'test', 'backcast', 'none']),
    provenance_ids: z.array(z.string()),
    reason: z.string()
  })
  .passthrough();

export const ActivityFileSchema = z.union([
  z.array(ActivityRecordSchema),
  z.object({ records: z.array(ActivityRecordSchema) }).passthrough()
]);

export function issues(err) {
  return err.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}
