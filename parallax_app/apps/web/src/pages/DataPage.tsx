import { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { STAGE_PLAIN, type StageKey } from '../shell/glossary';
import { useMonthData, useWorkspace } from '../shell/workspace';
import { Icon3D } from '../ui/icons/Icon3D';
import { Tip } from '../ui/Tip';
import { exportCsv, printBrief } from '../ui/exporting';
import { snapshotAge } from '../ui/PwaStatus';
import { monthLabel } from '../data/format';

type Rec = Record<string, any>;
const SENSOR_PLAIN: Record<string, { name: string; what: string }> = {
  modis: { name: 'Older satellite (MODIS, Aqua and Terra)', what: 'Yearly country files of fire detections from NASA FIRMS.' },
  'viirs-snpp': { name: 'Sharper satellite (VIIRS on S-NPP)', what: 'Yearly country files of fire detections from NASA FIRMS.' },
  natural_earth: { name: 'Country outlines (Natural Earth)', what: 'Country and state outlines used to cut the data into places.' }
};

export default function DataPage() {
  const { core, sel, region } = useWorkspace();
  const d = useMonthData();
  const m = core.manifest;
  const metrics = (core.metrics ?? {}) as Rec;

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

  const avail = Object.entries((metrics.availability ?? {}) as Rec);
  const yearRecords = Array.from({ length: 12 }, (_, i) => d.allRecords.find((x) => x.period_start_utc.startsWith(`${sel.year}-${String(i + 1).padStart(2, '0')}`)) ?? null);

  return (
    <Page route="data">
      <PageHead title="Data & sources" lead="Where every number comes from, what you can download, and what is not in the data." />

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
        <p className="small muted">Every month in the calendar lists the source files behind it under &ldquo;Technical details&rdquo; on the Calendar page.</p>
      </section>

      <section className="panel">
        <h2 className="panel__title">This data snapshot</h2>
        <dl className="about__facts">
          <div><dt>Created (UTC)</dt><dd>{m.created_utc.replace('T', ' ').slice(0, 16)} · {snapshotAge(m.created_utc)}</dd></div>
          <div><dt>Years covered</dt><dd>{m.years[0]}–{m.years[m.years.length - 1]}</dd></div>
          <div><dt>Places</dt><dd>{core.regions.filter((r) => m.aois.includes(r.aoi_id)).length}</dd></div>
          <div><dt>Result for the whole snapshot</dt><dd>{STAGE_PLAIN[m.release_stage as StageKey]?.label ?? 'not stated'}{m.synthetic ? ' (demo data)' : ''}</dd></div>
        </dl>
        <details className="details"><summary>Technical details</summary><dl className="about__facts"><div><dt>Snapshot id</dt><dd><code>{m.snapshot_id}</code></dd></div><div><dt>Method behind the estimate</dt><dd><code>{m.selected_model_id}</code></dd></div></dl></details>
      </section>

      <section className="panel">
        <h2 className="panel__title">Download</h2>
        <p>Takes the place and years you picked on the Calendar page: <b>{region?.name}</b>, {d.from} to {d.to}. Estimates stay labelled as estimates and missing months stay missing.</p>
        <div className="evidence__actions tour-export">
          <Tip text="Download every month in the years shown as a spreadsheet (CSV), with status and estimate labels."><span className="tipwrap"><button className="btn" onClick={() => exportCsv(d.allRecords, region, m, core.sources)} disabled={!d.allRecords.length}><Icon3D icon={Download} tone="teal" size={15} />Download CSV</button></span></Tip>
          <Tip text="Open a one-page printable brief for the selected month, with its sources."><span className="tipwrap"><button className="btn" onClick={() => d.record && printBrief(d.record, region, m, core.sources, yearRecords)} disabled={!d.record}><Icon3D icon={Printer} tone="neutral" size={15} />Print brief for {monthLabel(sel.year, sel.month)}</button></span></Tip>
        </div>
      </section>

      <section className="panel prose">
        <h2 className="panel__title">Licences and credits</h2>
        <ul className="bullets">
          <li><b>Fire detections:</b> <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA FIRMS</a>. We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA&rsquo;s Earth Science Data and Information System (ESDIS).</li>
          <li><b>Country and state outlines:</b> <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>, public domain.</li>
          <li><b>Bangladesh districts:</b> <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (gbOpen, CC BY 3.0 IGO), source BBS / OCHA ROAP.</li>
          <li><b>Map tiles and attribution:</b> shown on the map itself.</li>
          <li>Created by M Al Shahriar Hameem, Team Lumos, for the NASA Space Apps Challenge 2026.</li>
        </ul>
      </section>

      <section className="panel prose">
        <h2 className="panel__title">What is not in the data</h2>
        <ul className="bullets">
          <li>Anything about the future. The numbers describe the past and the present only.</li>
          <li>Confirmed wildfires. A detection is a hot pixel seen from space.</li>
          <li>How cloudy it was. FIRMS gives no count of cloud-free looks, so we cannot say how many fires were hidden.</li>
          <li>Fixed heat sources such as industry are counted separately. Planned burns such as crop burning cannot be told apart from other vegetation fires and are included.</li>
          <li>Some months. They are shown hatched on the calendar, never as zero.</li>
        </ul>
        {avail.length > 0 && (
          <div className="table-wrap">
            <table className="tbl tbl--num">
              <caption>Months with no satellite record, by country (from the snapshot)</caption>
              <thead><tr><th scope="col">Country</th><th scope="col">Older satellite (Aqua)</th><th scope="col">Older satellite (Terra)</th><th scope="col">Sharper satellite (includes every month before 2012)</th></tr></thead>
              <tbody>
                {avail.map(([c, v]) => {
                  const x = (k: string) => (typeof (v as Rec)?.[k]?.missing_months === 'number' ? (v as Rec)[k].missing_months : 'not measured');
                  return <tr key={c}><th scope="row">{c.replace(/_/g, ' ')}</th><td>{x('aqua')}</td><td>{x('terra')}</td><td>{x('snpp')}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <NextSteps to={['calendar', 'method', 'map']} />
    </Page>
  );
}
