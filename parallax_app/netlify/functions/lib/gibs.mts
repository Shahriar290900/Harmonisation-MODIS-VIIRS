// Pure helpers for the GIBS "latest time" function: read <Default> times of a few layers out of the WMTS capabilities XML.
export interface GibsLayerDef { key: string; layer: string; kind: 'daily' | 'geo' | 'static' }
export const GIBS_LAYERS: GibsLayerDef[] = [
  { key: 'terra', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', kind: 'daily' },
  { key: 'aqua', layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', kind: 'daily' },
  { key: 'noaa20', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', kind: 'daily' },
  { key: 'noaa21', layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', kind: 'daily' },
  { key: 'goes_east', layer: 'GOES-East_ABI_GeoColor', kind: 'geo' },
  { key: 'goes_west', layer: 'GOES-West_ABI_GeoColor', kind: 'geo' }
];

/** The <Default> value of the Time dimension of one layer, or null. Works on the one-line 5.8 MB XML without parsing all of it. */
export function layerDefaultTime(xml: string, layer: string): string | null {
  const at = xml.indexOf(`<ows:Identifier>${layer}</ows:Identifier>`);
  if (at < 0) return null;
  const end = xml.indexOf('</Layer>', at);
  const dim = xml.indexOf('<Dimension>', at);
  if (dim < 0 || (end >= 0 && dim > end)) return null;
  const m = /<Default>([^<]+)<\/Default>/.exec(xml.slice(dim, dim + 600));
  return m ? m[1] : null;
}

export const yesterdayUtc = (now = new Date()): string => new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

export interface GibsTimes {
  fetched_utc: string; state: 'ok' | 'fallback';
  daily: Record<string, { latest: string | null; yesterday: string }>;
  geo: Record<string, { time: string | null }>;
}

export function buildTimes(xml: string | null, now = new Date()): GibsTimes {
  const daily: GibsTimes['daily'] = {}, geo: GibsTimes['geo'] = {};
  const y = yesterdayUtc(now);
  for (const d of GIBS_LAYERS) {
    const t = xml ? layerDefaultTime(xml, d.layer) : null;
    if (d.kind === 'daily') daily[d.key] = { latest: t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null, yesterday: y };
    else geo[d.key] = { time: t && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t) ? t : null };
  }
  return { fetched_utc: now.toISOString(), state: xml ? 'ok' : 'fallback', daily, geo };
}
