import { useState } from 'react';
import { JumpSwitch, type JumpMode } from '../story/JumpSwitch';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { PlacePicker } from '../shell/PlacePicker';
import { Explainer } from '../ui/Explainer';
import { useMonthData, useWorkspace } from '../shell/workspace';
import { CompareChart } from '../ui/CompareChart';
import { setSelection, actions, useAppState } from '../ui/bridge';
import type { SeriesKey } from '../types';
import { SERIES_COLORS } from '../types';

const LINES: { key: SeriesKey; name: string }[] = [
  { key: 'aqua', name: 'Older satellite (MODIS)' },
  { key: 'viirs', name: 'Sharper satellite (VIIRS)' },
  { key: 'estimate', name: 'Estimate (dashed)' },
  { key: 'terra', name: 'Terra (older, second unit)' },
  { key: 'static', name: 'Fixed heat sources' }
];

export default function SensorsPage() {
  const { core, sel } = useWorkspace();
  const d = useMonthData();
  const on = useAppState((s) => s.series);
  const [jump, setJump] = useState<JumpMode>('raw');
  return (
    <Page route="sensors">
      <PageHead title="Two satellites" lead="Older and sharper satellite, lined up on one scale.">
        <PlacePicker regions={core.regions} aoiId={sel.aoiId} allowed={core.manifest.aois} />
      </PageHead>
      <section className="panel chart-panel" aria-label="The 2012 jump, with and without putting the satellites on one scale">
        <div className="panel__head"><h2 className="panel__title">The 2012 jump <span className="muted">· {core.regions.find((r) => r.aoi_id === sel.aoiId)?.name}</span></h2></div>
        <JumpSwitch mode={jump} onChange={setJump} cta />
        <CompareChart flat={d.flat} selection={sel} onSelect={(year, month) => setSelection({ year, month })} height={340} mode={jump} />
      </section>
      <section className="panel chart-panel tour-chart" aria-label="Compare the two satellites">
        <div className="panel__head"><h2 className="panel__title">Fire detections per month <span className="muted">· {core.regions.find((r) => r.aoi_id === sel.aoiId)?.name}</span></h2></div>
        <CompareChart flat={d.flat} selection={sel} onSelect={(year, month) => setSelection({ year, month })} height={340} />
      </section>
      <section className="panel" aria-label="Lines on the chart">
        <ul className="legend-list legend-list--row">
          {LINES.map((l) => (
            <li key={l.key}>
              <label className="legend-list__row">
                <input type="checkbox" checked={!!on[l.key]} onChange={() => actions.toggleSeries(l.key)} />
                <i className={'dot' + (l.key === 'estimate' ? ' dot--dash' : '')} style={{ background: SERIES_COLORS[l.key] }} aria-hidden />
                <span><b>{l.name}</b></span>
              </label>
            </li>
          ))}
        </ul>
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
