import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { PlacePicker } from '../shell/PlacePicker';
import { Term } from '../shell/Term';
import { Explainer } from '../ui/Explainer';
import { useMonthData, useWorkspace } from '../shell/workspace';
import { CompareChart } from '../ui/CompareChart';
import { setSelection, actions, useAppState } from '../ui/bridge';
import type { SeriesKey } from '../types';
import { SERIES_COLORS } from '../types';

const LINES: { key: SeriesKey; name: string; what: string }[] = [
  { key: 'aqua', name: 'Older satellite (MODIS)', what: 'What the older satellite counted (Terra from 2001, Aqua from mid-2002). Its squares are about 1 km wide, so it misses small fires.' },
  { key: 'viirs', name: 'Sharper satellite (VIIRS)', what: 'What the sharper satellite counted, since 2012. Its squares are about 375 m wide, so it notices smaller fires.' },
  { key: 'estimate', name: 'Estimate (dashed)', what: 'What the sharper satellite would probably have counted. Worked out from the older one, with a shaded likely range (8 in 10). An estimate, never a measurement.' },
  { key: 'terra', name: 'Terra (older satellite, second unit)', what: 'A second copy of the older satellite, shown on its own and never mixed into the estimate.' },
  { key: 'static', name: 'Fixed heat sources', what: 'Heat that does not move, such as industry or kilns. Counted separately.' }
];

export default function SensorsPage() {
  const { core, sel } = useWorkspace();
  const d = useMonthData();
  const on = useAppState((s) => s.series);
  const scale = useAppState((s) => s.scale);
  return (
    <Page route="sensors">
      <PageHead title="Two satellites" lead="The older and the sharper satellite count fire differently, so we line them up on one scale to compare the years fairly.">
        <PlacePicker regions={core.regions} aoiId={sel.aoiId} allowed={core.manifest.aois} />
      </PageHead>
      <section className="panel chart-panel tour-chart" aria-label="Compare the two satellites">
        <div className="panel__head"><h2 className="panel__title">Fire detections per month <span className="muted">· {core.regions.find((r) => r.aoi_id === sel.aoiId)?.name}</span></h2></div>
        <CompareChart flat={d.flat} selection={sel} onSelect={(year, month) => setSelection({ year, month })} height={340} />
      </section>
      <div className="cols2">
        <section className="panel">
          <h2 className="panel__title">Why the line jumps in 2012</h2>
          <p>In 2012 the sharper satellite (VIIRS) joined the older one (MODIS). It notices smaller fires, so its counts are several times higher for the same place. Gluing the two together makes the record leap upward even if no more land burned.</p>
          <p>To avoid that, we learn how the two satellites relate in years when both were flying, and use it to <Term k="past">estimate the missing years</Term> on the sharper satellite&rsquo;s scale. That estimate is the dashed line.</p>
        </section>
        <section className="panel">
          <h2 className="panel__title">What each line means</h2>
          <ul className="legend-list">
            {LINES.map((l) => (
              <li key={l.key}>
                <label className="legend-list__row">
                  <input type="checkbox" checked={!!on[l.key]} onChange={() => actions.toggleSeries(l.key)} />
                  <i className={'dot' + (l.key === 'estimate' ? ' dot--dash' : '')} style={{ background: SERIES_COLORS[l.key] }} aria-hidden />
                  <span><b>{l.name}</b><small>{l.what}</small></span>
                </label>
              </li>
            ))}
          </ul>
          <p className="small muted">Tick a box to show or hide a line.</p>
        </section>
      </div>
      <section className="panel">
        <h2 className="panel__title">Squeezed or even scale</h2>
        <p>The chart is on the <b>{scale === 'log' ? 'squeezed' : 'even'}</b> scale. <b>Squeezed</b> gives every tripling the same height, so quiet months and huge months can be read together, and zero stays at the bottom. <b>Even</b> gives equal steps equal counts, which is honest about size but makes quiet months look tiny. Use the switch above the chart to change it.</p>
      </section>
      <section className="panel">
        <details className="details">
          <summary>Show me with a drawing (illustration, not data)</summary>
          <Explainer />
        </details>
      </section>
      <NextSteps to={['method', 'calendar', 'map']} />
    </Page>
  );
}
