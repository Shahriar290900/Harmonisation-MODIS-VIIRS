import { describe, expect, it, vi } from 'vitest';
import { createDataApi, HttpError } from '../../apps/web/src/data/api';
import { diskFetch, SNAP_ID } from './helpers';

describe('createDataApi', () => {
  it('loads index, manifest, regions, geo, activity, cells, comparison, model card; caches', async () => {
    const f = vi.fn(diskFetch);
    const api = createDataApi('/', { fetch: f });
    const idx = await api.loadIndex();
    expect(idx.default).toBe(SNAP_ID);
    const m = await api.loadManifest(SNAP_ID);
    expect(m.schema_version).toBe('1.0');
    const regions = await api.loadRegions(SNAP_ID);
    expect(regions.map((r) => r.aoi_id)).toContain('AUS-NSW');
    const geo = await api.loadGeo(SNAP_ID, regions[0]);
    expect(geo.type).toBe('FeatureCollection');
    const a = await api.loadActivity(SNAP_ID, 'BGD', 2016);
    expect(a).toHaveLength(12);
    expect(a![0].period_start_utc).toBe('2016-01-01T00:00:00Z');
    const n = f.mock.calls.length;
    await api.loadActivity(SNAP_ID, 'BGD', 2016);
    expect(f.mock.calls.length).toBe(n); // cached
    expect(await api.loadActivity(SNAP_ID, 'BGD', 1999)).toBeNull();
    expect(await api.loadCells(SNAP_ID, 'AUS', 2016)).toBeNull(); // whole-AUS cells not exported
    expect((await api.loadCells(SNAP_ID, 'BGD', 2016))?.columns).toContain('est');
    const range = await api.loadActivityRange(SNAP_ID, 'AUS-NSW', [2015, 2016, 1990]);
    expect(range.get(2016)).toHaveLength(12);
    expect(range.get(1990)).toBeNull();
    const cmp = await api.loadComparisonCsv(SNAP_ID);
    expect(cmp[0]).toHaveProperty('model_id');
    expect(await api.loadModelCard(SNAP_ID, 'B1_poisson')).toHaveProperty('feature_order');
    expect(await api.loadModelCard(SNAP_ID, 'NOPE')).toBeNull();
    expect((await api.loadSources(SNAP_ID)).length).toBeGreaterThan(0);
    expect(await api.loadFeatures(SNAP_ID, 'BGD', 2016)).not.toBeNull();
    expect(api.fileUrl(SNAP_ID, 'figures/x.png')).toBe(`/data/${SNAP_ID}/figures/x.png`);
  });
  it('required files throw HttpError on 404; SPA html fallback for optional → null', async () => {
    const api = createDataApi('/', { fetch: diskFetch });
    await expect(api.loadManifest('nope')).rejects.toBeInstanceOf(HttpError);
    const html = createDataApi('/', { fetch: async () => ({ ok: true, status: 200, text: async () => '<!doctype html><html></html>' }) });
    expect(await html.loadActivity('s', 'BGD', 2016)).toBeNull();
  });
  it('invalid activity → DataValidationError', async () => {
    const api = createDataApi('/', { fetch: async () => ({ ok: true, status: 200, text: async () => '[{"schema_version":"1.0"}]' }) });
    await expect(api.loadActivity('s', 'BGD', 2016)).rejects.toThrow(/Invalid data/);
  });
});
