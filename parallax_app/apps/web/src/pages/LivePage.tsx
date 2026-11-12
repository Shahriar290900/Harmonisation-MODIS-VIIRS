// Live: the real globe with today's hot spots, satellite pictures and where the satellites are now (docs/REVAMP_SPEC.md section 5).
// The map, timers and markers are driven imperatively (refs); React only renders the panel and the readouts that change rarely.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MlMap, Marker, StyleSpecification } from 'maplibre-gl';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { useSelection } from '../ui/bridge';
import { SensorCaption, SensorControl, SensorFilters, lookForKey, type Look } from '../ui/SensorLook';
import { LIVE_COLORS, LIVE_ICON, makeLiveImages } from '../ui/LiveLayer';
import { BASEMAP_ATTRIBUTION, MAP_THEME, OFFLINE_NOTE, composeStyle, firstLabelLayer, isDarkTheme, loadBaseStyle, useDarkTheme, watchBasemapHealth, type Overlay } from '../ui/basemap';
import { fetchSats, fetchWorld, liveKeyFor, WORLD_KEYS, WORLD_LABEL, type SatsFile, type WorldKey, type WorldSource } from '../data/live';
import { fmtNum } from '../data/format';
import { DAILY, GEO, GIBS_CREDIT, NIGHT, dailyDate, gibsUrl, useGibsTimes } from '../live/gibs';
import { PLACES, placeById, type Place } from '../live/places';
import { SAT_COLORS, groundTrack, makeSats, nextPass, subPoint, type Sat } from '../live/orbits';
import { SENSOR_NAME, buildHotspots, strongest, type Strongest } from '../live/world';
import { LayerPanel, utcHm, type ImageryMode } from '../live/LayerPanel';
import '../styles/live.css';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Keep the point of interest clear of the layer panel (desktop: panel on the right). */
const viewPad = () => ({ top: 0, left: 0, bottom: 0, right: innerWidth > 760 ? 360 : 0 });
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const emptyFc = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const idleSource = (key: WorldKey): WorldSource => ({ key, label: WORLD_LABEL[key], state: 'loading', count: 0, newest_utc: null, oldest_utc: null, raw: null });
const hasWebGL = (): boolean => {
  try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); (g as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext(); return !!g; } catch { return false; }
};

