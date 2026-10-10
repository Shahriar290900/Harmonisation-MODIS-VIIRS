// Regression tests for the REVIEW / WATCHDOG / E2E findings resolved in review_app/RESOLUTION.md.
import { describe, expect, it } from 'vitest';
import type { ActivityRecord, CellsFile } from '../../apps/web/src/types';
import { createDataApi, deriveDisplayState, FetchError, headlineValue, shownAnomalyFlag, HEAVY_CACHE_MAX } from '../../apps/web/src/data/api';
import { B0WeightsSchema, B1WeightsSchema, parseActivityFile, parseCellsFile } from '../../apps/web/src/data/schemas';
import { exportedEstimates, parity, recomputeAoiMonth } from '../../apps/web/src/model';
import { b1FromFeatures } from '../../apps/web/src/model/b1';
import { explainMonthText } from '../../apps/web/src/data/explain';
import { neutralizeFormula, toCsv } from '../../apps/web/src/data/export';
import { parseCsv } from '../../apps/web/src/data/format';
import { cellText } from '../../apps/web/src/ui/Calendar';
import { diskFetch, readJson, SNAP_ID } from './helpers';

const recs = (aoi: string, y: number) => parseActivityFile(readJson(`activity/${aoi}/${y}.json`)) as ActivityRecord[];
const w0 = B0WeightsSchema.parse(readJson('models/B0_month_ratio/weights.json'));

describe('H1/H2: per-year activity outcomes', () => {
  it('listed file failing → error for that year only; unlisted → absent without a request', async () => {
    const seen: string[] = [];
    const api = createDataApi('/', {
      fetch: async (u) => {
        seen.push(u);
        if (u.includes('/activity/BGD/2016.json')) return { ok: false, status: 404, text: async () => '' };
        if (u.includes('/activity/BGD/2017.json')) return { ok: true, status: 200, text: async () => '<!doctype html><html></html>' };
        if (u.includes('/activity/BGD/2018.json')) throw new TypeError('Failed to fetch');
        return diskFetch(u);
      }
    });
    await api.loadIndex();
    await api.loadManifest(SNAP_ID);
    const res = await api.loadActivityYears(SNAP_ID, 'BGD', [2015, 2016, 2017, 2018, 1999]);
    expect(res.get(2015)?.status).toBe('ok');
    expect(res.get(2016)).toMatchObject({ status: 'error', offline: false });
    expect(res.get(2017)).toMatchObject({ status: 'error', offline: false });
    expect(res.get(2018)).toMatchObject({ status: 'error', offline: true });
    expect(res.get(1999)?.status).toBe('absent');
    expect(seen.some((u) => u.includes('1999'))).toBe(false);
  });
  it('F1: a stalled fetch times out with a friendly error', async () => {
    const api = createDataApi('/', { fetch: () => new Promise(() => {}), timeoutMs: 30 });
    await expect(api.loadIndex()).rejects.toBeInstanceOf(FetchError);
    await expect(api.loadIndex()).rejects.toThrow(/timed out/);
  });
});

describe('H4: cells parsing', () => {
  it('validates header + sampled rows and rejects bad rows', () => {
    const f = readJson<CellsFile>('cells/BGD/2016.json');
    expect(parseCellsFile(f).rows.length).toBe(f.rows.length);
    expect(() => parseCellsFile({ ...f, rows: [...f.rows, [1, 2]] })).toThrow(/expected an array/);
    expect(() => parseCellsFile({ ...f, columns: ['x'], rows: [] })).toThrow(/missing cell_id/);
    const bad = f.rows.map((r) => [...r]); bad[0][3] = 13;
    expect(() => parseCellsFile({ ...f, rows: bad })).toThrow(/month/);
  });
  it('a ~200 KB file parses + validates in < 50 ms', () => {
    const rows = Array.from({ length: 4500 }, (_, i) => [`${i}_${i}`, 90.1234, 23.4567, (i % 12) + 1, i % 5, i % 7 ? i % 9 : null, 1.23]);
    const text = JSON.stringify({ cell_size_m: 5000, proj: 'x', columns: ['cell_id', 'lon', 'lat', 'month', 'aqua', 'viirs', 'est'], rows });
    expect(text.length).toBeGreaterThan(180_000);
    parseCellsFile(JSON.parse(text)); // warm-up
    const t = performance.now();
    parseCellsFile(JSON.parse(text));
    expect(performance.now() - t).toBeLessThan(50);
  });
  it('parsed cells are kept in a bounded LRU', async () => {
    const api = createDataApi('/', { fetch: diskFetch });
    await api.loadIndex(); await api.loadManifest(SNAP_ID);
    for (let y = 2003; y <= 2025; y++) await api.loadCells(SNAP_ID, 'BGD', y);
    expect(api.heavyCacheSize).toBeLessThanOrEqual(HEAVY_CACHE_MAX);
  });
});

