// CSV + printable evidence brief with full provenance.
import type { ActivityRecord, Manifest, Region } from '../types';
import { deriveDisplayState, headlineValue } from './api';
import { explainMonth } from './explain';
import { DASH, fmtCount, fmtNum, fmtPct, monthLabelFromIso, utcRangeLabel } from './format';
import type { SourceEntry } from './schemas';

export const UNITS =
  'Counts of type-0 (presumed vegetation fire) active-fire detections per AOI per UTC calendar month. ' +
  'Estimate = expected S-NPP VIIRS 375 m reference detections (VIIRS-equivalent), harmonized from Aqua MODIS C6.1.';

export interface ExportMeta {
  snapshotId: string;
  releaseStage: string;
  releaseReason?: string | null;
  synthetic?: boolean;
  selectedModelId?: string | null;
  aoiName?: string | null;
  /** Free-text method line; default derived from selectedModelId. */
  method?: string;
  units?: string;
  generatedUtc?: string;
  /** sources.json entries; adds provenance sha256/url columns. */
  sources?: SourceEntry[];
}

export const CSV_COLUMNS = [
  'snapshot_id', 'release_stage', 'aoi_id', 'period_start_utc', 'period_end_utc_exclusive',
  'display_state', 'headline_value', 'headline_kind',
  'raw_modis_detections', 'raw_modis_terra_detections', 'raw_viirs_reference_detections',
  'static_source_detections_modis', 'static_source_detections_viirs',
  'estimated_viirs_reference_detections', 'estimate_interval_low', 'estimate_interval_high',
  'interval_nominal_level', 'interval_empirical_holdout_coverage',
  'extract_status', 'coverage_status', 'coverage_fraction', 'value_status', 'split', 'model_id',
  'anomaly_baseline_years', 'anomaly_rank', 'anomaly_zscore_log', 'anomaly_flag',
  'source_platform', 'reference_platform', 'source_product', 'reference_product',
  'provenance_ids', 'provenance_sha256', 'provenance_urls', 'reason'
] as const;

