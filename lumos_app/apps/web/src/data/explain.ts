// Deterministic plain-English templates. Every number printed comes from a record field (or a ratio of two fields);
// nothing is invented. Unknown values are omitted or shown as '—', never as 0/NaN/undefined/null.
import type { ActivityRecord } from '../types';
import { deriveDisplayState, recordMonth, recordYear, shownAnomalyFlag, terraOnlyIssue } from './api';
import { fmtCount, fmtNum, fmtPct, fmtRatio, isNum, monthLabel, ordinal } from './format';

export interface ExplainContext {
  /** Region display name, e.g. 'Bangladesh'. Defaults to aoi_id. */
  aoiName?: string;
  /** Manifest flag; adds a synthetic-data sentence. */
  synthetic?: boolean;
}

export const SPLIT_MEANING: Record<string, string> = {
  train: 'This year was used to fit the harmonization model (training period 2013–2020), so the estimate is not an independent test here.',
  val: 'This year was in the validation period (2021–2022), used only to choose the model and its interval.',
  test: 'This year is in the held-out test period (2023–2024), opened once at the end to measure accuracy.',
  backcast: 'This is a backcast: VIIRS did not exist yet, so the value is estimated from Aqua MODIS and mapped to the VIIRS S-NPP scale.',
  none: 'This month is outside the model periods (no train/validation/test role).'
};

/** REVIEW M4: the notebook labels 2012 'backcast' although S-NPP VIIRS is observed from 2012-01-20. */
export const BACKCAST_WITH_VIIRS =
  'This month is in the backcast period (before the 2013–2020 training years): the estimate is mapped from Aqua MODIS to the VIIRS S-NPP scale, and the observed S-NPP VIIRS count is also shown.';

export function splitMeaning(rec: Pick<ActivityRecord, 'split' | 'raw_viirs_reference_detections' | 'period_start_utc'>): string | null {
  if (!s(rec.split)) return null;
  if (rec.split === 'backcast') {
    const y = recordYear(rec as ActivityRecord);
    if (isNum(rec.raw_viirs_reference_detections) || (isNum(y) && y >= 2012)) return BACKCAST_WITH_VIIRS;
  }
  return SPLIT_MEANING[rec.split] ?? null;
}

export const STATE_MEANING: Record<string, string> = {
  observed: 'Observed: S-NPP VIIRS detections were recorded for the full month.',
  estimated: 'Estimated: no complete VIIRS observation, so the harmonized estimate from Aqua MODIS is shown.',
  partial: 'Partial: at least one source file covers only part of this month, so counts may be incomplete.',
  missing: 'Missing: no usable source data. This is shown as missing, not as zero.',
  unsupported: 'Unsupported: no harmonized estimate is possible for this month (e.g. 2001–2002, before a full Aqua MODIS year).'
};

/** Pull "Platform status: note" fragments out of the record's reason string (written by Notebook B). */
export function sourceNotes(reason: string | null | undefined): string[] {
  if (!reason) return [];
  const out: string[] = [];
  const re = /(Aqua MODIS|Terra MODIS|S-NPP VIIRS|NOAA-20 VIIRS)\s+(missing|partial|error)\s*:\s*([^|]+?)(?=\s*\||\.\s*Anomaly|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reason))) out.push(`${m[1]} ${m[2]}: ${m[3].trim().replace(/\.$/, '').replace(/\bfield null\b/g, 'value left empty (not zero)').replace(/\b(NaN|undefined|null)\b/g, '—')}.`);
  return out;
}

