import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { ActivityRecord, Selection } from '../types';
import { deriveDisplayState, headlineValue, shownAnomalyFlag } from './bridge';
import { MONTHS_SHORT, fmtCompact, fmtNum, monthLabel } from '../data/format';
import { RAMP_CSS, textOn, valueColor, ZERO_COLOR } from './scale';
import { STATE_LABEL, SPLIT_LABEL, type CellState } from './glyphs';
import { RotateCw } from 'lucide-react';
import { Tip, STATE_TIP, SPLIT_TIP } from './Tip';
import '../styles/charts.css';
import { Glyph } from './Glyph';
import { Icon3D } from './icons/Icon3D';
import type { YearStatus } from './useAppData';

interface Props {
  years: number[];
  map: Map<number, ActivityRecord[] | null> | null;
  /** Per-year load status; years without an entry are treated as loaded ('ok'). */
  status?: Map<number, YearStatus>;
  selection: Selection;
  onSelect: (year: number, month: number) => void;
  /** Enter/Space on a cell (compact layout: open the Evidence tab; E2E B4). */
  onActivate?: (year: number, month: number) => void;
  max: number;
  compact?: boolean;
  /** Years that failed to load + whether it looks like offline/not cached; shows a banner with Retry. */
  unavailable?: { years: number[]; offline: boolean; message?: string };
  onRetry?: () => void;
}

const recFor = (map: Props['map'], y: number, m: number) => map?.get(y)?.find((r) => +r.period_start_utc.slice(5, 7) === m) ?? null;

/** Calendar-cell text: '<1' for estimates between 0 and 1, '≈0' for an estimated exact zero; '0' only for observed zero (E2E B3). */
export function cellText(v: number, kind: 'viirs_observed' | 'estimate' | 'none'): string {
  if (kind === 'estimate') {
    if (v === 0) return '≈0';
    if (v > 0 && v < 1) return '<1';
  }
  return fmtCompact(v);
}

export function cellStateFor(r: ActivityRecord | null, yearStatus: YearStatus | undefined): CellState {
  if (yearStatus === 'loading') return 'loading';
  if (yearStatus === 'error') return 'unavailable';
  return deriveDisplayState(r);
}

