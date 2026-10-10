import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../apps/web/src/types';
import { explainMonth, explainMonthText, sourceNotes } from '../../apps/web/src/data/explain';
import { briefHtml, CSV_COLUMNS, toCsv } from '../../apps/web/src/data/export';
import { fmtNum, monthLabel, monthLabelFromIso, parseCsv, fmtCompact, ordinal } from '../../apps/web/src/data/format';
import { parseActivityFile, type SourceEntry } from '../../apps/web/src/data/schemas';
import { activityFiles, readJson, SNAP_ID } from './helpers';

const load = (aoi: string, y: number) => parseActivityFile(readJson(`activity/${aoi}/${y}.json`)) as ActivityRecord[];
const manifest = readJson<Record<string, unknown>>('manifest.json');
const sources = readJson<SourceEntry[]>('sources.json');

describe('format', () => {
  it('UTC month labels and dashes', () => {
    expect(monthLabel(2016, 3)).toBe('Mar 2016');
    expect(monthLabelFromIso('2016-12-01T00:00:00Z', true)).toBe('December 2016');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(NaN)).toBe('—');
    expect(fmtNum(1234)).toBe('1,234');
    expect(fmtCompact(12345)).toBe('12k');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(13)).toBe('13th');
  });
  it('parseCsv handles quotes', () => {
    expect(parseCsv('a,b\n"x,1","he said ""hi"""\n')).toEqual([{ a: 'x,1', b: 'he said "hi"' }]);
  });
});

describe('explainMonth', () => {
  it('sensor-ratio sentence uses only record numbers', () => {
    const t = explainMonthText(load('BGD', 2016)[2], { aoiName: 'Bangladesh' });
    expect(t).toContain('In Mar 2016 VIIRS recorded 408 detections, about 3.1× Aqua\'s 133');
    expect(t).toContain('468.65'.slice(0, 3));
    expect(t).toMatch(/ranks 14th highest of 23/);
  });
  it('backcast meaning', () => {
    expect(explainMonthText(load('BGD', 2005)[0])).toMatch(/backcast: VIIRS did not exist yet/i);
  });
  it('missing reasons for AUS 2016 VIIRS', () => {
    const lines = explainMonth(load('AUS', 2016)[2]);
    expect(lines.join(' ')).toMatch(/S-NPP VIIRS missing/);
    expect(sourceNotes(load('AUS', 2016)[2].reason).length).toBeGreaterThan(0);
  });
  it('null record is safe', () => {
    expect(explainMonth(null)[0]).toMatch(/missing, not as zero/);
  });
  it("never prints 'NaN', 'undefined' or 'null' for any sample record (or a fully-null record)", () => {
    const bad = /\b(NaN|undefined|null)\b/;
    for (const f of activityFiles()) for (const r of load(f.split('/')[1], Number(f.split('/')[2].slice(0, 4)))) {
      const t = explainMonthText(r, { synthetic: true });
      expect(bad.test(t), `${f} ${r.period_start_utc}: ${t}`).toBe(false);
    }
    const r0 = load('BGD', 2016)[0];
    const empty = Object.fromEntries(Object.entries(r0).map(([k, v]) => [k, typeof v === 'number' ? null : v])) as ActivityRecord;
    expect(bad.test(explainMonthText({ ...empty, anomaly: null, model_id: null, reason: '' }))).toBe(false);
  });
});

describe('export', () => {
  const recs = load('AUS', 2016);
  const csv = toCsv(recs, {
    snapshotId: SNAP_ID, releaseStage: String(manifest.release_stage), synthetic: true, selectedModelId: String(manifest.selected_model_id),
    aoiName: 'Australia', sources, generatedUtc: '2026-10-09T00:00:00Z'
  });
  it('has provenance header lines and columns', () => {
    expect(csv).toContain(`# snapshot_id: ${SNAP_ID}`);
    expect(csv).toContain('# release_stage: ui_prototype');
    expect(csv).toMatch(/# units: /);
    expect(csv).toMatch(/# method: .*B0_month_ratio/);
    expect(csv).toContain('DEMO DATA');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(12);
    expect(Object.keys(rows[0])).toEqual([...CSV_COLUMNS]);
    expect(rows[2].provenance_ids).toBe('modis_2016_Australia');
    expect(rows[2].provenance_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[2].snapshot_id).toBe(SNAP_ID);
  });
  it('missing is empty, never 0', () => {
    const rows = parseCsv(csv);
    expect(rows[2].raw_viirs_reference_detections).toBe('');
    expect(rows[2].display_state).toBe('partial');
  });
  it('brief html contains provenance, snapshot, units, method, release stage', () => {
    const r = load('BGD', 2016)[2];
    const html = briefHtml({ record: r, manifest: manifest as never, region: { aoi_id: 'BGD', name: 'Bangladesh', country: 'Bangladesh', bbox: [88, 20, 92, 26] }, sources, yearRecords: load('BGD', 2016) });
    expect(html).toContain(SNAP_ID);
    expect(html).toContain('ui_prototype');
    expect(html).toContain('modis_2016_Bangladesh');
    expect(html).toMatch(/[0-9a-f]{64}/);
    expect(html).toContain('DEMO DATA');
    expect(html).toContain('@media print');
    expect(html).toContain('2016-03-01 to 2016-04-01 UTC');
    expect(/\b(NaN|undefined)\b/.test(html)).toBe(false);
  });
});
