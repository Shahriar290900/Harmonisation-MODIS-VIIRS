// Live page, Earth view: a real-time three.js Earth with the five fire satellites, today's hot spots and a small HUD.
// The scene (earth/scene.ts) is imperative and lazy-loaded; this component owns data loading, the HUD and the controls.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Flame, Moon, Orbit, Tag } from 'lucide-react';
import { fetchSats, fetchWorld, type SatsFile, type WorldKey, type WorldSource, WORLD_KEYS, WORLD_LABEL } from '../data/live';
import { fmtNum } from '../data/format';
import { PLACES, type Place } from '../live/places';
import { makeSats, nextPass } from '../live/orbits';
import { utcHm } from '../live/LayerPanel';
import { Tip } from '../ui/Tip';
import { loadCountries } from './geo';
import type { EarthDebug, EarthScene, Layers, SatInfo } from './scene';
import '../styles/earth.css';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
const hasWebGL = (): boolean => {
  try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); (g as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext(); return !!g; } catch { return false; }
};
const idle = (key: WorldKey): WorldSource => ({ key, label: WORLD_LABEL[key], state: 'loading', count: 0, newest_utc: null, oldest_utc: null, raw: null });
const dist = (p: Place) => (p.id === "world" ? 3.7 : 2.4);
const dm = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
const GROUP_NAME = { modis: 'MODIS', viirs: 'VIIRS' } as const;
const COUNT_ROWS: { key: WorldKey; name: string }[] = [{ key: 'modis', name: 'Terra + Aqua' }, { key: 'noaa20', name: 'NOAA-20' }, { key: 'noaa21', name: 'NOAA-21' }, { key: 'snpp', name: 'Suomi NPP' }];

const NO_DEBUG: EarthDebug = { ready: false, textures: { day: false, night: false, bump: false, water: false }, frames: 0, hotspots: 0, sats: [], sun: { lat: 0, lon: 0 }, following: null, distance: 0 };

