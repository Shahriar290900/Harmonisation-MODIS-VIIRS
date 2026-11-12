// Orbit elements (TLE) for the five Earth-observing satellites we show on the Live page, from CelesTrak.
// Served at /api/sats. CelesTrak refreshes every 2 h and blocks clients that poll or retry on errors, so: sequential, no retry,
// and the CDN keeps a copy for 2 h (and serves a stale copy for a day while refreshing).
import { SATS, parseTle, type Tle } from './lib/sats.mts';
import { getText, json, cdn } from './lib/http.mts';

export default async (_req: Request): Promise<Response> => {
  const tles: Tle[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const s of SATS) {
    try {
      const t = parseTle(await getText(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.id}&FORMAT=TLE`, 10_000), s);
      if (t) tles.push(t); else failed.push({ name: s.name, error: 'response was not a valid orbit record' });
    } catch (e) { failed.push({ name: s.name, error: (e as Error).message }); }
  }
  if (!tles.length) return json({ error: 'CelesTrak unavailable', failed }, 502, { 'cache-control': 'no-store' });
  return json({ fetched_utc: new Date().toISOString(), source: 'CelesTrak (celestrak.org), orbit records refreshed every 2 hours', tles, failed },
    200, cdn(7200, 86400, 600));
};

export const config = { path: '/api/sats' };
