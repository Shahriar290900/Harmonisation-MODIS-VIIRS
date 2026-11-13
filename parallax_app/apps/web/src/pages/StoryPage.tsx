// #/story: "March 2024 in Bangladesh". Five short steps, each with one real visual. Every number comes from the snapshot at runtime.
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Page, PageHead } from '../shell/PageParts';
import { useWorkspace } from '../shell/workspace';
import { useCells, useGeo } from '../ui/useAppData';
import { Calendar } from '../ui/Calendar';
import { CompareChart } from '../ui/CompareChart';
import { MapPanel } from '../ui/MapPanel';
import { monthLabel } from '../data/format';
import { fmt, STORY_AOI, STORY_MONTH, STORY_YEAR, useStoryData } from '../story/useStoryData';
import '../styles/story.css';

const N = 5;
const hashStep = () => { const m = /[?&]step=(\d+)/.exec(location.hash); return m ? Math.max(1, Math.min(N, Number(m[1]))) - 1 : 0; };
// The selection store rewrites the hash at start-up and drops "step"; read it once while this module loads.
let first: number | null = typeof location !== 'undefined' && /[?&]step=\d+/.test(location.hash) ? hashStep() : null;

export default function StoryPage() {
  const { core } = useWorkspace();
  const d = useStoryData();
  const [step, setStep] = useState(() => { const s = first ?? hashStep(); first = null; return s; });
  const go = useCallback((n: number) => setStep(Math.max(0, Math.min(N - 1, n))), []);
  useEffect(() => {
    const base = location.hash.replace(/([?&])step=\d+&?/, '$1').replace(/[?&]$/, '');
    const h = `${base}${base.includes('?') ? '&' : '?'}step=${step + 1}`;
    if (location.hash !== h) history.replaceState(history.state, '', `${location.pathname}${location.search}${h}`);
  }, [step]);
  useEffect(() => {
    const on = () => { if (/[?&]step=\d+/.test(location.hash)) setStep(hashStep()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('[data-cal-grid], input, select, textarea, .maplibregl-map')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1); }
  };

  const r = d.rec;
  const sel = { aoiId: STORY_AOI, year: STORY_YEAR, month: STORY_MONTH };
  const name = d.region?.name ?? 'Bangladesh';
  const sharp = r?.raw_viirs_reference_detections ?? null, old = r?.raw_modis_detections ?? null;
  const est = r?.estimated_viirs_reference_detections ?? null, lo = r?.estimate_interval_low ?? null, hi = r?.estimate_interval_high ?? null;
  const level = r?.interval_nominal_level != null ? Math.round(r.interval_nominal_level * 10) : null;
  const inside = sharp != null && lo != null && hi != null ? sharp >= lo && sharp <= hi : null;
  const checked = r?.split === 'test';
  const flag = r?.anomaly?.flag ?? null;
  const when = monthLabel(STORY_YEAR, STORY_MONTH, true);

  const steps = [
    { h: `March is ${name}’s fire month.`, p: d.share != null ? <>Across {d.shareFrom}–{d.shareTo}, March and April hold about {Math.round(d.share * 100)}% of the sharper satellite’s detections. Those two columns glow every year.</> : <>Loading the calendar for {name}…</> },
    { h: 'Two cameras, two counts.', p: sharp != null && old != null ? <>{when}: the sharper satellite counted {fmt(sharp)} detections, the older one {fmt(old)}. Same month, same country. The sharper camera sees smaller fires.</> : <>Loading the counts for {when}…</> },
    { h: 'The check.', p: est != null && lo != null && hi != null && sharp != null ? <>{checked ? 'A check year, never used to learn. ' : 'Shown for comparison. '}Estimate: about {fmt(est)}, likely between {fmt(lo)} and {fmt(hi)}{level != null ? ` (${level} in 10)` : ''}. Seen: {fmt(sharp)}, {inside ? 'inside the range.' : 'outside the range: a miss.'}</> : <>Loading the estimate for {when}…</> },
    { h: 'A quiet March.', p: r ? (flag === 'low' ? <>{when} was unusually low{d.lowRank != null ? `: ${ord(d.lowRank)} of ${d.marchCount} Marches` : ''}. Below, where it burned.</> : <>{when} {flag === 'high' ? 'was unusually high' : 'was not unusual'}{d.lowRank != null ? ` (${ord(d.lowRank)} of ${d.marchCount} Marches)` : ''}. Below, where it burned.</>) : <>Loading…</> },
    { h: 'Your turn.', p: <>Open the calendar for your place, or see today. Detections are hot pixels, not confirmed wildfires.</> }
  ];

  return (
    <Page route="story">
      <PageHead title={`${when} in ${name}`} lead="One month, two satellites, one honest check." />
      <div className="story" onKeyDown={onKey}>
        <div className="story__bar">
          <button type="button" className="btn" disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden />Back</button>
          <ol className="story__dots" aria-label="Steps">
            {steps.map((s, i) => <li key={i}><button type="button" className={'story__dot' + (i === step ? ' is-on' : '')} aria-label={`Step ${i + 1} of ${N}: ${s.h}`} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)} /></li>)}
          </ol>
          <button type="button" className="btn btn--primary" data-story-next disabled={step === N - 1} onClick={() => go(step + 1)}>Next<ArrowRight size={16} aria-hidden /></button>
        </div>
        {steps.map((s, i) => (
          <section key={i} data-story-step={i + 1} className="story__step panel" hidden={i !== step} aria-label={`Step ${i + 1} of ${N}`}>
            <div className="story__text">
              <p className="story__n">Step {i + 1} of {N}</p>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </div>
            <div className="story__vis">
              {i === 0 && <div className="story-cal"><Calendar years={d.allYears.filter((y) => y >= (d.shareFrom ?? y))} map={d.act.map} status={d.act.status} selection={sel} onSelect={() => {}} max={d.max} compact /></div>}
              {i === 1 && sharp != null && old != null && <Bars sharp={sharp} old={old} />}
              {i === 2 && <Check r={r} inside={inside} />}
              {i === step && i === 3 && <StoryMap />}
              {i === step && i === 4 && (
                <ul className="story__go">
                  <li><a className="btn btn--primary" href="#/calendar">Open the Calendar for your place</a></li>
                  <li><a className="btn" href="#/live">See today (Live)</a></li>
                  <li><a className="btn" href="#/method">Results</a></li>
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="small muted story__src">Snapshot {core.manifest.snapshot_id}. Counts are satellite hot-spot detections.</p>
    </Page>
  );

  function Check({ r, inside }: { r: typeof d.rec; inside: boolean | null }) {
    const flat = d.flat.filter((p) => p.year >= STORY_YEAR - 3);
    return (
      <div>
        {r && <RangeBar r={r} inside={inside} />}
        <CompareChart flat={flat} selection={sel} onSelect={() => {}} />
      </div>
    );
  }
  function StoryMap() {
    const region = d.region, c = useCells(core.snapshotId, region, STORY_YEAR), g = useGeo(core.snapshotId, region);
    return <div className="mapwrap"><MapPanel region={region} regions={core.regions} geo={g} cells={c} selection={sel} monthState={undefined} record={d.rec} /></div>;
  }
}

const ord = (n: number) => n === 1 ? 'the lowest' : `the ${['', '', '2nd', '3rd'][n] ?? `${n}th`} lowest`;

function Bars({ sharp, old }: { sharp: number; old: number }) {
  const mx = Math.max(sharp, old, 1);
  return (
    <figure className="story__bars" data-chart="story-bars">
      {[['Sharper satellite', sharp, 'var(--viirs)'], ['Older satellite', old, 'var(--aqua)']].map(([t, v, c]) => (
        <div key={t as string} className="story__bar-row"><span>{t as string}</span><i style={{ width: `${Math.max(2, (v as number) / mx * 100)}%`, background: c as string }} /><b>{fmt(v as number)}</b></div>
      ))}
      <figcaption>Detections in {monthLabel(STORY_YEAR, STORY_MONTH, true)}, Bangladesh, as recorded.</figcaption>
    </figure>
  );
}

function RangeBar({ r, inside }: { r: NonNullable<ReturnType<typeof useStoryData>['rec']>; inside: boolean | null }) {
  const lo = r.estimate_interval_low, hi = r.estimate_interval_high, e = r.estimated_viirs_reference_detections, a = r.raw_viirs_reference_detections;
  if (lo == null || hi == null || e == null || a == null) return null;
  const top = Math.max(hi, a) * 1.05, pc = (v: number) => `${(v / top) * 100}%`;
  return (
    <figure className="story__range" data-chart="story-range">
      <div className="story__track"><i className="story__band" style={{ left: pc(lo), width: `calc(${pc(hi)} - ${pc(lo)})` }} /><i className="story__est" style={{ left: pc(e) }} /><i className={'story__seen' + (inside ? '' : ' is-out')} style={{ left: pc(a) }} /></div>
      <figcaption><span>Likely range {fmt(lo)} to {fmt(hi)}</span><span>Estimate {fmt(e)}</span><span>Seen {fmt(a)}</span></figcaption>
    </figure>
  );
}
