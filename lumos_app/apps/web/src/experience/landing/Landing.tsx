// Lumos landing experience (lazy chunk). Sections: hero globe + zoom story, two cameras, the 2012 jump,
// reading the calendar, honesty, region gallery, dense index, footer.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '../../styles/landing.css';
import type { GlobeHandle, HotPoint } from '../contract';
import { Logo } from '../../ui/Logo';
import { ArrowRight, FlaskConical, Layers, TriangleAlert, X } from 'lucide-react';
import { Icon3D } from '../../ui/icons/Icon3D';
import { STAGE_LABEL, StageTagLx } from './StageTag';
import { MONTHS_LONG } from '../../data/format';
import { api, BASE_URL, offline, unavailableText, useCore, useSeriesStatus, workspaceHash, type AoiSeries, type Core } from './data';
import { fallbackQuality, loadThree, webglOk, type ThreeModule } from './threeLoader';
import { mountFallbackGlobe } from './fallbacks';
import { band, Cursor, gsap, ScrollTrigger, scrollToId, scrollTriggerOff, scrollTriggerOn, SplitText, useFlags, useMagnetic, type Flags } from './motion';
import { consumeLandingScroll, onWorkspaceLink } from './transition';
import { CalendarStory, Honesty, JumpChart, TwoCameras } from './Story';
import { Gallery } from './Gallery';
import { IndexList } from './IndexList';
import { debugHook } from './debug';
import { usePwa } from '../../ui/PwaStatus';

export { STAGE_LABEL };

export interface Ctx { core: Core | null; three: ThreeModule | null | undefined; flags: Flags; quality: 'high' | 'low'; gl: boolean; /** Bangladesh series failed to load (offline + not cached). */ bgdFailed: boolean }

export default function Landing() {
  // REVIEW M2: ScrollTrigger must be enabled before any child creates its triggers (children's layout effects run
  // before this component's effects), so turn it on during the first render; it is turned off again on unmount.
  useState(() => { scrollTriggerOn(); return 0; });
  const { core, error } = useCore();
  const flags = useFlags();
  const gl = useMemo(() => webglOk(), []);
  const [three, setThree] = useState<ThreeModule | null | undefined>(undefined);
  useEffect(() => {
    if (!gl) { setThree(null); return; }
    let live = true;
    loadThree().then((m) => live && setThree(m));
    return () => { live = false; };
  }, [gl]);
  const quality = useMemo<'high' | 'low'>(() => {
    try { return three?.detectQuality ? three.detectQuality() : fallbackQuality(); } catch { return 'low'; }
  }, [three]);
  const { map: series, failed } = useSeriesStatus(core, ['BGD', 'AUS-NSW']);
  const bgd = series.get('BGD') ?? null;
  const ctx: Ctx = { core, three, flags, quality, gl, bgdFailed: !bgd && failed.has('BGD') };
  const nsw = series.get('AUS-NSW') ?? null;

  // Landing always starts at the top unless the browser restores a position; refresh triggers once data shapes settle.
  useEffect(() => { const t = setTimeout(() => ScrollTrigger.refresh(), 120); return () => clearTimeout(t); }, [core, bgd]);
  // Late layout shifts: web fonts (if any) and the window 'load' event can move section edges; refresh once each.
  useEffect(() => {
    let live = true;
    const once = () => { if (live) ScrollTrigger.refresh(); };
    document.fonts?.ready.then(once, () => undefined);
    if (document.readyState !== 'complete') window.addEventListener('load', once, { once: true });
    const d = debugHook();
    d.mounts++;
    scrollTriggerOn();
    return () => { live = false; window.removeEventListener('load', once); d.unmounts++; scrollTriggerOff(); };
  }, []);

  // REVIEW M1: Back from the workspace restores where the reader was (the transition saved scrollY in history.state).
  // The page is short until the series/gallery shapes load, so wait (bounded) for it to be tall enough, refresh the
  // triggers, then jump there.
  const restoreTo = useRef<number | null>(null);
  if (restoreTo.current === null) restoreTo.current = consumeLandingScroll();
  useEffect(() => {
    const target = restoreTo.current ?? 0;
    if (!(target > 0)) return;
    let prev: ScrollRestoration | undefined;
    try { prev = history.scrollRestoration; history.scrollRestoration = 'manual'; } catch { /* ignore */ }
    let live = true, timer: ReturnType<typeof setTimeout> | null = null;
    const t0 = performance.now();
    const attempt = () => {
      if (!live) return;
      const se = document.scrollingElement ?? document.documentElement;
      const tallEnough = se.scrollHeight - window.innerHeight >= target;
      if (tallEnough || performance.now() - t0 > 4000) {
        ScrollTrigger.refresh();
        window.scrollTo(0, Math.min(target, se.scrollHeight - window.innerHeight));
        ScrollTrigger.update();
        restoreTo.current = 0;
        debugHook().restoredScroll = Math.round(window.scrollY);
        return;
      }
      timer = setTimeout(attempt, 80);
    };
    timer = setTimeout(attempt, 60);
    return () => { live = false; if (timer) clearTimeout(timer); try { if (prev) history.scrollRestoration = prev; } catch { /* ignore */ } };
  }, []);

  const openHash = bgd ? workspaceHash('BGD', bgd.bestYear, bgd.openMonth) : '#aoi=BGD';

  return (
    <div className={'lx' + (flags.reduced ? ' lx--reduced' : '') + (flags.mobile ? ' lx--mobile' : '')}>
      <a className="lx-skip" href="#lx-main" onClick={(e) => {
        // In-page skip (REVIEW L6): focus the main region without adding a history entry.
        const el = document.getElementById('lx-main'); if (!el) return;
        e.preventDefault(); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'start' });
      }}>Skip to main content</a>
      <Nav core={core} flags={flags} openHash={openHash} />
      <main id="lx-main" tabIndex={-1}>
        <GlobeStage ctx={ctx} bgd={bgd} nsw={nsw} openHash={openHash} error={error} />
        <TwoCameras ctx={ctx} />
        <JumpChart ctx={ctx} bgd={bgd} />
        <CalendarStory ctx={ctx} bgd={bgd} />
        <Honesty ctx={ctx} />
        <Gallery ctx={ctx} />
        <IndexList ctx={ctx} />
      </main>
      <Footer core={core} openHash={openHash} />
      {flags.fine && !flags.reduced && !flags.mobile && <Cursor />}
      <UpdateToast />
    </div>
  );
}

