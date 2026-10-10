import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../apps/web/src/types';
import { deriveDisplayState, headlineValue, recordForMonth } from '../../apps/web/src/data/api';
import { parseActivityFile } from '../../apps/web/src/data/schemas';
import { readJson } from './helpers';

const load = (aoi: string, y: number) => parseActivityFile(readJson(`activity/${aoi}/${y}.json`)) as ActivityRecord[];
const base = () => ({ ...load('BGD', 2016)[2] }) as ActivityRecord;

describe('deriveDisplayState', () => {
  it('observed when VIIRS present and extract complete', () => {
    const r = base();
    expect(r.raw_viirs_reference_detections).toBe(408);
    expect(deriveDisplayState(r)).toBe('observed');
  });
  it('estimated when VIIRS null but estimate present (backcast)', () => {
    const r = load('BGD', 2005)[2];
    expect(deriveDisplayState(r)).toBe('estimated');
  });
  it('AUS 2016: VIIRS null (missing file) → partial, never zero', () => {
    const recs = load('AUS', 2016);
    for (const r of recs) {
      expect(r.raw_viirs_reference_detections).toBeNull();
      expect(deriveDisplayState(r)).toBe('partial');
      const h = headlineValue(r);
      expect(h.kind).toBe('estimate');
      expect(h.value).toBe(r.estimated_viirs_reference_detections);
      expect(h.value).not.toBe(0);
    }
  });
  it('missing when extract missing or both VIIRS and estimate null', () => {
    expect(deriveDisplayState({ ...base(), extract_status: 'missing' })).toBe('missing');
    const r = { ...base(), raw_viirs_reference_detections: null, estimated_viirs_reference_detections: null };
    expect(deriveDisplayState(r)).toBe('missing');
    expect(headlineValue(r)).toEqual({ value: null, kind: 'none' });
    expect(deriveDisplayState(null)).toBe('missing');
    expect(deriveDisplayState(undefined)).toBe('missing');
  });
  it('unsupported for value_status unsupported, and for 2001–2002 with no estimate', () => {
    expect(deriveDisplayState({ ...base(), value_status: 'unsupported' })).toBe('unsupported');
    for (const r of load('BGD', 2001)) expect(deriveDisplayState(r)).toBe('unsupported');
  });
  it('partial when extract partial', () => {
    expect(deriveDisplayState({ ...base(), extract_status: 'partial' })).toBe('partial');
  });
  it("value_status 'demo' does not change the state", () => {
    const r = base();
    expect(r.value_status).toBe('demo');
    expect(deriveDisplayState(r)).toBe(deriveDisplayState({ ...r, value_status: 'observed' }));
  });
  it('a true zero stays a zero (observed 0 ≠ missing)', () => {
    const r = { ...base(), raw_viirs_reference_detections: 0 };
    expect(deriveDisplayState(r)).toBe('observed');
    expect(headlineValue(r)).toEqual({ value: 0, kind: 'viirs_observed' });
  });
});

describe('headlineValue', () => {
  it('prefers observed VIIRS when extract complete', () => {
    expect(headlineValue(base())).toEqual({ value: 408, kind: 'viirs_observed' });
  });
  it('falls back to estimate when extract partial even if VIIRS non-null', () => {
    const r = { ...base(), extract_status: 'partial' as const };
    expect(headlineValue(r)).toEqual({ value: r.estimated_viirs_reference_detections, kind: 'estimate' });
  });
  it('null record → none', () => expect(headlineValue(null)).toEqual({ value: null, kind: 'none' }));
  it('recordForMonth finds by UTC month', () => expect(recordForMonth(load('BGD', 2016), 3)?.raw_viirs_reference_detections).toBe(408));
});

describe('all sample records', () => {
  it('never yields a numeric headline for missing/unsupported', async () => {
    const { activityFiles } = await import('./helpers');
    for (const f of activityFiles()) {
      for (const r of parseActivityFile(readJson(f)) as ActivityRecord[]) {
        const st = deriveDisplayState(r), h = headlineValue(r);
        if (st === 'missing' || st === 'unsupported') expect(h.value, `${f} ${r.period_start_utc}`).toBeNull();
        else if (st === 'observed' || st === 'estimated') expect(h.value, `${f} ${r.period_start_utc}`).not.toBeNull();
      }
    }
  });
});
