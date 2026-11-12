// NASA GIBS imagery tiles (WMTS, EPSG:3857, keyless, CORS open). Templates and levels verified in docs/LIVE_SOURCES.md.
import { useEffect, useState } from 'react';

export type DailyKey = 'terra' | 'aqua' | 'noaa20' | 'noaa21';
export type GeoKey = 'goes_east' | 'goes_west';

interface LayerInfo { layer: string; ext: string; matrix: string; max: number; label: string }
export const DAILY: Record<DailyKey, LayerInfo> = {
  terra: { layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', ext: 'jpg', matrix: 'GoogleMapsCompatible_Level9', max: 9, label: 'Terra' },
  aqua: { layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', ext: 'jpg', matrix: 'GoogleMapsCompatible_Level9', max: 9, label: 'Aqua' },
  noaa20: { layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', ext: 'jpg', matrix: 'GoogleMapsCompatible_Level9', max: 9, label: 'NOAA-20' },
  noaa21: { layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', ext: 'jpg', matrix: 'GoogleMapsCompatible_Level9', max: 9, label: 'NOAA-21' }
};
export const GEO: Record<GeoKey, LayerInfo> = {
  goes_east: { layer: 'GOES-East_ABI_GeoColor', ext: 'png', matrix: 'GoogleMapsCompatible_Level7', max: 7, label: 'GOES-East' },
  goes_west: { layer: 'GOES-West_ABI_GeoColor', ext: 'png', matrix: 'GoogleMapsCompatible_Level7', max: 7, label: 'GOES-West' }
};
const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const NIGHT = { url: `${BASE}/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`, max: 8, date: '2016-01-01' };
export const GIBS_CREDIT = 'Imagery: NASA EOSDIS GIBS / Worldview';

export const gibsUrl = (i: LayerInfo, time: string) => `${BASE}/${i.layer}/default/${time}/${i.matrix}/{z}/{y}/{x}.${i.ext}`;

export interface GibsTimes {
  daily: Partial<Record<DailyKey, { latest: string | null; yesterday: string }>>;
  geo: Partial<Record<GeoKey, { time: string | null }>>;
  fetched_utc: string; state: 'ok' | 'fallback' | 'unavailable';
}

const yesterdayUtc = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

/** Day of the daily image to show: the newest complete day (yesterday, or the latest published if that is older). */
export function dailyDate(t: GibsTimes | null, k: DailyKey): string {
  const d = t?.daily[k];
  const y = d?.yesterday ?? yesterdayUtc();
  return d?.latest && d.latest < y ? d.latest : y;
}

let cached: { at: number; v: GibsTimes } | null = null;
/** Latest layer times from /api/gibs-times. When the function is not reachable the daily layers fall back to yesterday (UTC) and geostationary has no time. */
export async function fetchGibsTimes(): Promise<GibsTimes> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.v;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch('/api/gibs-times', { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = (await r.json()) as GibsTimes;
    cached = { at: Date.now(), v };
    return v;
  } catch {
    return { daily: {}, geo: {}, fetched_utc: new Date().toISOString(), state: 'unavailable' };
  } finally { clearTimeout(t); }
}

export function useGibsTimes(enabled = true): GibsTimes | null {
  const [v, setV] = useState<GibsTimes | null>(cached?.v ?? null);
  useEffect(() => {
    if (!enabled || v) return;
    let off = false;
    fetchGibsTimes().then((x) => { if (!off) setV(x); });
    return () => { off = true; };
  }, [enabled, v]);
  return v;
}
