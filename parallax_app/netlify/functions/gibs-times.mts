// Latest available time of the NASA GIBS imagery layers the Live page uses. Served at /api/gibs-times.
// The capabilities file is 5.8 MB, so it is only read here; the browser gets a few lines. CDN cache 10 min.
import { buildTimes } from './lib/gibs.mts';
import { getText, json, cdn } from './lib/http.mts';

export default async (_req: Request): Promise<Response> => {
  let xml: string | null = null;
  try { xml = await getText('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml', 15_000); } catch { xml = null; }
  const body = buildTimes(xml);
  return json(body, 200, xml ? cdn(600, 1800, 120) : { 'cache-control': 'no-store' });
};

export const config = { path: '/api/gibs-times' };
