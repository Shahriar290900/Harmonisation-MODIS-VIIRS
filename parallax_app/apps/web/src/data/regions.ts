// Region helpers: the AOI list is DATA (regions.json), never a hard-coded list (CONTRACT §8 "v1.2 addendum").
// Display kind follows the registry in CONTRACT §9: admin1 in Bangladesh = Division, elsewhere = State.
import type { Region } from '../types';

/** The Bangladesh-first story: the workspace default and the landing's hero focus. */
export const DEFAULT_AOI = 'BGD';
/** Hero focus when the default region's own bbox is not available yet (Bangladesh, kept as the default focus). */
export const DEFAULT_FOCUS = { lon: 90.35, lat: 23.7 } as const;

export type DisplayKind = 'Country' | 'Division' | 'State';
type RegionLike = Pick<Region, 'aoi_id' | 'kind' | 'country'> & { display_kind?: unknown };

/** 'BGD-A' → 'BGD', 'USA-CA' → 'USA'. */
export function iso3Of(aoiId: string): string {
  return aoiId.split('-')[0].toUpperCase();
}

/** 'Country' | 'Division' | 'State'. Honours a registry `display_kind` when regions.json carries one, else derives it. */
export function displayKind(r: RegionLike): DisplayKind {
  const d = r.display_kind;
  if (d === 'Country' || d === 'Division' || d === 'State') return d;
  if (r.kind === 'country') return 'Country';
  return iso3Of(r.aoi_id) === 'BGD' ? 'Division' : 'State';
}

/** 'country' | 'division' | 'state' (lower case, for running text). */
export const displayKindLower = (r: RegionLike): string => displayKind(r).toLowerCase();

/** Plural for counts: 'divisions', 'states', 'countries'. */
export function kindPlural(k: DisplayKind): string {
  return k === 'Country' ? 'countries' : `${k.toLowerCase()}s`;
}

/**
 * "First-class detailed" regions: 5 km cell grids AND B1 features exported (BGD, AUS-NSW, USA-CA in the v1.2 set).
 * The default region comes first. A snapshot whose regions.json lacks the export flags yields just the default
 * region (never a guess about which other areas have cells).
 */
export function detailedRegions(regions: readonly Region[], defaultAoi: string = DEFAULT_AOI): Region[] {
  const det = regions.filter((r) => r.cells_exported === true && r.features_exported === true);
  const home = regions.find((r) => r.aoi_id === defaultAoi);
  if (home && !det.includes(home)) det.unshift(home);
  return det.sort((a, b) => Number(b.aoi_id === defaultAoi) - Number(a.aoi_id === defaultAoi));
}

/** Aggregate-only countries (no cell grid exported): shown in the gallery, but their map asks for a state. */
export const hasCells = (r: Pick<Region, 'cells_exported'> | undefined | null): boolean => r?.cells_exported === true;

/** Globe/map focus (lon, lat) for a region: the bbox centre; Bangladesh keeps its curated default focus. */
export function regionFocus(r: Pick<Region, 'aoi_id' | 'bbox'> | undefined | null): { lon: number; lat: number } {
  if (!r || !Array.isArray(r.bbox) || r.bbox.length !== 4 || r.bbox.some((v) => !Number.isFinite(v))) return { ...DEFAULT_FOCUS };
  if (r.aoi_id === DEFAULT_AOI) return { ...DEFAULT_FOCUS };
  const [x0, y0, x1, y1] = r.bbox;
  return { lon: (x0 + x1) / 2, lat: (y0 + y1) / 2 };
}

/**
 * Sentence for a country-level AOI that has no cell grid: points to the exported sub-regions of the same country,
 * e.g. "whole-country Australia is too large; pick New South Wales". Driven by `cells_exported` flags.
 */
export function noCellsHint(region: Pick<Region, 'aoi_id' | 'name' | 'country' | 'kind'> | undefined, regions: readonly Region[]): string {
  const name = region?.name ?? 'this area';
  const subs = region ? regions.filter((r) => r.kind !== 'country' && r.country === region.country && hasCells(r)) : [];
  const pick = subs.length ? `; pick ${subs.map((s) => s.name).join(' or ')}` : '';
  return region?.kind === 'country' ? `whole-country ${name} is too large${pick}` : `not exported for ${name}${pick}`;
}
