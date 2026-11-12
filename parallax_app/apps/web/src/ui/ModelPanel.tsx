import { useEffect, useMemo, useState } from 'react';
import type { Manifest } from '../types';
import { api } from './useAppData';
import { regionRelease, STAGE_INFO } from './TopBar';
import { Tip } from './Tip';
import { MODEL_PLAIN } from '../shell/glossary';
import { fmtNum, fmtPct, fmtSigned } from '../data/format';

type Row = Record<string, string>;
const num = (s: string | undefined) => (s == null || s === '' ? null : Number(s));

export function ModelPanel({ manifest, snapshotPath, metrics, region }: { manifest: Manifest; snapshotPath: string; metrics?: Record<string, any> | null; region?: import('../types').Region }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cards, setCards] = useState<Record<string, Record<string, unknown> | null>>({});
  useEffect(() => {
    api.loadComparisonCsv(manifest.snapshot_id).then(setRows).catch(() => setRows([]));
  }, [manifest.snapshot_id]);
  const models = useMemo(() => [...new Set((rows ?? []).map((r) => r.model_id).filter((m) => !m.includes('@') && !/^Q\d/.test(m)))], [rows]);
  useEffect(() => {
    const ids = [...models, 'Q1_vqc', 'Q2_qllm'];
    Promise.all(ids.map(async (id) => [id, await api.loadModelCard(manifest.snapshot_id, id).catch(() => null)] as const))
      .then((e) => setCards(Object.fromEntries(e)));
  }, [models, manifest.snapshot_id]);

  if (!rows) return <p className="muted">Getting the comparison table…</p>;
  const get = (m: string, split: string, level: string) => rows.find((r) => r.model_id === m && r.split === split && r.level === level && r.subgroup === 'all');
  const cov = (m: string) => { const i = cards[m]?.interval as { test_coverage?: number } | undefined; return i?.test_coverage ?? null; };

  const qRows = rows.filter((r) => r.level === 'cell_month_qml_subset' && r.subgroup === 'all');
  const qModels = [...new Set(qRows.map((r) => r.model_id))];
  const q2 = cards['Q2_qllm'];

  // Per-region stage from manifest.release_regions (gated regions only); never a pooled number presented as the region's.
  const rr = region ? regionRelease(manifest, region.aoi_id) : null;
  const regGate = rr && rr.scope === 'region' ? rr : null;
  const stage = rr?.stage ?? manifest.release_stage;

  return (
    <div className="models">
      {manifest.synthetic && <p className="notice small">These numbers come from demo data. They only test the plumbing; they are not scientific results.</p>}
      <h3>Average miss of every method, per place and month</h3>
      <p className="muted small">Average miss (mean absolute error, MAE) and average lean (bias) in fire detections per place and month. Lower is better. The method is chosen on the choose-years only; the check-years were opened once. We do not quote an accuracy percentage.</p>
      {rr && (
        <div className="region-gate-info">
          <strong>Result for {region?.name}: </strong>
          <Tip text={STAGE_INFO[stage]?.text ?? ''}><span className="badge" tabIndex={0}>{STAGE_INFO[stage]?.label ?? stage}</span></Tip>
          {regGate ? <p className="small muted">Checked on this place's own unseen months{regGate.n ? ` (${regGate.n} months)` : ''}{regGate.coverage != null ? `; the real value fell inside the likely range ${fmtPct(regGate.coverage)} of the time` : ''}. Small sample: coarse evidence.</p>
            : <p className="small muted">This place is not checked on its own. The result shown is the whole snapshot's (its weakest place). The table below pools the checked places, so it is not this place's result.</p>}
        </div>
      )}
      <div className="table-wrap">
        <table className="tbl tbl--num">
          <thead>
            <tr><th rowSpan={2}>Method</th><th colSpan={2}>Chosen on 2021–22</th><th colSpan={2}>Checked on 2023–24</th><th rowSpan={2}>Real value inside likely range (check years)</th></tr>
            <tr><th>Miss</th><th>Lean</th><th>Miss</th><th>Lean</th></tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const v = get(m, 'val', 'aoi_month'), t = get(m, 'test', 'aoi_month');
              const sel = m === manifest.selected_model_id;
              return (
                <tr key={m} className={sel ? 'is-sel' : ''}>
                  <th scope="row"><span title={m}>{MODEL_PLAIN[m] ?? m}</span> <code className="small muted">{m}</code>{sel && <span className="badge badge--sel">used for the estimate</span>}{v?.status && v.status !== 'ok' && <span className="badge">{v.status}</span>}</th>
                  <td>{fmtNum(num(v?.mae), 2)}</td><td>{fmtSigned(num(v?.bias))}</td>
                  <td>{fmtNum(num(t?.mae), 2)}</td><td>{fmtSigned(num(t?.bias))}</td>
                  <td>{fmtPct(cov(m))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {regGate && regGate.reasons.length ? (
        <details className="details">
          <summary>Why this result?</summary>
          <ul className="small">
            {regGate.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </details>
      ) : manifest.release_reason ? (
        <details className="details"><summary>Why this method was chosen</summary><p className="small">{manifest.release_reason}</p></details>
      ) : null}

      <section className="qml">
        <header className="qml__head">
          <h3>Side experiment: quantum machine learning</h3>
          <span className="badge badge--research">research only, simulated on an ordinary computer</span>
        </header>
        <p className="muted small">Q1 is a simulated quantum circuit trained on a small subset. Every ordinary method is retrained on the same subset for a fair comparison. It is not what the app uses for its estimate, and we make no claim that quantum is better.</p>
        <div className="table-wrap">
          <table className="tbl tbl--num">
            <thead><tr><th>Model</th><th>Trained on</th><th>n</th><th>Miss (chosen-on years)</th><th>Miss (checked-on years)</th><th>Count-model score (chosen-on)</th></tr></thead>
            <tbody>
              {qModels.map((m) => {
                const v = qRows.find((r) => r.model_id === m && r.split === 'val'), t = qRows.find((r) => r.model_id === m && r.split === 'test');
                const [base, how] = m.split('@');
                return (
                  <tr key={m} className={base.startsWith('Q') ? 'is-q' : ''}>
                    <th scope="row">{base}</th><td>{how === 'full_data' ? 'full data' : how === 'subset' ? 'same subset' : 'subset (simulated)'}</td>
                    <td>{fmtNum(num(v?.n))}</td><td>{fmtNum(num(v?.mae), 3)}</td><td>{fmtNum(num(t?.mae), 3)}</td><td>{fmtNum(num(v?.poisson_deviance), 3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small"><b>Q2</b> (a language model suggesting settings for Q1): <span className="badge">{String(q2?.status ?? 'unknown')}</span> {q2?.error ? <span className="muted">— {String(q2.error).replace(/ under \S+/, '')}</span> : null}</p>
      </section>
      <p className="small">Method cards (technical): {[...models, 'Q1_vqc', 'Q2_qllm'].map((m, i) => <span key={m}>{i ? ' · ' : ''}<a href={`${snapshotPath}models/${m}/model_card.json`} target="_blank" rel="noreferrer">{m}</a></span>)}</p>
    </div>
  );
}
