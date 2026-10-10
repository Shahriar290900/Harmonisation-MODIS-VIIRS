import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ActivityRecordSchema, B0WeightsSchema, B1FeaturesSchema, B1WeightsSchema, CellsFileSchema, ManifestSchema, RegionSchema, parseActivityFile } from '../../apps/web/src/data/schemas';
import { activityFiles, readJson, SNAP_DIR } from './helpers';

describe('Zod validation of the sample bundle', () => {
  const files = activityFiles();
  it('finds activity files', () => expect(files.length).toBeGreaterThanOrEqual(200));
  it.each(files)('%s validates (12 monthly records)', (f) => {
    const recs = parseActivityFile(readJson(f), f);
    expect(recs).toHaveLength(12);
    const [aoi, y] = f.replace('activity/', '').replace('.json', '').split('/');
    for (const r of recs) {
      expect(r.aoi_id).toBe(aoi);
      expect(r.period_start_utc.startsWith(y)).toBe(true);
      expect(r.coverage_fraction).toBeNull();
    }
  });
  it('accepts {records:[...]} wrapper and extra keys', () => {
    const recs = readJson<unknown[]>('activity/BGD/2016.json').map((r) => ({ ...(r as object), extra_future_key: 1 }));
    expect(parseActivityFile({ records: recs, meta: 'x' })).toHaveLength(12);
  });
  it('rejects 0-for-missing style corruption and bad enums', () => {
    const r = readJson<Record<string, unknown>[]>('activity/BGD/2016.json')[0];
    expect(ActivityRecordSchema.safeParse({ ...r, extract_status: 'unknown' }).success).toBe(false);
    expect(ActivityRecordSchema.safeParse({ ...r, raw_viirs_reference_detections: -1 }).success).toBe(false);
    expect(ActivityRecordSchema.safeParse({ ...r, schema_version: '2.0' }).success).toBe(false);
    expect(() => parseActivityFile([{ ...r, period_start_utc: '2016-03-15' }])).toThrow(/period_start_utc/);
  });
  it('manifest, regions, weights, cells and features validate', () => {
    expect(ManifestSchema.safeParse(readJson('manifest.json')).success).toBe(true);
    expect(RegionSchema.array().safeParse(readJson('regions.json')).success).toBe(true);
    expect(B0WeightsSchema.safeParse(readJson('models/B0_month_ratio/weights.json')).success).toBe(true);
    expect(B1WeightsSchema.safeParse(readJson('models/B1_poisson/weights.json')).success).toBe(true);
    expect(CellsFileSchema.safeParse(readJson('cells/BGD/2016.json')).success).toBe(true);
    for (const aoi of fs.readdirSync(path.join(SNAP_DIR, 'features')))
      for (const f of fs.readdirSync(path.join(SNAP_DIR, 'features', aoi))) {
        const r = B1FeaturesSchema.safeParse(readJson(`features/${aoi}/${f}`));
        expect(r.success, `features/${aoi}/${f}`).toBe(true);
      }
  });
});
