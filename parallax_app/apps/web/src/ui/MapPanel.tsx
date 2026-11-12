import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, RotateCw } from 'lucide-react';
import { Icon3D } from './icons/Icon3D';
import type { Map as MlMap, GeoJSONSource, Marker, Popup, StyleSpecification } from 'maplibre-gl';
import '../styles/live.css';
import { admin2KeyFor, districtsInRegion, featureBbox, useAdmin2, useAdmin2Year } from '../data/admin2';
import { clipRows, liveKeyFor, useLive } from '../data/live';
import { LIVE_COLORS, LIVE_ICON, LiveLegend, LiveTag, type LiveTagData, liveFeatures, livePopup, makeLiveImages } from './LiveLayer';
import { SensorControl, SensorCaption, SensorFilters, lookForKey, type Look } from './SensorLook';
import { buildDistricts, districtPopup, labelPoint } from './DistrictLayer';
import type { CellsFile, Region, Selection } from '../types';
import { SERIES_COLORS } from '../types';
import { fmtCompact, fmtNum, monthLabel } from '../data/format';
import { noCellsHint } from '../data/regions';
import { RAMP_CSS, valueColor } from './scale';
import type { CellState } from './glyphs';
import { BASEMAP_ATTRIBUTION, MAP_THEME, isDarkTheme, OFFLINE_NOTE, composeStyle, firstLabelLayer, loadBaseStyle, useDarkTheme, watchBasemapHealth, type Overlay } from './basemap';
import { DAILY, GIBS_CREDIT, NIGHT, dailyDate, gibsUrl, useGibsTimes } from '../live/gibs';

export type MapSeries = 'auto' | 'viirs' | 'aqua' | 'est';
const SERIES_OPTS: { k: MapSeries; label: string; color?: string }[] = [
  { k: 'auto', label: 'Headline' }, { k: 'viirs', label: 'VIIRS', color: SERIES_COLORS.viirs },
  { k: 'aqua', label: 'Aqua', color: SERIES_COLORS.aqua }, { k: 'est', label: 'Estimate', color: SERIES_COLORS.estimate }
];

interface Props {
  region: Region | undefined; geo: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** All regions of the snapshot: lets the no-cells message name the exported sub-regions (from `cells_exported`). */
  regions?: Region[];
  cells: { loaded: boolean; file: CellsFile | null; error?: string | null; retry?: () => void }; selection: Selection; visible?: boolean;
  /** Display state of the AOI-month record (REVIEW M5): a missing month is never shown as '0 active cells'. */
  monthState?: CellState;
}

// REVIEW M5: probe once per page and release the throwaway context (the workspace can now remount many times).
let glProbe: boolean | null = null;
function hasWebGL(): boolean {
  if (/[?&]nowebgl\b/.test(location.search)) return false;
  if (glProbe !== null) return glProbe;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return (glProbe = !!gl);
  } catch { return (glProbe = false); }
}

type Imagery = 'none' | 'day' | 'night';

