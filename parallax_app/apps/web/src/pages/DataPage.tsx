import { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { STAGE_PLAIN, type StageKey } from '../shell/glossary';
import { useMonthData, useWorkspace } from '../shell/workspace';
import { MANUAL_URL } from '../ui/TopBar';
import { Icon3D } from '../ui/icons/Icon3D';
import { Tip } from '../ui/Tip';
import { exportCsv, printBrief } from '../ui/exporting';
import { snapshotAge } from '../ui/PwaStatus';
import { monthLabel } from '../data/format';

type Rec = Record<string, any>;
const SENSOR_PLAIN: Record<string, { name: string; what: string }> = {
  modis: { name: 'Older satellite (MODIS, Aqua and Terra)', what: 'Fire detections, NASA FIRMS.' },
  'viirs-snpp': { name: 'Sharper satellite (VIIRS on S-NPP)', what: 'Fire detections, NASA FIRMS.' },
  natural_earth: { name: 'Country outlines (Natural Earth)', what: 'Country and state outlines.' }
};

export default function DataPage() {
  const { core, sel, region } = useWorkspace();
  const d = useMonthData();
  const m = core.manifest;

  const groups = useMemo(() => {
    const g = new Map<string, { files: number; years: number[]; first: string; last: string; countries: Set<string> }>();
    for (const s of core.sources.values()) {
      const k = String((s as Rec).sensor ?? (s as Rec).kind ?? 'other');
      const e = g.get(k) ?? { files: 0, years: [], first: '', last: '', countries: new Set<string>() };
      e.files++;
      if (typeof (s as Rec).year === 'number') e.years.push((s as Rec).year);
      if ((s as Rec).country) e.countries.add(String((s as Rec).country));
      const t = String((s as Rec).retrieved_utc ?? '').slice(0, 10);
      if (t) { if (!e.first || t < e.first) e.first = t; if (!e.last || t > e.last) e.last = t; }
      g.set(k, e);
    }
    return [...g.entries()];
  }, [core.sources]);

    const yearRecords = Array.from({ length: 12 }, (_, i) => d.allRecords.find((x) => x.period_start_utc.startsWith(`${sel.year}-${String(i + 1).padStart(2, '0')}`)) ?? null);

  return (
    <Page route="data">
      <PageHead title="Data & sources" lead="Where the numbers come from, and what you can download." />

      <section className="panel prose">
        <h2 className="panel__title">Where the numbers come from</h2>
        {groups.length === 0 ? <p className="notice">The source list is not available in this snapshot, so it is not shown.</p> : (
          <div className="table-wrap">
            <table className="tbl">
              <caption className="sr-only">Data sources in this snapshot</caption>
              <thead><tr><th scope="col">Source</th><th scope="col">What it is</th><th scope="col">Files</th><th scope="col">Years</th><th scope="col">Fetched</th></tr></thead>
              <tbody>
                {groups.map(([k, e]) => {
                  const p = SENSOR_PLAIN[k] ?? { name: k, what: 'Source file.' };
                  const ys = e.years.length ? `${Math.min(...e.years)}–${Math.max(...e.years)}` : 'not applicable';
                  return <tr key={k}><th scope="row">{p.name}</th><td>{p.what}{e.countries.size ? ` Countries: ${[...e.countries].map((c) => c.replace(/_/g, ' ')).join(', ')}.` : ''}</td><td>{e.files}</td><td>{ys}</td><td>{e.first ? (e.first === e.last ? e.first : `${e.first} to ${e.last}`) : 'not stated'}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">This data snapshot</h2>
        <dl className="about__facts">
          <div><dt>Created (UTC)</dt><dd>{m.created_utc.replace('T', ' ').slice(0, 16)} · {snapshotAge(m.created_utc)}</dd></div>
          <div><dt>Years covered</dt><dd>{m.years[0]}–{m.years[m.years.length - 1]}</dd></div>
          <div><dt>Places</dt><dd>{core.regions.filter((r) => m.aois.includes(r.aoi_id)).length}</dd></div>
          <div><dt>Result for the whole snapshot</dt><dd>{STAGE_PLAIN[m.release_stage as StageKey]?.label ?? 'not stated'}{m.synthetic ? ' (demo data)' : ''}</dd></div>
        </dl>
        <details className="details"><summary>More</summary><dl className="about__facts"><div><dt>Snapshot id</dt><dd><code>{m.snapshot_id}</code></dd></div><div><dt>Method behind the estimate</dt><dd><code>{m.selected_model_id}</code></dd></div></dl></details>
      </section>

      <section className="panel">
        <h2 className="panel__title">Download</h2>
        <p className="small muted">{region?.name}, {d.from} to {d.to}</p>
        <div className="evidence__actions tour-export">
          <Tip text="Download every month in the years shown as a spreadsheet (CSV), with status and estimate labels."><span className="tipwrap"><button className="btn" onClick={() => exportCsv(d.allRecords, region, m, core.sources)} disabled={!d.allRecords.length}><Icon3D icon={Download} tone="teal" size={15} />Download CSV</button></span></Tip>
          <Tip text="Open a one-page printable brief for the selected month, with its sources."><span className="tipwrap"><button className="btn" onClick={() => d.record && printBrief(d.record, region, m, core.sources, yearRecords)} disabled={!d.record}><Icon3D icon={Printer} tone="neutral" size={15} />Print brief for {monthLabel(sel.year, sel.month)}</button></span></Tip>
        </div>
      </section>

      <p className="small"><a data-manual-inline href={MANUAL_URL} target="_blank" rel="noopener">Licences, credits and limits in the manual (PDF)</a></p>
      <NextSteps to={['calendar', 'method', 'map']} />
    </Page>
  );
}