/** Tiny, non-blocking SW update notice for the landing (the workspace keeps its own prompt toast). */
function UpdateToast() {
  const pwa = usePwa();
  if (!pwa.needRefresh) return null;
  return (
    <div className="lx-update" role="status">
      <span>New version ready.</span>
      <button className="lx-update__btn" onClick={pwa.update}>Reload</button>
      <button className="lx-update__x" onClick={pwa.dismiss} aria-label="Dismiss update notice"><Icon3D icon={X} tone="neutral" size={16} /></button>
    </div>
  );
}

function Nav({ core, flags, openHash }: { core: Core | null; flags: Flags; openHash: string }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const links: [string, string][] = [['how', 'How it works'], ['regions', 'Regions'], ['index', 'Index']];
  return (
    <header className={'lx-nav' + (solid ? ' is-solid' : '')}>
      <a className="lx-brand" href="#/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: flags.reduced ? 'auto' : 'smooth' }); }} aria-label="Lumos Fire Calendar — top">
        <Logo size={28} /><span>Lumos <b>Fire Calendar</b></span>
      </a>
      {core?.manifest.synthetic && <span className="lx-demo" title="Synthetic fixture in the real bundle format — not real fire observations"><Icon3D icon={FlaskConical} tone="red" size={14} />DEMO DATA</span>}
      <nav aria-label="Sections" className="lx-nav__links">
        {links.map(([id, label]) => <button key={id} className="lx-link" onClick={() => scrollToId(id, flags.reduced)}>{label}</button>)}
      </nav>
      <a className="lx-btn lx-btn--sm" href={openHash} onClick={(e) => onWorkspaceLink(e, openHash, 'Opening the fire calendar')}>Open app <span className="lx-btn__arrow"><Icon3D icon={ArrowRight} tone="current" size={16} /></span></a>
    </header>
  );
}

const FOCUS_BGD = { lon: 90.35, lat: 23.7 };

async function hotPoints(three: ThreeModule | null | undefined, core: Core, aoi: string, year: number, month: number): Promise<HotPoint[]> {
  if (three?.loadHotPoints) {
    try { return await three.loadHotPoints(BASE_URL, core.snapshotId, [aoi], year, month); } catch { /* fall back */ }
  }
  try {
    const f = await api.loadCells(core.snapshotId, aoi, year);
    if (!f) return [];
    const ix = (n: string, d: number) => { const i = f.columns.indexOf(n); return i < 0 ? d : i; };
    const [iLon, iLat, iM, iA, iV, iE] = [ix('lon', 1), ix('lat', 2), ix('month', 3), ix('aqua', 4), ix('viirs', 5), ix('est', 6)];
    const out: HotPoint[] = [];
    for (const r of f.rows) {
      if (Number(r[iM]) !== month) continue;
      const lon = Number(r[iLon]), lat = Number(r[iLat]);
      const add = (v: unknown, series: HotPoint['series']) => { if (typeof v === 'number' && v > 0) out.push({ lon, lat, value: v, series, aoiId: aoi, year, month }); };
      add(r[iA], 'aqua'); add(r[iV], 'viirs'); add(r[iE], 'est');
    }
    return out;
  } catch { return []; }
}

