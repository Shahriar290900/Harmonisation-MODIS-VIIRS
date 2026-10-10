import { describe, expect, it } from 'vitest';
import type { CellsFile, Region } from '../../apps/web/src/types';
import { B0WeightsSchema, B1FeaturesSchema, B1WeightsSchema } from '../../apps/web/src/data/schemas';
import { createDataApi } from '../../apps/web/src/data/api';
import {
  DEFAULT_AOI, DEFAULT_FOCUS, detailedRegions, displayKind, displayKindLower, iso3Of, kindPlural, noCellsHint, regionFocus
} from '../../apps/web/src/data/regions';
import { b0FallbackMonths, b0FallbackNote, b0FromCells, b0FromRecords, b1FallbackNotes, b1FromFeatures, iso3OfAoi, recomputeAoiMonth } from '../../apps/web/src/model';
import { diskFetch, readJson, SNAP_ID } from './helpers';

// CONTRACT §9 region registry (v1.2 addendum): the single source of truth for the three-region set.
const R = (aoi_id: string, name: string, country: string, kind: 'country' | 'admin1', bbox: [number, number, number, number], cells: boolean, feats: boolean): Region => ({
  aoi_id, name, country, kind, bbox, geometry_path: `geo/${aoi_id}.geojson`, supported_calibration: false, iso_3166_2: null, note: null, cells_exported: cells, features_exported: feats
});
const REGISTRY: Region[] = [
  R('AUS', 'Australia', 'Australia', 'country', [113.3, -43.6, 153.6, -10.7], false, false),
  R('AUS-NSW', 'New South Wales', 'Australia', 'admin1', [141, -37.5, 159.1, -28.1], true, true),
  R('USA', 'United States', 'United States', 'country', [-179.1, 18.9, 179.8, 71.4], false, false),
  R('USA-CA', 'California', 'United States', 'admin1', [-124.4, 32.5, -114.1, 42.0], true, true),
  R('BGD', 'Bangladesh', 'Bangladesh', 'country', [88.08, 20.67, 92.67, 26.45], true, true),
  ...'ABCDEFG'.split('').map((l, i) => R(`BGD-${l}`, ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Rajshahi', 'Rangpur', 'Sylhet'][i], 'Bangladesh', 'admin1', [88, 21, 92, 26], true, false))
];

describe('region helpers (data-driven, three-region set)', () => {
  it('iso3 of AOI ids (BGD, AUS, USA prefixes)', () => {
    expect([iso3Of('BGD-A'), iso3Of('AUS-NSW'), iso3Of('USA-CA'), iso3Of('usa')]).toEqual(['BGD', 'AUS', 'USA', 'USA']);
    expect(iso3OfAoi('USA-CA')).toBe('USA');
  });
  it('display kind: Division for BGD admin1, State for AUS and USA admin1, Country for countries', () => {
    const k = Object.fromEntries(REGISTRY.map((r) => [r.aoi_id, displayKind(r)]));
    expect(k).toMatchObject({ BGD: 'Country', AUS: 'Country', USA: 'Country', 'BGD-A': 'Division', 'BGD-G': 'Division', 'AUS-NSW': 'State', 'USA-CA': 'State' });
    expect(displayKindLower(REGISTRY.find((r) => r.aoi_id === 'USA-CA')!)).toBe('state');
    expect(kindPlural('Division')).toBe('divisions');
    expect(kindPlural('State')).toBe('states');
    expect(kindPlural('Country')).toBe('countries');
  });
  it('a registry display_kind wins when present and valid; junk is ignored', () => {
    const ca = REGISTRY.find((r) => r.aoi_id === 'USA-CA')!;
    expect(displayKind({ ...ca, display_kind: 'Division' })).toBe('Division');
    expect(displayKind({ ...ca, display_kind: 'Province' })).toBe('State');
  });
  it('detailed regions = cells AND features exported: BGD first, then AUS-NSW and USA-CA (no special-casing)', () => {
    expect(detailedRegions(REGISTRY).map((r) => r.aoi_id)).toEqual(['BGD', 'AUS-NSW', 'USA-CA']);
    expect(detailedRegions(REGISTRY).map((r) => r.aoi_id)).not.toContain('USA');
    expect(detailedRegions(REGISTRY).map((r) => r.aoi_id)).not.toContain('AUS');
  });
  it('old regions.json without export flags: only the default region (never a guess)', () => {
    const old = REGISTRY.map(({ cells_exported: _c, features_exported: _f, ...r }) => r as Region);
    expect(detailedRegions(old).map((r) => r.aoi_id)).toEqual([DEFAULT_AOI]);
    expect(detailedRegions([])).toEqual([]);
  });
  it('the default region stays Bangladesh with its curated focus; others focus on their bbox centre', () => {
    expect(DEFAULT_AOI).toBe('BGD');
    expect(regionFocus(REGISTRY.find((r) => r.aoi_id === 'BGD'))).toEqual(DEFAULT_FOCUS);
    expect(regionFocus(undefined)).toEqual(DEFAULT_FOCUS);
    const ca = regionFocus(REGISTRY.find((r) => r.aoi_id === 'USA-CA'));
    expect(ca.lon).toBeCloseTo(-119.25, 2);
    expect(ca.lat).toBeCloseTo(37.25, 2);
    const nsw = regionFocus(REGISTRY.find((r) => r.aoi_id === 'AUS-NSW'));
    expect(nsw.lat).toBeLessThan(0);
    expect(regionFocus({ aoi_id: 'XXX', bbox: [NaN, 0, 1, 1] })).toEqual(DEFAULT_FOCUS);
  });
  it('no-cells hint names the exported sub-regions from the cells_exported flags', () => {
    const get = (id: string) => REGISTRY.find((r) => r.aoi_id === id);
    expect(noCellsHint(get('AUS'), REGISTRY)).toBe('whole-country Australia is too large; pick New South Wales');
    expect(noCellsHint(get('USA'), REGISTRY)).toBe('whole-country United States is too large; pick California');
    expect(noCellsHint(get('USA'), REGISTRY.filter((r) => r.aoi_id !== 'USA-CA'))).toBe('whole-country United States is too large');
  });
});

describe('honest fallbacks for a country with no weights (USA on an older snapshot)', () => {
  // Weights shaped like a bundle written before USA was added: AUS + BGD ratios only.
  const w0 = B0WeightsSchema.parse({
    ratios: Object.fromEntries(['AUS', 'BGD'].flatMap((c) => Array.from({ length: 12 }, (_, m) => [`${c}-${String(m + 1).padStart(2, '0')}`, 2]))),
    fallback_global_r: 3.5
  });
  const cells: CellsFile = { cell_size_m: 5000, proj: 'lambert-cea', columns: ['cell_id', 'lon', 'lat', 'month', 'aqua', 'viirs', 'est'], rows: [['1_1', -120, 37, 3, 10, 5, null], ['1_2', -120, 37.1, 3, 0, 0, null]] };

  it('B0: ratios for a country without keys fall back to the global ratio and say so', () => {
    expect(b0FallbackMonths(w0, 'USA-CA')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(b0FallbackMonths(w0, 'AUS-NSW')).toEqual([]);
    const note = b0FallbackNote(w0, 'USA-CA')!;
    expect(note).toMatch(/No USA ratios/);
    expect(note).toMatch(/global fallback ratio \(3\.50\)/);
    expect(note).toMatch(/not a USA-specific ratio/);
    expect(b0FallbackNote(w0, 'BGD-C')).toBeNull();
    const r = recomputeAoiMonth('B0_month_ratio', { aoiId: 'USA-CA', year: 2016, b0Weights: w0, cells });
    expect(r.months[2]).toBeCloseTo(35, 9); // 3.5 × 10
    expect(r.fallbackNotes).toHaveLength(1);
    expect(recomputeAoiMonth('B0_month_ratio', { aoiId: 'AUS-NSW', year: 2016, b0Weights: w0, cells }).fallbackNotes).toEqual([]);
  });
  it('B0: no own ratio and no global fallback → month is null (never zero), with a label', () => {
    const bare = B0WeightsSchema.parse({ ratios: { 'AUS-01': 2 } });
    const out = b0FromCells(bare, 'USA-CA', cells);
    expect(out.every((v) => v === null)).toBe(true);
    expect(b0FromRecords(bare, 'USA', []).every((v) => v === null)).toBe(true);
    expect(b0FallbackNote(bare, 'USA-CA')).toMatch(/no global fallback/);
  });
  it('B1: a country with no country_<ISO3> term is labelled, not scored silently', () => {
    const w1 = B1WeightsSchema.parse(readJson('models/B1_poisson/weights.json'));
    const f = B1FeaturesSchema.parse(readJson('features/BGD/2016.json'));
    expect(b1FallbackNotes(w1, f)).toEqual([]); // BGD has its own term
    const usa = { ...f, aoi_id: 'XYZ-QQ' };
    const notes = b1FallbackNotes(w1, usa);
    expect(notes[0]).toMatch(/no country_XYZ term/);
    expect(b1FromFeatures(w1, usa).fallbackNotes).toEqual(notes);
    const dropped = { ...f, derived: { ...f.derived, country_onehot: { country_BGD: 1 } } };
    expect(b1FallbackNotes(w1, dropped).join(' ')).toMatch(/country_AUS, country_USA missing from the features file/);
  });
});

describe('three-region snapshot', () => {
  const api = createDataApi('/', { fetch: diskFetch });
  it('regions.json flags match the CONTRACT §9 registry for every AOI present', async () => {
    const regions = await api.loadRegions(SNAP_ID);
    for (const r of regions) {
      const want = REGISTRY.find((x) => x.aoi_id === r.aoi_id);
      expect(want, `${r.aoi_id} is in the registry`).toBeDefined();
      expect([r.aoi_id, r.kind, r.country, r.cells_exported, r.features_exported]).toEqual([want!.aoi_id, want!.kind, want!.country, want!.cells_exported, want!.features_exported]);
    }
  });
  it('USA + USA-CA present, cells/features only for USA-CA', async () => {
    const regions = await api.loadRegions(SNAP_ID);
    expect(regions.map((r) => r.aoi_id)).toEqual(expect.arrayContaining(['BGD', 'AUS', 'AUS-NSW', 'USA', 'USA-CA']));
    expect(detailedRegions(regions).map((r) => r.aoi_id)).toEqual(['BGD', 'AUS-NSW', 'USA-CA']);
    expect(await api.loadCells(SNAP_ID, 'USA', 2016)).toBeNull(); // whole-country USA cell grid is not exported
    expect((await api.loadCells(SNAP_ID, 'USA-CA', 2016))?.columns).toContain('est');
    expect(await api.loadFeatures(SNAP_ID, 'USA-CA', 2016)).not.toBeNull();
    expect(await api.loadFeatures(SNAP_ID, 'USA', 2016)).toBeNull();
    expect(await api.loadActivity(SNAP_ID, 'USA', 2016)).toHaveLength(12);
    const w0 = B0WeightsSchema.parse(readJson('models/B0_month_ratio/weights.json'));
    expect(b0FallbackMonths(w0, 'USA-CA')).toEqual([]); // the regenerated weights carry USA-01..USA-12
  });
});
