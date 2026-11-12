// Live NASA FIRMS near-real-time detections (keyless global 24 h CSVs) for the three Parallax Fire regions.
// Served at /api/firms-live. CDN-cached ~30 min so NASA is contacted about twice an hour.
// NOTE: process.env.FIRMS_MAP_KEY (if ever set) is intentionally ignored for now; the keyless feeds are enough.
import { filterFirmsCsv, emptyRegions, type RegionRows } from './lib/firms.mts';
import { getText } from './lib/http.mts';
import { packWorldCsv, emptySource, WORLD_LAYOUT, type PackedSource } from './lib/world.mts';

const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
const MODIS_URL = `${BASE}/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv`;
// S-NPP is tried first; if its global file has no data rows (it was header-only when checked, 2026-11-11),
// NOAA-20 VIIRS 375 m is used instead and reported in `viirs_source`.
const VIIRS_URLS = [
  { sat: 'S-NPP', url: `${BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` },
  { sat: 'NOAA-20', url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` }
];
const NOTE = 'Near-real-time detections, not quality-controlled standard data; not used in the calendar or the model';

const json = (body: unknown, status: number, cache: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...cache } });

// ?scope=world: every detection of the last 24 h of MODIS, NOAA-20 and NOAA-21, packed (see lib/world.mts). Sequential, 12 s each.
const WORLD_SOURCES = [
  { key: 'modis', label: 'MODIS (Terra and Aqua, 1 km)', url: MODIS_URL },
  { key: 'noaa20', label: 'NOAA-20 VIIRS (375 m)', url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` },
  { key: 'noaa21', label: 'NOAA-21 VIIRS (375 m)', url: `${BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv` },
  { key: 'snpp', label: 'Suomi NPP VIIRS (375 m)', url: `${BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` }
];

// 12 s per file on Netlify; the local dev middleware raises it because a home connection needs longer for 9 MB.
const REGION_TIMEOUT_MS = Number(process.env.PARALLAX_FETCH_TIMEOUT_MS) || 10_000;
const WORLD_TIMEOUT_MS = Number(process.env.PARALLAX_FETCH_TIMEOUT_MS) || 12_000;

// Optional ?src=modis,snpp limits the response to some sources, so a page can load them in separate requests (each stays well inside
// the function time limit and the big files do not hold up the small ones). Without it all four are returned.
async function worldResponse(only: string[] | null): Promise<Response> {
  const sources: Record<string, PackedSource & { label: string }> = {};
  for (const s of WORLD_SOURCES) {
    if (only && !only.includes(s.key)) continue;
    let packed: PackedSource;
    try { packed = packWorldCsv(await getText(s.url, WORLD_TIMEOUT_MS)); }
    catch (e) { packed = emptySource('failed', (e as Error).message); }
    sources[s.key] = { ...packed, label: s.label };
  }
  const all = Object.values(sources);
  const okCount = all.filter((s) => s.state === 'ok').length;
  if (!okCount && all.some((s) => s.state === 'failed')) return json({ error: 'NASA FIRMS feed unavailable', sources, note: NOTE }, 502, { 'cache-control': 'no-store' });
  const total = all.reduce((n, s) => n + s.count, 0);
  return json({ scope: 'world', fetched_utc: new Date().toISOString(), note: NOTE, layout: WORLD_LAYOUT, sources, total },
    200, all.some((s) => s.state === 'failed')
      ? { 'cache-control': 'public, max-age=60', 'netlify-cdn-cache-control': 'public, s-maxage=120' }
      : { 'cache-control': 'public, max-age=300', 'netlify-cdn-cache-control': 'public, s-maxage=1800, stale-while-revalidate=3600' });
}

export default async (req: Request): Promise<Response> => {
  try {
    const q = new URL(req.url).searchParams;
    if (q.get('scope') === 'world') return await worldResponse(q.get('src') ? q.get('src')!.split(',') : null);
    const sources: string[] = [MODIS_URL];
    let modis: RegionRows = emptyRegions();
    let viirs: RegionRows = emptyRegions();
    let viirsSource: string | null = null;
    const errors: string[] = [];

    try { modis = filterFirmsCsv(await getText(MODIS_URL, REGION_TIMEOUT_MS)).regions; }
    catch (e) { errors.push(`MODIS: ${(e as Error).message}`); }

    for (const v of VIIRS_URLS) {
      try {
        const res = filterFirmsCsv(await getText(v.url, REGION_TIMEOUT_MS));
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
