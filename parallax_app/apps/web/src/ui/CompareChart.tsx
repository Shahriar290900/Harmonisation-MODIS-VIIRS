import { useMemo, useState } from 'react';
import { actions, useAppState } from './bridge';
import { scaleLinear, scaleSymlog } from 'd3-scale';
import { area, line } from 'd3-shape';
import type { ActivityRecord, SeriesKey, Selection } from '../types';
import { SERIES_COLORS } from '../types';
import { fmtCompact, fmtNum, monthLabel } from '../data/format';
import { useSize } from './hooks';

type Pt = { year: number; month: number; r: ActivityRecord | null };
interface Props { flat: Pt[]; selection: Selection; onSelect: (y: number, m: number) => void; height?: number }

const SERIES: { key: SeriesKey; label: string; title?: string; get: (r: ActivityRecord) => number | null }[] = [
  { key: 'viirs', label: 'VIIRS (raw)', get: (r) => r.raw_viirs_reference_detections },
  { key: 'aqua', label: 'Aqua (raw)', get: (r) => r.raw_modis_detections },
  { key: 'estimate', label: 'Estimate · 80% band', title: 'VIIRS-scale estimate from Aqua MODIS with 80% interval', get: (r) => r.estimated_viirs_reference_detections },
  { key: 'terra', label: 'Terra', title: 'Terra MODIS — shown separately, never pooled into the estimate', get: (r) => r.raw_modis_terra_detections },
  { key: 'static', label: 'Static sources', title: 'VIIRS type-2 static land sources (e.g. kilns, industry)', get: (r) => r.static_source_detections_viirs }
];
const SPAN_LABEL: Record<string, string> = { backcast: 'backcast', train: 'train', val: 'val', test: 'test' };
const SPAN_FILL: Record<string, string> = { backcast: 'rgba(20,184,166,0.07)', train: 'rgba(147,164,195,0.06)', val: 'rgba(139,92,246,0.09)', test: 'rgba(245,158,11,0.09)' };

