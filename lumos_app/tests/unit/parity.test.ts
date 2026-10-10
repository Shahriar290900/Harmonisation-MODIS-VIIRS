import { describe, expect, it } from 'vitest';
import type { ActivityRecord, CellsFile } from '../../apps/web/src/types';
import { B0WeightsSchema, B1FeaturesSchema, B1WeightsSchema, parseActivityFile } from '../../apps/web/src/data/schemas';
import { createDataApi } from '../../apps/web/src/data/api';
import { b0FromRecords, exportedEstimates, harmonizeInBrowser, parity, recomputeAoiMonth } from '../../apps/web/src/model';
import { diskFetch, readJson, SNAP_ID } from './helpers';

const w0 = B0WeightsSchema.parse(readJson('models/B0_month_ratio/weights.json'));
const w1 = B1WeightsSchema.parse(readJson('models/B1_poisson/weights.json'));
const recs = (aoi: string, y: number) => parseActivityFile(readJson(`activity/${aoi}/${y}.json`)) as ActivityRecord[];
const YEARS = [2005, 2008, 2012, 2015, 2016, 2019, 2021, 2023, 2025];

describe('B0_month_ratio parity (selected model) vs exported activity estimates', () => {
  for (const aoi of ['BGD', 'AUS-NSW', 'BGD-C'])
    it.each(YEARS)(`${aoi} %i from cells ≤1e-3`, (y) => {
      const cells = readJson<CellsFile>(`cells/${aoi}/${y}.json`);
      const r = recomputeAoiMonth('B0_month_ratio', { aoiId: aoi, year: y, b0Weights: w0, cells, records: recs(aoi, y) });
      const p = parity(r.months, exportedEstimates(recs(aoi, y)));
      expect(p.n).toBeGreaterThan(0);
      expect(p.maxRelDiff).toBeLessThanOrEqual(1e-3);
    });
  it('AUS (no cells exported) from AOI-level records ≤1e-3', () => {
    for (const y of YEARS) {
      const p = parity(b0FromRecords(w0, 'AUS', recs('AUS', y)), exportedEstimates(recs('AUS', y)));
      expect(p.n).toBeGreaterThan(0);
      expect(p.maxRelDiff).toBeLessThanOrEqual(1e-3);
    }
  });
  it('2001–2002 recompute is null (unsupported)', () => {
    const r = recomputeAoiMonth('B0_month_ratio', { aoiId: 'BGD', year: 2001, b0Weights: w0, cells: readJson<CellsFile>('cells/BGD/2001.json') });
    expect(r.months.every((v) => v === null)).toBe(true);
  });
});

describe('B1_poisson parity vs notebook export (features.check.b1_sum_by_month)', () => {
  for (const aoi of ['BGD', 'AUS-NSW'])
    it.each([2003, 2008, 2012, 2016, 2020, 2022, 2024, 2025])(`${aoi} %i ≤1e-3`, (y) => {
      const f = B1FeaturesSchema.parse(readJson(`features/${aoi}/${y}.json`));
      const r = recomputeAoiMonth('B1_poisson', { aoiId: aoi, b1Weights: w1, features: f });
      const exp = f.check!.b1_sum_by_month;
      const p = parity(r.months, exp, 1e-3, 1e-4);
      if (exp.every((v) => v === null)) { expect(p.n).toBe(0); return; }
      expect(p.n).toBeGreaterThan(0);
      expect(p.maxRelDiff).toBeLessThanOrEqual(1e-3);
      // unavailable months stay null, never 0
      for (const m of f.unavailable_months) expect(r.months[m - 1]).toBeNull();
    });
});

describe('harmonizeInBrowser via DataApi', () => {
  const api = createDataApi('/', { fetch: diskFetch });
  it('B0 selected model matches activity estimates', async () => {
    const h = await harmonizeInBrowser(api, SNAP_ID, 'B0_month_ratio', 'BGD', 2016, 'B0_month_ratio');
    expect(h?.exportedSource).toBe('activity_estimate');
    expect(h?.parity.ok).toBe(true);
  });
  it('B1 compares to features check when not selected', async () => {
    const h = await harmonizeInBrowser(api, SNAP_ID, 'B1_poisson', 'AUS-NSW', 2016, 'B0_month_ratio');
    expect(h?.exportedSource).toBe('features_check');
    expect(h?.parity.ok).toBe(true);
  });
  it('B1 for an AOI without features → null', async () => {
    expect(await harmonizeInBrowser(api, SNAP_ID, 'B1_poisson', 'BGD-A', 2016)).toBeNull();
  });
  it('parity helper', () => {
    const p = parity([1, null, 100], [1.0005, 5, 100.2], 1e-3, 0);
    expect(p.maxRelDiff).toBeCloseTo(0.2 / 100.2, 9);
    expect(p.ok).toBe(false);
    expect(parity([3.375], [3.38]).ok).toBe(true); // within export rounding (2 dp)
    expect(parity([3.375], [3.38]).maxRelDiffRaw).toBeGreaterThan(1e-3);
    expect(parity([3.4], [3.38]).ok).toBe(false);
    expect(parity([null], [null]).ok).toBe(false);
  });
});
