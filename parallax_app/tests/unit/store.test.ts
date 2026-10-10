import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createStore, isWorkspaceHash, parseHash, stepMonthOf, toHash } from '../../apps/web/src/state/store';
import { seasonOf } from '../../apps/web/src/experience/landing/data';

describe('selection store', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } history.replaceState(null, '', '/'); });
  it('hash roundtrip', () => {
    expect(parseHash('#aoi=BGD&y=2016&m=3')).toEqual({ aoiId: 'BGD', year: 2016, month: 3 });
    expect(parseHash('#aoi=<x>&y=abc&m=13')).toEqual({});
    expect(toHash({ aoiId: 'AUS-NSW', year: 2019, month: 12, snapshotId: null })).toBe('#aoi=AUS-NSW&y=2019&m=12');
  });
  it('linked selection: set notifies subscribers and writes hash + localStorage; survives tab switch', () => {
    const s = createStore();
    s.attach();
    let calls = 0;
    s.subscribe(() => calls++);
    s.set({ aoiId: 'AUS-NSW', year: 2019, month: 12 });
    expect(calls).toBe(1);
    expect(location.hash).toBe('#aoi=AUS-NSW&y=2019&m=12');
    s.set({ mobileTab: 'map' });
    s.set({ mobileTab: 'evidence' });
    expect(s.get()).toMatchObject({ aoiId: 'AUS-NSW', year: 2019, month: 12, mobileTab: 'evidence' });
    s.set({ aoiId: 'AUS-NSW' }); // no-op
    expect(calls).toBe(3);
    const s2 = createStore();
    s2.attach();
    expect(s2.get()).toMatchObject({ aoiId: 'AUS-NSW', year: 2019, month: 12, mobileTab: 'evidence' });
  });
  it('hash wins over localStorage and hashchange updates', () => {
    const s = createStore(); s.attach(); s.set({ aoiId: 'BGD', year: 2010, month: 1 });
    history.replaceState(null, '', '/#aoi=BGD-C&y=2020&m=5');
    const s2 = createStore(); const stop = s2.attach();
    expect(s2.get()).toMatchObject({ aoiId: 'BGD-C', year: 2020, month: 5 });
    location.hash = '#aoi=BGD&y=2011&m=7';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(s2.get()).toMatchObject({ aoiId: 'BGD', year: 2011, month: 7 });
    stop();
  });
  it('series toggles and scale', () => {
    const s = createStore({}, { persist: false });
    s.set((st) => ({ series: { ...st.series, terra: !st.series.terra } }));
    expect(s.get().series.terra).toBe(false);
    s.set({ scale: 'linear' });
    expect(s.get().scale).toBe('linear');
    s.set({ month: 13 });
    expect(s.get().month).toBe(3);
  });
  it('localStorage failure does not break', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    const s = createStore(); s.attach(); s.set({ year: 2001 });
    expect(s.get().year).toBe(2001);
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
  });
  it('stepMonth wraps years and clamps', () => {
    expect(stepMonthOf({ year: 2016, month: 12 }, 1)).toEqual({ year: 2017, month: 1 });
    expect(stepMonthOf({ year: 2016, month: 1 }, -1)).toEqual({ year: 2015, month: 12 });
    expect(stepMonthOf({ year: 2001, month: 1 }, -1, 2001, 2025)).toEqual({ year: 2001, month: 1 });
    expect(stepMonthOf({ year: 2016, month: 3 }, 12)).toEqual({ year: 2017, month: 3 });
  });
});

describe('holdSync (WATCHDOG F7)', () => {
  it('throttles hash writes to ≤1/s while held and flushes on release', () => {
    vi.useFakeTimers();
    try {
      try { localStorage.clear(); } catch { /* */ }
      history.replaceState(null, '', '/');
      const s = createStore(); s.attach();
      const spy = vi.spyOn(history, 'replaceState');
      s.holdSync(true);
      for (let i = 1; i <= 10; i++) { s.set({ month: (i % 12) + 1 }); vi.advanceTimersByTime(100); }
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
      s.set({ year: 2020, month: 7 });
      s.holdSync(false);
      expect(location.hash).toBe('#aoi=BGD&y=2020&m=7');
      spy.mockRestore();
    } finally { vi.useRealTimers(); }
  });
});

describe('landing/workspace routing + H1 (REVIEW_EXP)', () => {
  it('only app routes and selection hashes belong to the workspace', () => {
    for (const h of ['#/app', '#/app?aoi=BGD', '#aoi=BGD&y=2016&m=3', '#y=2016', '#/app/']) expect(isWorkspaceHash(h)).toBe(true);
    for (const h of ['', '#', '#/', '#lx-main', '#how', '#/foo', '#//', '#apple', '#/application']) expect(isWorkspaceHash(h)).toBe(false);
  });
  it('releasing a held sync without flush (unmount) never writes over a landing hash; throttled writes are dropped', () => {
    vi.useFakeTimers();
    try {
      try { localStorage.clear(); } catch { /* */ }
      history.replaceState(null, '', '/');
      const s = createStore(); s.attach();
      expect(location.hash).toBe('#aoi=BGD&y=2016&m=3'); // attach (workspace mount) may replace any hash
      s.holdSync(true);
      s.set({ month: 4 }); s.set({ month: 5 });
      history.replaceState(null, '', '/'); // Back restored the landing entry ('' hash)
      s.holdSync(false, { flush: false });
      vi.advanceTimersByTime(3000);
      expect(location.hash).toBe('');
      s.set({ month: 6 }); // even a later stray set does not rewrite a landing hash
      expect(location.hash).toBe('');
    } finally { vi.useRealTimers(); }
  });
});

describe('landing season (REVIEW_EXP L5)', () => {
  it('contiguous months at >= half the peak mean, wrapping the year', () => {
    expect(seasonOf([1, 6, 10, 7, 2, 1, 1, 1, 1, 1, 1, 1], 3)).toEqual([2, 4]);
    expect(seasonOf([8, 2, 1, 1, 1, 1, 1, 1, 1, 1, 5, 10], 12)).toEqual([11, 1]);
    expect(seasonOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1)).toEqual([1, 1]);
  });
});