/** REVIEW M3: text cells that a spreadsheet would evaluate as a formula get a leading apostrophe. Numbers are untouched. */
export function neutralizeFormula(t: string): string {
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const t = typeof v === 'number' || typeof v === 'boolean' ? String(v) : neutralizeFormula(String(v));
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function methodLine(meta: Pick<ExportMeta, 'method' | 'selectedModelId'>): string {
  if (meta.method) return meta.method;
  const m = meta.selectedModelId ?? 'unknown';
  return `Aqua MODIS (source) mapped to S-NPP VIIRS (reference) scale with model ${m}; selection on validation only; ` +
    'intervals from validation residual quantiles (80% nominal). Missing values are empty, never zero.';
}

/** CSV with '#'-prefixed header comment lines (snapshot, release_stage, units, method), then one row per record. */
export function toCsv(records: (ActivityRecord | null | undefined)[], meta: ExportMeta): string {
  const src = new Map((meta.sources ?? []).map((s) => [s.id, s]));
  const lines: string[] = [
    '# Lumos Fire Calendar export',
    `# snapshot_id: ${meta.snapshotId}`,
    `# release_stage: ${meta.releaseStage}`,
    ...(meta.releaseReason ? [`# release_reason: ${oneLine(meta.releaseReason)}`] : []),
    ...(meta.synthetic ? ['# DEMO DATA: synthetic fixture, not real observations'] : []),
    ...(meta.aoiName ? [`# aoi: ${meta.aoiName}`] : []),
    `# units: ${oneLine(meta.units ?? UNITS)}`,
    `# method: ${oneLine(methodLine(meta))}`,
    '# times: UTC calendar months; period_end_utc_exclusive is exclusive',
    '# sources: NASA FIRMS (MODIS C6.1, VIIRS 375 m S-NPP) yearly country CSVs; see provenance columns',
    `# generated_utc: ${meta.generatedUtc ?? new Date().toISOString()}`,
    CSV_COLUMNS.join(',')
  ];
  for (const r of records) {
    if (!r) continue;
    const h = headlineValue(r);
    const prov = r.provenance_ids ?? [];
    const row: Record<string, unknown> = {
      ...r,
      snapshot_id: r.snapshot_id || meta.snapshotId,
      release_stage: meta.releaseStage,
      display_state: deriveDisplayState(r),
      headline_value: h.value,
      headline_kind: h.kind,
      anomaly_baseline_years: r.anomaly?.baseline_years,
      anomaly_rank: r.anomaly?.rank,
      anomaly_zscore_log: r.anomaly?.zscore_log,
      anomaly_flag: r.anomaly?.flag,
      provenance_ids: prov.join(';'),
      provenance_sha256: prov.map((p) => src.get(p)?.sha256 ?? '').join(';'),
      provenance_urls: prov.map((p) => src.get(p)?.url ?? '').join(';')
    };
    lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

function oneLine(t: string): string {
  return t.replace(/[\r\n]+/g, ' ');
}

export function escapeHtml(t: unknown): string {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface BriefInput {
  record: ActivityRecord | null;
  manifest: Pick<Manifest, 'snapshot_id' | 'release_stage' | 'selected_model_id' | 'created_utc'> & Partial<Manifest>;
  region?: Pick<Region, 'aoi_id' | 'name' | 'country' | 'bbox'> | null;
  sources?: SourceEntry[];
  /** Optional year context (12 records) for a small table. */
  yearRecords?: (ActivityRecord | null)[];
  generatedUtc?: string;
}

/** Self-contained printable HTML document (print CSS) for one AOI-month. */
export function briefHtml(inp: BriefInput): string {
  const { record: r, manifest: m, region } = inp;
  const name = region?.name ?? r?.aoi_id ?? '—';
  const month = r ? monthLabelFromIso(r.period_start_utc, true) : '—';
  const src = new Map((inp.sources ?? []).map((s) => [s.id, s]));
  const synthetic = !!m.synthetic || r?.value_status === 'demo';
  const row = (k: string, v: string) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;
  const facts = r
    ? [
        row('Display state', deriveDisplayState(r)),
        row('UTC period', utcRangeLabel(r.period_start_utc, r.period_end_utc_exclusive)),
        row('Aqua MODIS detections (source)', fmtCount(r.raw_modis_detections)),
        row('S-NPP VIIRS detections (reference)', fmtCount(r.raw_viirs_reference_detections)),
        row('Terra MODIS detections (separate)', fmtCount(r.raw_modis_terra_detections)),
        row('Static-source detections MODIS / VIIRS', `${fmtCount(r.static_source_detections_modis)} / ${fmtCount(r.static_source_detections_viirs)}`),
        row('Harmonized estimate (VIIRS-equivalent)', fmtNum(r.estimated_viirs_reference_detections)),
        row('Interval', r.estimate_interval_low == null || r.estimate_interval_high == null ? DASH :
          `${fmtNum(r.estimate_interval_low)}–${fmtNum(r.estimate_interval_high)} (${fmtPct(r.interval_nominal_level)} nominal; empirical holdout coverage ${fmtPct(r.interval_empirical_holdout_coverage)})`),
        row('Extract status', r.extract_status),
        row('Value status', r.value_status),
        row('Split', r.split),
        row('Model', r.model_id ?? DASH),
        row('Anomaly', r.anomaly ? `flag ${r.anomaly.flag ?? DASH}; rank ${r.anomaly.rank ?? DASH}; baseline years ${r.anomaly.baseline_years ?? DASH}; log z ${r.anomaly.zscore_log ?? DASH}` : DASH),
        row('Coverage', `${r.coverage_status}; cloud-free fraction unknown (FIRMS points give no denominator)`)
      ].join('')
    : row('Record', 'No record for this month (missing, not zero)');
  const prov = (r?.provenance_ids ?? []).map((id) => {
    const s = src.get(id);
    return `<tr><td>${escapeHtml(id)}</td><td>${escapeHtml(s?.status ?? DASH)}</td><td class="mono">${escapeHtml(s?.sha256 ?? DASH)}</td><td class="mono">${escapeHtml(s?.url ?? DASH)}</td></tr>`;
  }).join('');
  const yr = (inp.yearRecords ?? []).filter((x): x is ActivityRecord => !!x);
  const yearTable = yr.length
    ? `<h2>Year context</h2><table><thead><tr><th>Month</th><th>State</th><th>Aqua</th><th>VIIRS</th><th>Estimate</th></tr></thead><tbody>${yr
        .map((x) => `<tr><td>${escapeHtml(monthLabelFromIso(x.period_start_utc))}</td><td>${escapeHtml(deriveDisplayState(x))}</td><td>${fmtCount(x.raw_modis_detections)}</td><td>${fmtCount(x.raw_viirs_reference_detections)}</td><td>${fmtNum(x.estimated_viirs_reference_detections)}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const explain = explainMonth(r, { aoiName: region?.name, synthetic }).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evidence brief — ${escapeHtml(name)} ${escapeHtml(month)}</title>
<style>
:root{color-scheme:light}body{font:14px/1.45 Inter,system-ui,sans-serif;margin:24px;color:#0B1220;background:#fff;max-width:900px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #9aa4b8;padding:4px 6px;text-align:left;vertical-align:top}th[scope=row]{width:38%}
.mono{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all}.demo{border:2px solid #EF4444;color:#B91C1C;padding:6px 10px;font-weight:700;margin:8px 0}
.meta{color:#334155}@media print{body{margin:12mm}a{color:inherit}.noprint{display:none}}
</style></head><body>
<h1>Lumos Fire Calendar — evidence brief</h1>
<p class="meta">${escapeHtml(name)}${region?.country && region.country !== name ? ` (${escapeHtml(region.country)})` : ''} · ${escapeHtml(month)} · snapshot <span class="mono">${escapeHtml(m.snapshot_id)}</span> · release stage <b>${escapeHtml(m.release_stage)}</b></p>
${synthetic ? '<div class="demo">DEMO DATA — synthetic fixture, not real observations.</div>' : ''}
${m.release_reason ? `<p class="meta">Release reason: ${escapeHtml(m.release_reason)}</p>` : ''}
<h2>Summary</h2><ul>${explain}</ul>
<h2>Record</h2><table><tbody>${facts}</tbody></table>
<h2>Units</h2><p>${escapeHtml(UNITS)}</p>
<h2>Method</h2><p>${escapeHtml(methodLine({ selectedModelId: m.selected_model_id }))}</p>
${region?.bbox ? `<p class="meta">AOI bbox (W,S,E,N): ${region.bbox.map((v) => v.toFixed(3)).join(', ')}</p>` : ''}
<h2>Sources (provenance)</h2>${prov ? `<table><thead><tr><th>Source id</th><th>Status</th><th>sha256</th><th>URL</th></tr></thead><tbody>${prov}</tbody></table>` : '<p>No source ids recorded for this month.</p>'}
<p class="meta">Data: NASA FIRMS active-fire products (MODIS C6.1, VIIRS 375 m S-NPP). Boundaries: Natural Earth (public domain).</p>
${yearTable}
<p class="meta">Snapshot created ${escapeHtml(m.created_utc)} · brief generated ${escapeHtml(inp.generatedUtc ?? new Date().toISOString())}</p>
</body></html>`;
}
