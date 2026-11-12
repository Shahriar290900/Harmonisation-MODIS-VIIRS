import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { PlacePicker } from '../shell/PlacePicker';
import { useMonthData, useWorkspace } from '../shell/workspace';
import { Calendar } from '../ui/Calendar';
import { Evidence } from '../ui/Evidence';
import { Icon3D } from '../ui/icons/Icon3D';
import { Tip } from '../ui/Tip';
import { selectionStore, setSelection } from '../ui/bridge';
import { useMedia, useReducedMotion } from '../ui/hooks';
import { monthLabel } from '../data/format';
import { Info } from 'lucide-react';

export default function CalendarPage() {
  const { core, sel, region, allYears } = useWorkspace();
  const d = useMonthData();
  const phone = useMedia('(max-width: 699px)');
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const { from, to, years, flat } = d;
  const idx = flat.findIndex((p) => p.year === sel.year && p.month === sel.month);
  const firstError = d.errorYears.length ? d.act.errors.get(d.errorYears[0]) : undefined;

  // Replay steps month by month through the visible years. Hash writes are throttled while it plays.
  const selRef = useRef(sel); selRef.current = sel;
  useEffect(() => { selectionStore.holdSync(playing); }, [playing]);
  useEffect(() => () => selectionStore.holdSync(false, { flush: false }), []);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = selRef.current;
      let y = s.year, m = s.month + 1;
      if (m > 12) { m = 1; y++; }
      if (y > to || y < from) { setPlaying(false); return; }
      setSelection({ year: y, month: m });
    }, reduced ? 1200 : 380);
    return () => clearInterval(id);
  }, [playing, from, to, reduced]);
  const startReplay = () => {
    if (!playing && sel.year === to && sel.month === 12) setSelection({ year: from, month: 1 });
    setPlaying(!playing);
  };

  return (
    <Page route="calendar">
      <PageHead title="Burning calendar" lead="Pick a place to see fire detections month by month: older-satellite counts from 2001, estimates from 2003 until 2012, then the sharper satellite’s own counts.">
        <PlacePicker regions={core.regions} aoiId={sel.aoiId} allowed={core.manifest.aois} />
        <div className="field field--range">
          <span className="field__lab">Years</span>
          <select aria-label="From year" value={from} onChange={(e) => d.setYears(Math.min(+e.target.value, to), to)}>{allYears.map((y) => <option key={y}>{y}</option>)}</select>
          <span className="muted" aria-hidden>to</span>
          <select aria-label="To year" value={to} onChange={(e) => d.setYears(from, Math.max(+e.target.value, from))}>{allYears.map((y) => <option key={y}>{y}</option>)}</select>
        </div>
      </PageHead>
      {region?.note && <p className="region-note" role="note"><Icon3D icon={Info} tone="cyan" size={14} />{region.note}</p>}
      <section className="panel cal-panel tour-calendar" aria-label="Burning calendar">
        <div className="panel__head">
          <h2 className="panel__title">{region?.name} <span className="muted">· {monthLabel(sel.year, sel.month)} selected</span></h2>
          <div className="replay">
            <Tip text="Play the calendar like a movie, one month at a time. Pause any time, or drag the slider to scrub."><button className={'btn btn--sm' + (playing ? ' btn--primary' : '')} onClick={startReplay} aria-pressed={playing} aria-label={playing ? 'Pause replay' : 'Replay month by month'}>
              <Icon3D icon={playing ? Pause : Play} tone={playing ? 'current' : 'amber'} size={14} filled />{playing ? 'Pause' : 'Replay'}
            </button></Tip>
            <input className="scrub" type="range" min={0} max={Math.max(0, flat.length - 1)} value={Math.max(0, idx)} aria-label="Scrub through months"
              aria-valuetext={monthLabel(sel.year, sel.month)}
              onChange={(e) => { const p = flat[+e.target.value]; if (p) setSelection({ year: p.year, month: p.month }); }} />
          </div>
        </div>
        <Calendar years={years} map={d.act.map} status={d.act.status} selection={sel} onSelect={(year, month) => setSelection({ year, month })} max={d.max} compact={phone}
          unavailable={d.errorYears.length ? { years: d.errorYears, offline: d.act.offline, message: firstError } : undefined} onRetry={d.act.retry} />
      </section>
      <div className="tour-evidence">
        <Evidence record={d.record} state={d.monthState} yearError={d.act.errors.get(sel.year)} offline={d.act.offline} onRetry={d.act.retry}
          selection={sel} region={region} manifest={core.manifest} snapshotPath={core.snapshotPath} sources={core.sources} allRecords={d.allRecords} noActions />
      </div>
      <NextSteps to={['map', 'sensors', 'method']} />
    </Page>
  );
}