function overlay(): Overlay {
  const sz = (a: number, b: number, c: number, d: number) => ['interpolate', ['linear'], ['get', 'n'], 1, a, 10, b, 100, c, 1000, d];
  const trackColor = ['match', ['get', 'key'], ...Object.entries(SAT_COLORS).flat(), '#FFFFFF'];
  return {
    sources: { 'hs-modis': { type: 'geojson', data: emptyFc() }, 'hs-viirs': { type: 'geojson', data: emptyFc() }, 'sat-tracks': { type: 'geojson', data: emptyFc() } },
    layers: [
      { id: 'sat-tracks', type: 'line', source: 'sat-tracks', layout: { visibility: 'none' }, paint: { 'line-color': trackColor, 'line-width': 1.4, 'line-opacity': 0.85, 'line-dasharray': [2, 2] } },
      { id: 'hs-halo-modis', type: 'circle', source: 'hs-modis', paint: { 'circle-color': LIVE_COLORS.modis, 'circle-radius': sz(4, 6, 9, 14), 'circle-opacity': 0.25 } },
      { id: 'hs-halo-viirs', type: 'circle', source: 'hs-viirs', paint: { 'circle-color': LIVE_COLORS.viirs, 'circle-radius': sz(3.5, 5.5, 8.5, 13), 'circle-opacity': 0.25 } },
      { id: 'hs-modis', type: 'symbol', source: 'hs-modis', layout: { 'icon-image': LIVE_ICON.modis, 'icon-size': sz(0.28, 0.34, 0.45, 0.6), 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
      { id: 'hs-viirs', type: 'symbol', source: 'hs-viirs', layout: { 'icon-image': LIVE_ICON.viirs, 'icon-size': sz(0.26, 0.32, 0.42, 0.56), 'icon-allow-overlap': true, 'icon-ignore-placement': true } }
    ] as Overlay['layers']
  };
}

interface Tag { x: number; y: number; head: string; line: string }

export default function LivePage() {
  const sel = useSelection();
  const dark = useDarkTheme();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const [ready, setReady] = useState(false);
  const [styleRev, setStyleRev] = useState(0);
  const [failed, setFailed] = useState<string | null>(() => (hasWebGL() ? null : 'WebGL is not available in this browser, so the globe cannot be drawn.'));
  const [offline, setOffline] = useState(false);
  const applied = useRef({ dark, offline: false });
  const countries = useRef<unknown>(emptyFc());
  const [look, setLook] = useState<Look>('normal');
  const [panelOpen, setPanelOpen] = useState(false);
  const [tag, setTag] = useState<Tag | null>(null);
  const tagKey = useRef('');
  const [place, setPlace] = useState<Place>(() => { const k = liveKeyFor(sel.aoiId); return k ? placeById(k) : placeById('world'); });

  // ---- hot spots ----
  const [hotOn, setHotOn] = useState(true);
  const [sources, setSources] = useState<Record<WorldKey, WorldSource>>(() => ({ modis: idleSource('modis'), noaa20: idleSource('noaa20'), noaa21: idleSource('noaa21'), snpp: idleSource('snpp') }));
  const [fetchedUtc, setFetchedUtc] = useState<string | null>(null);
  const sourcesRef = useRef(sources);
  const hotRef = useRef(hotOn);
  useEffect(() => {
    let off = false;
    (async () => {
      for (const group of [['modis', 'snpp'], ['noaa20'], ['noaa21']] as WorldKey[][]) {
        const r = await fetchWorld(group);
        if (off) return;
        setSources((prev) => { const n = { ...prev }; for (const s of r.sources) n[s.key] = s; sourcesRef.current = n; return n; });
        if (r.fetched_utc) setFetchedUtc((cur) => (!cur || r.fetched_utc! > cur ? r.fetched_utc : cur));
      }
    })();
    return () => { off = true; };
  }, []);
  const okSources = WORLD_KEYS.map((k) => sources[k]).filter((s) => s.state === 'ok');
  const total = okSources.reduce((n, s) => n + s.count, 0);
  const loadingAny = WORLD_KEYS.some((k) => sources[k].state === 'loading');
  const strong = useMemo(() => (loadingAny ? [] : strongest(okSources)), [loadingAny, sources]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshHot = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('hs-modis')) return;
    const b = map.getBounds();
    const fc = buildHotspots(WORLD_KEYS.map((k) => sourcesRef.current[k]), map.getZoom(), [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    (map.getSource('hs-modis') as GeoJSONSource).setData(hotRef.current ? fc.modis : emptyFc());
    (map.getSource('hs-viirs') as GeoJSONSource).setData(hotRef.current ? fc.viirs : emptyFc());
  }, []);
  useEffect(() => { hotRef.current = hotOn; if (ready) refreshHot(); }, [hotOn, ready, sources, styleRev, refreshHot]);

  // ---- imagery ----
  const [imagery, setImagery] = useState<ImageryMode>('none');
  const gibs = useGibsTimes(imagery !== 'none' && imagery !== 'night');

  // ---- satellites ----
  const [satsOn, setSatsOn] = useState(true);
  const [satFile, setSatFile] = useState<SatsFile | null>(null);
  const [satsState, setSatsState] = useState<'loading' | 'ok' | 'unavailable'>('loading');
  const sats = useMemo<Sat[] | null>(() => (satFile ? makeSats(satFile.tles) : null), [satFile]);
  const satEls = useRef(new Map<string, HTMLElement>());
  const satRef = useCallback((key: string, el: HTMLElement | null) => { if (el) satEls.current.set(key, el); else satEls.current.delete(key); }, []);
  useEffect(() => {
    let off = false;
    fetchSats().then((f) => { if (off) return; setSatFile(f); setSatsState(f ? 'ok' : 'unavailable'); });
    return () => { off = true; };
  }, []);
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setTick((x) => x + 1); }, 60_000); return () => clearInterval(id); }, []);
  const passes = useMemo(() => {
    if (!sats || place.id === 'world') return [];
    const now = new Date();
    return sats.map((s) => {
      const p = nextPass(s, place, now);
      const mins = p ? Math.round((p.startMs - now.getTime()) / 60_000) : 0;
      const text = !p ? `${s.name}: no pass found in the next 24 hours.`
        : p.inViewNow ? `${s.name} is over ${place.label} now (until about ${utcHm(p.endMs)}).`
        : `${s.name} passes over ${place.label} in about ${mins < 90 ? `${mins} min` : `${Math.round(mins / 6) / 10} hours`} (around ${utcHm(p.startMs)}).`;
      return { key: s.key, text };
    });
  }, [sats, place, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- create the globe ----
  useEffect(() => {
    if (failed || !box.current) return;
    let disposed = false, stopHealth: (() => void) | null = null;
    const dark0 = isDarkTheme();
    (async () => {
      try {
        const [{ default: maplibregl }, ne, baseStyle] = await Promise.all([
          import('maplibre-gl'),
          fetch('./basemap/ne_110m_admin_0_countries.geojson').then((r) => r.json()).catch(() => emptyFc()),
          loadBaseStyle(dark0)
        ]);
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (disposed || !box.current) return;
        mlRef.current = maplibregl; countries.current = ne;
        applied.current = { dark: dark0, offline: !baseStyle }; setOffline(!baseStyle);
        const map = new maplibregl.Map({
          container: box.current, attributionControl: false,
          style: composeStyle({ base: baseStyle, dark: dark0, countries: ne, overlay: overlay(), globe: true }),
          center: [place.lon, place.lat], zoom: place.zoom, minZoom: 0.6, maxZoom: 10, dragRotate: false, pitchWithRotate: false, maxPitch: 0
        });
        map.setPadding(viewPad());
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: (baseStyle ? BASEMAP_ATTRIBUTION : 'Natural Earth') + ' · NASA FIRMS · CelesTrak' }));
        const prep = () => {
          const imgs = makeLiveImages();
          if (imgs && !map.hasImage(LIVE_ICON.modis)) { map.addImage(LIVE_ICON.modis, imgs.modis, { pixelRatio: 2 }); map.addImage(LIVE_ICON.viirs, imgs.viirs, { pixelRatio: 2 }); }
          try { map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] }); } catch { /* sky needs a globe-capable build */ }
        };
        map.on('load', () => { prep(); if (!disposed) setReady(true); });
        map.on('style.load', () => { prep(); if (!disposed) setStyleRev((x) => x + 1); });
        if (baseStyle) stopHealth = watchBasemapHealth(map, () => { if (!disposed) setOffline(true); });
        let timer = 0;
        map.on('moveend', () => { clearTimeout(timer); timer = window.setTimeout(() => refreshHot(), 120); });
        map.on('movestart', () => { tagKey.current = ''; setTag(null); });
        map.on('error', (e) => { if (!/tile|404|Failed to fetch/i.test(String(e?.error?.message ?? ''))) console.warn('map error', e?.error?.message); });
        const readout = document.getElementById('lv-cursor');
        map.on('mousemove', (e) => { if (readout) readout.textContent = `${Math.abs(e.lngLat.lat).toFixed(2)}°${e.lngLat.lat >= 0 ? 'N' : 'S'}  ${Math.abs(e.lngLat.lng).toFixed(2)}°${e.lngLat.lng >= 0 ? 'E' : 'W'}`; });
        const showTag = (e: { point: { x: number; y: number }; features?: { properties?: unknown }[] }) => {
          const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
          if (!p) return;
          const n = Number(p.n ?? 1), k = String(p.k ?? '') as WorldKey;
          const frp = p.frp == null || p.frp === '' || p.frp === 'null' ? null : Number(p.frp);
          const key = `${n}|${k}|${p.t}|${Math.round(e.point.x / 6)}|${Math.round(e.point.y / 6)}`;
          if (key === tagKey.current) return; tagKey.current = key;
          const sensor = SENSOR_NAME[k] ?? (k === ('viirs' as string) ? 'VIIRS (NOAA-20 and NOAA-21)' : 'MODIS (Terra or Aqua)');
          setTag(n > 1
            ? { x: e.point.x, y: e.point.y, head: `${fmtNum(n)} hot spots grouped here`, line: `${sensor}${frp != null ? `, strongest ${fmtNum(frp, 1)} MW` : ''}. Zoom in to see each one.` }
            : { x: e.point.x, y: e.point.y, head: `Detected by ${sensor}`, line: `${p.d} ${p.t} UTC, ${p.dn === 1 || p.dn === '1' ? 'daytime' : 'night'}, heat output ${frp == null ? 'not given' : fmtNum(frp, 1) + ' MW'}` });
        };
        for (const id of ['hs-modis', 'hs-viirs']) {
          map.on('mousemove', id, (e) => { map.getCanvas().style.cursor = 'pointer'; showTag(e); });
          map.on('click', id, (e) => showTag(e));
          map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; tagKey.current = ''; setTag(null); });
        }
        mapRef.current = map;
      } catch (err) { if (!disposed) setFailed('The globe could not start: ' + String((err as Error)?.message ?? err)); }
    })();
    return () => { disposed = true; stopHealth?.(); mapRef.current?.remove(); mapRef.current = null; setReady(false); };
  }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme or offline fallback: new style, data and icons come back on style.load.
  useEffect(() => {
    const map = mapRef.current, a = applied.current;
    if (!ready || !map || (a.dark === dark && a.offline === offline)) return;
    let off = false;
    (async () => {
      const base: StyleSpecification | null = offline ? null : await loadBaseStyle(dark);
      if (off || !mapRef.current) return;
      if (!base && !offline) { setOffline(true); return; }
      applied.current = { dark, offline: !base };
      mapRef.current.setStyle(composeStyle({ base, dark, countries: countries.current, overlay: overlay(), globe: true }), { diff: false });
    })();
    return () => { off = true; };
  }, [ready, dark, offline]);

  // Imagery layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer('imagery')) map.removeLayer('imagery');
    if (map.getSource('imagery')) map.removeSource('imagery');
    if (imagery === 'none') return;
    let tiles: string, max: number;
    if (imagery === 'night') { tiles = NIGHT.url; max = NIGHT.max; }
    else if (imagery === 'goes_east' || imagery === 'goes_west') {
      const t = gibs?.geo[imagery]?.time; if (!t) return;
      tiles = gibsUrl(GEO[imagery], t); max = GEO[imagery].max;
    } else { tiles = gibsUrl(DAILY[imagery], dailyDate(gibs, imagery)); max = DAILY[imagery].max; }
    map.addSource('imagery', { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom: max, attribution: GIBS_CREDIT });
    map.addLayer({ id: 'imagery', type: 'raster', source: 'imagery' }, firstLabelLayer(map, 'sat-tracks'));
  }, [ready, imagery, gibs, styleRev]);

  // Satellites on the map: markers moved about once a second without touching React, tracks refreshed every minute.
  useEffect(() => {
    const map = mapRef.current, gl = mlRef.current;
    if (!ready || !map || !gl || !sats) return;
    const vis = satsOn ? 'visible' : 'none';
    if (map.getLayer('sat-tracks')) map.setLayoutProperty('sat-tracks', 'visibility', vis);
    if (!satsOn) return;
    const markers = new Map<string, Marker>();
    for (const s of sats) {
      const el = document.createElement('div'); el.className = 'sat-pin'; el.style.setProperty('--c', SAT_COLORS[s.key] ?? '#fff');
      el.innerHTML = '<i></i><span></span>'; (el.lastChild as HTMLElement).textContent = s.name;
      markers.set(s.key, new gl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([0, 0]).addTo(map));
    }
    const updatePos = () => {
      const now = new Date();
      for (const s of sats) {
        const p = subPoint(s, now), m = markers.get(s.key), t = satEls.current.get(s.key);
        if (!p) { m?.getElement().style.setProperty('display', 'none'); if (t) t.textContent = 'position unavailable'; continue; }
        m?.getElement().style.removeProperty('display'); m?.setLngLat([p.lon, p.lat]);
        if (t) t.textContent = `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(1)}°${p.lon >= 0 ? 'E' : 'W'}, ${Math.round(p.altKm)} km up`;
      }
    };
    const updateTracks = () => {
      const now = new Date();
      const features: GeoJSON.Feature[] = sats.map((s) => ({ type: 'Feature', properties: { key: s.key }, geometry: { type: 'MultiLineString', coordinates: groundTrack(s, now) } }));
      (map.getSource('sat-tracks') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };
    updatePos(); updateTracks();
    const slow = reduced();
    const a = setInterval(() => { if (!document.hidden) updatePos(); }, slow ? 5000 : 1000);
    const b = setInterval(() => { if (!document.hidden) updateTracks(); }, 60_000);
    return () => { clearInterval(a); clearInterval(b); markers.forEach((m) => m.remove()); };
  }, [ready, sats, satsOn, styleRev]);

  // UTC clock.
  useEffect(() => {
    const el = document.getElementById('lv-clock');
    const draw = () => { if (el) el.textContent = new Date().toISOString().slice(11, 19) + ' UTC'; };
    draw(); const id = setInterval(() => { if (!document.hidden) draw(); }, 1000);
    return () => clearInterval(id);
  }, []);

  const jump = (p: Place) => {
    setPlace(p);
    const map = mapRef.current; if (!map) return;
    if (reduced()) map.jumpTo({ center: [p.lon, p.lat], zoom: p.zoom, padding: viewPad() });
    else map.flyTo({ center: [p.lon, p.lat], zoom: p.zoom, padding: viewPad(), duration: 1800, essential: false, easing: easeInOut });
  };
  const showStrong = (s: Strongest) => {
    const map = mapRef.current; if (!map) return;
    const put = () => {
      const pt = map.project([s.lon, s.lat]);
      setTag({ x: pt.x, y: pt.y, head: `Detected by ${SENSOR_NAME[s.key]}`, line: `${s.date} ${s.hhmm} UTC, heat output ${fmtNum(s.frp, 1)} MW` });
    };
    map.once('moveend', () => window.setTimeout(put, 160));
    if (reduced()) map.jumpTo({ center: [s.lon, s.lat], zoom: 7, padding: viewPad() }); else map.flyTo({ center: [s.lon, s.lat], zoom: 7, padding: viewPad(), duration: 1800, easing: easeInOut });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const l = lookForKey(e.key); if (l) setLook(l);
  };

  const hotLine = loadingAny ? (total ? 'so far, still loading' : 'loading') : okSources.length ? 'in the last 24 hours' : 'feed unavailable';
  return (
    <Page route="live" className="live-page">
      <PageHead title="Live" lead="See where satellites saw fire-like heat in the last 24 hours, the latest satellite pictures of Earth, and where the satellites are right now." />
      <section className="lv-stage" data-look={look} aria-label="Globe with live satellite data" onKeyDown={onKey}>
        <SensorFilters />
        <div className="lv-toolbar">
          <div className="seg seg--sm" role="group" aria-label="Quick jumps">
            {PLACES.map((p) => <button key={p.id} type="button" className={place.id === p.id ? 'is-on' : ''} aria-pressed={place.id === p.id} onClick={() => jump(p)}>{p.label}</button>)}
          </div>
          {!failed && <SensorControl look={look} onLook={setLook} />}
          {!failed && <SensorCaption look={look} />}
        </div>
        <div className="lv-map">
          <div ref={box} className="lv-canvas" hidden={!!failed} />
          {failed && <div className="lv-fallback"><p className="notice" role="status">{failed}</p><p className="muted">The layer details are still listed in the panel.</p></div>}
          {!failed && (
            <div className="lv-hud" aria-hidden="false">
              <i className="lv-br lv-br--tl" /><i className="lv-br lv-br--tr" /><i className="lv-br lv-br--bl" /><i className="lv-br lv-br--br" />
              <div className="lv-hud__tl"><b>PARALLAX FIRE · LIVE</b><span id="lv-clock">--:--:-- UTC</span></div>
              <div className="lv-hud__count">
                <span className="lv-hud__num" data-live-count>{total ? fmtNum(total) : loadingAny ? '...' : 'none'}</span>
                <span className="lv-hud__lab">hot spots {hotLine}</span>
              </div>
              <div className="lv-hud__bl"><span id="lv-cursor">Move over the map</span></div>
              <div className="lv-hud__badges" role="status">
                <span className="lv-badge" data-state={!hotOn ? 'off' : loadingAny ? 'loading' : okSources.length ? 'ok' : 'unavailable'}>Hot spots</span>
                <span className="lv-badge" data-state={!satsOn ? 'off' : satsState}>Satellites</span>
                <span className="lv-badge" data-state={imagery === 'none' ? 'off' : 'ok'}>Picture</span>
              </div>
              {offline && <p className="lv-hud__offline" role="status">{OFFLINE_NOTE}</p>}
            </div>
          )}
          {tag && !failed && (
            <div className="live__tag lv-tag" style={{ left: tag.x, top: tag.y }} role="status">
              <i className="live__tag-c live__tag-c--tl" /><i className="live__tag-c live__tag-c--tr" /><i className="live__tag-c live__tag-c--bl" /><i className="live__tag-c live__tag-c--br" />
              <b>{tag.head}</b><br />{tag.line}
            </div>
          )}
          <LayerPanel
            open={panelOpen} onOpen={setPanelOpen} hotOn={hotOn} onHot={setHotOn} sources={sources} fetchedUtc={fetchedUtc} strong={strong} onStrong={showStrong}
            imagery={imagery} onImagery={setImagery} gibs={gibs} satsOn={satsOn} onSats={setSatsOn} sats={sats} satsState={satsState} satsFetched={satFile?.fetched_utc ?? null}
            satRef={satRef} passes={passes} placeLabel={place.id === 'world' ? 'a place' : place.label}
          />
        </div>
      </section>
      <p className="page__note small muted">Hot spots come from NASA FIRMS (near-real-time, may be revised). We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Observing System Data and Information System (EOSDIS). Orbit records: CelesTrak. Satellite pictures: NASA GIBS. Map: OpenFreeMap, OpenMapTiles, OpenStreetMap. The looks 1 to 4 only change how the map is drawn.</p>
      <NextSteps to={['map', 'calendar', 'method']} />
    </Page>
  );
}