describe('M1: B0 null pattern', () => {
  it('2025-09 partial (exported null) recomputes to null, and parity flags null mismatches', () => {
    for (const aoi of ['BGD', 'AUS-NSW', 'BGD-C']) {
      const r = recs(aoi, 2025);
      const rc = recomputeAoiMonth('B0_month_ratio', { aoiId: aoi, year: 2025, b0Weights: w0, cells: readJson<CellsFile>(`cells/${aoi}/2025.json`), records: r });
      const ex = exportedEstimates(r);
      rc.months.forEach((v, k) => expect(v == null).toBe(ex[k] == null));
      expect(parity(rc.months, ex).ok).toBe(true);
    }
    const p = parity([0, 1, 2], [null, 1, 2]);
    expect(p.nullMismatch).toBe(1);
    expect(p.mismatchMonths).toEqual([1]);
    expect(p.ok).toBe(false);
  });
  it('B1 without a transform list throws instead of guessing log1p', () => {
    const w1 = B1WeightsSchema.parse(readJson('models/B1_poisson/weights.json'));
    const f = readJson('features/BGD/2016.json');
    expect(() => b1FromFeatures({ ...w1, transform: undefined }, f as never)).toThrow(/transform/);
  });
});

describe('M3/M4/M6/M7 + E2E-3', () => {
  it('CSV neutralizes formula-looking text but keeps numbers', () => {
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutralizeFormula('plain')).toBe('plain');
    const r = { ...recs('BGD', 2016)[0], reason: '=1+1', aoi_id: '-cmd', anomaly: { baseline_years: 5, rank: 2, zscore_log: -1.25, flag: 'low' as const } };
    const row = parseCsv(toCsv([r], { snapshotId: 's', releaseStage: 'ui_prototype' }))[0];
    expect(row.reason).toBe("'=1+1");
    expect(row.aoi_id).toBe("'-cmd");
    expect(row.anomaly_zscore_log).toBe('-1.25');
  });
  it('2012 backcast text does not claim VIIRS did not exist', () => {
    const r = recs('BGD', 2012).find((x) => x.split === 'backcast' && x.raw_viirs_reference_detections != null)!;
    const t = explainMonthText(r);
    expect(t).not.toMatch(/VIIRS did not exist/);
    expect(t).toMatch(/observed S-NPP VIIRS count is also shown/);
  });
  it('Terra-only partial months keep the observed VIIRS state', () => {
    const r = recs('AUS-NSW', 2008)[0];
    expect(r.extract_status).toBe('partial');
    expect(r.raw_viirs_reference_detections).toBeNull(); // 2008: pre-VIIRS → estimated, not partial
    expect(deriveDisplayState(r)).toBe('estimated');
    const withViirs = { ...recs('BGD', 2016)[2], extract_status: 'partial' as const, reason: 'Terra MODIS missing: outage; field null.' };
    expect(deriveDisplayState(withViirs)).toBe('observed');
    expect(headlineValue(withViirs).kind).toBe('viirs_observed');
    const viirsPartial = { ...withViirs, reason: 'S-NPP VIIRS partial: starts mid-month.' };
    expect(deriveDisplayState(viirsPartial)).toBe('partial');
  });
  it('anomaly flags are suppressed on partial months', () => {
    const r = { ...recs('BGD', 2016)[2], anomaly: { baseline_years: 10, rank: 1, zscore_log: 2, flag: 'high' as const } };
    expect(shownAnomalyFlag(r)).toBe('high');
    expect(shownAnomalyFlag({ ...r, extract_status: 'partial', reason: 'S-NPP VIIRS partial: x.' })).toBeNull();
  });
  it("calendar text: '<1' / '≈0' for small estimates, '0' only for observed zero", () => {
    expect(cellText(0.4, 'estimate')).toBe('<1');
    expect(cellText(0, 'estimate')).toBe('≈0');
    expect(cellText(0, 'viirs_observed')).toBe('0');
    expect(cellText(4.2, 'estimate')).toBe('4.2');
  });
});
