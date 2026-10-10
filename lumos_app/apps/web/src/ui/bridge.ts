// Single seam between the UI and the data/model/state layers (owned by the data agent).
export { createDataApi, deriveDisplayState, headlineValue, recordForMonth, friendlyError, isOfflineError, shownAnomalyFlag, terraOnlyIssue } from '../data/api';
export type { YearLoad } from '../data/api';
export type { LumosDataApi } from '../data/api';
export type { SourceEntry } from '../data/schemas';
export { explainMonth, explainMonthText } from '../data/explain';
export { toCsv, briefHtml } from '../data/export';
export { harmonizeInBrowser, BROWSER_MODELS } from '../model';
export type { BrowserModelId, BrowserHarmonization } from '../model';
export { selectionStore, useAppState, actions } from '../state/store';
export type { AppState, MobileTab, Scale } from '../state/store';
import { selectionStore, useAppState, type AppState } from '../state/store';

/** Whole app state (stable object identity between changes). Has aoiId/year/month. */
export const useSelection = (): AppState => useAppState();
export const setSelection = (patch: Partial<AppState>) => selectionStore.set(patch);
