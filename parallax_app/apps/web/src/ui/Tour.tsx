import { useCallback, useEffect, useMemo, useState } from 'react';
import { Joyride, EVENTS, STATUS, type EventData, type Step, type TooltipRenderProps } from 'react-joyride';
import { X } from 'lucide-react';
import { routeHash, routeOfHash, selectionStore, type Route } from '../state/store';

const LS_KEY = 'parallax.tour.v1';

/** Tests / deep links opt out with ?notour or #...&notour=1. */
function tourSuppressed(): boolean {
  try {
    const s = `${location.search}${location.hash}`;
    return /(?:[?&#/]|^)notour(?:=(?:1|true))?(?:$|[&/#])/.test(s);
  } catch { return false; }
}
const SUPPRESSED = tourSuppressed();
function seen(): boolean { try { return localStorage.getItem(LS_KEY) === 'done'; } catch { return false; } }
function markSeen() { try { localStorage.setItem(LS_KEY, 'done'); } catch { /* private mode */ } }

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Def { id: string; target: string; title: string; body: string; route?: Route; placement?: Step['placement'] }

// CSS targets: [data-nav] (page navigation), .tour-area (place picker), .tour-calendar, .tour-cal-grid, .tour-evidence
// (month summary), .tour-map, .tour-chart, .tour-method, .tour-export (downloads), .tour-theme (theme + help in the top bar).
const DEFS: Def[] = [
  { id: 'welcome', target: 'body', placement: 'center', route: 'calendar', title: 'Welcome to Parallax Fire',
    body: 'Two satellites spot hot pixels from space, but they count them differently. Parallax Fire puts them on one fair scale so you can read one honest fire record. This quick tour takes about a minute.' },
  { id: 'nav', target: '[data-nav]', placement: 'auto', title: 'Pages, one place',
    body: 'Use the menu to move between pages. The place, year and month you pick follow you from page to page.' },
  { id: 'area', target: '.tour-area', route: 'calendar', title: 'Pick a place',
    body: 'Search for a country, division or state. You can also narrow the years you look at.' },
  { id: 'calendar', target: '.tour-calendar', route: 'calendar', placement: 'auto', title: 'The burning calendar',
    body: 'Each row is a year and each column is a month. The colour shows how many fire detections the satellites recorded. A hatched square means there is no data. No data is never shown as zero.' },
  { id: 'month', target: '.tour-cal-grid', route: 'calendar', placement: 'auto', title: 'Click any month',
    body: 'Tap a square to pick that month. The summary below, the map and the chart all follow it. Arrow keys work too, and Replay plays the months like a movie.' },
  { id: 'summary', target: '.tour-evidence', route: 'calendar', placement: 'auto', title: 'What happened that month',
    body: 'A short plain-words summary of what was counted and what was estimated for the month you picked.' },
  { id: 'map', target: '.tour-map', route: 'map', placement: 'auto', title: 'Where it burned',
    body: 'The map splits the place into 5 km squares. Brighter squares had more fire detections in the month you picked.' },
  { id: 'chart', target: '.tour-chart', route: 'sensors', placement: 'auto', title: 'The two satellites',
    body: 'Solid lines are what each satellite really counted. The dashed teal line is our estimate of what the sharper satellite would have counted, with a shaded likely range. It is learned only from years when both satellites flew.' },
  { id: 'method', target: '.tour-method', route: 'method', placement: 'auto', title: 'How good is the estimate?',
    body: 'This page shows, place by place, how far off the estimate was on years it had never seen, compared with simple rules.' },
  { id: 'export', target: '.tour-export', route: 'data', placement: 'auto', title: 'Take it with you',
    body: 'Download the data as a spreadsheet (CSV), or print a one-page brief. Estimates stay labelled as estimates.' },
  { id: 'theme', target: '.tour-theme', route: 'data', title: 'Light, dark and help',
    body: 'Switch between light and dark here. The ? button replays this tour any time.' }
];

function TourTooltip(p: TooltipRenderProps) {
  const { index, size, isLastStep, step, backProps, closeProps, primaryProps, skipProps, tooltipProps } = p;
  return (
    <div className="tour" {...tooltipProps} aria-label={typeof step.title === 'string' ? step.title : 'Tour'}>
      <button className="tour__x" {...closeProps} aria-label="Close tour" title="Close tour"><X size={16} aria-hidden /></button>
      <p className="tour__count">Step {index + 1} of {size}</p>
      <div className="tour__bar" aria-hidden><i style={{ width: `${((index + 1) / size) * 100}%` }} /></div>
      {step.title && <h3 className="tour__title">{step.title}</h3>}
      <div className="tour__body">{step.content}</div>
      <div className="tour__foot">
        {!isLastStep ? <button className="tour__skip" {...skipProps}>Skip tour</button> : <span />}
        <span className="tour__nav">
          {index > 0 && <button className="btn btn--sm" {...backProps}>Back</button>}
          <button className="btn btn--sm btn--primary" {...primaryProps}>{isLastStep ? 'Done' : 'Next'}</button>
        </span>
      </div>
    </div>
  );
}

interface Props { ready: boolean; reduced: boolean; runToken: number }

/** First-visit tour + replay (runToken increments when the user presses "Take the tour"). */
export function Tour({ ready, reduced, runToken }: Props) {
  const [run, setRun] = useState(false);
  const [first] = useState(() => !SUPPRESSED && !seen());
  useEffect(() => { if (ready && first) { const t = window.setTimeout(() => setRun(true), 900); return () => clearTimeout(t); } }, [ready, first]);
  useEffect(() => { if (runToken > 0 && ready) setRun(true); }, [runToken, ready]);

  const steps = useMemo<Step[]>(() => DEFS.map((d) => ({
    id: d.id,
    target: d.target,
    title: d.title,
    content: d.body,
    placement: d.placement ?? 'bottom',
    skipBeacon: true,
    // Each step lives on its own page: open that page first (keeping the selection) and let it render.
    before: async () => {
      if (d.route && routeOfHash(location.hash) !== d.route) { location.hash = routeHash(d.route, selectionStore.get()); await wait(700); }
    }
  })), []);

  const onEvent = useCallback((data: EventData) => {
    if (data.type === EVENTS.TOUR_END || (data.type === EVENTS.TOUR_STATUS && (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED))) {
      markSeen(); setRun(false);
    }
  }, []);

  if (!ready) return null;
  return (
    <Joyride
      steps={steps} run={run} continuous onEvent={onEvent}
      tooltipComponent={TourTooltip}
      scrollToFirstStep={false}
      options={{
        skipScroll: reduced, scrollDuration: reduced ? 0 : 300, showProgress: true, skipBeacon: true,
        zIndex: 1000, spotlightPadding: 6, spotlightRadius: 10, overlayClickAction: false,
        overlayColor: 'color-mix(in srgb, var(--bg) 70%, transparent)', arrowColor: 'var(--bg-2)', backgroundColor: 'var(--bg-2)',
        primaryColor: 'var(--text)', textColor: 'var(--text)', targetWaitTimeout: 1500
      }}
      locale={{ back: 'Back', close: 'Close', last: 'Done', next: 'Next', skip: 'Skip tour' }}
    />
  );
}