/** Our data layers, drawn on top of whichever basemap is active. */
function overlayFor(dark: boolean, hasBase: boolean): Overlay {
  const T = dark ? MAP_THEME.dark : MAP_THEME.light;
  const emptyFc = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
  const empty = (): { type: 'geojson'; data: GeoJSON.FeatureCollection } => ({ type: 'geojson', data: emptyFc });
  return {
    sources: { aoi: empty(), cells: empty(), districts: empty(), 'live-modis': empty(), 'live-viirs': empty() },
    layers: [
      { id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': T.aoi, 'fill-opacity': 0.05 } },
      { id: 'aoi-glow', type: 'line', source: 'aoi', paint: { 'line-color': T.halo, 'line-width': 5, 'line-opacity': hasBase ? 0.6 : 0.08, 'line-blur': hasBase ? 1 : 4 } },
      { id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': T.aoi, 'line-width': 1.4, 'line-opacity': 0.9 } },
      { id: 'd-fill', type: 'fill', source: 'districts', layout: { visibility: 'none' }, paint: { 'fill-color': ['case', ['has', 'c'], ['get', 'c'], T.land], 'fill-opacity': ['case', ['has', 'c'], hasBase ? 0.72 : 0.85, hasBase ? 0.12 : 0.35] } },
      { id: 'd-line', type: 'line', source: 'districts', layout: { visibility: 'none' }, paint: { 'line-color': T.district, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 1.2], 'line-opacity': 0.9 } },
      {
        id: 'cells', type: 'circle', source: 'cells',
        paint: {
          'circle-color': ['get', 'c'],
          // about the true 5 km footprint from z8 up; enlarged (min ~2.5 px) at low zoom so cells stay visible
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 3, 1.8, 5, 2.6, 6, 3.4, 8, 6.5, 10, 22, 12, 88],
          'circle-opacity': hasBase ? 0.82 : 0.92,
          'circle-stroke-color': T.stroke, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 6, 0.6, 9, 0.8]
        }
      },
      { id: 'live-halo-modis', type: 'circle', source: 'live-modis', layout: { visibility: 'none' }, paint: { 'circle-color': LIVE_COLORS.modis, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 6, 6, 9, 10, 12, 14], 'circle-opacity': 0.3 } },
      { id: 'live-halo-viirs', type: 'circle', source: 'live-viirs', layout: { visibility: 'none' }, paint: { 'circle-color': LIVE_COLORS.viirs, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 6, 5, 9, 8, 12, 11], 'circle-opacity': 0.3 } },
      { id: 'live-modis', type: 'symbol', source: 'live-modis', layout: { visibility: 'none', 'icon-image': LIVE_ICON.modis, 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 8, 0.5, 12, 0.6], 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
      { id: 'live-viirs', type: 'symbol', source: 'live-viirs', layout: { visibility: 'none', 'icon-image': LIVE_ICON.viirs, 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 8, 0.45, 12, 0.55], 'icon-allow-overlap': true, 'icon-ignore-placement': true } }
    ] as Overlay['layers']
  };
}

interface CellPt { id: string; lon: number; lat: number; aqua: number | null; viirs: number | null; est: number | null; v: number | null }

