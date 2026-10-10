import { useEffect, useMemo, useState } from 'react';
import type { Manifest } from '../types';
import { api } from './useAppData';
import { fmtNum, fmtPct, fmtSigned } from '../data/format';

type Row = Record<string, string>;
const num = (s: string | undefined) => (s == null || s === '' ? null : Number(s));

export function ModelPanel({ manifest, snapshotPath }: { manifest: Manifest; snapshotPath: string }) {
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

  if (!rows) return <p className="muted">Loading comparison.csv…</p>;
  const get = (m: string, split: string, level: string) => rows.find((r) => r.model_id === m && r.split === split && r.level === level && r.subgroup === 'all');
  const cov = (m: string) => { const i = cards[m]?.interval as { test_coverage?: number } | undefined; return i?.test_coverage ?? null; };

  const qRows = rows.filter((r) => r.level === 'cell_month_qml_subset' && r.subgroup === 'all');
  const qModels = [...new Set(qRows.map((r) => r.model_id))];
  const q2 = cards['Q2_qllm'];

  return (
    <div className="models">
      {manifest.synthetic && <p className="notice small">These metrics come from a synthetic fixture — plumbing checks only, not scientific results.</p>}
      <h3>AOI-month error by model</h3>
      <p className="muted small">Mean absolute error (MAE) and mean bias in detections per AOI-month. Lower MAE is better. Selection uses validation only; test was opened once. No “accuracy %”.</p>
      <div className="table-wrap">
        <table className="tbl tbl--num">
          <thead>
            <tr><th rowSpan={2}>Model</th><th colSpan={2}>Validation 2021–22</th><th colSpan={2}>Test 2023–24</th><th rowSpan={2}>80% interval coverage (test)</th></tr>
            <tr><th>MAE</th><th>Bias</th><th>MAE</th><th>Bias</th></tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const v = get(m, 'val', 'aoi_month'), t = get(m, 'test', 'aoi_month');
              const sel = m === manifest.selected_model_id;
              return (
                <tr key={m} className={sel ? 'is-sel' : ''}>
                  <th scope="row">{m}{sel && <span className="badge badge--sel">app estimate</span>}{v?.status && v.status !== 'ok' && <span className="badge">{v.status}</span>}</th>
                  <td>{fmtNum(num(v?.mae), 2)}</td><td>{fmtSigned(num(v?.bias))}</td>
                  <td>{fmtNum(num(t?.mae), 2)}</td><td>{fmtSigned(num(t?.bias))}</td>
                  <td>{fmtPct(cov(m))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {manifest.release_reason && <details className="details"><summary>Why this model was selected (gate)</summary><p className="small">{manifest.release_reason}</p></details>}

      <section className="qml">
        <header className="qml__head">
          <h3>Quantum-ML subset study</h3>
          <span className="badge badge--research">research — simulated on classical hardware</span>
        </header>
        <p className="muted small">Q1 is a simulated variational circuit trained on a bounded subset. Every classical model is retrained on the same subset for a fair comparison. This panel is not the app's estimator, and we make no quantum-advantage claim.</p>
        <div className="table-wrap">
          <table className="tbl tbl--num">
            <thead><tr><th>Model</th><th>Trained on</th><th>n</th><th>Val MAE</th><th>Test MAE</th><th>Val Poisson dev.</th></tr></thead>
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
        <p className="small"><b>Q2 QLLM</b> (LLM-guided search over Q1 configs): <span className="badge">{String(q2?.status ?? 'unknown')}</span> {q2?.error ? <span className="muted">— {String(q2.error).replace(/ under \S+/, '')}</span> : null}</p>
      </section>
      <p className="small">Model cards: {[...models, 'Q1_vqc', 'Q2_qllm'].map((m, i) => <span key={m}>{i ? ' · ' : ''}<a href={`${snapshotPath}models/${m}/model_card.json`} target="_blank" rel="noreferrer">{m}</a></span>)}</p>
    </div>
  );
}