export function CompareChart({ flat, selection, onSelect, height = 260 }: Props) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const log = useAppState((s) => s.scale) === 'log';
  const setLog = (l: boolean) => actions.setScale(l ? 'log' : 'linear');
  const on = useAppState((s) => s.series);
  const [hover, setHover] = useState<number | null>(null);

  const M = { l: 44, r: 12, t: 18, b: 24 };
  const W = Math.max(280, w), H = height;
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const n = flat.length;

  const { x, y, maxV } = useMemo(() => {
    let mx = 1;
    for (const p of flat) {
      if (!p.r) continue;
      for (const s of SERIES) if (on[s.key]) { const v = s.get(p.r); if (v != null && v > mx) mx = v; }
      if (on.estimate && p.r.estimate_interval_high != null) mx = Math.max(mx, p.r.estimate_interval_high);
    }
    const x = scaleLinear().domain([0, Math.max(1, n - 1)]).range([0, iw]);
    const y = (log ? scaleSymlog().constant(1) : scaleLinear()).domain([0, mx * 1.05]).range([ih, 0]).nice();
    return { x, y, maxV: mx };
  }, [flat, on, log, iw, ih, n]);

  const complete = (p: Pt) => p.r != null && p.r.extract_status === 'complete';
  const paths = useMemo(() => {
    const out: Partial<Record<SeriesKey, string>> = {};
    for (const s of SERIES) {
      if (!on[s.key]) continue;
      const g = line<Pt>().defined((p) => complete(p) && s.get(p.r!) != null).x((_, i) => x(i)).y((p) => y(s.get(p.r!)!));
      out[s.key] = g(flat) ?? '';
    }
    return out;
  }, [flat, on, x, y]);
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
    return out.filter((s) => s.split !== 'none');
  }, [flat]);

  const selIdx = flat.findIndex((p) => p.year === selection.year && p.month === selection.month);
  const yearTicks = flat.map((p, i) => ({ p, i })).filter(({ p }) => p.month === 1);
  const step = Math.ceil(yearTicks.length / Math.max(2, Math.floor(iw / 46)));
  const yTicks = log ? symlogTicks(maxV) : y.ticks(5);

  const idxAt = (clientX: number, el: SVGRectElement) => {
    const b = el.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(x.invert(clientX - b.left))));
  };
  const hp = hover != null ? flat[hover] : null;

  return (
    <div className="chart">
      <div className="chart__bar">
        <ul className="chart__legend" aria-label="Series (click to toggle)">
          {SERIES.map((s) => (
            <li key={s.key}>
              <button className={'ser-tag' + (on[s.key] ? ' is-on' : '')} title={s.title} aria-pressed={on[s.key]} onClick={() => actions.toggleSeries(s.key)}>
                <svg width="22" height="10" aria-hidden><SeriesSwatch k={s.key} /></svg>{s.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="seg" role="group" aria-label="Y axis scale">
          <button className={log ? 'is-on' : ''} aria-pressed={log} onClick={() => setLog(true)}>log</button>
          <button className={!log ? 'is-on' : ''} aria-pressed={!log} onClick={() => setLog(false)}>linear</button>
        </div>
      </div>
      <div className="chart__plot" ref={ref}>
        {w > 0 && n > 0 && (
          <svg width={W} height={H} role="img" aria-label="Monthly detections by sensor over time. Gaps mean missing data, not zero.">
            <g transform={`translate(${M.l},${M.t})`}>
              {spans.map((s) => (
                <g key={s.split + s.a}>
                  <rect x={x(s.a) - x(0.5) + x(0)} y={0} width={Math.max(1, x(s.b) - x(s.a) + x(1) - x(0))} height={ih} fill={SPAN_FILL[s.split]} />
                  {x(s.b) - x(s.a) > 18 && <text className="chart__span" x={x(s.a) + 3} y={-5}>{SPAN_LABEL[s.split] ?? s.split}</text>}
                </g>
              ))}
              {yTicks.map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x2={iw} className="chart__grid" />
                  <text className="chart__tick" x={-6} dy="0.32em" textAnchor="end">{fmtCompact(t)}</text>
                </g>
              ))}
              {yearTicks.filter((_, k) => k % step === 0).map(({ p, i }) => (
                <text key={p.year} className="chart__tick" x={x(i)} y={ih + 16} textAnchor="middle">{p.year}</text>
              ))}
              {band && <path d={band} fill={SERIES_COLORS.estimate} opacity={0.22} />}
              {on.static && <path d={paths.static} fill="none" stroke={SERIES_COLORS.static} strokeWidth={1.4} />}
              {on.terra && <path d={paths.terra} fill="none" stroke={SERIES_COLORS.terra} strokeWidth={1} />}
              {on.aqua && <path d={paths.aqua} fill="none" stroke={SERIES_COLORS.aqua} strokeWidth={1.8} />}
              {on.estimate && <path d={paths.estimate} fill="none" stroke={SERIES_COLORS.estimate} strokeWidth={1.8} strokeDasharray="5 3" />}
              {on.viirs && <path d={paths.viirs} fill="none" stroke={SERIES_COLORS.viirs} strokeWidth={1.8} />}
              {on.viirs && flat.map((p, i) => complete(p) && p.r!.raw_viirs_reference_detections != null ? (
                <circle key={i} cx={x(i)} cy={y(p.r!.raw_viirs_reference_detections!)} r={n > 160 ? 1.6 : 2.6} fill={SERIES_COLORS.viirs} />) : null)}
              {/* partial months: hollow points, never joined into the line */}
              {flat.map((p, i) => p.r && p.r.extract_status === 'partial' ? SERIES.filter((s) => on[s.key] && s.get(p.r!) != null).map((s) => (
                <circle key={s.key + i} cx={x(i)} cy={y(s.get(p.r!)!)} r={2.4} fill="none" stroke={SERIES_COLORS[s.key]} strokeWidth={1.2} />)) : null)}
              {selIdx >= 0 && <line className="chart__sel" x1={x(selIdx)} x2={x(selIdx)} y1={-4} y2={ih} />}
              {hover != null && <line className="chart__hover" x1={x(hover)} x2={x(hover)} y1={0} y2={ih} />}
              <rect width={iw} height={ih} fill="transparent" style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
                onPointerMove={(e) => setHover(idxAt(e.clientX, e.currentTarget))}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => { const i = idxAt(e.clientX, e.currentTarget); onSelect(flat[i].year, flat[i].month); }} />
            </g>
          </svg>
        )}
        {hp && hover != null && (
          <div className="tip" style={{ left: Math.min(W - 190, Math.max(0, M.l + x(hover) + 10)), top: 8 }} role="status">
            <strong>{monthLabel(hp.year, hp.month)}</strong>
            {hp.r ? <>
              {hp.r.extract_status !== 'complete' && <div className="tip__warn">{hp.r.extract_status} month</div>}
              {SERIES.filter((s) => on[s.key]).map((s) => (
                <div key={s.key} className="tip__row"><i style={{ background: SERIES_COLORS[s.key] }} />{s.label.split(' (')[0].split(' ·')[0]}<b>{fmtNum(s.get(hp.r!))}</b></div>
              ))}
              {on.estimate && hp.r.estimate_interval_low != null && <div className="tip__sub">80%: {fmtNum(hp.r.estimate_interval_low)}–{fmtNum(hp.r.estimate_interval_high)}</div>}
            </> : <div className="tip__warn">no record (missing)</div>}
          </div>
        )}
      </div>
      <p className="chart__note">Gaps = missing (never zero) · hollow points = partial months · shading = model splits · click to select a month</p>
    </div>
  );
}

function SeriesSwatch({ k }: { k: SeriesKey }) {
  const c = SERIES_COLORS[k];
  if (k === 'estimate') return <><rect x="0" y="1" width="22" height="8" fill={c} opacity={0.25} /><line x1="0" x2="22" y1="5" y2="5" stroke={c} strokeWidth="2" strokeDasharray="5 3" /></>;
  if (k === 'viirs') return <><line x1="0" x2="22" y1="5" y2="5" stroke={c} strokeWidth="2" /><circle cx="11" cy="5" r="3" fill={c} /></>;
  return <line x1="0" x2="22" y1="5" y2="5" stroke={c} strokeWidth={k === 'terra' ? 1.2 : 2} />;
}

function symlogTicks(max: number): number[] {
  const t = [0];
  for (let p = 1; p <= max * 1.05; p *= 10) { t.push(p); if (p * 3 <= max * 1.05) t.push(p * 3); }
  return t;
}
