import type { DisplayState } from '../types';

/**
 * UI-only cell states on top of the data DisplayState (types.ts is frozen):
 *  - 'unavailable': the year's file is listed in the snapshot but could not be loaded (offline & not cached, HTTP error,
 *    HTML fallback, timeout, invalid file). Rendered distinctly from 'missing' (which means absent in the snapshot).
 *  - 'loading': request in flight (skeleton shimmer, no glyph) — never shown as missing.
 */
export type CellState = DisplayState | 'unavailable' | 'loading';

/** States listed in the legend, in order (loading has no glyph). Shapes live in Glyph.tsx (lucide icons). */
export const LEGEND_STATES: Exclude<CellState, 'loading'>[] = ['observed', 'estimated', 'partial', 'missing', 'unsupported', 'unavailable'];
export const STATE_LABEL: Record<CellState, string> = {
  observed: 'Observed (VIIRS)',
  estimated: 'Estimated (VIIRS-scale from Aqua)',
  partial: 'Partial month',
  missing: 'Missing (not zero)',
  unsupported: 'Unsupported (no estimate)',
  unavailable: 'Unavailable (not cached / failed to load)',
  loading: 'Loading…'
};
export const SPLIT_LABEL: Record<string, string> = { train: 'Train', val: 'Validation', test: 'Test', backcast: 'Backcast', none: '—' };
