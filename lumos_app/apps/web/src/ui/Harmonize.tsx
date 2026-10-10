import { useEffect, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { Icon3D } from './icons/Icon3D';
import type { ActivityRecord, Manifest, Region, Selection } from '../types';
import { BROWSER_MODELS, harmonizeInBrowser, type BrowserHarmonization, type BrowserModelId } from './bridge';
import { api } from './useAppData';
import { fmtNum, MONTHS_SHORT } from '../data/format';

interface Props { record: ActivityRecord | null; selection: Selection; region: Region | undefined; manifest: Manifest }

export function Harmonize({ selection, region, manifest }: Props) {
  const [on, setOn] = useState(false);
  const def = (BROWSER_MODELS as string[]).includes(manifest.selected_model_id) ? (manifest.selected_model_id as BrowserModelId) : 'B0_month_ratio';
  const [model, setModel] = useState<BrowserModelId>(def);
  const [res, setRes] = useState<{ key: string; h: BrowserHarmonization | null; err?: string; ms: number } | null>(null);
  const key = `${model}:${selection.aoiId}:${selection.year}`;

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const t0 = performance.now();
    harmonizeInBrowser(api, manifest.snapshot_id, model, selection.aoiId, selection.year, manifest.selected_model_id)
      .then((h) => alive && setRes({ key, h, ms: performance.now() - t0 }))
      .catch((e) => alive && setRes({ key, h: null, err: String((e as Error).message ?? e), ms: 0 }));
    return () => { alive = false; };
  }, [on, key, manifest, model, selection.aoiId, selection.year]);

  const cur = res && res.key === key ? res : null;
  const h = cur?.h;
  const mi = selection.month - 1;
  return (
    <div className="harm">
      <div className="harm__row">
        <label className="switch">
          <input type="checkbox" role="switch" checked={on} onChange={(e) => setOn(e.target.checked)} />
          <span className="switch__track" aria-hidden><span className="switch__thumb" /></span>
          <span>Recompute from exported weights</span>
        </label>
        <div className="seg seg--sm" role="group" aria-label="Model to recompute">
          {BROWSER_MODELS.map((m) => <button key={m} className={model === m ? 'is-on' : ''} aria-pressed={model === m} onClick={() => setModel(m)}>{m}</button>)}
        </div>
      </div>
      {!on && <p className="muted small">Runs {model} in this browser from <code>weights.json</code> + per-cell inputs and checks parity (≤1e-3 relative) against the bundle — proof the published weights are live.</p>}
      {on && !cur && <p className="muted small">Computing…</p>}
      {on && cur && !h && <p className="notice small">{cur.err ?? `${model} inputs are not exported for ${region?.name ?? selection.aoiId} ${selection.year} (B1 per-cell features exist for Bangladesh and New South Wales only).`}</p>}
      {on && h && (
        <>
          <div className="harm__result">
            <div><span className="muted small">Browser ({MONTHS_SHORT[mi]})</span><b>{fmtNum(h.recomputed.months[mi])}</b></div>
            <div><span className="muted small">{h.exportedSource === 'activity_estimate' ? 'Exported estimate' : 'Notebook check sum'}</span><b>{fmtNum(h.exported[mi])}</b></div>
            <span className={'parity ' + (h.parity.n === 0 ? 'parity--na' : h.parity.ok ? 'parity--ok' : 'parity--bad')} role="status">
              <span className="parity__h">{h.parity.n === 0 && !h.parity.nullMismatch ? 'No comparable months' : h.parity.ok ? <><Icon3D icon={CircleCheck} tone="teal" size={16} />Parity</> : <><Icon3D icon={CircleX} tone="red" size={16} />Parity fails</>}</span>
              {h.parity.n > 0 && <small> max rel. diff {h.parity.maxRelDiff.toExponential(1)} (raw {h.parity.maxRelDiffRaw.toExponential(1)}) · {h.parity.n} months · tol {h.parity.tolerance}</small>}
              {h.parity.nullMismatch > 0 && <small> · {h.parity.nullMismatch} month{h.parity.nullMismatch > 1 ? 's' : ''} empty on one side only ({h.parity.mismatchMonths.map((k) => MONTHS_SHORT[k - 1]).join(', ')})</small>}
            </span>
          </div>
          <p className="muted small">Inputs: {h.recomputed.inputs} · computed in {cur.ms.toFixed(0)} ms · “max rel. diff” allows for the export’s rounding ({h.parity.quantum}); “raw” does not{h.exportedSource === 'features_check' ? ` · ${model} is not the selected app model, so it is checked against the notebook's own per-month sums` : ''}.</p>
        </>
      )}
    </div>
  );
}
