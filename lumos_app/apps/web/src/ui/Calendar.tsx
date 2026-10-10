import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { ActivityRecord, Selection } from '../types';
import { deriveDisplayState, headlineValue, shownAnomalyFlag } from './bridge';
import { MONTHS_SHORT, fmtCompact, fmtNum, monthLabel } from '../data/format';
import { RAMP_CSS, textOn, valueColor, ZERO_COLOR } from './scale';
import { LEGEND_STATES, STATE_LABEL, SPLIT_LABEL, type CellState } from './glyphs';
import { RotateCw } from 'lucide-react';
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

const SPLIT_SHORT: Record<string, string> = { train: 'train', val: 'val', test: 'test', backcast: 'back' };
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

  // Compact layout scrolls horizontally: keep the selected month in view.
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!compact || !sc) return;
    const el = sc.querySelector<HTMLElement>('[data-sel="true"]');
    if (!el) return;
    const yr = sc.querySelector<HTMLElement>('.cal__row:not(.cal__row--head) .cal__yr');
    const pad = (yr?.offsetWidth ?? 40) + 8;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    if (left - pad < sc.scrollLeft) sc.scrollLeft = Math.max(0, left - pad);
    else if (right + 8 > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = right + 8 - sc.clientWidth;
  }, [compact, selection.year, selection.month, map]);

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
    <div className="cal">
      {unavailYears.length > 0 && (
        <div className="cal__unavail" role="status">
          <Glyph state="unavailable" size={14} />
          <span>
            <b>{unavailYears.length === years.length ? 'This area is unavailable' : `${unavailYears.length} year${unavailYears.length > 1 ? 's' : ''} unavailable`}</b>
            {' — '}{unavailable?.offline ? 'not cached for offline use. Reconnect to load it.' : `failed to load${unavailable?.message ? ` (${unavailable.message})` : ''}.`}
            {' '}This is not missing data.
          </span>
          {onRetry && <button className="btn btn--sm" onClick={onRetry}><Icon3D icon={RotateCw} tone="current" size={14} />Retry</button>}
        </div>
      )}
      <div ref={scrollRef} className={'cal__scroll' + (compact ? ' cal__scroll--compact' : '')}>
        <div className={'cal__grid' + (compact ? ' cal__grid--compact' : '')} role="grid" aria-label="Burning calendar: years by months. Use arrow keys to move." aria-rowcount={years.length + 1} ref={gridRef} onKeyDown={onKey}>
          <div className="cal__row cal__row--head" role="row">
            <div className="cal__yr" role="columnheader" aria-label="Year" />
            {MONTHS_SHORT.map((m, i) => <div key={m} className={'cal__mh' + (selection.month === i + 1 ? ' is-on' : '')} role="columnheader">{m}</div>)}
            <div className="cal__split" role="columnheader" aria-label="Split">{compact ? '' : 'split'}</div>
          </div>
          {years.map((y, yi) => {
            const recs = map?.get(y) ?? null;
            const ys = status?.get(y) ?? 'ok';
            const split = recs?.find((r) => r.split !== 'none')?.split ?? 'none';
            const boundary = y === 2012 && yi > 0;
            return (
              <div key={y} className={'cal__row' + (boundary ? ' cal__row--viirs' : '')} role="row">
                <div className={'cal__yr' + (selection.year === y ? ' is-on' : '')} role="rowheader">{y}</div>
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
                      className={`cal__cell st-${st}${sel ? ' is-sel' : ''}${observedZero ? ' is-zero' : ''}`}
                      style={bg ? { background: bg, color: textOn(v, max) } : undefined}
                      onClick={() => onSelect(y, m)}>
                      <Glyph state={st} size={compact ? 9 : 8} className="cal__glyph" />
                      {v != null && <span className="cal__val" aria-hidden>{cellText(v, hv.kind)}</span>}
                      {flag && <span className={'cal__anom cal__anom--' + flag} aria-hidden />}
                    </div>
                  );
                })}
                <div className={'cal__split sp-' + split} role="gridcell" aria-label={`Split ${SPLIT_LABEL[split]}`}>{compact ? '' : SPLIT_SHORT[split] ?? ''}</div>
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
  return (
    <div className="legend" aria-label="Calendar legend">
      <div className="legend__ramp">
        <span className="legend__sw" style={{ background: ZERO_COLOR }} title="Observed zero" />
        <span className="legend__lab">0</span>
        <span className="legend__bar" style={{ background: RAMP_CSS }} />
        <span className="legend__lab">{fmtCompact(max)}</span>
        <span className="legend__unit">VIIRS-scale detections / month · log scale · “&lt;1” = estimate below 1</span>
      </div>
      <ul className="legend__glyphs">
        {LEGEND_STATES.map((k) => (
          <li key={k} className={'legend__st legend__st--' + k}><Glyph state={k} size={11} className="legend__g" />{k === 'unavailable' ? 'Unavailable (not cached / failed)' : STATE_LABEL[k].split(' (')[0]}</li>
        ))}
        <li title="Not shown on partial or missing months"><span className="legend__tri legend__tri--high" aria-hidden />Unusually high</li>
        <li title="Not shown on partial or missing months"><span className="legend__tri legend__tri--low" aria-hidden />Unusually low</li>
        <li><span className="legend__viirs" aria-hidden />VIIRS era (since 2012)</li>
      </ul>
    </div>
  );
}