export function MapPanel({ region, regions, geo, cells, selection, visible = true, monthState }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(() => (hasWebGL() ? null : 'WebGL is not available in this browser.'));
  const [series, setSeries] = useState<MapSeries>('auto');
  const [showTable, setShowTable] = useState(false);
  const dark = useDarkTheme();
  const [imagery, setImagery] = useState<Imagery>('none');
  const [offline, setOffline] = useState(false);
  const [styleRev, setStyleRev] = useState(0);
  const appliedRef = useRef({ dark, offline: false });
  const countriesRef = useRef<unknown>({ type: 'FeatureCollection', features: [] });
  const gibs = useGibsTimes(imagery === 'day');
  const [view, setView] = useState<'cells' | 'districts'>('cells');
  const [liveOn, setLiveOn] = useState(false);
  const [look, setLook] = useState<Look>('normal');
  const [tag, setTag] = useState<LiveTagData | null>(null);
  const tagKey = useRef('');
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hoverRef = useRef<Popup | null>(null);
  const bboxRef = useRef<Map<string, [number, number, number, number]>>(new Map());
  const admin2Key = admin2KeyFor(region?.aoi_id);
  const admin2 = useAdmin2(admin2Key);
  const districtsOn = view === 'districts' && admin2.available && !!admin2Key;
  const distYear = useAdmin2Year(admin2Key, selection.year, districtsOn);
  const live = useLive(liveOn);
  const liveKey = liveKeyFor(region?.aoi_id);

  // Resolve per-cell values for the selected month and series.
  const { pts, max, seriesUsed } = useMemo(() => {
    const f = cells.file;
    if (!f) return { pts: [] as CellPt[], max: 0, seriesUsed: series };
    const ci = (n: string) => f.columns.indexOf(n);
    const [iId, iLon, iLat, iM, iA, iV, iE] = ['cell_id', 'lon', 'lat', 'month', 'aqua', 'viirs', 'est'].map(ci);
    const anyViirs = f.rows.some((r) => r[iV] != null);
    const used: MapSeries = series === 'auto' ? (anyViirs ? 'viirs' : 'est') : series;
    const col = used === 'viirs' ? iV : used === 'aqua' ? iA : iE;
    let mx = 0;
    for (const r of f.rows) { const v = r[col]; if (typeof v === 'number' && v > mx) mx = v; }
    const pts: CellPt[] = [];
    for (const r of f.rows) {
      if (r[iM] !== selection.month) continue;
      const num = (k: number) => (typeof r[k] === 'number' ? (r[k] as number) : null);
      const v = num(col);
      if (v == null || v <= 0) continue;
      pts.push({ id: String(r[iId]), lon: r[iLon] as number, lat: r[iLat] as number, aqua: num(iA), viirs: num(iV), est: num(iE), v });
    }
    pts.sort((a, b) => (a.v ?? 0) - (b.v ?? 0));
    return { pts, max: mx, seriesUsed: used };
  }, [cells.file, selection.month, series]);

  const allowed = useMemo(
    () => (admin2.geo && region ? districtsInRegion(admin2.geo, region.aoi_id, region.bbox, geo) : null),
    [admin2.geo, region, geo]
  );
  const dist = useMemo(
    () => (admin2.geo ? buildDistricts(admin2.geo, distYear.file, selection.month, series, allowed) : null),
    [admin2.geo, distYear.file, selection.month, series, allowed]
  );
  const liveRows = useMemo(() => {
    const r = liveKey ? live.data?.regions?.[liveKey] : undefined;
    return { modis: clipRows(r?.modis ?? [], region?.bbox), viirs: clipRows(r?.viirs ?? [], region?.bbox) };
  }, [live.data, liveKey, region]);

  // Create map once.
  useEffect(() => {
    if (failed || !box.current) return;
    let disposed = false;
    const isDark0 = isDarkTheme();
    let stopHealth: (() => void) | null = null;
    (async () => {
      try {
        const [{ default: maplibregl }, countries, baseStyle] = await Promise.all([
          import('maplibre-gl'),
          fetch('./basemap/ne_110m_admin_0_countries.geojson').then((r) => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] })),
          loadBaseStyle(isDark0)
        ]);
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (disposed || !box.current) return;
        mlRef.current = maplibregl;
        countriesRef.current = countries;
        appliedRef.current = { dark: isDark0, offline: !baseStyle };
        setOffline(!baseStyle);
        const map = new maplibregl.Map({
          container: box.current,
          attributionControl: false,
          style: composeStyle({ base: baseStyle, dark: isDark0, countries, overlay: overlayFor(isDark0, !!baseStyle) }),
          center: [90.3, 23.7], zoom: 5, maxZoom: 12, minZoom: 1,
          dragRotate: false, pitchWithRotate: false, cooperativeGestures: false
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: (baseStyle ? BASEMAP_ATTRIBUTION : 'Natural Earth') + ' · NASA FIRMS' }));
        const addIcons = () => {
          const imgs = makeLiveImages();
          if (imgs && !map.hasImage(LIVE_ICON.modis)) { map.addImage(LIVE_ICON.modis, imgs.modis, { pixelRatio: 2 }); map.addImage(LIVE_ICON.viirs, imgs.viirs, { pixelRatio: 2 }); }
        };
        map.on('load', () => {
          addIcons();
          if (!disposed) setReady(true);
        });
        // A new style (theme change, offline fallback) drops our icons and data: put the icons back and let the data effects run again.
        map.on('style.load', () => { addIcons(); if (!disposed) setStyleRev((x) => x + 1); });
        if (baseStyle) stopHealth = watchBasemapHealth(map, () => { if (!disposed) setOffline(true); });
        const liveAt = (pt: { x: number; y: number }) => map.queryRenderedFeatures([[pt.x - 6, pt.y - 6], [pt.x + 6, pt.y + 6]], { layers: ['live-modis', 'live-viirs'] });
        for (const id of ['live-modis', 'live-viirs']) {
          map.on('click', id, (e) => {
            const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
            if (p) new maplibregl.Popup({ closeButton: true, className: 'cell-pop' }).setLngLat(e.lngLat).setDOMContent(livePopup(p)).addTo(map);
          });
          map.on('mousemove', id, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
            const g = e.features?.[0]?.geometry as GeoJSON.Point | undefined;
            const key = `${String(p?.kind)}|${String(p?.date)}|${String(p?.time)}|${g?.coordinates?.join(',')}`;
            if (p && key !== tagKey.current) { tagKey.current = key; setTag({ x: e.point.x, y: e.point.y, kind: p.kind === 'viirs' ? 'viirs' : 'modis', date: String(p.date ?? ''), time: String(p.time ?? ''), frp: p.frp == null || p.frp === '' ? null : Number(p.frp) }); }
          });
          map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; tagKey.current = ''; setTag(null); });
        }
        map.on('movestart', () => { tagKey.current = ''; setTag(null); });
        const showDistrict = (e: { features?: { properties?: unknown }[]; lngLat: { lng: number; lat: number }; point: { x: number; y: number } }, sticky: boolean) => {
          if (liveAt(e.point).length) return;
          const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
          if (!p) return;
          hoverRef.current?.remove();
          const pop = new maplibregl.Popup({ closeButton: sticky, closeOnClick: !sticky, className: 'cell-pop', offset: 6 });
          pop.setLngLat(e.lngLat).setDOMContent(districtPopup(p, (map.getContainer().dataset.series as string) || '')).addTo(map);
          hoverRef.current = pop;
        };
        map.on('mousemove', 'd-fill', (e) => { map.getCanvas().style.cursor = 'pointer'; showDistrict(e, false); });
        map.on('mouseleave', 'd-fill', () => { map.getCanvas().style.cursor = ''; hoverRef.current?.remove(); hoverRef.current = null; });
        map.on('click', 'd-fill', (e) => {
          if (liveAt(e.point).length) return;
          showDistrict(e, true);
          const id = String((e.features?.[0]?.properties as { id?: string } | undefined)?.id ?? '');
          const b = bboxRef.current.get(id);
          if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 48, maxZoom: 10, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 });
        });
        map.on('zoom', () => {
          const th = Number(map.getContainer().dataset.labelZoom || 8);
          map.getContainer().classList.toggle('show-dlabels', map.getZoom() >= th);
        });
        map.on('error', (e) => console.warn('map error', e?.error));
        map.on('click', 'cells', (e) => {
          const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
          if (!p) return;
          // REVIEW M2: cell_id comes from bundle JSON — build DOM nodes with textContent, never setHTML.
          new maplibregl.Popup({ closeButton: true, className: 'cell-pop' }).setLngLat(e.lngLat).setDOMContent(popupNode(p)).addTo(map);
        });
        map.on('mouseenter', 'cells', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'cells', () => (map.getCanvas().style.cursor = ''));
        mapRef.current = map;
      } catch (err) {
        if (!disposed) setFailed('The map could not start: ' + String((err as Error)?.message ?? err));
      }
    })();
    return () => { disposed = true; stopHealth?.(); markersRef.current.forEach((m) => m.remove()); markersRef.current = []; hoverRef.current?.remove(); mapRef.current?.remove(); mapRef.current = null; };
  }, [failed]);

  // AOI outline + fit.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !region) return;
    (map.getSource('aoi') as GeoJSONSource | undefined)?.setData((geo as GeoJSON.FeatureCollection) ?? { type: 'FeatureCollection', features: [] });
  }, [ready, geo, region, styleRev]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !region) return;
    const [w, s, e, n] = region.bbox;
    map.fitBounds([[w, s], [e, n]], { padding: 36, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
  }, [ready, region, geo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('cells') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { ...p, c: p.v != null && p.v > 0 ? valueColor(p.v, max) : '#8A94A6' } }))
    });
  }, [ready, pts, max, styleRev]);

  useEffect(() => { if (visible) mapRef.current?.resize(); }, [visible]);

  // Theme or offline fallback: build the whole style again (the two basemaps have different layers); data and icons are re-applied on style.load.
  useEffect(() => {
    const map = mapRef.current, a = appliedRef.current;
    if (!ready || !map || (a.dark === dark && a.offline === offline)) return;
    let off = false;
    (async () => {
      const base: StyleSpecification | null = offline ? null : await loadBaseStyle(dark);
      if (off || !mapRef.current) return;
      if (!base && !offline) { setOffline(true); return; }
      appliedRef.current = { dark, offline: !base };
      mapRef.current.setStyle(composeStyle({ base, dark, countries: countriesRef.current, overlay: overlayFor(dark, !!base) }), { diff: false });
    })();
    return () => { off = true; };
  }, [ready, dark, offline]);

  // Imagery (GIBS): yesterday's true colour or night lights, inserted under the place names.
  const imgDate = dailyDate(gibs, 'terra');
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer('imagery')) map.removeLayer('imagery');
    if (map.getSource('imagery')) map.removeSource('imagery');
    if (imagery === 'none') return;
    const day = imagery === 'day';
    map.addSource('imagery', { type: 'raster', tiles: [day ? gibsUrl(DAILY.terra, imgDate) : NIGHT.url], tileSize: 256, maxzoom: day ? DAILY.terra.max : NIGHT.max, attribution: GIBS_CREDIT });
    map.addLayer({ id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-opacity': 1 } }, firstLabelLayer(map, 'aoi-fill'));
  }, [ready, imagery, imgDate, styleRev]);

  // Layer visibility: cells vs districts, live overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('cells', !districtsOn); vis('d-fill', districtsOn); vis('d-line', districtsOn);
    for (const id of ['live-halo-modis', 'live-halo-viirs', 'live-modis', 'live-viirs']) vis(id, liveOn && live.status === 'ok');
    if (!districtsOn) { hoverRef.current?.remove(); hoverRef.current = null; }
  }, [ready, districtsOn, liveOn, live.status, styleRev]);

  // District choropleth data + name labels (DOM markers: the basemap style has no glyph server).
  useEffect(() => {
    const map = mapRef.current, gl = mlRef.current;
    if (!ready || !map || !gl) return;
    (map.getSource('districts') as GeoJSONSource | undefined)?.setData(dist && districtsOn ? dist.fc : { type: 'FeatureCollection', features: [] });
    map.getContainer().dataset.series = dist ? (SERIES_OPTS.find((o) => o.k === dist.used)?.label ?? '') : '';
    markersRef.current.forEach((m) => m.remove()); markersRef.current = [];
    if (!dist || !districtsOn) { map.getContainer().classList.remove('show-dlabels'); return; }
    map.getContainer().dataset.labelZoom = String(dist.total <= 15 ? 6.5 : 8);
    for (const f of dist.fc.features) {
      const pt = labelPoint(f); if (!pt) continue;
      const el = document.createElement('div'); el.className = 'district-label'; el.textContent = String((f.properties as { name?: string }).name ?? '');
      markersRef.current.push(new gl.Marker({ element: el, anchor: 'center' }).setLngLat(pt).addTo(map));
    }
    map.fire('zoom');
  }, [ready, dist, districtsOn, styleRev]);

  useEffect(() => {
    const feats = admin2.geo?.features; const m = new Map<string, [number, number, number, number]>();
    for (const f of feats ?? []) m.set(String((f.properties as { id: string }).id), featureBbox(f));
    bboxRef.current = m;
  }, [admin2.geo]);

  // Live detections: data + pulse.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('live-modis') as GeoJSONSource | undefined)?.setData(liveFeatures(liveOn ? liveRows.modis : [], 'modis'));
    (map.getSource('live-viirs') as GeoJSONSource | undefined)?.setData(liveFeatures(liveOn ? liveRows.viirs : [], 'viirs'));
  }, [ready, liveOn, liveRows, styleRev]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !liveOn || live.status !== 'ok' || !visible) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulse = (ph: number) => {
      for (const [id, base] of [['live-halo-modis', 0.4], ['live-halo-viirs', 0.4]] as const) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'circle-opacity', base * (1 - ph));
      }
    };
    if (still) { pulse(0.3); return; }
    let raf = 0, last = 0;
    const step = (t: number) => {
      if (t - last > 60) { last = t; pulse((t % 1800) / 1800); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready, liveOn, live.status, visible]);

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const l = lookForKey(e.key);
    if (l) setLook(l);
  };
  const tableMode = !!failed || showTable;
  const seriesName = SERIES_OPTS.find((o) => o.k === (districtsOn && dist ? dist.used : seriesUsed))?.label ?? '';
  const districtSub = !distYear.loaded ? 'Loading districts…'
    : !distYear.file ? 'District sums unavailable for this year (not cached / failed to load) — not missing data'
    : monthState === 'missing' ? 'No data this month (missing, not zero)'
    : `${dist?.active ?? 0} of ${dist?.total ?? 0} districts with active cells · sums of 5 km cells`;

  return (
    <section className="panel map" aria-label="Map of 5 km cells" onKeyDown={onKey}>
      <div className="panel__head">
        <h2 className="panel__title">Map <span className="muted">· {region?.name ?? ''} · {monthLabel(selection.year, selection.month)}</span></h2>
        <div className="map__tools">
          <div className="seg seg--sm" role="group" aria-label="Map series">
            {SERIES_OPTS.map((o) => (
              <button key={o.k} className={series === o.k ? 'is-on' : ''} aria-pressed={series === o.k} onClick={() => setSeries(o.k)}>
                {o.color && <i className="dot" style={{ background: o.color }} />}{o.label}
              </button>
            ))}
          </div>
          {!tableMode && <SensorControl look={look} onLook={setLook} />}
          {!tableMode && <SensorCaption look={look} />}
          {!tableMode && admin2.available && (
            <div className="seg seg--sm" role="group" aria-label="Map view">
              <button className={!districtsOn ? 'is-on' : ''} aria-pressed={!districtsOn} onClick={() => setView('cells')}>Cells</button>
              <button className={districtsOn ? 'is-on' : ''} aria-pressed={districtsOn} onClick={() => setView('districts')}>Districts</button>
            </div>
          )}
          {!tableMode && (
            <div className="seg seg--sm" role="group" aria-label="Satellite image under the map">
              <button className={imagery === 'none' ? 'is-on' : ''} aria-pressed={imagery === 'none'} onClick={() => setImagery('none')}>Map only</button>
              <button className={imagery === 'day' ? 'is-on' : ''} aria-pressed={imagery === 'day'} onClick={() => setImagery('day')}>Satellite image, yesterday</button>
              <button className={imagery === 'night' ? 'is-on' : ''} aria-pressed={imagery === 'night'} onClick={() => setImagery('night')}>Night lights</button>
            </div>
          )}
          {!tableMode && <button className="btn btn--ghost btn--sm map__live-btn" aria-pressed={liveOn} onClick={() => setLiveOn(!liveOn)}><i className="live__dot" aria-hidden="true" />Live · last 24 h</button>}
          {!failed && <button className="btn btn--ghost btn--sm" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>{showTable ? 'Map' : 'Table'}</button>}
        </div>
      </div>
      {!tableMode && (offline || imagery !== 'none') && (
        <div className="map__notes">
          {offline && <p className="notice map__offline" role="status">{OFFLINE_NOTE}</p>}
          {imagery === 'day' && <p className="muted map__imgnote" role="status">Satellite image of {imgDate} (Terra, true colour){gibs?.state === 'unavailable' ? ' - latest date could not be checked, showing yesterday' : ''}. {GIBS_CREDIT}.</p>}
          {imagery === 'night' && <p className="muted map__imgnote" role="status">Night lights, a fixed picture from 2016 (VIIRS Black Marble). {GIBS_CREDIT}.</p>}
        </div>
      )}
      {!tableMode && liveOn && (
        <div className="map__notes">
          {liveOn && <LiveLegend status={live.status} data={live.data} covered={!!liveKey} nModis={liveRows.modis.length} nViirs={liveRows.viirs.length} regionName={region?.name ?? ''} retry={live.retry} />}
        </div>
      )}
      <div className="map__stage" data-look={look}>
        <SensorFilters />
        <div ref={box} className="map__canvas" hidden={tableMode} aria-hidden={tableMode} />
        {!tableMode && tag && liveOn && <LiveTag tag={tag} />}
        {!tableMode && districtsOn && <div className="map__attrib" aria-label="District boundary attribution">District boundaries: geoBoundaries (CC BY 3.0 IGO), source BBS / OCHA ROAP</div>}
        {!tableMode && (
          <div className="map__overlay">
            <div className="map__legend">
              <div className="map__legend-title">{seriesName} detections / {districtsOn ? 'district' : '5 km cell'}</div>
              <div className="legend__ramp"><span className="legend__lab">1</span><span className="legend__bar" style={{ background: RAMP_CSS }} /><span className="legend__lab">{fmtCompact(districtsOn ? dist?.max ?? 0 : max)}</span></div>
              {districtsOn
                ? <div className="map__legend-sub">{districtSub}</div>
                : <div className="map__legend-sub">{subIcon(cells, monthState)}{legendSub(cells, pts.length, monthState)}</div>}
              {!districtsOn && cells.error && cells.retry && <button className="btn btn--sm map__retry" onClick={cells.retry}><Icon3D icon={RotateCw} tone="current" size={14} />Retry</button>}
            </div>
          </div>
        )}
        {tableMode && (
          <div className="map__fallback">
            {failed && <p className="notice" role="status">{failed} Showing a table instead — the calendar, chart and evidence still work.</p>}
            {cells.error ? <p className="muted">{subIcon(cells, monthState)}{legendSub(cells, 0, monthState)}</p>
              : monthState === 'missing' ? <p className="muted">{legendSub(cells, 0, monthState)}</p>
              : <CellTable pts={pts} loaded={cells.loaded} hasFile={!!cells.file} noFileText={noFileText(region, regions)} />}
          </div>
        )}
      </div>
    </section>
  );
}

