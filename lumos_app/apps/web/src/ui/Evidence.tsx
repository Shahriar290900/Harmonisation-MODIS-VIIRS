import type { ActivityRecord, Manifest, Region, Selection } from '../types';
import { ChevronDown, ChevronUp, Download, ExternalLink, FlaskConical, Printer, RotateCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Icon3D } from './icons/Icon3D';
import { explainMonth, shownAnomalyFlag, terraOnlyIssue } from './bridge';
import { fmtNum, fmtPct, fmtSigned, monthLabel, ordinal, utcRangeLabel } from '../data/format';
import { STATE_LABEL, SPLIT_LABEL, type CellState } from './glyphs';
import { Glyph } from './Glyph';
import { SERIES_COLORS } from '../types';
import type { SourceEntry } from './useAppData';
import { Harmonize } from './Harmonize';
import { exportCsv, printBrief } from './exporting';

interface Props {
  record: ActivityRecord | null; selection: Selection;
  /** Cell state incl. UI-only 'unavailable' / 'loading' (year file failed to load / in flight). */
  state: CellState; yearError?: string; offline?: boolean; onRetry?: () => void; region: Region | undefined; manifest: Manifest;
  snapshotPath: string; sources: Map<string, SourceEntry>; allRecords: ActivityRecord[];
  expanded?: boolean; onToggle?: () => void; embedded?: boolean;
}

