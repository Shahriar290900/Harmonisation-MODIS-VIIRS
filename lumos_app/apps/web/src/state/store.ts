// Tiny linked-selection store (AOI × year × month + view prefs) shared by calendar, map, chart and drawer.
// Persisted to the URL hash (#aoi=BGD&y=2016&m=3[&snap=...]) and to localStorage (prefs), both best-effort.
import { useSyncExternalStore } from 'react';
import type { SeriesKey } from '../types';

export type Scale = 'log' | 'linear';
export type MobileTab = 'calendar' | 'map' | 'evidence';

export interface AppState {
  snapshotId: string | null;
  aoiId: string;
  year: number;
  month: number; // 1-12
  series: Record<SeriesKey, boolean>;
  scale: Scale;
  mobileTab: MobileTab;
}

export const DEFAULT_STATE: AppState = {
  snapshotId: null,
  aoiId: 'BGD',
  year: 2016,
  month: 3,
  series: { aqua: true, viirs: true, estimate: true, terra: true, static: false },
  scale: 'log',
  mobileTab: 'calendar'
};

const LS_KEY = 'lumos.selection.v1';

/**
 * Routing rule shared with the experience Router (see experience/contract.ts "Routing"): the workspace owns '#/app…'
 * and any hash carrying selection keys (aoi=, y=, m=, …). Everything else — '', '#/', in-page anchors such as
 * '#lx-main' and unknown hashes — belongs to the landing.
 */
export function isWorkspaceHash(hash: string): boolean {
  const h = hash.replace(/^#/, '');
  if (/^\/app(?:$|[?&/])/.test(h)) return true;
  return /(?:^|[?&/])(?:aoi|y|m|snap|scale|tab)=/.test(h);
}
const MOBILE_TABS: MobileTab[] = ['calendar', 'map', 'evidence'];

/** Parse '#aoi=BGD&y=2016&m=3' → partial state (invalid values dropped). */
export function parseHash(hash: string): Partial<AppState> {
  const p = new URLSearchParams(hash.replace(/^#\/?/, ''));
  const out: Partial<AppState> = {};
  const aoi = p.get('aoi');
  if (aoi && /^[A-Za-z0-9_-]{1,32}$/.test(aoi)) out.aoiId = aoi;
  const y = Number(p.get('y'));
  if (p.has('y') && Number.isInteger(y) && y >= 1990 && y <= 2100) out.year = y;
  const m = Number(p.get('m'));
  if (p.has('m') && Number.isInteger(m) && m >= 1 && m <= 12) out.month = m;
  const snap = p.get('snap');
  if (snap && /^[A-Za-z0-9_.:-]{1,128}$/.test(snap)) out.snapshotId = snap;
  const sc = p.get('scale');
  if (sc === 'log' || sc === 'linear') out.scale = sc;
  const tab = p.get('tab') as MobileTab | null;
  if (tab && MOBILE_TABS.includes(tab)) out.mobileTab = tab;
  return out;
}

export function toHash(s: Pick<AppState, 'aoiId' | 'year' | 'month' | 'snapshotId'>): string {
  const p = new URLSearchParams();
  p.set('aoi', s.aoiId);
  p.set('y', String(s.year));
  p.set('m', String(s.month));
  if (s.snapshotId) p.set('snap', s.snapshotId);
  return `#${p.toString()}`;
}

function readLocal(): Partial<AppState> {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Partial<AppState>;
    const out: Partial<AppState> = {};
    if (v.scale === 'log' || v.scale === 'linear') out.scale = v.scale;
    if (v.mobileTab && MOBILE_TABS.includes(v.mobileTab)) out.mobileTab = v.mobileTab;
    if (v.series && typeof v.series === 'object') {
      out.series = { ...DEFAULT_STATE.series };
      for (const k of Object.keys(out.series) as SeriesKey[]) if (typeof v.series[k] === 'boolean') out.series[k] = v.series[k];
    }
    if (typeof v.aoiId === 'string') out.aoiId = v.aoiId;
    if (Number.isInteger(v.year)) out.year = v.year;
    if (Number.isInteger(v.month) && v.month! >= 1 && v.month! <= 12) out.month = v.month;
    return out;
  } catch {
    return {};
  }
}

function writeLocal(s: AppState): void {
  try {
    const { aoiId, year, month, series, scale, mobileTab } = s;
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify({ aoiId, year, month, series, scale, mobileTab }));
  } catch {
    /* storage blocked: ignore */
  }
}

type Listener = () => void;

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void;
  subscribe(l: Listener): () => void;
  /** Start syncing with location.hash + localStorage (idempotent). Returns a stop function. */
  attach(): () => void;
  /**
   * WATCHDOG F7: while held (e.g. during replay), hash/localStorage writes are throttled to ≤1 per second;
   * releasing flushes the final state immediately.
   */
  holdSync(on: boolean, opts?: { flush?: boolean }): void;
}

