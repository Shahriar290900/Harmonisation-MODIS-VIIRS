import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { Term } from '../shell/Term';
import { MODEL_PLAIN, STAGE_PLAIN, type StageKey } from '../shell/glossary';
import { useWorkspace } from '../shell/workspace';
import { ModelPanel } from '../ui/ModelPanel';
import { fmtNum, fmtPct } from '../data/format';

interface Maes { selected?: number; B0_identity?: number; B0_month_ratio?: number }
interface Row { aoi: string; stage?: string; checkedOnItsOwn: boolean; n?: number; mae: Maes; coverage?: number | null }
type Rec = Record<string, any>; // metrics.json is read defensively: every value may be absent

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const span = (a: unknown): string | null => (Array.isArray(a) && a.length && a.every((x) => typeof x === 'number') ? (a[0] === a[a.length - 1] ? `${a[0]}` : `${a[0]}–${a[a.length - 1]}`) : null);
const nm = (v: number | undefined) => (v == null ? 'not measured' : fmtNum(v, v < 10 ? 1 : 0));

export default function MethodPage() {
  const { core, sel } = useWorkspace();
  const m = core.manifest;
  const metrics = (core.metrics ?? {}) as Rec;
  const rel = (metrics.release ?? {}) as Rec;
  const split = (metrics.split_manifest ?? {}) as Rec;
  const learn = span(split.train_years), choose = span(split.val_years), check = span(split.test_years), past = span(split.backcast_years);
  const nameOf = (id: string) => core.regions.find((r) => r.aoi_id === id)?.name ?? id;
  const selectedPlain = MODEL_PLAIN[m.selected_model_id] ?? 'the chosen method';

  const rows: Row[] = [
    ...Object.entries((rel.regions ?? {}) as Rec).map(([aoi, v]: [string, Rec]) => ({ aoi, stage: v.stage as string | undefined, checkedOnItsOwn: true, n: num(v.n_test_aoi_months), mae: (v.test_aoi_month_mae ?? {}) as Maes, coverage: num(v.interval_test_coverage) ?? null })),
    ...Object.entries((rel.reported_separately ?? {}) as Rec).map(([aoi, v]: [string, Rec]) => ({ aoi, checkedOnItsOwn: false, n: num(v.interval_n_test_aoi_months), mae: (v.test_aoi_month_mae ?? {}) as Maes, coverage: num(v.interval_test_coverage) ?? null }))
  ];
  const mine = rows.find((r) => r.aoi === sel.aoiId);

  return (
    <Page route="method">
      <PageHead title="How it works" lead="How we line up two satellites, how the estimate is learned, and how well it holds up on years it had never seen." />

      <section className="panel prose">
        <h2 className="panel__title">The idea in seven steps</h2>
        <ol className="steps">
          <li><b>Count the hot pixels.</b> NASA satellites spot pixels that are hotter than their surroundings. For each place and month we count them. The older satellite (<Term k="modis">MODIS</Term>) has done this since 2002 and the sharper one (<Term k="viirs">VIIRS</Term>) since 2012.</li>
          <li><b>Notice the jump.</b> The sharper satellite sees smaller fires, so when it joins in 2012 the counts leap up, even if no more land burned.</li>
          <li><b>Learn the translation.</b> {learn ? <>In the years {learn}</> : <>In the years</>} both satellites were flying. We study how many detections the sharper one made whenever the older one saw a certain number. These are the <Term k="learn">years used to learn</Term>.</li>
          <li><b>Try several methods and pick one.</b> We tried a simple ratio, a statistical model, a tree model and a neural net. {choose ? <>Each was compared on {choose}</> : <>Each was compared</>}, years held back for this (<Term k="choose">years used to choose</Term>). The winner is the <b>{selectedPlain.toLowerCase()}</b>.</li>
          <li><b>Check it on unseen years.</b> {check ? <>The years {check}</> : <>A final set of years</>} were kept sealed until the end and used once (<Term k="check">years used to check</Term>). The results below come from those years only.</li>
          <li><b>Add a likely range.</b> Next to every estimate we show a <Term k="range">likely range (8 in 10)</Term>, sized on the chosen-on years. Below we measure how often the real value landed inside it.</li>
          <li><b>Fill in the past.</b> {past ? <>For {past}</> : <>For the years before 2012</>}, when only the older satellite existed, we show the <Term k="past">estimated past</Term> on the sharper satellite&rsquo;s scale, always dashed and labelled as an estimate.</li>
        </ol>
      </section>

      <section className="panel tour-method" aria-labelledby="results-h">
        <h2 className="panel__title" id="results-h">How well it holds up, place by place</h2>
        <p>Each row is measured on the unseen check years. &ldquo;Average miss&rdquo; is how far off the monthly total was, on average, in fire detections. Lower is better. A method only counts as good here if it beats both <Term k="baseline">simple rules</Term>.</p>
        {rows.length === 0 ? <p className="notice">The results file has no per-place numbers for this snapshot, so none are shown. They are not measured.</p> : (
          <div className="table-wrap">
            <table className="tbl tbl--num">
              <caption className="sr-only">Average miss on unseen years, by place</caption>
              <thead>
                <tr><th scope="col">Place</th><th scope="col">Result</th><th scope="col">Average miss (ours)</th><th scope="col">Simple rule: copy the older satellite</th><th scope="col">Simple rule: monthly ratio</th><th scope="col">Real value inside the likely range</th><th scope="col">Months checked</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = r.stage ? STAGE_PLAIN[r.stage as StageKey] : undefined;
                  const beats = r.mae.selected != null && r.mae.B0_identity != null && r.mae.B0_month_ratio != null && r.mae.selected < r.mae.B0_identity && r.mae.selected < r.mae.B0_month_ratio;
                  return (
                    <tr key={r.aoi} className={r.aoi === sel.aoiId ? 'is-sel' : ''}>
                      <th scope="row">{nameOf(r.aoi)}</th>
                      <td>{st ? <span className={'badge st-tag--' + st.tone}>{st.label}</span> : <span className="muted small">Not checked on its own</span>}</td>
                      <td>{nm(r.mae.selected)}{beats && <span className="small muted"> · beats both</span>}</td>
                      <td>{nm(r.mae.B0_identity)}</td><td>{nm(r.mae.B0_month_ratio)}</td>
                      <td>{r.coverage == null ? 'not measured' : fmtPct(r.coverage)}<span className="small muted"> (aim: 80%)</span></td>
                      <td>{r.n == null ? 'not measured' : r.n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {mine
          ? <p className="small">{nameOf(sel.aoiId)}: {mine.checkedOnItsOwn ? `${STAGE_PLAIN[mine.stage as StageKey]?.label ?? 'not stated'}. ` : 'this place is not checked on its own; its row is for information only. '}
              {mine.n != null && mine.n < 36 ? `Only ${mine.n} months were checked, so this is coarse evidence.` : ''}</p>
          : <p className="small muted">{nameOf(sel.aoiId)} has no row of its own, so its result is not measured.</p>}
        <p className="small muted">Rows marked &ldquo;Not checked on its own&rdquo; sit inside a larger checked place (or are whole countries dominated by huge counts), so they are shown for information and do not decide the label. The whole snapshot is labelled <b>{STAGE_PLAIN[m.release_stage as StageKey]?.label ?? 'not stated'}</b> because it takes the result of its weakest checked place.</p>
      </section>

      <section className="panel prose">
        <h2 className="panel__title">What it cannot tell you</h2>
        <ul className="bullets">
          <li>It does not say what will happen next. It only lines up counts from the past and the present.</li>
          <li>A detection is a hot pixel seen from space. It is not a confirmed wildfire, and it does not give the size or the damage.</li>
          <li>Clouds and smoke can hide fires. We have no way to count how often that happened.</li>
          <li>The estimate cannot recover small fires the older satellite never saw. It tells you what the sharper satellite would typically have counted, with a range.</li>
          <li>Results hold per place. A good result for one place says nothing about another.</li>
          <li>With only a couple of dozen checked months per place, the numbers above are coarse evidence.</li>
        </ul>
      </section>

      <section className="panel">
        <details className="details">
          <summary>For specialists: technical names and every method compared</summary>
          <p className="small">Split names: learn = train, choose = validation, check = test, estimated past = backcast. Release labels: &ldquo;Checked on unseen years&rdquo; = validated_calibration, &ldquo;Raw comparison only&rdquo; = observed_comparison, &ldquo;Demo data&rdquo; = ui_prototype. Chosen method: <code>{m.selected_model_id}</code> in snapshot <code>{m.snapshot_id}</code>. Error measure: mean absolute error (MAE) of the monthly total per place.</p>
          <ModelPanel manifest={m} snapshotPath={core.snapshotPath} metrics={metrics} region={core.regions.find((r) => r.aoi_id === sel.aoiId)} />
        </details>
      </section>
      <NextSteps to={['data', 'sensors', 'calendar']} />
    </Page>
  );
}