function GlobeStage({ ctx, bgd, nsw, openHash, error }: { ctx: Ctx; bgd: AoiSeries | null; nsw: AoiSeries | null; openHash: string; error: string | null }) {
  const { core, three, flags, quality, gl } = ctx;
  const stageRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeHandle | null>(null);
  const lastPoints = useRef<HotPoint[] | null>(null);
  const [mode, setMode] = useState<'pending' | 'webgl' | 'fallback'>('pending');
  const primary = useMagnetic<HTMLAnchorElement>(flags.fine && !flags.reduced);
  const secondary = useMagnetic<HTMLButtonElement>(flags.fine && !flags.reduced, 0.22);

  // Mount the globe (three when available, else the 2-D canvas stand-in).
  useEffect(() => {
    if (three === undefined && gl) return; // still loading the three chunk
    const host = hostRef.current!;
    let h: GlobeHandle | null = null;
    if (three && gl) {
      try { h = three.mountGlobe(host, { reducedMotion: flags.reduced, quality }); } catch { h = null; }
    }
    const isGl = !!h;
    if (!h) h = mountFallbackGlobe(host, { reducedMotion: flags.reduced, layout: () => globeLayout(host) });
    globe.current = h;
    // REVIEW L1: a remount (reduced-motion / quality change) keeps the hotspots already loaded.
    if (lastPoints.current) h.setPoints(lastPoints.current);
    setMode(isGl ? 'webgl' : 'fallback');
    debugHook().globe = isGl ? 'webgl' : 'fallback';
    if (isGl) void h.focus(FOCUS_BGD.lon, FOCUS_BGD.lat, 0)?.catch?.(() => undefined);
    // The three globe observes its own host; only the 2-D fallback needs a ResizeObserver here (avoids double resize).
    let ro: ResizeObserver | null = null;
    if (!isGl) { ro = new ResizeObserver(() => h?.resize()); ro.observe(host); }
    return () => { ro?.disconnect(); h?.dispose(); if (globe.current === h) globe.current = null; };
  }, [three, gl, flags.reduced, quality]);

  // Hotspots: peak month of the latest good year for Bangladesh and New South Wales.
  const [pointsInfo, setPointsInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!core || !bgd || mode === 'pending') return;
    let live = true;
    // REVIEW M4: each area's own peak month in the year shown (not the all-year mean month).
    const jobs: Promise<HotPoint[]>[] = [hotPoints(three, core, 'BGD', bgd.bestYear, bgd.openMonth)];
    if (nsw) jobs.push(hotPoints(three, core, 'AUS-NSW', nsw.bestYear, nsw.openMonth));
    Promise.all(jobs).then((sets) => {
      if (!live) return;
      const pts = sets.flat();
      lastPoints.current = pts;
      globe.current?.setPoints(pts);
      if (!pts.length) { setPointsInfo(offline() ? 'Hotspot cells unavailable offline.' : 'No hotspot cells in this month.'); return; }
      const parts = [`Bangladesh, ${MONTHS_LONG[bgd.openMonth - 1]} ${bgd.bestYear}`];
      if (nsw) parts.push(`New South Wales, ${MONTHS_LONG[nsw.openMonth - 1]} ${nsw.bestYear}`);
      setPointsInfo(`${pts.filter((p) => p.series === 'viirs').length.toLocaleString('en-US')} hotspot cells · ${parts.join(' · ')}`);
    });
    return () => { live = false; };
  }, [core, bgd, nsw, three, mode]);

  // Intro + scroll choreography.
  useLayoutEffect(() => {
    const stage = stageRef.current!;
    if (flags.reduced) { globe.current?.setProgress(0); return; }
    const c = gsap.context(() => {
      gsap.from('.lx-hero .lx-c', { yPercent: 115, rotate: 8, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.022, delay: 0.1 });
      gsap.from('.lx-hero [data-intro]', { y: 24, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.45 });
      gsap.from('.lx-fire__ul', { scaleX: 0, transformOrigin: '0 50%', duration: 1.2, ease: 'expo.inOut', delay: 0.9 });
      const caps = gsap.utils.toArray<HTMLElement>('.lx-zoomcap');
      const wide = window.innerWidth >= 1100;
      const narrow = window.innerWidth < 700;
      if (wide) gsap.set('.lx-globe', { xPercent: 17 });
      if (narrow) gsap.set('.lx-globe', { yPercent: 26 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: stage, start: 'top top', end: 'bottom bottom', scrub: flags.mobile ? 0.4 : 0.8,
          onUpdate: (self) => {
            const p = self.progress;
            globe.current?.setProgress(band(p, 0.12, 0.62));
            globe.current?.setSeries(p > 0.66 ? 'viirs' : 'all');
          }
        }
      });
      tl.to('.lx-hero__copy', { opacity: 0, y: -80, duration: 0.18 }, 0.02)
        .to('.lx-hero__aside, .lx-scrollcue', { opacity: 0, duration: 0.1 }, 0.02)
        .to('.lx-stage__shade', { opacity: 0.25, duration: 0.3 }, 0.05);
      if (wide) tl.to('.lx-globe', { xPercent: 0, duration: 0.3, ease: 'power1.inOut' }, 0.04);
      if (narrow) tl.to('.lx-globe', { yPercent: 0, duration: 0.3, ease: 'power1.inOut' }, 0.04);
      caps.forEach((el, i) => {
        const at = 0.28 + i * 0.22;
        tl.fromTo(el, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.07 }, at);
        if (i < caps.length - 1) tl.to(el, { opacity: 0, y: -40, duration: 0.07 }, at + 0.16);
      });
      tl.to({}, { duration: 0.05 }, 0.95);
    }, stage);
    return () => c.revert();
  }, [flags.reduced, flags.mobile]);

  const synthetic = core?.manifest.synthetic;
  const peak = bgd ? MONTHS_LONG[bgd.peakMonth - 1] : 'March';
  // REVIEW L5: the averaging span is the years that actually entered the mean.
  const [first, last] = bgd?.peakSpan ?? [core?.manifest.years[0] ?? 2001, core?.manifest.years.at(-1) ?? 2025];

  const captions = [
    { k: '01 · Zoom', h: 'This is Bangladesh.', p: `Every glowing dot is a 5 km cell with at least one satellite hotspot in ${bgd ? `${MONTHS_LONG[bgd.openMonth - 1]} ${bgd.bestYear}, that year’s peak burning month` : 'its peak burning month'}. Cells, not fires: a hotspot is a hot pixel.` },
    { k: '02 · Season', h: `${peak} burns most.`, p: `Averaged over ${first}–${last}, ${peak} carries the most hotspots of any month in this snapshot. That is the season the calendar makes visible.` },
    { k: '03 · The catch', h: 'But which satellite was looking?', p: 'Two different cameras built this record. Before we compare 2005 with 2020, we have to put them on one scale.' }
  ];

  return (
    <section ref={stageRef} className={'lx-stage' + (flags.reduced ? ' is-static' : '')} aria-labelledby="lx-h1">
      <div className="lx-stage__sticky">
        <div ref={hostRef} className={'lx-globe lx-globe--' + mode} aria-hidden="true" />
        <div className="lx-stage__shade" aria-hidden="true" />
        <div className="lx-hero">
          <div className="lx-hero__copy">
            <p className="lx-eyebrow" data-intro><span className="lx-pulse" aria-hidden /> NASA Space Apps 2026 · Harmonizing MODIS + VIIRS hotspots</p>
            <h1 id="lx-h1" className="lx-h1" aria-label="Two satellites. One honest fire record.">
              <SplitText className="lx-line" text="Two satellites." />
              <span className="lx-line" aria-hidden="true">
                <SplitText text="One honest" />{' '}
                <span className="lx-fire"><SplitText text="fire" /><span className="lx-fire__ul" /></span>{' '}
                <SplitText text="record." />
              </span>
            </h1>
            <p className="lx-lede" data-intro>
              NASA’s MODIS has watched for fires since 2002. The sharper VIIRS joined in 2012 — and the record jumped, not because more land burned, but because the new camera sees smaller fires. Lumos puts both on one fair scale, with honest error bars.
            </p>
            <div className="lx-ctas" data-intro>
              <a ref={primary} className="lx-btn lx-btn--primary" href={openHash} onClick={(e) => onWorkspaceLink(e, openHash, 'Opening the fire calendar for Bangladesh')}>
                Open the fire calendar <span className="lx-btn__arrow"><Icon3D icon={ArrowRight} tone="current" size={19} strokeWidth={2.4} /></span>
              </a>
              <button ref={secondary} className="lx-btn lx-btn--ghost" onClick={() => scrollToId('how', flags.reduced)}><Icon3D icon={Layers} tone="cyan" size={18} />How harmonization works</button>
            </div>
            <ul className="lx-sensors" data-intro aria-label="Series colours">
              <li><i className="sw sw--aqua" />Aqua MODIS <span>1 km · since 2002</span></li>
              <li><i className="sw sw--viirs" />S-NPP VIIRS <span>375 m · since 2012</span></li>
              <li><i className="sw sw--est" />Harmonized <span>VIIRS-scale estimate</span></li>
            </ul>
          </div>
          <aside className="lx-hero__aside" data-intro aria-label="What the globe shows">
            {synthetic && <span className="lx-demo lx-demo--live"><Icon3D icon={TriangleAlert} tone="red" size={14} />DEMO DATA · synthetic fixture</span>}
            <p className="lx-aside__t">{mode === 'fallback' ? 'Static globe (WebGL unavailable)' : 'Live from the snapshot'}</p>
            <p className="lx-aside__v">{pointsInfo ?? (error ? (offline() ? 'Snapshot unavailable offline.' : 'Snapshot unavailable.') : ctx.bgdFailed ? unavailableText('Hotspot cells') : 'Loading hotspot cells…')}</p>
            {core && <p className="lx-aside__s">{core.manifest.years.length} years · {core.regions.length} areas · {core.manifest.snapshot_id}</p>}
          </aside>
          <div className="lx-scrollcue" aria-hidden="true"><span />Scroll</div>
        </div>
        <ol className="lx-zoomcaps" aria-label="Zooming into Bangladesh">
          {captions.map((c) => (
            <li key={c.k} className="lx-zoomcap"><span className="lx-kicker">{c.k}</span><h2 className="lx-h3">{c.h}</h2><p>{c.p}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Where the 2-D fallback globe sits at progress 0 (mirrors the hero layout: right side on desktop, lower on mobile). */
function globeLayout(host: HTMLElement) {
  const w = host.clientWidth, h = host.clientHeight;
  if (w < 700) return { cx: w * 0.5, cy: h * 0.78, r: Math.min(w * 0.62, h * 0.36) };
  return { cx: w * 0.7, cy: h * 0.52, r: Math.min(w * 0.3, h * 0.42) };
}

function Footer({ core, openHash }: { core: Core | null; openHash: string }) {
  const m = core?.manifest;
  return (
    <footer className="lx-foot">
      <div className="lx-foot__grid">
        <div className="lx-foot__brand">
          <Logo size={36} />
          <p className="lx-foot__name">Lumos Fire Calendar</p>
          <p>Pick a place. See its burning seasons over 20+ years on one fair scale. Tell real change apart from satellite change.</p>
          <a className="lx-btn lx-btn--primary lx-btn--sm" href={openHash} onClick={(e) => onWorkspaceLink(e, openHash)}>Open the fire calendar <span className="lx-btn__arrow"><Icon3D icon={ArrowRight} tone="current" size={16} /></span></a>
        </div>
        <div>
          <h2 className="lx-foot__h">Made by</h2>
          <p><b>M. Al Shahriar Hameem</b><br />Team Lumos · Dhaka, Bangladesh</p>
          <p>NASA Space Apps Challenge 2026 — <i>Harmonization of MODIS and VIIRS Hot Spots</i></p>
        </div>
        <div>
          <h2 className="lx-foot__h">Data & credits</h2>
          <p>Active-fire detections: <a href="https://firms.modaps.eosdis.nasa.gov/" rel="noopener" target="_blank">NASA FIRMS</a> — MODIS C6.1 (Aqua, Terra) and VIIRS 375 m (S-NPP).</p>
          <p>Boundaries: <a href="https://www.naturalearthdata.com/" rel="noopener" target="_blank">Natural Earth</a> (public domain).</p>
          <p className="lx-foot__small">We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA’s Earth Science Data and Information System (ESDIS).</p>
        </div>
        <div>
          <h2 className="lx-foot__h">This snapshot</h2>
          {m ? (
            <>
              <p><StageTagLx stage={m.release_stage} /></p>
              <p className="lx-foot__small"><code>{m.snapshot_id}</code></p>
              {m.synthetic && <p className="lx-foot__disc"><b>Synthetic demo.</b> Every number on this page comes from a synthetic fixture in the real bundle format. It exercises the pipeline and the interface; it is not a real fire observation.</p>}
            </>
          ) : <p className="lx-foot__small">Loading snapshot…</p>}
        </div>
      </div>
      <p className="lx-foot__base">A hotspot is a hot pixel, not a fire incident. No “AI accuracy” badges here — skill is reported as MAE against the ratio baseline inside the app.</p>
    </footer>
  );
}
