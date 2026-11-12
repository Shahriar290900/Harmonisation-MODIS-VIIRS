// Real-world basemap for every map: OpenFreeMap (keyless vector tiles, dark and positron styles) that follows the theme,
// with the old Natural Earth outline style as an honest "offline basemap" fallback. Terms: docs/LIVE_SOURCES.md.
import { useEffect, useState } from 'react';
import type { Map as MlMap, StyleSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';

export const BASEMAP_URL = { dark: 'https://tiles.openfreemap.org/styles/dark', light: 'https://tiles.openfreemap.org/styles/positron' } as const;
export const BASEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
export const OFFLINE_NOTE = 'Offline basemap: the detailed map could not be loaded, so a simple outline is shown. The data on top is unchanged.';

export function isDarkTheme(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** True when the page is in the dark theme; follows the data-theme attribute and the OS preference. */
export function useDarkTheme(): boolean {
  const [dark, setDark] = useState(isDarkTheme);
  useEffect(() => {
    const upd = () => setDark(isDarkTheme());
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', upd);
    upd();
    return () => { mo.disconnect(); mq.removeEventListener?.('change', upd); };
  }, []);
  return dark;
}

/** Colours of the Natural Earth fallback and of the data outlines drawn on top of any basemap. */
export const MAP_THEME = {
  dark: { bg: '#081022', land: '#16233F', borders: '#2E4068', aoi: '#E6EDF7', stroke: '#0B1220', district: '#C3CEE6', halo: '#0B1220' },
  light: { bg: '#D9E6F2', land: '#F6F4EE', borders: '#9AA7BC', aoi: '#1E2A44', stroke: '#FFFFFF', district: '#52607A', halo: '#FFFFFF' }
};

const styleCache = new Map<boolean, Promise<StyleSpecification | null>>();
/** The OpenFreeMap style JSON for a theme (6 s limit, remembered). Null when it cannot be fetched: the caller then uses the offline style. */
export function loadBaseStyle(dark: boolean): Promise<StyleSpecification | null> {
  let p = styleCache.get(dark);
  if (!p) {
    p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {   // one retry: a single dropped connection should not switch the map to offline
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 6000);
        try {
          const r = await fetch(dark ? BASEMAP_URL.dark : BASEMAP_URL.light, { signal: ctl.signal });
          if (r.ok) {
            const j = (await r.json()) as StyleSpecification;
            if (j && Array.isArray(j.layers) && j.sources) return j;
          }
        } catch { /* try once more */ } finally { clearTimeout(t); }
        if (attempt === 0) await new Promise((res) => setTimeout(res, 1500));
      }
      return null;
    })();
    styleCache.set(dark, p);
    p.then((v) => { if (!v) styleCache.delete(dark); });   // a failure is not remembered: the next attempt may work
  }
  return p;
}

export interface Overlay { sources: Record<string, SourceSpecification>; layers: LayerSpecification[] }

/** Base layers + our data layers in one style. `base` null = offline Natural Earth outline. */
export function composeStyle(opts: { base: StyleSpecification | null; dark: boolean; countries: unknown; overlay: Overlay; globe?: boolean }): StyleSpecification {
  const { base, dark, countries, overlay, globe } = opts;
  const T = dark ? MAP_THEME.dark : MAP_THEME.light;
  const projection = globe ? { projection: { type: 'globe' } } : {};
  if (base) {
    return { ...base, ...projection, sources: { ...base.sources, ...overlay.sources }, layers: [...base.layers, ...overlay.layers] } as StyleSpecification;
  }
  return {
    version: 8, ...projection,
    sources: { countries: { type: 'geojson', data: countries as GeoJSON.FeatureCollection }, ...overlay.sources },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': T.bg } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': T.land } },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': T.borders, 'line-width': 0.8 } },
      ...overlay.layers
    ]
  } as StyleSpecification;
}

/** Id of the first label layer of the base style: imagery goes just under it so place names stay readable. */
export function firstLabelLayer(map: MlMap, fallback: string): string | undefined {
  const ls = map.getStyle()?.layers ?? [];
  return ls.find((l) => l.type === 'symbol' && (l as { source?: string }).source === 'openmaptiles')?.id ?? (map.getLayer(fallback) ? fallback : undefined);
}

/** Calls `onOffline` once when the vector tiles repeatedly fail before any tile has loaded (offline, blocked host). */
export function watchBasemapHealth(map: MlMap, onOffline: () => void): () => void {
  let loaded = false, errors = 0, fired = false;
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => { if (e.sourceId === 'openmaptiles' && e.isSourceLoaded) loaded = true; };
  const onErr = (e: { sourceId?: string }) => {
    if (e.sourceId !== 'openmaptiles' || loaded || fired) return;
    if (++errors >= 4) { fired = true; onOffline(); }
  };
  map.on('sourcedata', onData as never); map.on('error', onErr as never);
  return () => { map.off('sourcedata', onData as never); map.off('error', onErr as never); };
}