/** CloudOff marker for the 'unavailable' legend lines (was a unicode pictograph inside the string). */
function subIcon(cells: Props['cells'], monthState?: CellState) {
  return cells.error || (cells.loaded && cells.file && monthState === 'unavailable') ? <Icon3D icon={CloudOff} tone="amber" size={13} className="i3d--inline" /> : null;
}

/** Legend sub-line: honest about loading, unavailable, missing and partial months (REVIEW M5, E2E B1). */
export function legendSub(cells: Props['cells'], n: number, monthState?: CellState): string {
  if (cells.error) return `Cell grid unavailable (not cached / failed to load) — not missing data`;
  if (!cells.loaded || monthState === 'loading') return 'Loading cells…';
  if (!cells.file) return 'No cell grid exported for this AOI';
  if (monthState === 'missing') return 'No data this month (missing, not zero)';
  if (monthState === 'unavailable') return 'Month unavailable (not cached / failed to load)';
  if (monthState === 'unsupported') return `${n} active cells · no harmonized estimate this month`;
  if (monthState === 'partial') return `${n} active cells · partial month (counts may be incomplete)`;
  return `${n} active cells this month`;
}

function popupNode(p: Record<string, unknown>): HTMLElement {
  const root = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = `Cell ${String(p.id ?? '')}`;
  const l1 = document.createElement('div');
  l1.textContent = `Aqua ${fmtNum(p.aqua as number)} · VIIRS ${fmtNum(p.viirs as number)}`;
  const l2 = document.createElement('div');
  l2.textContent = `Estimate ${fmtNum(p.est as number)}`;
  root.append(title, l1, l2);
  return root;
}

