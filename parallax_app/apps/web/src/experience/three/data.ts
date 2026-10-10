import type { HotPoint } from '../contract';

type Row = [string, number, number, number, number | null, number | null, number | null];
interface CellsFile { columns?: string[]; rows: Row[] }

const join = (base: string, path: string) => (base.endsWith('/') ? base : base + '/') + path;

/**
 * Read data/<snap>/cells/<aoi>/<year>.json for each AOI and flatten rows
 * [cell_id, lon, lat, month, aqua, viirs, est] into HotPoints (one per non-null, >0 series value).
 * Values are taken verbatim from the bundle (which may be SYNTHETIC demo data) — nothing is invented.
 * Duplicate cells across overlapping AOIs (e.g. BGD and BGD-A) are de-duplicated.
 * Missing files are skipped silently (an AOI/year without data yields no points).
 */
export async function loadHotPoints(
  baseUrl: string,
  snapshotId: string,
  aoiIds: string[],
  year: number,
  month?: number,
  signal?: AbortSignal
): Promise<HotPoint[]> {
  const out: HotPoint[] = [];
  const seen = new Set<string>();
  const files = await Promise.all(
    aoiIds.map(async (aoi) => {
      try {
        const res = await fetch(join(baseUrl, `data/${snapshotId}/cells/${aoi}/${year}.json`), { signal });
        if (!res.ok) return null;
        return { aoi, data: (await res.json()) as CellsFile };
      } catch {
        return null;
      }
    })
  );
  for (const f of files) {
    if (!f || !Array.isArray(f.data?.rows)) continue;
    const cols = f.data.columns ?? ['cell_id', 'lon', 'lat', 'month', 'aqua', 'viirs', 'est'];
    const ix = (n: string, d: number) => { const i = cols.indexOf(n); return i < 0 ? d : i; };
    const iId = ix('cell_id', 0), iLon = ix('lon', 1), iLat = ix('lat', 2), iM = ix('month', 3);
    const iA = ix('aqua', 4), iV = ix('viirs', 5), iE = ix('est', 6);
    for (const r of f.data.rows) {
      const m = Number(r[iM]);
      if (month !== undefined && m !== month) continue;
      const lon = Number(r[iLon]), lat = Number(r[iLat]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const key = `${r[iId]}|${m}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const push = (v: unknown, series: HotPoint['series']) => {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.push({ lon, lat, value: v, series, aoiId: f.aoi, year, month: m });
      };
      push(r[iA], 'aqua');
      push(r[iV], 'viirs');
      push(r[iE], 'est');
    }
  }
  return out;
}

export interface CountryLines { positions: Float32Array; highlight: Float32Array }

/** Load Natural Earth admin-0 GeoJSON. */
export async function loadCountries(url: string, signal?: AbortSignal): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as GeoJSON.FeatureCollection;
  } catch {
    return null;
  }
}

/** Default URL of the bundled basemap relative to the app base. */
export function defaultBasemapUrl(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? './';
  try {
    return new URL(join(base, 'basemap/ne_110m_admin_0_countries.geojson'), document.baseURI).toString();
  } catch {
    return join(base, 'basemap/ne_110m_admin_0_countries.geojson');
  }
}