export function Evidence({ record: r, state: st, yearError, offline, onRetry, selection, region, manifest, snapshotPath, sources, allRecords, expanded = true, onToggle, embedded }: Props) {
  const unavailable = st === 'unavailable', loading = st === 'loading';
  const lines = unavailable
    ? [`${region?.name ?? selection.aoiId}, ${monthLabel(selection.year, selection.month)}: Unavailable — ${offline ? 'this year is not cached for offline use' : `this year's file failed to load${yearError ? ` (${yearError})` : ''}`}.`,
       'The record exists in the snapshot; it is not missing data and not zero. Reconnect and retry.']
    : loading ? ['Loading this month…']
    : explainMonth(r, { aoiName: region?.name, synthetic: manifest.synthetic });
  const flag = unavailable || loading ? null : shownAnomalyFlag(r, st);
  const flagHidden = !flag && (r?.anomaly?.flag === 'high' || r?.anomaly?.flag === 'low');
  const yearRecords = Array.from({ length: 12 }, (_, i) => allRecords.find((x) => x.period_start_utc.startsWith(`${selection.year}-${String(i + 1).padStart(2, '0')}`)) ?? null);
  const a = r?.anomaly;
  return (
    <section className={'panel evidence' + (expanded ? ' is-open' : '') + (embedded ? ' evidence--embedded' : '')} aria-label="Evidence for selected month">
      <div className="evidence__head">
        <div className="evidence__title">
          <h2>{monthLabel(selection.year, selection.month, true)} <span className="muted">· {region?.name}</span></h2>
          <div className="badges">
            <span className={'badge st-' + st}><Glyph state={st} size={11} /> {STATE_LABEL[st]}</span>
            {r && r.split !== 'none' && <span className={'badge sp-' + r.split}>{SPLIT_LABEL[r.split]} split</span>}
            {flag === 'high' && <span className="badge anom-h"><Icon3D icon={TrendingUp} tone="red" size={13} />Unusually high</span>}
            {flag === 'low' && <span className="badge anom-l"><Icon3D icon={TrendingDown} tone="cyan" size={13} />Unusually low</span>}
            {r?.value_status === 'demo' && <span className="badge badge--demo"><Icon3D icon={FlaskConical} tone="red" size={13} />DEMO</span>}
          </div>
        </div>
        <div className="evidence__actions">
          <button className="btn" onClick={() => exportCsv(allRecords, region, manifest, sources)} disabled={!allRecords.length}><Icon3D icon={Download} tone="teal" size={15} />Export CSV</button>
          <button className="btn" onClick={() => r && printBrief(r, region, manifest, sources, yearRecords)} disabled={!r}><Icon3D icon={Printer} tone="neutral" size={15} />Print brief</button>
          {onToggle && <button className="btn btn--ghost" onClick={onToggle} aria-expanded={expanded}>{expanded ? 'Close' : 'All evidence'}<Icon3D icon={expanded ? ChevronDown : ChevronUp} tone="neutral" size={15} /></button>}
        </div>
      </div>
      <div className="evidence__explain" aria-live="polite">{(expanded ? lines : [lines[1] ?? lines[0]]).map((l, i) => <p key={i}>{l}</p>)}</div>
      {unavailable && onRetry && <p><button className="btn btn--sm" onClick={onRetry}><Icon3D icon={RotateCw} tone="current" size={14} />Retry loading</button></p>}
      {expanded && r && !unavailable && (
        <div className="evidence__grid">
          <Group title="Raw detections (type 0)">
            <KV k="Aqua MODIS" v={fmtNum(r.raw_modis_detections)} c={SERIES_COLORS.aqua} />
            <KV k="S-NPP VIIRS" v={fmtNum(r.raw_viirs_reference_detections)} c={SERIES_COLORS.viirs} />
            <KV k="Terra MODIS" v={r.raw_modis_terra_detections == null && terraOnlyIssue(r) ? '— (Terra unavailable; not used in the estimate)' : fmtNum(r.raw_modis_terra_detections)} c={SERIES_COLORS.terra} />
            <KV k="Static · MODIS" v={fmtNum(r.static_source_detections_modis)} c={SERIES_COLORS.static} />
            <KV k="Static · VIIRS" v={fmtNum(r.static_source_detections_viirs)} c={SERIES_COLORS.static} />
          </Group>
          <Group title="VIIRS-scale estimate">
            <KV k="Estimate" v={fmtNum(r.estimated_viirs_reference_detections)} c={SERIES_COLORS.estimate} big />
            <KV k={`${fmtPct(r.interval_nominal_level)} interval`} v={r.estimate_interval_low != null ? `${fmtNum(r.estimate_interval_low)} – ${fmtNum(r.estimate_interval_high)}` : '—'} />
            <KV k="Empirical holdout coverage" v={fmtPct(r.interval_empirical_holdout_coverage)} />
            <KV k="Model" v={r.model_id ? <a href={`${snapshotPath}models/${r.model_id}/model_card.json`} target="_blank" rel="noreferrer">{r.model_id}<Icon3D icon={ExternalLink} tone="cyan" size={12} className="i3d--inline" /></a> : '—'} />
          </Group>
          <Group title="Status">
            <KV k="Extract" v={r.extract_status} />
            <KV k="Value status" v={r.value_status} />
            <KV k="Split" v={SPLIT_LABEL[r.split]} />
            <KV k="Cloud-free coverage" v={`${r.coverage_status} (FIRMS has no denominator)`} />
            <KV k="UTC bounds" v={utcRangeLabel(r.period_start_utc, r.period_end_utc_exclusive)} small />
          </Group>
          <Group title="Anomaly (same month, other years)">
            <KV k="Flag" v={flagHidden ? `${a?.flag} (not shown: ${st} month)` : a?.flag ?? '—'} />
            <KV k="Rank" v={a?.rank != null ? `${ordinal(a.rank)} of ${a.baseline_years != null ? a.baseline_years + 1 : '—'} years` : '—'} />
            <KV k="z-score (log)" v={fmtSigned(a?.zscore_log)} />
          </Group>
          <Group title="Provenance" wide>
            <ul className="prov">
              {r.provenance_ids.length === 0 && <li className="muted">No source files (month outside product coverage).</li>}
              {r.provenance_ids.map((id) => {
                const s = sources.get(id);
                return (
                  <li key={id}>
                    <code>{id}</code>
                    {s?.sha256 && <span className="prov__sha" title={s.sha256}>sha256 {s.sha256.slice(0, 12)}…</span>}
                    {s?.status && <span className={'prov__st prov__st--' + s.status}>{s.status}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="evidence__reason">{r.reason}</p>
          </Group>
          <Group title="Harmonize in your browser" wide>
            <Harmonize record={r} selection={selection} region={region} manifest={manifest} />
          </Group>
        </div>
      )}
      {expanded && !r && st === 'missing' && <p className="muted">No record exists for this month in the snapshot. Missing is shown as missing, never as zero.</p>}
    </section>
  );
}

function Group({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={'grp' + (wide ? ' grp--wide' : '')}><h3>{title}</h3><dl>{children}</dl></div>;
}
function KV({ k, v, c, big, small }: { k: string; v: React.ReactNode; c?: string; big?: boolean; small?: boolean }) {
  return (
    <div className={'kv' + (big ? ' kv--big' : '') + (small ? ' kv--small' : '')}>
      <dt>{c && <i className="dot" style={{ background: c }} />}{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
