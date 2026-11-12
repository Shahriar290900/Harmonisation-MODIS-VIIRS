// Orbit elements (TLE) for the five Earth-observing satellites we show on the Live page, from CelesTrak.
// Served at /api/sats. CelesTrak refreshes every 2 h and blocks clients that poll or retry on errors, so: no retry,
// and the CDN keeps a copy for 2 h (and serves a stale copy for a day while refreshing).
import { SATS, parseTle, type Tle } from './lib/sats.mts';
import { getText, json, cdn, cdnFail, budget } from './lib/http.mts';

export default async (_req: Request): Promise<Response> => {
  // CelesTrak answers one catalogue number per request; the five run in parallel inside one 7 s budget. No retries.
  const b = budget(Number(process.env.PARALLAX_FETCH_TIMEOUT_MS) || 7000);
  const results = await Promise.all(SATS.map(async (s) => {
    try {
      const t = parseTle(await getText(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.id}&FORMAT=TLE`, b.left()), s);
      return t ? { t } : { f: { name: s.name, error: 'response was not a valid orbit record' } };
    } catch (e) { return { f: { name: s.name, error: (e as Error).message } }; }
  }));
  const tles = results.flatMap((r) => ('t' in r && r.t ? [r.t] : []));
  const failed = results.flatMap((r) => ('f' in r && r.f ? [r.f] : []));
  if (!tles.length) return json({ fetched_utc: new Date().toISOString(), error: 'CelesTrak unavailable', tles: [], failed }, 200, cdnFail(7200));   // 200 so the CDN caches the failure (CelesTrak: never re-ask within 2 hours)
  return json({ fetched_utc: new Date().toISOString(), source: 'CelesTrak (celestrak.org), orbit records refreshed every 2 hours', tles, failed },
    200, failed.length ? cdnFail(7200) : cdn(7200, 86400, 600));
};

export const config = { path: '/api/sats' };