const s = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Sentences explaining one AOI-month. Returns [] for a null record's details except a missing notice. */
export function explainMonth(rec: ActivityRecord | null | undefined, ctx: ExplainContext = {}): string[] {
  if (!rec) return ['No record exists for this month in the snapshot. It is shown as missing, not as zero.'];
  const y = recordYear(rec), mo = recordMonth(rec);
  const when = isNum(y) && isNum(mo) ? monthLabel(y, mo) : 'this month';
  const where = s(ctx.aoiName) ? ctx.aoiName : s(rec.aoi_id) ? rec.aoi_id : 'this area';
  const state = deriveDisplayState(rec);
  const aqua = rec.raw_modis_detections, viirs = rec.raw_viirs_reference_detections, terra = rec.raw_modis_terra_detections;
  const est = rec.estimated_viirs_reference_detections, lo = rec.estimate_interval_low, hi = rec.estimate_interval_high;
  const out: string[] = [];

  out.push(`${where}, ${when} (UTC): ${STATE_MEANING[state]}`);

  // Sensor comparison
  if (isNum(viirs) && isNum(aqua)) {
    if (aqua > 0) {
      const r = viirs / aqua;
      const tail = r >= 1
        ? 'this is typical of the sensor gap (VIIRS 375 m pixels see smaller fires), not necessarily more fire.'
        : 'VIIRS usually records more than Aqua, so a lower ratio is unusual for this sensor pair.';
      out.push(`In ${when} VIIRS recorded ${fmtCount(viirs)} detections, about ${fmtRatio(r)} Aqua's ${fmtCount(aqua)}; ${tail}`);
    } else if (viirs > 0) {
      out.push(`In ${when} VIIRS recorded ${fmtCount(viirs)} detections while Aqua MODIS recorded none; VIIRS's finer pixels can see fires MODIS misses.`);
    } else {
      out.push(`In ${when} neither VIIRS nor Aqua MODIS recorded any vegetation-fire detections.`);
    }
  } else if (isNum(aqua)) {
    out.push(`Aqua MODIS recorded ${fmtCount(aqua)} detections in ${when}; no S-NPP VIIRS reference count is available for this month${isNum(y) && y < 2012 ? ' (VIIRS S-NPP data start in 2012)' : ''}.`);
  } else if (isNum(viirs)) {
    out.push(`VIIRS recorded ${fmtCount(viirs)} detections in ${when}; no Aqua MODIS count is available.`);
  }
  if (isNum(terra)) out.push(`Terra MODIS recorded ${fmtCount(terra)} detections; Terra is shown separately and is never pooled into the estimate.`);
  else if (terraOnlyIssue(rec)) out.push('Only the Terra MODIS count is unavailable this month; Terra is never part of the estimate, so the VIIRS and estimate values above are unaffected.');

  // Estimate
  if (isNum(est)) {
    let t = `The harmonized estimate is ${fmtNum(est, 1)} VIIRS-equivalent detections`;
    if (isNum(lo) && isNum(hi)) {
      t += ` (${isNum(rec.interval_nominal_level) ? fmtPct(rec.interval_nominal_level) + ' ' : ''}interval ${fmtNum(lo, 1)}–${fmtNum(hi, 1)}`;
      if (isNum(rec.interval_empirical_holdout_coverage)) t += `; empirical holdout coverage ${fmtPct(rec.interval_empirical_holdout_coverage)}`;
      t += ')';
    }
    if (s(rec.model_id)) t += `, from model ${rec.model_id}`;
    out.push(`${t}.`);
  }

  // Static sources
  const stm = rec.static_source_detections_modis, sv = rec.static_source_detections_viirs;
  if ((isNum(stm) && stm > 0) || (isNum(sv) && sv > 0)) {
    const parts = [isNum(stm) ? `${fmtCount(stm)} MODIS` : null, isNum(sv) ? `${fmtCount(sv)} VIIRS` : null].filter(Boolean);
    out.push(`${parts.join(' and ')} detections were flagged as static or non-vegetation sources (e.g. kilns, industry, volcanoes, offshore) and are counted separately.`);
  }

  // Split
  const sm = splitMeaning(rec);
  if (sm) out.push(sm);

  // Anomaly
  const an = rec.anomaly;
  const suppressed = !!an && (an.flag === 'high' || an.flag === 'low') && !shownAnomalyFlag(rec, state);
  if (suppressed) {
    out.push(`No anomaly marker is shown: this is a ${state} month, and partial or missing months are excluded from the anomaly comparison.`);
  } else if (an && an.flag && an.flag !== 'insufficient' && isNum(an.rank) && isNum(an.baseline_years)) {
    const of = an.baseline_years + 1;
    const z = isNum(an.zscore_log) ? ` (log z-score ${an.zscore_log.toFixed(2)})` : '';
    const label = an.flag === 'high' ? 'unusually high' : an.flag === 'low' ? 'unusually low' : 'within the normal range';
    out.push(`Compared with the same month in ${an.baseline_years} other years, this month ranks ${ordinal(an.rank)} highest of ${of}${z}: ${label}.`);
  } else if (an && an.flag === 'insufficient') {
    out.push(isNum(an.baseline_years)
      ? `No anomaly is given: it needs a value for this month and enough comparable years (${an.baseline_years} available).`
      : 'No anomaly is given: not enough comparable years.');
  }

  // Missing / partial reasons from B's notes
  if (state === 'missing' || state === 'partial' || state === 'unsupported' || rec.extract_status !== 'complete') {
    for (const n of sourceNotes(rec.reason)) out.push(n);
  }

  if (rec.value_status === 'demo' || ctx.synthetic) out.push('DEMO DATA: these values come from a synthetic fixture, not real observations.');
  return out.filter((x) => s(x) && !/\b(NaN|undefined|null)\b/.test(x));
}

export function explainMonthText(rec: ActivityRecord | null | undefined, ctx: ExplainContext = {}): string {
  return explainMonth(rec, ctx).join(' ');
}
