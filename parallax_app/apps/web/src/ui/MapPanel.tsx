import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, RotateCw } from 'lucide-react';
import { Icon3D } from './icons/Icon3D';
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { CellsFile, Region, Selection } from '../types';
import { SERIES_COLORS } from '../types';
import { fmtCompact, fmtNum, monthLabel } from '../data/format';
import { noCellsHint } from '../data/regions';
import { RAMP_CSS, valueColor } from './scale';
import type { CellState } from './glyphs';

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

interface CellPt { id: string; lon: number; lat: number; aqua: number | null; viirs: number | null; est: number | null; v: number | null }

export function MapPanel({ region, regions, geo, cells, selection, visible = true, monthState }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(() => (hasWebGL() ? null : 'WebGL is not available in this browser.'));
  const [series, setSeries] = useState<MapSeries>('auto');
  const [showTable, setShowTable] = useState(false);

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

  // Create map once.
  useEffect(() => {
    if (failed || !box.current) return;
    let disposed = false;
    (async () => {
      try {
        const [{ default: maplibregl }, base] = await Promise.all([
          import('maplibre-gl'),
          fetch('./basemap/ne_110m_admin_0_countries.geojson').then((r) => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] }))
        ]);
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (disposed || !box.current) return;
        const map = new maplibregl.Map({
          container: box.current,
          attributionControl: false,
          style: {
            version: 8,
            sources: {
              countries: { type: 'geojson', data: base },
              aoi: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
              cells: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
            },
            layers: [
              { id: 'bg', type: 'background', paint: { 'background-color': '#081022' } },
              { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#16233F' } },
              { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#2E4068', 'line-width': 0.8 } },
              { id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#E6EDF7', 'fill-opacity': 0.05 } },
              { id: 'aoi-glow', type: 'line', source: 'aoi', paint: { 'line-color': '#E6EDF7', 'line-width': 6, 'line-opacity': 0.08, 'line-blur': 4 } },
              { id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#E6EDF7', 'line-width': 1.4, 'line-opacity': 0.85 } },
              {
                id: 'cells', type: 'circle', source: 'cells',
                paint: {
                  'circle-color': ['get', 'c'],
                  // ≈ true 5 km footprint from z8 up; enlarged (min ~2.5 px) at low zoom so cells stay visible
                  'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 3, 1.8, 5, 2.6, 6, 3.4, 8, 6.5, 10, 22, 12, 88],
                  'circle-opacity': 0.92,
                  'circle-stroke-color': '#0B1220', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 0, 9, 0.6]
                }
              }
            ]
          },
          center: [90.3, 23.7], zoom: 5, maxZoom: 12, minZoom: 1,
          dragRotate: false, pitchWithRotate: false, cooperativeGestures: false
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Natural Earth · NASA FIRMS' }));
        map.on('load', () => { if (!disposed) setReady(true); });
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
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [failed]);

  // AOI outline + fit.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !region) return;
    (map.getSource('aoi') as GeoJSONSource | undefined)?.setData((geo as GeoJSON.FeatureCollection) ?? { type: 'FeatureCollection', features: [] });
    const [w, s, e, n] = region.bbox;
    map.fitBounds([[w, s], [e, n]], { padding: 36, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
  }, [ready, region, geo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('cells') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { ...p, c: valueColor(p.v, max) } }))
    });
  }, [ready, pts, max]);

  useEffect(() => { if (visible) mapRef.current?.resize(); }, [visible]);

  const tableMode = !!failed || showTable;
  const seriesName = SERIES_OPTS.find((o) => o.k === seriesUsed)?.label ?? '';

  return (
    <section className="panel map" aria-label="Map of 5 km cells">
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
          {!failed && <button className="btn btn--ghost btn--sm" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>{showTable ? 'Map' : 'Table'}</button>}
        </div>
      </div>
      <div className="map__stage">
        <div ref={box} className="map__canvas" hidden={tableMode} aria-hidden={tableMode} />
        {!tableMode && (
          <div className="map__overlay">
            <div className="map__legend">
              <div className="map__legend-title">{seriesName} detections / 5 km cell</div>
              <div className="legend__ramp"><span className="legend__lab">1</span><span className="legend__bar" style={{ background: RAMP_CSS }} /><span className="legend__lab">{fmtCompact(max)}</span></div>
              <div className="map__legend-sub">{subIcon(cells, monthState)}{legendSub(cells, pts.length, monthState)}</div>
              {cells.error && cells.retry && <button className="btn btn--sm map__retry" onClick={cells.retry}><Icon3D icon={RotateCw} tone="current" size={14} />Retry</button>}
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
