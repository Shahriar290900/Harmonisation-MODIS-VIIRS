import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { JUMP_SENTENCE, type JumpMode } from '../story/JumpSwitch';
import { actions, useAppState } from './bridge';
import { scaleLinear, scaleSymlog } from 'd3-scale';
import { area, line } from 'd3-shape';
import type { ActivityRecord, SeriesKey, Selection } from '../types';
import { fmtCompact, fmtNum, monthLabel } from '../data/format';
import { useSize } from './hooks';
import { Tip } from './Tip';
import { symlogTicks, yearTicks } from '../charts/ticks';
import '../styles/charts.css';

type Pt = { year: number; month: number; r: ActivityRecord | null };
/** `height` is accepted for backwards compatibility and ignored: the chart sizes itself from its width. */
interface Props { flat: Pt[]; selection: Selection; onSelect: (y: number, m: number) => void; height?: number;
  /** Jump view: one joined line (older satellite, or the estimate, before 2012; sharper satellite from 2012). Absent = the detailed view. */
  mode?: JumpMode }

const COLOR: Record<SeriesKey, string> = { aqua: 'var(--aqua)', viirs: 'var(--viirs)', estimate: 'var(--est)', terra: 'var(--terra)', static: 'var(--static)' };
const SERIES: { key: SeriesKey; label: string; direct: string; title: string; get: (r: ActivityRecord) => number | null }[] = [
  { key: 'viirs', label: 'Sharper satellite (VIIRS)', direct: 'Sharper satellite', title: 'VIIRS, 375 m pixels, flying since 2012. Counts as recorded, nothing adjusted.', get: (r) => r.raw_viirs_reference_detections },
  { key: 'aqua', label: 'Older satellite (MODIS)', direct: 'Older satellite', title: 'Aqua MODIS, 1 km pixels, flying since 2002. It sees fire more coarsely, so its counts are lower and not directly comparable.', get: (r) => r.raw_modis_detections },
  { key: 'estimate', label: 'Estimate, likely range', direct: 'Estimate', title: 'Dashed line: our estimate of what the sharper satellite would have counted, worked out from the older one. The shaded band is the likely range (8 in 10). An estimate, not a measurement.', get: (r) => r.estimated_viirs_reference_detections },
  { key: 'terra', label: 'Terra (MODIS)', direct: 'Terra', title: 'Terra MODIS, shown on its own and never mixed into the estimate.', get: (r) => r.raw_modis_terra_detections },
  { key: 'static', label: 'Fixed heat sources', direct: 'Fixed sources', title: 'Hot spots from fixed land sources such as kilns and industry.', get: (r) => r.static_source_detections_viirs }
];
const SPAN: Record<string, { label: string; fill: string }> = {
  backcast: { label: 'estimated past', fill: 'var(--est)' },
  train: { label: 'learned from', fill: 'var(--muted)' },
  val: { label: 'chosen on', fill: 'var(--viirs)' },
  test: { label: 'checked on', fill: 'var(--amber)' }
};
const statusWord = (r: ActivityRecord | null) => !r ? 'no data for this month' : r.extract_status === 'complete' ? 'full month' : r.extract_status === 'partial' ? 'part of the month only' : 'no data for this month';

