import { useCallback, useEffect, useMemo, useState } from 'react';
import { Joyride, EVENTS, STATUS, type EventData, type Step, type TooltipRenderProps } from 'react-joyride';
import { X } from 'lucide-react';
import type { MobileTab } from '../state/store';

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

interface Def { id: string; target: string; title: string; body: string; tab?: MobileTab; placement?: Step['placement'] }

// CSS targets: .tour-welcome (centered, no target element), .tour-area (TopBar area picker), .tour-calendar, .tour-cal-grid,
// .tour-chart, .tour-map, .tour-evidence, .tour-export (evidence actions), .tour-theme (theme + help cluster in the top bar).
const DEFS: Def[] = [
  { id: 'welcome', target: 'body', placement: 'center', title: 'Welcome to Parallax Fire',
    body: 'Two satellites, MODIS and VIIRS, both spot hot pixels from space, but they count them differently. Parallax Fire puts them on one fair scale so you can read one honest fire record. This quick tour takes about a minute.' },
  { id: 'area', target: '.tour-area', title: 'Pick an area',
    body: 'Choose Bangladesh, California or New South Wales. You can also narrow the years you look at.' },
  { id: 'calendar', target: '.tour-calendar', tab: 'calendar', placement: 'auto', title: 'The burning calendar',
    body: 'Each row is a year and each column is a month. The colour shows how much burning the satellites detected. A hatched square means there is no data. Missing is never zero.' },
  { id: 'month', target: '.tour-cal-grid', tab: 'calendar', placement: 'auto', title: 'Click any month',
    body: 'Tap a square to pick that month. The map, chart and evidence all update to match. Arrow keys work too, and Replay plays the months like a movie.' },
  { id: 'map', target: '.tour-map', tab: 'map', placement: 'auto', title: 'Where it burned',
    body: 'The map splits the area into 5 km cells. Brighter cells had more hotspots in the month you picked.' },
  { id: 'chart', target: '.tour-chart', tab: 'calendar', placement: 'auto', title: 'Compare the satellites',
    body: 'Solid lines are what MODIS and VIIRS really counted. The dashed teal line is our estimate of what VIIRS would have counted, with a shaded 80% band. It is learned only from years when both satellites flew, so treat it as an estimate.' },
  { id: 'evidence', target: '.tour-evidence', tab: 'evidence', placement: 'auto', title: 'The evidence drawer',
    body: 'This shows what was observed and what was estimated for the chosen month, plus the sources behind every number.' },
  { id: 'export', target: '.tour-export', tab: 'evidence', placement: 'auto', title: 'Take it with you',
    body: 'Export the data as a CSV file, or print a one-page brief. Estimates stay labelled as estimates.' },
  { id: 'theme', target: '.tour-theme', tab: 'calendar', title: 'Light, dark and help',
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

interface Props { ready: boolean; mobile: boolean; reduced: boolean; setTab: (t: MobileTab) => void; runToken: number }

/** First-visit tour + replay (runToken increments when the user presses "Take the tour"). */
export function Tour({ ready, mobile, reduced, setTab, runToken }: Props) {
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
    // On phones each panel lives in its own tab, so switch tab first and let it render before highlighting.
    before: async () => { if (mobile && d.tab) { setTab(d.tab); await wait(120); } }
  })), [mobile, setTab]);

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