/** Why there is no cell grid: not exported for this AOI (e.g. whole-country AUS / USA) vs. exported but absent for this year. */
export function noFileText(region: Region | undefined, regions: Region[] = []): string {
  if (region?.cells_exported === true) return 'No 5 km cell grid file for this year (missing, not zero).';
  return `No 5 km cell grid is exported for this AOI (${noCellsHint(region, regions)}).`;
}

function CellTable({ pts, loaded, hasFile, noFileText: noFile }: { pts: CellPt[]; loaded: boolean; hasFile: boolean; noFileText: string }) {
  if (!loaded) return <p className="muted">Loading cells…</p>;
  if (!hasFile) return <p className="muted">{noFile}</p>;
  const top = [...pts].sort((a, b) => (b.v ?? 0) - (a.v ?? 0)).slice(0, 60);
  return (
    <div className="table-wrap">
      <table className="tbl">
        <caption>Most active 5 km cells this month ({pts.length} total)</caption>
        <thead><tr><th>Cell</th><th>Lat</th><th>Lon</th><th>Aqua</th><th>VIIRS</th><th>Estimate</th></tr></thead>
        <tbody>{top.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.lat.toFixed(3)}</td><td>{p.lon.toFixed(3)}</td><td>{fmtNum(p.aqua)}</td><td>{fmtNum(p.viirs)}</td><td>{fmtNum(p.est)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