export default function EarthView({ active, place, onPlace, onUnavailable }: { active: boolean; place: Place; onPlace: (p: Place) => void; onUnavailable: (why: string) => void }) {
  const canvasBox = useRef<HTMLDivElement>(null);
  const labelBox = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EarthScene | null>(null);
  const [scene, setScene] = useState<EarthScene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ hot: true, orbits: true, night: true, labels: true });
  const [satFile, setSatFile] = useState<SatsFile | null>(null);
  const [satState, setSatState] = useState<'loading' | 'ok' | 'unavailable'>('loading');
  const [sources, setSources] = useState<Record<WorldKey, WorldSource>>(() => ({ modis: idle('modis'), noaa20: idle('noaa20'), noaa21: idle('noaa21'), snpp: idle('snpp') }));
  const [fetched, setFetched] = useState<string | null>(null);
  const [infos, setInfos] = useState<SatInfo[]>([]);
  const [sun, setSun] = useState<{ lat: number; lon: number } | null>(null);
  const [follow, setFollow] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(0);
  const [tick, setTick] = useState(0);
  const [summary, setSummary] = useState('');
  const infosRef = useRef<SatInfo[]>([]);

  // ---- scene ----
  useEffect(() => {
    window.__earth = { debug: () => sceneRef.current?.debug() ?? NO_DEBUG };
    if (!hasWebGL()) { const w = 'WebGL is not available in this browser, so the 3D Earth cannot be drawn.'; setFailed(w); onUnavailable(w); return; }
    let off = false, sc: EarthScene | null = null;
    (async () => {
      try {
        const { EarthScene } = await import('./scene');
        if (off || !canvasBox.current || !labelBox.current) return;
        sc = new EarthScene({
          container: canvasBox.current, labelLayer: labelBox.current, phone: isPhone(), reduced: reduced(),
          startView: { lat: place.lat, lon: place.lon, dist: place.id === 'world' ? 3.7 : 3.1 },
          onTick: (s, sn) => { infosRef.current = s; setInfos(s); setSun(sn); },
          onFollow: setFollow,
          onFail: (w) => { setFailed(w); onUnavailable(w); }
        });
        sceneRef.current = sc; setScene(sc);
      } catch (e) { if (!off) { const w = 'The 3D Earth could not start: ' + String((e as Error)?.message ?? e); setFailed(w); onUnavailable(w); } }
    })();
    return () => { off = true; sc?.dispose(); sceneRef.current = null; setScene(null); delete window.__earth; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene?.setActive(active); }, [scene, active]);
  useEffect(() => { scene?.setLayers(layers); }, [scene, layers]);

  // ---- data ----
  useEffect(() => { loadCountries(); }, []);
  useEffect(() => {
    let off = false;
    fetchSats().then((f) => { if (off) return; setSatFile(f); setSatState(f ? 'ok' : 'unavailable'); });
    return () => { off = true; };
  }, []);
  useEffect(() => { if (scene && satFile) scene.setSats(satFile.tles); }, [scene, satFile]);
  useEffect(() => {
    let off = false;
    (async () => {
      for (const group of [['modis', 'snpp'], ['noaa20'], ['noaa21']] as WorldKey[][]) {
        const r = await fetchWorld(group);
        if (off) return;
        setSources((prev) => { const n = { ...prev }; for (const s of r.sources) n[s.key] = s; return n; });
        if (r.fetched_utc) setFetched((c) => (!c || r.fetched_utc! > c ? r.fetched_utc : c));
      }
    })();
    return () => { off = true; };
  }, []);
  useEffect(() => { if (scene) setDrawn(scene.setHotspots(WORLD_KEYS.map((k) => sources[k]))); }, [scene, sources]);
  const total = WORLD_KEYS.reduce((n, k) => n + (sources[k].state === 'ok' ? sources[k].count : 0), 0);
  const loadingAny = WORLD_KEYS.some((k) => sources[k].state === 'loading');
  const anyAnswer = WORLD_KEYS.some((k) => sources[k].state === 'ok' || sources[k].state === 'empty');

  // clock + slow ticks (next passes every 30 s, screen-reader summary every 30 s)
  useEffect(() => {
    const el = document.getElementById('ev-clock');
    const draw = () => { if (el) el.textContent = new Date().toISOString().slice(11, 19) + ' UTC'; };
    draw(); const a = setInterval(() => { if (!document.hidden) draw(); }, 1000);
    const b = setInterval(() => { if (!document.hidden) { setTick((x) => x + 1); setSummary(infosRef.current.map((s) => `${s.name} is ${s.over ? 'over ' + s.over : 'at ' + dm(s.lat, 'N', 'S') + ' ' + dm(s.lon, 'E', 'W')}, ${Math.round(s.altKm)} kilometres up`).join('. ')); } }, 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const passes = useMemo(() => {
    const out = new Map<string, string>();
    if (!satFile || place.id === 'world') return out;
    const now = new Date();
    for (const s of makeSats(satFile.tles)) {
      const p = nextPass(s, place, now);
      const mins = p ? Math.round((p.startMs - now.getTime()) / 60_000) : 0;
      out.set(s.key, !p ? 'No pass in 24 h' : p.inViewNow ? `Over ${place.label} now` : `Next pass ${mins < 90 ? `${mins} min` : `${Math.round(mins / 6) / 10} h`} · ${utcHm(p.startMs).replace(' UTC', '')}`);
    }
    return out;
  }, [satFile, place, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = useCallback((p: Place) => { onPlace(p); scene?.flyTo(p.lat, p.lon, dist(p)); }, [scene, onPlace]);
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const stale = fetched ? Math.round((Date.now() - Date.parse(fetched)) / 60_000) : null;

  const layerBtns: { k: keyof Layers; label: string; icon: JSX.Element; tip: string }[] = [
    { k: 'hot', label: 'Hot spots', icon: <Flame size={14} aria-hidden />, tip: 'Places where NASA satellites saw fire-like heat in the last 24 hours. A hot spot is not a confirmed wildfire.' },
    { k: 'orbits', label: 'Orbits', icon: <Orbit size={14} aria-hidden />, tip: 'Where each satellite has just been and will be over the next 100 minutes, drawn over the turning Earth.' },
    { k: 'night', label: 'Night lights', icon: <Moon size={14} aria-hidden />, tip: 'City lights on the night side of Earth.' },
    { k: 'labels', label: 'Labels', icon: <Tag size={14} aria-hidden />, tip: 'Satellite names next to their markers.' }
  ];
  const satCards = infos.length ? infos : [];

  return (
    <section className="ev" data-earth aria-label="3D Earth with live satellites and hot spots">
      <div className="ev-bar">
        <div className="seg seg--sm" role="group" aria-label="Quick jumps">
          {PLACES.map((p) => <button key={p.id} type="button" className={place.id === p.id ? 'is-on' : ''} aria-pressed={place.id === p.id} onClick={() => jump(p)}>{p.id === 'world' ? 'Whole Earth' : p.label}</button>)}
        </div>
        <div className="ev-layers" role="group" aria-label="Layers">
          {layerBtns.map((b) => (
            <Tip key={b.k} text={b.tip}><button type="button" className="ev-chip" aria-label={b.label} aria-pressed={layers[b.k]} onClick={() => toggle(b.k)}>{b.icon}<span>{b.label}</span></button></Tip>
          ))}
        </div>
      </div>
      <div className="ev-stage">
        <div ref={canvasBox} className="ev-canvas" role="img" aria-label="Earth seen from space with the five fire satellites and today's hot spots" hidden={!!failed} />
        <div ref={labelBox} className="ev-labels" aria-hidden="true" />
        {failed && <div className="ev-fail" role="status">{failed}</div>}
        {!failed && (
          <div className="ev-hud">
            <i className="ev-br ev-br--tl" /><i className="ev-br ev-br--tr" /><i className="ev-br ev-br--bl" /><i className="ev-br ev-br--br" />
            <div className="ev-tl"><b>PARALLAX FIRE · LIVE</b><span id="ev-clock">--:--:-- UTC</span>{sun && <small>Sun overhead {dm(sun.lat, 'N', 'S')} {dm(sun.lon, 'E', 'W')}</small>}</div>
            <div className="ev-count" data-live-count>
              <b className="ev-h">Hot spots, last 24 h</b>
              {COUNT_ROWS.map((r) => {
                const s = sources[r.key];
                const text = s.state === 'ok' ? fmtNum(s.count) : s.state === 'loading' ? '...' : s.state === 'empty' ? 'none reported' : 'no data';
                return <span key={r.key} className="ev-count__row" data-state={s.state}><span>{r.name}</span><em>{text}</em></span>;
              })}
              {!loadingAny && !anyAnswer && <span className="ev-warn">Feed unavailable right now</span>}
            </div>
            <div className="ev-cards" role="group" aria-label="Satellites">
              {satState === 'unavailable' && <div className="ev-warn">Orbit records unavailable</div>}
              {satState === 'loading' && <div className="ev-card ev-card--ghost">Finding satellites...</div>}
              {satCards.map((s) => (
                <button key={s.key} type="button" className="ev-card" data-group={s.group} aria-pressed={follow === s.key}
                  onClick={() => (follow === s.key ? scene?.setFollow(null) : scene?.followSat(s.key))}
                  title={`${s.name}: ${dm(s.lat, 'N', 'S')} ${dm(s.lon, 'E', 'W')}. ${follow === s.key ? 'Following. Press to stop.' : 'Press to follow it with the camera.'}`}>
                  <span className="ev-card__h"><i />{s.name}<small>{GROUP_NAME[s.group]}</small>{follow === s.key && <Crosshair size={12} aria-label="following" />}</span>
                  <span className="ev-card__v">{Math.round(s.altKm)} km up · {Number.isFinite(s.speedKms) ? s.speedKms.toFixed(1) : '—'} km/s</span>
                  <span className="ev-card__o">{s.over ?? '…'} · {dm(s.lat, 'N', 'S')} {dm(s.lon, 'E', 'W')}</span>
                  {place.id !== 'world' && passes.get(s.key) && <span className="ev-card__p" title={`${place.label}: ${passes.get(s.key)} (UTC)`}>{passes.get(s.key)}</span>}
                </button>
              ))}
            </div>
            <div className="ev-legend">
              <span className="ev-key" data-group="modis"><i />Terra, Aqua (MODIS)</span>
              <span className="ev-key" data-group="viirs"><i />NOAA-20, NOAA-21, Suomi NPP (VIIRS)</span>
              <Tip text="A hot spot is a place where a satellite saw fire-like heat. It is not a confirmed wildfire. The same fire can be seen by several satellites, so the counts are never added up."><span className="ev-key ev-key--note" tabIndex={0}>Not confirmed fires</span></Tip>
            </div>
            <div className="ev-feed">
              <span>{loadingAny ? 'Waiting for hot spots...' : anyAnswer ? `Hot spots updated ${fetched ? fetched.slice(11, 16) + ' UTC' : ''}${stale != null && stale > 90 ? ' (old)' : ''}` : 'Hot spots: feed unavailable'}</span>
              {!loadingAny && drawn > 0 && drawn < total && <span>{fmtNum(drawn)} of {fmtNum(total)} drawn</span>}
              <span>Orbits: CelesTrak</span>
            </div>
          </div>
        )}
      </div>
      <div className="live__sr" role="status" aria-live="polite">{summary}</div>
    </section>
  );
}

declare global { interface Window { __earth?: { debug(): EarthDebug } } }