export function CompareChart({ flat, selection, onSelect, mode }: Props) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const log = useAppState((s) => s.scale) === 'log';
  const onStore = useAppState((s) => s.series);
  const jump = mode != null;
  const on = jump ? { aqua: false, viirs: false, estimate: false, terra: false, static: false } : onStore;
  const target = mode === 'onescale' ? 1 : 0;
  const [tt, setTt] = useState(target);
  const ttRef = useRef(target); ttRef.current = tt;
  useEffect(() => {
    if (!jump) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setTt(target); return; }
    const from = ttRef.current, t0 = performance.now(); let raf = 0;
    const step = (now: number) => { const k = Math.min(1, (now - t0) / 650); const e = 1 - (1 - k) ** 3; setTt(from + (target - from) * e); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [jump, target]);
  const [hover, setHover] = useState<number | null>(null);

  const n = flat.length;
  const W = Math.max(260, w);
  const narrow = W < 700;
  const M = { l: 54, r: narrow ? 10 : 112, t: 40, b: 30 };
  const H = Math.round(Math.min(480, Math.max(narrow ? 220 : 280, W * (narrow ? 0.7 : 0.4)))) + M.t + M.b - 70;
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  const { x, y, maxV } = useMemo(() => {
    let mx = 1;
    for (const p of flat) {
      if (!p.r) continue;
      for (const s of SERIES) if (on[s.key]) { const v = s.get(p.r); if (v != null && v > mx) mx = v; }
      if (on.estimate && p.r.estimate_interval_high != null) mx = Math.max(mx, p.r.estimate_interval_high);
      if (jump) for (const v of [p.r.raw_viirs_reference_detections, p.r.raw_modis_detections, p.r.estimated_viirs_reference_detections, p.r.estimate_interval_high]) if (v != null && v > mx) mx = v;
    }
    const x = scaleLinear().domain([0, Math.max(1, n - 1)]).range([0, iw]);
    const y = (log ? scaleSymlog().constant(1) : scaleLinear()).domain([0, mx * 1.05]).range([ih, 0]).nice();
    return { x, y, maxV: mx };
  }, [flat, on, log, iw, ih, n, jump]);

  const complete = (p: Pt) => p.r != null && p.r.extract_status === 'complete';
  const paths = useMemo(() => {
    const out: Partial<Record<SeriesKey, string>> = {};
    for (const s of SERIES) {
      if (!on[s.key]) continue;
      out[s.key] = line<Pt>().defined((p) => complete(p) && s.get(p.r!) != null).x((_, i) => x(i)).y((p) => y(s.get(p.r!)!))(flat) ?? '';
    }
    return out;
  }, [flat, on, x, y]);
  const pre = (p: Pt) => p.year < 2012;
  const joined = useMemo(() => {
    if (!jump) return null;
    const val = (p: Pt) => {
      if (!complete(p)) return null;
      if (!pre(p)) return p.r!.raw_viirs_reference_detections;
      const a = p.r!.raw_modis_detections, e = p.r!.estimated_viirs_reference_detections;
      const want = target === 1 ? e : a, other = target === 1 ? a : e;
      return want == null ? null : other == null ? want : other + (want - other) * (target === 1 ? tt : 1 - tt);
    };
    const mk = (f: (p: Pt) => boolean) => line<Pt>().defined((p) => f(p) && val(p) != null).x((_, i) => x(i)).y((p) => y(val(p)!))(flat) ?? '';
    const pts = flat.map((p, i) => ({ i, v: val(p), pre: pre(p) })).filter((q) => q.v != null);
    const lastPre = [...pts].reverse().find((q) => q.pre), firstPost = pts.find((q) => !q.pre);
    const link = lastPre && firstPost ? `M${x(lastPre.i)},${y(lastPre.v!)}L${x(firstPost.i)},${y(firstPost.v!)}` : '';
    const bandPre = area<Pt>().defined((p) => pre(p) && complete(p) && p.r!.estimate_interval_low != null && p.r!.estimate_interval_high != null)
      .x((_, i) => x(i)).y0((p) => y(p.r!.estimate_interval_low!)).y1((p) => y(p.r!.estimate_interval_high!))(flat) ?? '';
    return { pre: mk(pre), post: mk((p) => !pre(p)), link, bandPre, midX: lastPre && firstPost ? (x(lastPre.i) + x(firstPost.i)) / 2 : null, hiY: firstPost ? y(firstPost.v!) : 0 };
  }, [jump, flat, x, y, tt, target]);  // eslint-disable-line react-hooks/exhaustive-deps
  const band = useMemo(() => on.estimate ? area<Pt>()
    .defined((p) => complete(p) && p.r!.estimate_interval_low != null && p.r!.estimate_interval_high != null)
    .x((_, i) => x(i)).y0((p) => y(p.r!.estimate_interval_low!)).y1((p) => y(p.r!.estimate_interval_high!))(flat) ?? '' : '', [flat, on.estimate, x, y]);

  const spans = useMemo(() => {
    const out: { split: string; a: number; b: number }[] = [];
    flat.forEach((p, i) => {
      const s = p.r?.split ?? 'none';
      const last = out[out.length - 1];
      if (last && last.split === s && last.b === i - 1) last.b = i; else out.push({ split: s, a: i, b: i });
    });
    return out.filter((s) => s.split !== 'none' && SPAN[s.split]);
  }, [flat]);

  const selIdx = flat.findIndex((p) => p.year === selection.year && p.month === selection.month);
  const y0 = flat[0]?.year ?? 0, y1 = flat[n - 1]?.year ?? 0;
  const xYear = (yr: number) => flat.findIndex((p) => p.year === yr && p.month === 1);
  const ticksX = n ? yearTicks(y0, y1, iw / Math.max(1, y1 - y0 + 1)).map((yr) => ({ yr, i: xYear(yr) })).filter((t) => t.i >= 0) : [];
  const yTicks = (log ? symlogTicks(y.domain()[1]) : y.ticks(5)).filter((t) => t <= y.domain()[1]);
  const i2012 = xYear(2012);
  const half = n > 1 ? (x(1) - x(0)) / 2 : 0;

  // direct labels at the right end of each main line, nudged apart
  const labels = useMemo(() => {
    if (narrow) return [];
    const L: { k: SeriesKey; text: string; y: number }[] = [];
    for (const s of SERIES) {
      if (!on[s.key] || !['aqua', 'viirs', 'estimate'].includes(s.key)) continue;
      for (let i = n - 1; i >= 0; i--) { const p = flat[i]; if (complete(p) && s.get(p.r!) != null) { L.push({ k: s.key, text: s.direct, y: y(s.get(p.r!)!) }); break; } }
    }
    L.sort((a, b) => a.y - b.y);
    for (let i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < 14) L[i].y = L[i - 1].y + 14;
    return L;
  }, [flat, on, y, narrow, n]);

  const idxAt = (clientX: number, el: Element) => Math.max(0, Math.min(n - 1, Math.round(x.invert(clientX - el.getBoundingClientRect().left))));
  const hp = hover != null ? flat[hover] : null;
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    const cur = hover ?? Math.max(0, selIdx);
    let nx = cur;
    switch (e.key) {
      case 'ArrowRight': nx = cur + 1; break;
      case 'ArrowLeft': nx = cur - 1; break;
      case 'PageUp': nx = cur - 12; break;
      case 'PageDown': nx = cur + 12; break;
      case 'Home': nx = 0; break;
      case 'End': nx = n - 1; break;
      case 'Enter': case ' ': e.preventDefault(); onSelect(flat[cur].year, flat[cur].month); return;
      case 'Escape': setHover(null); return;
      default: return;
    }
    e.preventDefault();
    setHover(Math.max(0, Math.min(n - 1, nx)));
  };
  const tipLeft = hover != null ? (M.l + x(hover) > W - 230 ? M.l + x(hover) - 214 : M.l + x(hover) + 12) : 0;
  const yearRows = flat.filter((p) => p.year === selection.year);

  return (
    <div className="cc" data-chart="compare" data-mode={mode}>
      <div className="cc__bar">
        {jump ? (
          <ul className="cc__legend" aria-label="Lines">
            <li><span className="cc__tag is-on"><svg width="22" height="10" aria-hidden><Swatch k={mode === 'onescale' ? 'estimate' : 'aqua'} /></svg>{mode === 'onescale' ? 'Estimate before 2012, likely range shaded' : 'Older satellite (MODIS) before 2012'}</span></li>
            <li><span className="cc__tag is-on"><svg width="22" height="10" aria-hidden><Swatch k="viirs" /></svg>Sharper satellite (VIIRS) from 2012</span></li>
          </ul>
        ) : (
        <ul className="cc__legend" aria-label="Lines (press to show or hide)">
          {SERIES.map((s) => (
            <li key={s.key}>
              <Tip text={s.title}><button type="button" className={'cc__tag' + (on[s.key] ? ' is-on' : '')} aria-pressed={on[s.key]} onClick={() => actions.toggleSeries(s.key)}>
                <svg width="22" height="10" aria-hidden><Swatch k={s.key} /></svg>{s.label}
              </button></Tip>
            </li>
          ))}
        </ul>
        )}
        <div className="cc__seg" role="group" aria-label="Vertical scale">
          <Tip text="Squeezed scale: each step up is about three times more, so small and big months can be read together. Zero stays at the bottom."><button type="button" className={log ? 'is-on' : ''} aria-pressed={log} onClick={() => actions.setScale('log')}>squeezed</button></Tip>
          <Tip text="Even scale: equal steps are equal counts. Best for judging real size differences; small months look tiny."><button type="button" className={!log ? 'is-on' : ''} aria-pressed={!log} onClick={() => actions.setScale('linear')}>even</button></Tip>
        </div>
      </div>
      <div className="cc__plot" ref={ref}>
        {w > 0 && n > 0 && (
          <div className="cc__focus" tabIndex={0} role="group" onKeyDown={onKey} onBlur={() => setHover(null)}
            aria-label="Monthly satellite detections over time. Use left and right arrow keys to read each month, Enter to select it.">
            <svg width={W} height={H} role="img" aria-label="Line chart of monthly detections. Gaps mean missing data, not zero.">
              <g transform={`translate(${M.l},${M.t})`}>
                {spans.map((s) => {
                  const sx = x(s.a) - half, sw = Math.max(1, x(s.b) - x(s.a) + 2 * half);
                  return (
                    <g key={s.split + s.a}>
                      <rect x={sx} y={0} width={sw} height={ih} fill={SPAN[s.split].fill} opacity={0.07} />
                      <rect x={sx} y={-14} width={sw} height={2} fill={SPAN[s.split].fill} opacity={0.7} />
                      {sw > SPAN[s.split].label.length * 6.2 + 6 && <text className="cc__span" x={sx + 3} y={-19}>{SPAN[s.split].label}</text>}
                    </g>
                  );
                })}
                {yTicks.map((t) => (
                  <g key={t} transform={`translate(0,${y(t)})`}>
                    <line x2={iw} className="cc__grid" />
                    <text className="cc__tick" x={-8} dy="0.32em" textAnchor="end">{fmtCompact(t)}</text>
                  </g>
                ))}
                <text className="cc__ytitle" transform={`translate(${-M.l + 12},${ih / 2}) rotate(-90)`} textAnchor="middle">detections per month</text>
                {ticksX.map(({ yr, i }) => (
                  <g key={yr}><line className="cc__grid" x1={x(i)} x2={x(i)} y1={ih} y2={ih + 4} /><text className="cc__tick" x={x(i)} y={ih + 18} textAnchor="middle">{yr}</text></g>
                ))}
                {i2012 >= 0 && (
                  <g>
                    <line x1={x(i2012)} x2={x(i2012)} y1={-12} y2={ih} stroke="var(--amber)" strokeWidth={1.5} strokeDasharray="3 3" />
                    <text className="cc__mark" x={x(i2012) + 4} y={-3}>2012: sharper satellite starts</text>
                  </g>
                )}
                {joined && (
                  <g>
                    {joined.bandPre && <path d={joined.bandPre} fill={COLOR.estimate} opacity={0.22 * tt} />}
                    <path d={joined.pre} fill="none" stroke={COLOR.aqua} strokeWidth={2.2} opacity={1 - tt} />
                    <path d={joined.pre} fill="none" stroke={COLOR.estimate} strokeWidth={2.2} strokeDasharray="6 3" opacity={tt} />
                    <path d={joined.link} fill="none" stroke="var(--amber)" strokeWidth={2} strokeDasharray="2 3" opacity={0.9} />
                    <path d={joined.post} fill="none" stroke={COLOR.viirs} strokeWidth={2.2} />
                    <text className="cc__direct" x={x(Math.max(0, i2012)) + 6} y={Math.max(12, (joined.hiY || 0) - 10)} style={{ fill: 'var(--amber)' }}>{mode === 'raw' ? 'the jump: the camera changed' : 'jump mostly gone'}</text>
                  </g>
                )}
                {band && <path d={band} fill={COLOR.estimate} opacity={0.22} />}
                {on.static && <path d={paths.static} fill="none" stroke={COLOR.static} strokeWidth={1.4} />}
                {on.terra && <path d={paths.terra} fill="none" stroke={COLOR.terra} strokeWidth={1.2} />}
                {on.aqua && <path d={paths.aqua} fill="none" stroke={COLOR.aqua} strokeWidth={2} />}
                {on.estimate && <path d={paths.estimate} fill="none" stroke={COLOR.estimate} strokeWidth={2} strokeDasharray="6 3" />}
                {on.viirs && <path d={paths.viirs} fill="none" stroke={COLOR.viirs} strokeWidth={2} />}
                {on.viirs && flat.map((p, i) => complete(p) && p.r!.raw_viirs_reference_detections != null ? (
                  <circle key={i} cx={x(i)} cy={y(p.r!.raw_viirs_reference_detections!)} r={n > 160 ? 1.6 : 2.6} fill={COLOR.viirs} />) : null)}
                {flat.map((p, i) => p.r && p.r.extract_status === 'partial' ? SERIES.filter((s) => on[s.key] && s.get(p.r!) != null).map((s) => (
                  <circle key={s.key + i} cx={x(i)} cy={y(s.get(p.r!)!)} r={3} fill="var(--panel)" stroke={COLOR[s.key]} strokeWidth={1.4} />)) : null)}
                {labels.map((l) => <text key={l.k} className="cc__direct" x={iw + 8} y={l.y} dy="0.32em" fill={COLOR[l.k]} style={{ fill: COLOR[l.k] }}>{l.text}</text>)}
                {selIdx >= 0 && <line className="cc__sel" x1={x(selIdx)} x2={x(selIdx)} y1={-4} y2={ih} />}
                {hover != null && <line className="cc__hover" x1={x(hover)} x2={x(hover)} y1={0} y2={ih} />}
                <rect width={iw} height={ih} fill="transparent" style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
                  onPointerMove={(e) => setHover(idxAt(e.clientX, e.currentTarget))}
                  onPointerLeave={() => setHover(null)}
                  onClick={(e) => { const i = idxAt(e.clientX, e.currentTarget); onSelect(flat[i].year, flat[i].month); }} />
              </g>
            </svg>
          </div>
        )}
        {hp && hover != null && (
          <div className="cc__tip" style={{ left: Math.max(0, tipLeft), top: M.t }} role="status">
            <strong>{monthLabel(hp.year, hp.month)}</strong>
            <div className="cc__tipsub">{statusWord(hp.r)}</div>
            {hp.r && SERIES.filter((s) => on[s.key]).map((s) => (
              <div key={s.key} className="cc__tiprow"><i style={{ background: COLOR[s.key] }} />{s.direct}{s.key === 'estimate' ? ' (estimate)' : ''}<b>{fmtNum(s.get(hp.r!))}</b></div>
            ))}
            {on.estimate && hp.r?.estimate_interval_low != null && <div className="cc__tipsub">likely range: {fmtNum(hp.r.estimate_interval_low)} to {fmtNum(hp.r.estimate_interval_high)}</div>}
          </div>
        )}
      </div>
      {jump && <p className="cc__jumpnote" aria-live="polite">{JUMP_SENTENCE[mode!]}</p>}
      <p className="cc__note">
        {log ? 'Squeezed scale: zero sits at the bottom and each step up is about three times more. ' : 'Even scale. '}
        Gaps are missing months (never zero). Hollow dots are part-month counts. The strip on top shows how each period was used (estimated past, learned from, chosen on, checked on). Tap or click a month to select it.
      </p>
      <details className="cc__table">
        <summary>Show the numbers for {selection.year}</summary>
        <table>
          <thead><tr><th>Month</th>{SERIES.filter((s) => on[s.key]).map((s) => <th key={s.key}>{s.direct}</th>)}<th>Status</th></tr></thead>
          <tbody>{yearRows.map((p) => (
            <tr key={p.month}><td>{monthLabel(p.year, p.month)}</td>{SERIES.filter((s) => on[s.key]).map((s) => <td key={s.key}>{p.r ? fmtNum(s.get(p.r)) : '—'}</td>)}<td>{statusWord(p.r)}</td></tr>
          ))}</tbody>
        </table>
      </details>
      <span className="cc__sr" aria-live="polite">{hp ? `${monthLabel(hp.year, hp.month)}: ${hp.r ? SERIES.filter((s) => on[s.key]).map((s) => `${s.direct} ${fmtNum(s.get(hp.r!))}`).join(', ') : 'no data'}` : ''}</span>
      <span hidden>{maxV}</span>
    </div>
  );
}

function Swatch({ k }: { k: SeriesKey }) {
  const c = COLOR[k];
  if (k === 'estimate') return <><rect x="0" y="1" width="22" height="8" fill={c} opacity={0.25} /><line x1="0" x2="22" y1="5" y2="5" stroke={c} strokeWidth="2" strokeDasharray="5 3" /></>;
  if (k === 'viirs') return <><line x1="0" x2="22" y1="5" y2="5" stroke={c} strokeWidth="2" /><circle cx="11" cy="5" r="3" fill={c} /></>;
  return <line x1="0" x2="22" y1="5" y2="5" stroke={c} strokeWidth={k === 'terra' ? 1.4 : 2} />;
}