export function Calendar({ years, map, status, selection, onSelect, onActivate, max, compact, unavailable, onRetry }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusWanted = useRef(false);

  useEffect(() => {
    if (!focusWanted.current) return;
    focusWanted.current = false;
    gridRef.current?.querySelector<HTMLElement>('[data-sel="true"]')?.focus();
  }, [selection.year, selection.month]);

  // The grid scrolls inside its own area: keep the selected month in view (below the sticky header, right of the year column).
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const el = sc.querySelector<HTMLElement>('[data-sel="true"]');
    if (!el) return;
    const yr = sc.querySelector<HTMLElement>('.cg-yr');
    const pad = (yr?.offsetWidth ?? 40) + 8;
    const sr = sc.getBoundingClientRect(), er = el.getBoundingClientRect();
    const left = er.left - sr.left + sc.scrollLeft, right = left + er.width;
    if (left - pad < sc.scrollLeft) sc.scrollLeft = Math.max(0, left - pad);
    else if (right + 8 > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = right + 8 - sc.clientWidth;
    const head = sc.querySelector<HTMLElement>('.cg-row--head')?.offsetHeight ?? 28;
    const top = er.top - sr.top + sc.scrollTop, bottom = top + er.height;
    if (top - head < sc.scrollTop) sc.scrollTop = Math.max(0, top - head - 4);
    else if (bottom + 8 > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom + 8 - sc.clientHeight;
  }, [selection.year, selection.month, map]);

  const onKey = (e: KeyboardEvent) => {
    const yi = years.indexOf(selection.year);
    let y = yi < 0 ? 0 : yi, m = selection.month;
    switch (e.key) {
      case 'Enter':
      case ' ':
        if (onActivate) { e.preventDefault(); onActivate(selection.year, selection.month); }
        return;
      case 'ArrowRight': if (m < 12) m++; else if (y < years.length - 1) { m = 1; y++; } break;
      case 'ArrowLeft': if (m > 1) m--; else if (y > 0) { m = 12; y--; } break;
      case 'ArrowDown': y = Math.min(years.length - 1, y + 1); break;
      case 'ArrowUp': y = Math.max(0, y - 1); break;
      case 'Home': m = 1; if (e.ctrlKey) y = 0; break;
      case 'End': m = 12; if (e.ctrlKey) y = years.length - 1; break;
      case 'PageUp': y = Math.max(0, y - 5); break;
      case 'PageDown': y = Math.min(years.length - 1, y + 5); break;
      default: return;
    }
    e.preventDefault();
    focusWanted.current = true;
    onSelect(years[y], m);
  };

  const selInRange = years.includes(selection.year);
  const unavailYears = unavailable?.years.filter((y) => years.includes(y)) ?? [];

  return (
    <div className="cg" data-chart="calendar">
      {unavailYears.length > 0 && (
        <div className="cal__unavail" role="status">
          <Glyph state="unavailable" size={14} />
          <span>
            <b>{unavailYears.length === years.length ? 'This place is unavailable' : `${unavailYears.length} year${unavailYears.length > 1 ? 's' : ''} unavailable`}</b>
            {' — '}{unavailable?.offline ? 'not saved for offline use. Reconnect to load it.' : `could not load${unavailable?.message ? ` (${unavailable.message})` : ''}.`}
            {' '}This is not missing data.
          </span>
          {onRetry && <button className="btn btn--sm" onClick={onRetry}><Icon3D icon={RotateCw} tone="current" size={14} />Retry</button>}
        </div>
      )}
      <div ref={scrollRef} className="tour-cal-grid cg-scroll" data-cal-grid>
        <div className="cg-grid" role="grid" aria-label="Burning calendar: years by months. Use arrow keys to move." aria-rowcount={years.length + 1} ref={gridRef} onKeyDown={onKey}>
          <div className="cg-row cg-row--head" role="row">
            <div className="cg-yr cg-yr--head" role="columnheader"><span className="cg-sr">Year</span></div>
            {MONTHS_SHORT.map((m, i) => <div key={m} className={'cg-mh' + (selection.month === i + 1 ? ' is-on' : '')} role="columnheader">{m}</div>)}
          </div>
          {years.map((y, yi) => {
            const ys = status?.get(y) ?? 'ok';
            const recs = map?.get(y) ?? null;
            const split = recs?.find((r) => r.split !== 'none')?.split ?? 'none';
            return (
              <div key={y} className={'cg-row' + (y === 2012 && yi > 0 ? ' cg-row--viirs' : '')} role="row">
                <Tip text={SPLIT_TIP[split]} side="right"><div className={'cg-yr sp-' + split + (selection.year === y ? ' is-on' : '')} role="rowheader" aria-label={`${y}${split !== 'none' ? ', ' + SPLIT_LABEL[split] : ''}`}>{y}</div></Tip>
                {MONTHS_SHORT.map((_, mi) => {
                  const m = mi + 1;
                  const r = recFor(map, y, m);
                  const st = cellStateFor(r, ys);
                  const hv = headlineValue(r);
                  const v = st === 'missing' || st === 'unsupported' || st === 'unavailable' || st === 'loading' ? null : hv.value;
                  const bg = valueColor(v, max);
                  const sel = selection.year === y && selection.month === m;
                  const tabbable = sel || (!selInRange && yi === 0 && mi === 0);
                  const flag = st === 'unavailable' || st === 'loading' ? null : shownAnomalyFlag(r, st);
                  const observedZero = v === 0 && hv.kind === 'viirs_observed';
                  const label = `${monthLabel(y, m)}: ${STATE_LABEL[st]}${v != null ? `, ${hv.kind === 'estimate' ? 'estimated' : 'VIIRS'} ${hv.kind === 'estimate' && v < 1 ? (v === 0 ? 'about 0' : 'less than 1') : fmtNum(v)} detections` : ''}${flag === 'high' ? ', unusually high' : flag === 'low' ? ', unusually low' : ''}`;
                  return (
                    <div key={m} role="gridcell" aria-selected={sel} aria-label={label} title={label} aria-busy={st === 'loading' || undefined}
                      tabIndex={tabbable ? 0 : -1} data-sel={sel}
                      className={`cg-cell st-${st}${sel ? ' is-sel' : ''}${observedZero ? ' is-zero' : ''}`}
                      style={bg ? { background: bg, color: textOn(v, max) } : undefined}
                      onClick={() => onSelect(y, m)}>
                      <Glyph state={st} size={8} className="cg-glyph" />
                      {v != null && <span className="cg-val" aria-hidden>{cellText(v, hv.kind)}</span>}
                      {flag && <span className={'cg-anom cg-anom--' + flag} aria-hidden />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <CalendarLegend max={max} />
    </div>
  );
}

export function CalendarLegend({ max }: { max: number }) {
  const items: { st: CellState; text: string }[] = [
    { st: 'observed', text: 'measured by the sharper satellite' },
    { st: 'estimated', text: 'estimate' },
    { st: 'partial', text: 'part of the month only' },
    { st: 'missing', text: 'no data' },
    { st: 'unsupported', text: 'no trustworthy estimate' },
    { st: 'unavailable', text: 'could not load' }
  ];
  return (
    <div className="cg-legend" data-cal-legend aria-label="Calendar legend">
      <div className="cg-legend__ramp">
        <span className="cg-legend__sw" style={{ background: ZERO_COLOR }} title="Measured zero" />
        <span>0</span>
        <span className="cg-legend__bar" style={{ background: RAMP_CSS }} />
        <span>{fmtCompact(max)}</span>
        <span className="cg-legend__unit">detections per month, sharper-satellite scale (squeezed scale)</span>
      </div>
      <ul className="cg-legend__items">
        {items.map((it) => (
          <Tip key={it.st} text={STATE_TIP[it.st]}><li tabIndex={0} className={'cg-legend__st cg-legend__st--' + it.st}>
            <span className={'cg-legend__chip st-' + it.st}><Glyph state={it.st} size={10} /></span>{it.text}</li></Tip>
        ))}
        <li><span className="cg-legend__tri cg-legend__tri--high" aria-hidden />unusually high for the season</li>
        <li><span className="cg-legend__tri cg-legend__tri--low" aria-hidden />unusually low for the season</li>
        <li><span className="cg-legend__viirs" aria-hidden />sharper satellite flies from 2012</li>
      </ul>
    </div>
  );
}
