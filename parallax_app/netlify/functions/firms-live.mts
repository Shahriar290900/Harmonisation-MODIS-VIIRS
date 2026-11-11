// Live NASA FIRMS near-real-time detections (keyless global 24 h CSVs) for the three Parallax Fire regions.
// Served at /api/firms-live. CDN-cached ~30 min so NASA is contacted about twice an hour.
// NOTE: process.env.FIRMS_MAP_KEY (if ever set) is intentionally ignored for now; the keyless feeds are enough.
import { filterFirmsCsv, emptyRegions, type RegionRows } from './lib/firms.mts';

const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
const MODIS_URL = `${BASE}/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv`;
// S-NPP is tried first; if its global file has no data rows (it was header-only when checked, 2026-11-11),
// NOAA-20 VIIRS 375 m is used instead and reported in `viirs_source`.
const VIIRS_URLS = [
  { sat: 'S-NPP', url: `${BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` },
  { sat: 'NOAA-20', url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` }
];
const NOTE = 'Near-real-time detections, not quality-controlled standard data; not used in the calendar or the model';

async function getText(url: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'parallax-fire/1.0 (NASA Space Apps project)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

const json = (body: unknown, status: number, cache: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...cache } });

export default async (_req: Request): Promise<Response> => {
  try {
    const sources: string[] = [MODIS_URL];
    let modis: RegionRows = emptyRegions();
    let viirs: RegionRows = emptyRegions();
    let viirsSource: string | null = null;
    const errors: string[] = [];

    try { modis = filterFirmsCsv(await getText(MODIS_URL)).regions; }
    catch (e) { errors.push(`MODIS: ${(e as Error).message}`); }

    for (const v of VIIRS_URLS) {
      try {
        const res = filterFirmsCsv(await getText(v.url));
        if (res.totalRows > 0) { viirs = res.regions; viirsSource = v.sat; sources.push(v.url); break; }
      } catch (e) { errors.push(`VIIRS ${v.sat}: ${(e as Error).message}`); }
    }

    if (errors.length >= 1 && !viirsSource && modis.BGD.length + modis['USA-CA'].length + modis['AUS-NSW'].length === 0 && errors.some((m) => m.startsWith('MODIS'))) {
      return json({ error: 'NASA FIRMS feed unavailable', detail: errors, note: NOTE }, 502, { 'cache-control': 'no-store' });
    }

    const regions: Record<string, { modis: unknown[]; viirs: unknown[] }> = {};
    const counts: Record<string, { modis: number; viirs: number }> = {};
    for (const id of Object.keys(modis) as (keyof RegionRows)[]) {
      regions[id] = { modis: modis[id], viirs: viirs[id] };
      counts[id] = { modis: modis[id].length, viirs: viirs[id].length };
    }
    return json({
      fetched_utc: new Date().toISOString(), source_urls: sources, viirs_source: viirsSource, note: NOTE,
      columns: ['lon', 'lat', 'acq_date', 'acq_time', 'frp', 'confidence', 'daynight'],
      warnings: errors, regions, counts
    }, 200, {
      'cache-control': 'public, max-age=300',
      'netlify-cdn-cache-control': 'public, s-maxage=1800, stale-while-revalidate=3600'
    });
  } catch (e) {
    return json({ error: 'Live feed failed', detail: String((e as Error)?.message ?? e), note: NOTE }, 502, { 'cache-control': 'no-store' });
  }
};

export const config = { path: '/api/firms-live' };
