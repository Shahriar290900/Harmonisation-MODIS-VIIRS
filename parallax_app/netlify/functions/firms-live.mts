// Worldwide NASA FIRMS near-real-time detections of the last 24 h (keyless global CSVs), served at /api/firms-live?scope=world[&src=modis,noaa20,...].
// The page asks for one source per request. Everything runs inside one 7 s download budget (plus a little processing) (Netlify stops sync functions at 10 s); a file that does not
// arrive in time is reported as state "failed" instead of making the whole call fail. CDN cache 30 min; failures 3 min; nothing is retried.
import { getText, json, cdn, cdnFail, budget } from './lib/http.mts';
import { packWorldCsv, emptySource, WORLD_LAYOUT, type PackedSource } from './lib/world.mts';

const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
const NOTE = 'Near-real-time detections, not quality-controlled standard data; not used in the calendar or the model';
const WORLD_SOURCES = [
  { key: 'modis', label: 'MODIS (Terra and Aqua, 1 km)', url: `${BASE}/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv` },
  { key: 'noaa20', label: 'NOAA-20 VIIRS (375 m)', url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` },
  { key: 'noaa21', label: 'NOAA-21 VIIRS (375 m)', url: `${BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv` },
  { key: 'snpp', label: 'Suomi NPP VIIRS (375 m)', url: `${BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` }
];
// The local dev middleware may raise the budget because a home connection needs longer for 9 MB; Netlify never sets this.
const BUDGET = Number(process.env.PARALLAX_FETCH_TIMEOUT_MS) || 7000;

export default async (req: Request): Promise<Response> => {
  const q = new URL(req.url).searchParams;
  if (q.get('scope') !== 'world') return json({ error: 'unknown scope; use ?scope=world' }, 400, { 'cache-control': 'no-store' });
  const only = q.get('src') ? q.get('src')!.split(',') : null;
  const b = budget(BUDGET);
  const sources: Record<string, PackedSource & { label: string }> = {};
  for (const s of WORLD_SOURCES) {
    if (only && !only.includes(s.key)) continue;
    let packed: PackedSource;
    try { packed = packWorldCsv(await getText(s.url, b.left())); }
    catch (e) { packed = emptySource('failed', (e as Error).message); }
    sources[s.key] = { ...packed, label: s.label };
  }
  const all = Object.values(sources);
  const total = all.reduce((n, s) => n + s.count, 0);
  const anyFailed = all.some((s) => s.state === 'failed');
  if (!all.length) return json({ error: 'no such source' }, 400, { 'cache-control': 'no-store' });
  if (anyFailed && !all.some((s) => s.state === 'ok')) return json({ error: 'NASA FIRMS feed unavailable', sources, note: NOTE }, 502, cdnFail(180));
  return json({ scope: 'world', fetched_utc: new Date().toISOString(), note: NOTE, layout: WORLD_LAYOUT, sources, total },
    200, anyFailed ? cdnFail(180) : cdn(1800, 3600));
};

export const config = { path: '/api/firms-live' };
