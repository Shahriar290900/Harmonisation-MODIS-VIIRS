// Scroll story: (b) two cameras, (c) the 2012 jump, (d) reading the calendar, (e) honesty.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PixelCompareHandle } from '../contract';
import { MONTHS_LONG, MONTHS_SHORT, fmtNum } from '../../data/format';
import { textOn, valueColor } from '../../ui/scale';
import { Glyph } from '../../ui/Glyph';
import { CircleCheck, CircleX, FlaskConical, Info } from 'lucide-react';
import { Icon3D } from '../../ui/icons/Icon3D';
import { annualMeans, countWord, unavailableText, useNear, type AoiSeries } from './data';
import { mountFallbackPixels } from './fallbacks';
import { gsap, Reveal } from './motion';
import type { Ctx } from './Landing';
import { DEFAULT_AOI } from '../../data/regions';
import { StageTagLx } from './StageTag';

/** The Bangladesh-first story's region name, read from regions.json (falls back to the default's name while loading). */
const homeName = (ctx: Ctx) => ctx.core?.regions.find((r) => r.aoi_id === DEFAULT_AOI)?.name ?? 'Bangladesh';

function useStep(n: number) {
  const [step, setStep] = useState(0);
  const cur = useRef(0);
  const set = (p: number, edges: number[]) => {
    let s = 0;
    for (let i = 0; i < edges.length; i++) if (p >= edges[i]) s = i + 1;
    s = Math.min(n - 1, s);
    if (s !== cur.current) { cur.current = s; setStep(s); }
  };
  return [step, set] as const;
}

function Steps({ items, step, reduced }: { items: { k: string; h: string; p: React.ReactNode }[]; step: number; reduced: boolean }) {
  return (
    <ol className="lx-steps">
      {items.map((it, i) => (
        <li key={it.k} className={'lx-step' + (reduced || i === step ? ' is-on' : '')} aria-current={!reduced && i === step ? 'step' : undefined}>
          <span className="lx-kicker">{it.k}</span>
          <h3 className="lx-h3">{it.h}</h3>
          <p>{it.p}</p>
        </li>
      ))}
    </ol>
  );
}

function Progress({ step, n }: { step: number; n: number }) {
  return <div className="lx-prog" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i <= step ? 'is-on' : ''} />)}</div>;
}

const CAMERAS = [
  { k: 'MODIS · 1 km', h: 'One camera sees in big squares.', p: 'Aqua MODIS reads the ground in pixels about 1 km wide. A small fire inside a big pixel often stays below the detection threshold — so it is never counted.' },
  { k: 'VIIRS · 375 m', h: 'The other sees in small ones.', p: 'S-NPP VIIRS pixels are about 375 m — seven times less area each. Small fires light up, so VIIRS typically records several times more hotspots over the same land.' },
  { k: 'Harmonized', h: 'We translate one into the other.', p: 'From 2012 to 2024 both flew together. We learn “when MODIS saw X here, VIIRS saw Y”, test it on unseen years and places, then turn 2003–2011 MODIS into VIIRS-scale estimates — each with an 80% band.' }
];

