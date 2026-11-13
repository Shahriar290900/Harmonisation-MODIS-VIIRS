import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { PlacePicker } from '../shell/PlacePicker';
import { useMonthData, useWorkspace } from '../shell/workspace';
import { MapPanel } from '../ui/MapPanel';
import { actions } from '../ui/bridge';
import { monthLabel } from '../data/format';

export default function MapPage() {
  const { core, sel, region, allYears } = useWorkspace();
  const d = useMonthData();
  const lo = allYears[0], hi = allYears[allYears.length - 1];
  return (
    <Page route="map">
      <PageHead title="Map" lead="Where the satellites saw fire detections this month.">
        <PlacePicker regions={core.regions} aoiId={sel.aoiId} allowed={core.manifest.aois} />
        <div className="stepper" role="group" aria-label="Month">
          <button className="btn btn--icon" aria-label="Previous month" onClick={() => actions.stepMonth(-1, lo, hi)}><ChevronLeft size={18} aria-hidden /></button>
          <span className="stepper__v" aria-live="polite">{monthLabel(sel.year, sel.month, true)}</span>
          <button className="btn btn--icon" aria-label="Next month" onClick={() => actions.stepMonth(1, lo, hi)}><ChevronRight size={18} aria-hidden /></button>
        </div>
      </PageHead>
      <div className="mapwrap tour-map">
        <MapPanel region={region} regions={core.regions} geo={d.geo} cells={d.cells} selection={sel} monthState={d.monthState} record={d.record} />
      </div>
      <NextSteps to={['calendar', 'sensors', 'method']} />
    </Page>
  );
}
