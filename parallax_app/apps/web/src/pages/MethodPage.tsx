import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { STAGE_PLAIN, type StageKey } from '../shell/glossary';
import { useWorkspace } from '../shell/workspace';
import { MANUAL_URL } from '../ui/TopBar';
import { ModelPanel } from '../ui/ModelPanel';
import { fmtNum, fmtPct } from '../data/format';

interface Maes { selected?: number; B0_identity?: number; B0_month_ratio?: number }
interface Row { aoi: string; stage?: string; checkedOnItsOwn: boolean; n?: number; mae: Maes; coverage?: number | null }
type Rec = Record<string, any>; // metrics.json is read defensively: every value may be absent

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const nm = (v: number | undefined) => (v == null ? 'not measured' : fmtNum(v, v < 10 ? 1 : 0));

export default function MethodPage() {
  const { core, sel } = useWorkspace();
  const m = core.manifest;
  const metrics = (core.metrics ?? {}) as Rec;
  const rel = (metrics.release ?? {}) as Rec;
  const nameOf = (id: string) => core.regions.find((r) => r.aoi_id === id)?.name ?? id;

  const rows: Row[] = [
    ...Object.entries((rel.regions ?? {}) as Rec).map(([aoi, v]: [string, Rec]) => ({ aoi, stage: v.stage as string | undefined, checkedOnItsOwn: true, n: num(v.n_test_aoi_months), mae: (v.test_aoi_month_mae ?? {}) as Maes, coverage: num(v.interval_test_coverage) ?? null })),
    ...Object.entries((rel.reported_separately ?? {}) as Rec).map(([aoi, v]: [string, Rec]) => ({ aoi, checkedOnItsOwn: false, n: num(v.interval_n_test_aoi_months), mae: (v.test_aoi_month_mae ?? {}) as Maes, coverage: num(v.interval_test_coverage) ?? null }))
  ];
  const mine = rows.find((r) => r.aoi === sel.aoiId);

  return (
    <Page route="method">
      <PageHead title="Results" lead="How far off the estimate was on years it never saw, place by place." />

      <section className="panel tour-method" aria-labelledby="results-h">
        <h2 className="panel__title" id="results-h">Average miss per month, in fire detections (lower is better)</h2>
        {rows.length === 0 ? <p className="notice">No per-place results in this snapshot.</p> : (
          <div className="table-wrap">
            <table className="tbl tbl--num">
              <caption className="sr-only">Average miss on unseen years, by place</caption>
              <thead>
                <tr><th scope="col">Place</th><th scope="col">Result</th><th scope="col">Ours</th><th scope="col">Copy older satellite</th><th scope="col">Monthly ratio</th><th scope="col">Inside likely range (aim 80%)</th><th scope="col">Months checked</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = r.stage ? STAGE_PLAIN[r.stage as StageKey] : undefined;
                  const beats = r.mae.selected != null && r.mae.B0_identity != null && r.mae.B0_month_ratio != null && r.mae.selected < r.mae.B0_identity && r.mae.selected < r.mae.B0_month_ratio;
                  return (
                    <tr key={r.aoi} className={r.aoi === sel.aoiId ? 'is-sel' : ''}>
                      <th scope="row">{nameOf(r.aoi)}</th>
                      <td>{st ? <span className={'badge st-tag--' + st.tone}>{st.label}</span> : <span className="muted small">Not checked alone</span>}</td>
                      <td>{nm(r.mae.selected)}{beats && <span className="small muted"> · beats both</span>}</td>
                      <td>{nm(r.mae.B0_identity)}</td><td>{nm(r.mae.B0_month_ratio)}</td>
                      <td>{r.coverage == null ? 'not measured' : fmtPct(r.coverage)}</td>
                      <td>{r.n == null ? 'not measured' : r.n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small"><a data-manual-inline href={MANUAL_URL} target="_blank" rel="noopener">Full method in the manual (PDF)</a></p>
      </section>

      <section className="panel">
        <details className="details">
          <summary>All methods compared</summary>
          <ModelPanel manifest={m} snapshotPath={core.snapshotPath} metrics={metrics} region={core.regions.find((r) => r.aoi_id === sel.aoiId)} />
        </details>
      </section>
      <NextSteps to={['data', 'sensors', 'calendar']} />
    </Page>
  );
}