/** (b) Two cameras: 3-D pixel compare (or a 2-D canvas), scrubbed 0→1. */
export function TwoCameras({ ctx }: { ctx: Ctx }) {
  const { three, flags, quality, gl } = ctx;
  const ref = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PixelCompareHandle | null>(null);
  const near = useNear(ref, '600px');
  const [step, setStep] = useStep(3);

  useEffect(() => {
    if (flags.reduced || !near || (three === undefined && gl)) return;
    const el = host.current!;
    let h: PixelCompareHandle | null = null;
    // badge:false — the "Illustrative" note is React markup below, so all three paths (WebGL, 2-D, static) show it.
    if (three && gl) { try { h = three.mountPixelCompare(el, { reducedMotion: false, quality, badge: false } as Parameters<typeof three.mountPixelCompare>[1]); } catch { h = null; } }
    // three's pixel compare observes its own host; only the 2-D fallback needs our ResizeObserver.
    let ro: ResizeObserver | null = null;
    if (!h) { h = mountFallbackPixels(el); ro = new ResizeObserver(() => h?.resize()); ro.observe(el); }
    handle.current = h;
    return () => { ro?.disconnect(); h?.dispose(); if (handle.current === h) handle.current = null; };
  }, [near, three, gl, quality, flags.reduced]);

  useLayoutEffect(() => {
    if (flags.reduced) return;
    const c = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: {
          trigger: ref.current!, start: 'top top', end: 'bottom bottom', scrub: 0.6,
          onUpdate: (s) => { const p = s.progress; handle.current?.setProgress(Math.min(1, p * 1.08)); setStep(p, [0.36, 0.68]); }
        }
      }).fromTo('.lx-cam__frame', { scale: 0.92, opacity: 0.4 }, { scale: 1, opacity: 1, duration: 0.15, ease: 'power2.out' }, 0).to({}, { duration: 0.85 });
    }, ref);
    return () => c.revert();
  }, [flags.reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="how" ref={ref} className={'lx-scrolly lx-cam' + (flags.reduced ? ' is-static' : '')} aria-labelledby="lx-cam-h">
      <div className="lx-scrolly__sticky">
        <div className="lx-scrolly__text">
          <p className="lx-eyebrow">How harmonization works</p>
          <h2 id="lx-cam-h" className="lx-h2">Two cameras, <span className="lx-grad">one field of fire.</span></h2>
          <Steps items={CAMERAS} step={step} reduced={flags.reduced} />
          {!flags.reduced && <Progress step={step} n={3} />}
        </div>
        {flags.reduced ? (
          <StaticPixels />
        ) : (
          <div className="lx-cam__frame">
            <div ref={host} className="lx-cam__host" aria-hidden="true" />
            <div className="lx-cam__legend" aria-hidden="true">
              <span className={step === 0 ? 'is-on' : ''}><i className="sw sw--aqua" />MODIS 1 km</span>
              <span className={step === 1 ? 'is-on' : ''}><i className="sw sw--viirs" />VIIRS 375 m</span>
              <span className={step === 2 ? 'is-on' : ''}><i className="sw sw--est" />Harmonized</span>
            </div>
            <IllustrativeNote />
            <p className="lx-sr">Illustration: the same fire field sampled by a coarse 1 km grid, a fine 375 m grid, then the harmonized estimate on the coarse grid.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** REVIEW M3: visible on every path (WebGL, 2-D fallback, reduced-motion static frames). */
function IllustrativeNote() {
  return <p className="lx-cam__note" role="note">Illustrative fires · not real data</p>;
}

/** Reduced motion: three static frames (no animation). */
function StaticPixels() {
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const box = useRef<HTMLDivElement>(null);
  // Mounted when the section approaches (like the animated path), so the top of the page has only the hero canvas.
  const near = useNear(box, '600px');
  useEffect(() => {
    if (!near) return;
    const hs = refs.map((r, i) => { const h = mountFallbackPixels(r.current!); h.setProgress([0.1, 0.55, 1][i]); return h; });
    return () => hs.forEach((h) => h.dispose());
  }, [near]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className="lx-cam__static">
      {['MODIS 1 km', 'VIIRS 375 m', 'Harmonized'].map((t, i) => (
        <figure key={t}><div ref={refs[i]} className="lx-cam__host" aria-hidden="true" /><figcaption>{t}</figcaption></figure>
      ))}
      <IllustrativeNote />
    </div>
  );
}

const C = { aqua: '#00B4D8', viirs: '#8B5CF6', est: '#14B8A6' };

/** (c) The 2012 jump: annual mean monthly hotspots for the default region (Bangladesh), drawn on scroll. */
export function JumpChart({ ctx, bgd }: { ctx: Ctx; bgd: AoiSeries | null }) {
  const { flags, core } = ctx;
  const home = homeName(ctx);
  const ref = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [step, setStep] = useStep(3);
  useEffect(() => {
    const el = box.current!;
    // Debounced: every width change rebuilds the scrubbed timeline, so don't do it on every resize frame.
    let t: ReturnType<typeof setTimeout> | null = null, first = true;
    const ro = new ResizeObserver(([e]) => {
      const v = Math.max(280, Math.round(e.contentRect.width));
      if (first) { first = false; setW(v); return; }
      if (t) clearTimeout(t);
      t = setTimeout(() => setW(v), 150);
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (t) clearTimeout(t); };
  }, []);
  const data = useMemo(() => (bgd ? annualMeans(bgd) : []), [bgd]);
  const ratio = useMemo(() => {
    const r = data.filter((d) => d.year >= 2013 && d.year <= 2024 && d.aqua && d.viirs).map((d) => d.viirs! / d.aqua!);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
  }, [data]);
  const h = flags.mobile ? 260 : 360;
  const m = { l: 44, r: 14, t: 14, b: 28 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const y0 = data[0]?.year ?? 2003, y1 = data.at(-1)?.year ?? 2025;
  const ymax = useMemo(() => {
    let v = 1;
    for (const d of data) for (const k of ['aqua', 'viirs', 'est'] as const) if (d[k] != null) v = Math.max(v, d[k]!);
    return v * 1.18;
  }, [data]);
  const X = (yr: number) => m.l + ((yr - y0) / Math.max(1, y1 - y0)) * pw;
  const Y = (v: number) => m.t + ph - (Math.min(v, ymax) / ymax) * ph;
  const path = (k: 'aqua' | 'viirs' | 'est') => {
    let d = '', pen = false;
    for (const p of data) { const v = p[k]; if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(p.year).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }
    return d;
  };
  const bandPath = useMemo(() => {
    const pts = data.filter((d) => d.lo != null && d.hi != null);
    if (!pts.length) return '';
    return 'M' + pts.map((d) => `${X(d.year).toFixed(1)},${Y(d.hi!).toFixed(1)}`).join('L') + 'L' + [...pts].reverse().map((d) => `${X(d.year).toFixed(1)},${Y(d.lo!).toFixed(1)}`).join('L') + 'Z';
  }, [data, w, h, ymax]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = useMemo(() => { const n = 4, s = ymax / n; const mag = 10 ** Math.floor(Math.log10(s)); const st = Math.ceil(s / mag) * mag; return Array.from({ length: n + 1 }, (_, i) => i * st).filter((v) => v <= ymax); }, [ymax]);
  const xt = [2003, 2008, 2012, 2016, 2020, 2025].filter((y) => y >= y0 && y <= y1);

  useLayoutEffect(() => {
    if (flags.reduced || !data.length) return;
    const c = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: ref.current!, start: 'top top', end: 'bottom bottom', scrub: 0.6, onUpdate: (s) => setStep(s.progress, [0.38, 0.68]) }
      });
      tl.fromTo('#lx-clip-aqua rect', { attr: { width: 0 } }, { attr: { width: pw + 4 }, duration: 0.3 }, 0.04)
        .fromTo('.lx-jump__mark', { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.36)
        .fromTo('#lx-clip-viirs rect', { attr: { width: 0 } }, { attr: { width: X(y1) - X(2011.5) + 6 }, duration: 0.2 }, 0.38)
        .fromTo('.lx-jump__ratio', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.06 }, 0.55)
        .fromTo('#lx-clip-est rect', { attr: { width: 0 } }, { attr: { width: pw + 4 }, duration: 0.24 }, 0.68)
        .to({}, { duration: 0.06 }, 0.94);
    }, ref);
    return () => c.revert();
  }, [flags.reduced, data, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = ratio ? `×${ratio.toFixed(1)}` : 'several times';
  const items = [
    { k: '01 · MODIS alone', h: 'A record since 2003.', p: `Aqua MODIS, month by month, averaged per year for ${home}. One camera, one scale.` },
    { k: '02 · Splice in VIIRS', h: `In 2012 the record leaps ${r}.`, p: 'Join the sharper VIIRS onto the end and the chart jumps. Nothing changed on the ground — the camera did.' },
    { k: '03 · Harmonized', h: 'Now the years are comparable.', p: 'MODIS years translated to the VIIRS scale (dashed), with the 80% band. 2005 and 2020 finally sit on the same axis.' }
  ];
  const full = flags.reduced;

  return (
    <section id="jump" ref={ref} className={'lx-scrolly lx-jump' + (flags.reduced ? ' is-static' : '')} aria-labelledby="lx-jump-h">
      <div className="lx-scrolly__sticky">
        <div className="lx-scrolly__text">
          <p className="lx-eyebrow">The 2012 jump {core?.manifest.synthetic && <span className="lx-demo lx-demo--inline"><Icon3D icon={FlaskConical} tone="red" size={12} />DEMO DATA</span>}</p>
          <h2 id="lx-jump-h" className="lx-h2">The fire record <span className="lx-grad">didn’t change.</span> The camera did.</h2>
          <Steps items={items} step={step} reduced={flags.reduced} />
          {!flags.reduced && <Progress step={step} n={3} />}
        </div>
        <figure className="lx-jump__fig">
          <div className="lx-jump__head">
          <ul className="lx-legend" aria-label="Legend">
            <li><i className="sw sw--aqua" />Raw Aqua MODIS</li>
            <li><i className="sw sw--viirs" />Raw S-NPP VIIRS</li>
            <li><i className="sw sw--est sw--dash" />Harmonized estimate · 80% band</li>
          </ul>
          {ratio && <p className="lx-jump__ratio"><b>{r}</b><span>VIIRS ÷ MODIS hotspots<br />mean ratio, 2013–2024</span></p>}
          </div>
          <div ref={box} className="lx-jump__box">
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-labelledby="lx-jump-desc">
              <desc id="lx-jump-desc">
                {`${home}, mean monthly hotspots per year, ${y0}–${y1}. Raw MODIS stays low; raw VIIRS from 2012 is ${r} higher; the harmonized estimate puts all years on the VIIRS scale.`}
              </desc>
              <defs>
                <clipPath id="lx-clip-aqua"><rect x={m.l - 2} y={0} width={full ? pw + 4 : 0} height={h} /></clipPath>
                <clipPath id="lx-clip-viirs"><rect x={X(2011.5)} y={0} width={full ? X(y1) - X(2011.5) + 6 : 0} height={h} /></clipPath>
                <clipPath id="lx-clip-est"><rect x={m.l - 2} y={0} width={full ? pw + 4 : 0} height={h} /></clipPath>
                <linearGradient id="lx-bandfade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#14B8A6" stopOpacity="0" /><stop offset="0.45" stopColor="#14B8A6" stopOpacity="0.1" /><stop offset="1" stopColor="#14B8A6" stopOpacity="0.24" /></linearGradient>
                <linearGradient id="lx-vfade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8B5CF6" stopOpacity="0.28" /><stop offset="1" stopColor="#8B5CF6" stopOpacity="0" /></linearGradient>
              </defs>
              {ticks.map((t) => (
                <g key={t} className="lx-axis">
                  <line x1={m.l} x2={w - m.r} y1={Y(t)} y2={Y(t)} />
                  <text x={m.l - 8} y={Y(t) + 4} textAnchor="end">{fmtNum(t)}</text>
                </g>
              ))}
              {xt.map((yr) => <text key={yr} className="lx-axis lx-axis--x" x={X(yr)} y={h - 8} textAnchor="middle">{yr}</text>)}
              <g className="lx-jump__mark">
                <line x1={X(2012)} x2={X(2012)} y1={m.t} y2={m.t + ph} stroke="#F59E0B" strokeDasharray="3 4" strokeWidth="1.5" />
                <text x={X(2012) + 6} y={m.t + 12} className="lx-jump__marktext">VIIRS arrives · Jan 2012</text>
              </g>
              <g clipPath="url(#lx-clip-est)">
                <path d={bandPath} fill="url(#lx-bandfade)" />
                <path d={path('est')} fill="none" stroke={C.est} strokeWidth="2.5" strokeDasharray="7 5" strokeLinecap="round" />
              </g>
              <g clipPath="url(#lx-clip-aqua)">
                <path d={path('aqua')} fill="none" stroke={C.aqua} strokeWidth="2.5" strokeLinejoin="round" />
              </g>
              <g clipPath="url(#lx-clip-viirs)">
                <path d={path('viirs') + (data.length ? `L${X(y1)},${m.t + ph}L${X(2012)},${m.t + ph}Z` : '')} fill="url(#lx-vfade)" stroke="none" />
                <path d={path('viirs')} fill="none" stroke={C.viirs} strokeWidth="2.75" strokeLinejoin="round" />
                {data.filter((d) => d.viirs != null).map((d) => <circle key={d.year} cx={X(d.year)} cy={Y(d.viirs!)} r={3} fill={C.viirs} stroke="#0B1220" strokeWidth="1.5" />)}
              </g>
              {!data.length && <text x={w / 2} y={h / 2} textAnchor="middle" className="lx-axis">{ctx.homeFailed ? unavailableText(`${home} activity`) : `Loading ${home} activity…`}</text>}
            </svg>
          </div>
          <figcaption className="lx-figcap">{home} · mean monthly hotspot detections per year · y-axis linear. Source: this snapshot’s <code>activity/{DEFAULT_AOI}/*.json</code>.</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** (d) Read the calendar: a mini heatmap that assembles cell by cell. */
export function CalendarStory({ ctx, bgd }: { ctx: Ctx; bgd: AoiSeries | null }) {
  const { flags } = ctx;
  const home = homeName(ctx);
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useStep(3);
  const rows = useMemo(() => (bgd ? bgd.rows.filter((r) => r.year >= 2003) : []), [bgd]);
  const peak = bgd?.peakMonth ?? 3;
  const highs = useMemo(() => rows.flatMap((r) => r.months.filter((m) => m.flag === 'high').map((m) => `${r.year}-${m.month}`)), [rows]);

  useLayoutEffect(() => {
    if (flags.reduced || !rows.length) return;
    const c = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: ref.current!, start: 'top top', end: 'bottom bottom', scrub: 0.5, onUpdate: (s) => setStep(s.progress, [0.4, 0.68]) }
      });
      tl.fromTo('.lx-cal__cell', { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.42, ease: 'power2.out', stagger: { amount: 0.36, grid: [rows.length, 12], from: 'start' } }, 0.02)
        .fromTo('.lx-cal__yr, .lx-cal__mh', { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0.02)
        .fromTo('.lx-cal__peak', { opacity: 0, scaleY: 0 }, { opacity: 1, scaleY: 1, transformOrigin: '50% 0%', duration: 0.12 }, 0.44)
        .fromTo('.lx-cal__hi', { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1, duration: 0.1, stagger: 0.01 }, 0.7)
        .to({}, { duration: 0.08 }, 0.92);
    }, ref);
    return () => c.revert();
  }, [flags.reduced, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // REVIEW L5: season = contiguous months at ≥ half the peak mean (data.ts seasonOf), not a fixed ±1 month.
  const [sa, sb] = bgd?.season ?? [peak, peak];
  const seasonText = sa === sb ? MONTHS_LONG[sa - 1] : `${MONTHS_LONG[sa - 1]}–${MONTHS_LONG[sb - 1]}`;
  const nYears = rows.length || 23;
  const yearsWord = countWord(nYears).replace(/-/g, '\u2011');
  const items = [
    { k: 'Rows × columns', h: 'Each row is a year. Each column, a month.', p: <>Bright cells hold more hotspots. The glyph says how we know: <Glyph state="observed" size={13} /> observed by VIIRS, <Glyph state="estimated" size={13} /> estimated from MODIS, <Glyph state="partial" size={13} /> partial month, <Glyph state="missing" size={13} /> missing — never zero.</> },
    { k: 'The season', h: `The usual season: ${seasonText}.`, p: `Read down a column and the burning season appears. In this snapshot ${MONTHS_LONG[peak - 1]} is the usual peak (mean over all years).` },
    { k: 'The outliers', h: 'Spot the unusual month.', p: <>A white corner flag <span className="lx-flag" aria-hidden /> marks months that are high for their season against same-month baseline years. Click any month in the app for the full evidence.</> }
  ];

  return (
    <section id="read" ref={ref} className={'lx-scrolly lx-calstory' + (flags.reduced ? ' is-static' : '')} aria-labelledby="lx-cal-h">
      <div className="lx-scrolly__sticky">
        <div className="lx-scrolly__text">
          <p className="lx-eyebrow">Read the calendar</p>
          <h2 id="lx-cal-h" className="lx-h2">{yearsWord[0].toUpperCase() + yearsWord.slice(1)} years <span className="lx-grad">on one page.</span></h2>
          <Steps items={items} step={step} reduced={flags.reduced} />
          {!flags.reduced && <Progress step={step} n={3} />}
        </div>
        <figure className="lx-cal" role="img" aria-label={`${home} burning calendar, ${rows[0]?.year ?? 2003}–${rows.at(-1)?.year ?? 2025}; peak month ${MONTHS_LONG[peak - 1]}; ${highs.length} months flagged unusually high.`}>
          <div className="lx-cal__grid" style={{ ['--rows' as string]: rows.length || 23 }}>
            <span />
            {MONTHS_SHORT.map((mn, i) => <span key={mn} className={'lx-cal__mh' + (i + 1 === peak ? ' is-peak' : '')}>{mn[0]}</span>)}
            {rows.map((r) => (
              <Row key={r.year} r={r} max={bgd!.max} />
            ))}
            {!rows.length && Array.from({ length: 23 * 13 }, (_, i) => <span key={i} className="lx-cal__ghost" />)}
            {rows.length > 0 && <span className="lx-cal__peak" style={{ gridColumn: `${peak + 1} / span 1`, gridRow: `2 / span ${rows.length}` }} />}
          </div>
          {ctx.homeFailed && !rows.length && <p className="lx-figcap lx-cal__na" role="status">{unavailableText(`The ${home} calendar`)}</p>}
          <figcaption className="lx-figcap lx-cal__key">{home} · VIIRS-scale hotspots per month · <span><Glyph state="observed" /> observed</span> <span><Glyph state="estimated" /> estimated</span> <span><Glyph state="partial" /> partial</span> <span><Glyph state="missing" /> missing</span> <span><span className="lx-flag" aria-hidden /> high for its season</span></figcaption>
        </figure>
      </div>
    </section>
  );
}

function Row({ r, max }: { r: AoiSeries['rows'][number]; max: number }) {
  return (
    <>
      <span className="lx-cal__yr">{r.year}</span>
      {r.months.map((m) => {
        const show = m.state !== 'missing' && m.state !== 'unsupported';
        const bg = show ? valueColor(m.value, max) : null;
        return (
          <span key={m.month} className={'lx-cal__cell st-' + m.state} style={bg ? { background: bg, color: textOn(m.value, max) } : undefined}>
            <Glyph state={m.state} size={8} />
            {m.flag === 'high' && show && <b className="lx-cal__hi" />}
          </span>
        );
      })}
    </>
  );
}

/** (e) Honesty: what we can and can't claim. */
export function Honesty({ ctx }: { ctx: Ctx }) {
  const { flags, core } = ctx;
  const m = core?.manifest;
  return (
    <section id="honest" className="lx-honest" aria-labelledby="lx-honest-h">
      <Reveal reduced={flags.reduced} className="lx-honest__head">
        <p className="lx-eyebrow">Honesty, by design</p>
        <h2 id="lx-honest-h" className="lx-h2">What this can — and <span className="lx-grad">can’t</span> — tell you.</h2>
      </Reveal>
      <Reveal reduced={flags.reduced} className="lx-honest__grid">
        <div className="lx-honest__card lx-honest__card--can">
          <h3><span className="lx-honest__ico"><Icon3D icon={CircleCheck} tone="teal" size={22} /></span>We can claim</h3>
          <ul>
            <li><b>When a place usually burns</b>, month by month, across 20+ years.</li>
            <li><b>Whether a month is unusual</b> for its season, against same-month baseline years.</li>
            <li><b>How far the sensors differ</b>, and exactly which adjustment was applied.</li>
            <li><b>An 80% band on every estimate</b>, with its measured coverage on held-out data.</li>
          </ul>
        </div>
        <div className="lx-honest__card lx-honest__card--cant">
          <h3><span className="lx-honest__ico"><Icon3D icon={CircleX} tone="red" size={22} /></span>We can’t claim</h3>
          <ul>
            <li><b>The small fires MODIS missed.</b> We estimate counts, not individual fires.</li>
            <li><b>Anything under cloud.</b> FIRMS gives no cloud-free denominator, so coverage stays “unknown”.</li>
            <li><b>Wildfire incidents.</b> A hotspot is a hot pixel; a kiln or flare can be one too (shown separately).</li>
            <li><b>Any quantum or “AI accuracy” advantage.</b> Simulated QML is a labelled research panel, not the estimator.</li>
          </ul>
        </div>
        <div className="lx-honest__card lx-honest__card--stage">
          <h3>This snapshot</h3>
          {m ? (
            <>
              <p className="lx-honest__stage"><StageTagLx stage={m.release_stage} /></p>
              <p>{m.synthetic ? 'Synthetic fixture in the real bundle format. It proves the pipeline and the interface — not the science. Real FIRMS data replaces it before judging.' : 'Real FIRMS data. The release stage says how far calibration has been proven.'}</p>
              <p className="lx-honest__small">Release rule: the selected model must beat both the identity and month-ratio baselines on test, with interval coverage within ±10 points of nominal.</p>
            </>
          ) : <p>Loading…</p>}
        </div>
        <div className="lx-honest__card lx-honest__card--usa" style={{ gridColumn: '1 / -1' }}>
          <h3><span className="lx-honest__ico"><Icon3D icon={Info} tone="cyan" size={22} /></span>United States caveats</h3>
          <ul>
            <li><b>Alaska and Hawaii included.</b> The US national boundary includes these states.</li>
            <li><b>Non-wildfire burning excluded.</b> FIRMS types 1, 2, and 3 (prescribed, agricultural) are excluded from the main count.</li>
            <li><b>Grid scale limits.</b> The 5 km grid is unmeasured at the USA scale.</li>
            <li><b>California calibration.</b> California inherits national B0_month_ratio coefficients.</li>
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