export const HELD_SYNC_INTERVAL_MS = 1000;

export function createStore(initial: Partial<AppState> = {}, opts: { persist?: boolean } = {}): Store {
  const persist = opts.persist ?? true;
  let state: AppState = { ...DEFAULT_STATE, ...initial, series: { ...DEFAULT_STATE.series, ...(initial.series ?? {}) } };
  const listeners = new Set<Listener>();
  let attached: (() => void) | null = null;

  const emit = () => listeners.forEach((l) => l());
  let held = false, lastSync = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  function requestSync() {
    if (!held) return syncOut();
    const wait = lastSync + HELD_SYNC_INTERVAL_MS - Date.now();
    if (wait <= 0) return syncOut();
    if (!pending) pending = setTimeout(() => { pending = null; syncOut(); }, wait);
  }

  function syncOut(force = false) {
    if (!persist) return;
    lastSync = Date.now();
    if (pending) { clearTimeout(pending); pending = null; }
    writeLocal(state);
    try {
      // REVIEW H1: never write '#aoi=…' over a landing entry (e.g. a flush/throttled write after Back).
      if (typeof location !== 'undefined' && typeof history !== 'undefined' && (force || isWorkspaceHash(location.hash))) {
        const h = toHash(state);
        if (location.hash !== h) history.replaceState(history.state, '', `${location.pathname}${location.search}${h}`);
      }
    } catch {
      /* ignore */
    }
  }

  const store: Store = {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      const next: AppState = { ...state, ...p, series: p.series ? { ...state.series, ...p.series } : state.series };
      if (next.month < 1 || next.month > 12 || !Number.isInteger(next.month)) next.month = state.month;
      const changed = (Object.keys(next) as (keyof AppState)[]).some((k) => next[k] !== state[k]);
      if (!changed) return;
      state = next;
      requestSync();
      emit();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    attach() {
      if (attached) return attached;
      if (persist) {
        const fromHash = typeof location !== 'undefined' ? parseHash(location.hash) : {};
        store.set({ ...readLocal(), ...fromHash });
        syncOut(true); // attach() only runs when the workspace mounts, so the first write may replace any hash
      }
      const onHash = () => store.set(parseHash(location.hash));
      if (typeof window !== 'undefined') window.addEventListener('hashchange', onHash);
      attached = () => {
        if (typeof window !== 'undefined') window.removeEventListener('hashchange', onHash);
        attached = null;
      };
      return attached;
    },
    holdSync(on, opts) {
      if (held === on) return;
      held = on;
      if (on) return;
      if (opts?.flush === false) {
        if (pending) { clearTimeout(pending); pending = null; }
        return;
      }
      syncOut();
    }
  };
  return store;
}

/** App-wide singleton. Call `selectionStore.attach()` once at startup (main.tsx / App). */
export const selectionStore = createStore();

/** React hook: whole state or a selected slice (selector must return a stable/primitive value). */
export function useAppState(): AppState;
export function useAppState<T>(selector: (s: AppState) => T, store?: Store): T;
export function useAppState<T>(selector?: (s: AppState) => T, store: Store = selectionStore): T | AppState {
  const get = () => (selector ? selector(store.get()) : store.get());
  return useSyncExternalStore(store.subscribe, get, get);
}

// ---- actions (singleton) ----
export const actions = {
  select: (aoiId: string, year: number, month: number) => selectionStore.set({ aoiId, year, month }),
  setAoi: (aoiId: string) => selectionStore.set({ aoiId }),
  setYearMonth: (year: number, month: number) => selectionStore.set({ year, month }),
  setSnapshot: (snapshotId: string | null) => selectionStore.set({ snapshotId }),
  toggleSeries: (k: SeriesKey) => selectionStore.set((s) => ({ series: { ...s.series, [k]: !s.series[k] } })),
  setSeries: (k: SeriesKey, on: boolean) => selectionStore.set((s) => ({ series: { ...s.series, [k]: on } })),
  setScale: (scale: Scale) => selectionStore.set({ scale }),
  setMobileTab: (mobileTab: MobileTab) => selectionStore.set({ mobileTab }),
  /** Move by ±n months, wrapping years; clamps to [minYear, maxYear] if given. */
  stepMonth: (delta: number, minYear?: number, maxYear?: number) =>
    selectionStore.set((s) => stepMonthOf(s, delta, minYear, maxYear))
};

export function stepMonthOf(s: Pick<AppState, 'year' | 'month'>, delta: number, minYear?: number, maxYear?: number): { year: number; month: number } {
  let idx = s.year * 12 + (s.month - 1) + delta;
  if (minYear !== undefined) idx = Math.max(idx, minYear * 12);
  if (maxYear !== undefined) idx = Math.min(idx, maxYear * 12 + 11);
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
