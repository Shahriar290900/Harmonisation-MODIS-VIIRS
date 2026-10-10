// FROZEN shared types (coordinator). Mirrors CONTRACT.md §6 + v1.1. Change only via coordinator.
export type ValueStatus = 'observed' | 'estimated' | 'unsupported' | 'demo';
export type ExtractStatus = 'complete' | 'partial' | 'missing';
export type ReleaseStage = 'ui_prototype' | 'observed_comparison' | 'validated_calibration';
export type Split = 'train' | 'val' | 'test' | 'backcast' | 'none';
/** UI display state derived from a record (see deriveDisplayState in data/state.ts). */
export type DisplayState = 'observed' | 'estimated' | 'partial' | 'missing' | 'unsupported';

export interface Anomaly { baseline_years: number | null; rank: number | null; zscore_log: number | null; flag: 'high' | 'normal' | 'low' | 'insufficient' | null }

export interface ActivityRecord {
  schema_version: string; snapshot_id: string; aoi_id: string;
  period_start_utc: string; period_end_utc_exclusive: string;
  source_platform: string; reference_platform: string; source_product: string; reference_product: string;
  raw_modis_detections: number | null; raw_modis_terra_detections: number | null; raw_viirs_reference_detections: number | null;
  static_source_detections_modis: number | null; static_source_detections_viirs: number | null;
  estimated_viirs_reference_detections: number | null; estimate_interval_low: number | null; estimate_interval_high: number | null;
  interval_nominal_level: number | null; interval_empirical_holdout_coverage: number | null;
  extract_status: ExtractStatus; coverage_status: string; coverage_fraction: null;
  value_status: ValueStatus; split: Split; anomaly: Anomaly | null;
  model_id: string | null; provenance_ids: string[]; reason: string;
  [extra: string]: unknown;
}

export interface Manifest {
  schema_version: string; snapshot_id: string; created_utc: string; release_stage: ReleaseStage;
  selected_model_id: string; aois: string[]; years: number[]; synthetic?: boolean; release_reason?: string;
  value_status_default?: string; files?: Record<string, string>; layers?: Record<string, string>;
}

export interface Region {
  aoi_id: string; name: string; country: string; kind: 'country' | 'admin1'; bbox: [number, number, number, number];
  geometry_path: string; supported_calibration: boolean; iso_3166_2: string | null; note: string | null;
  cells_exported?: boolean; features_exported?: boolean;
}

/** cells/<aoi>/<year>.json — rows are [cell_id, lon, lat, month(1-12), aqua, viirs|null, est|null] */
export interface CellsFile { cell_size_m: number; proj: string; est_min?: number; columns: string[]; rows: (string | number | null)[][] }

export interface SnapshotIndex { snapshots: { snapshot_id: string; path: string; synthetic?: boolean }[]; default: string }

export interface Selection { aoiId: string; year: number; month: number /* 1-12 */ }

export type SeriesKey = 'aqua' | 'viirs' | 'estimate' | 'terra' | 'static';
export const SERIES_COLORS: Record<SeriesKey, string> = {
  aqua: '#00B4D8', viirs: '#8B5CF6', estimate: '#14B8A6', terra: '#F59E0B', static: '#EF4444'
};
