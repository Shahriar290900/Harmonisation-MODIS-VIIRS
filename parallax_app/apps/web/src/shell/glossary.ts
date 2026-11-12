// Plain-language glossary (docs/REVAMP_SPEC.md section 3). The UI shows the plain label; the technical name appears
// only inside a closed <details> block or a tooltip.
export interface GlossaryEntry { label: string; help: string; tech?: string }

export const GLOSSARY: Record<string, GlossaryEntry> = {
  place: { label: 'place', help: 'The area you are looking at: a whole country, or one division or state inside it.', tech: 'AOI (area of interest)' },
  hotspot: { label: 'fire detection', help: 'A spot where a satellite saw a pixel hotter than its surroundings. It is a hot pixel, not a confirmed wildfire.', tech: 'active-fire pixel' },
  modis: { label: 'older satellite (MODIS)', help: 'MODIS looks at the ground in squares about 1 km wide. It has been flying since 2000 and 2002 (Terra and Aqua).', tech: 'Aqua / Terra MODIS C6.1' },
  viirs: { label: 'sharper satellite (VIIRS)', help: 'VIIRS sees squares about 375 m wide, so it notices smaller fires. It has been flying since 2012.', tech: 'S-NPP VIIRS 375 m' },
  estimate: { label: 'estimate on the sharper satellite’s scale', help: 'What the sharper satellite would probably have counted. It is worked out from the older satellite, so it is an estimate, never a measurement.', tech: 'estimated_viirs_reference_detections, harmonized' },
  range: { label: 'likely range (8 in 10)', help: 'We expect the true value to fall inside this range about 8 times out of 10.', tech: '80% interval' },
  past: { label: 'estimated past (before 2012)', help: 'Years before the sharper satellite existed. The numbers are estimates made from the older satellite.', tech: 'backcast' },
  learn: { label: 'years used to learn', help: 'Years the estimate was learned from, using months when both satellites were flying.', tech: 'train split' },
  choose: { label: 'years used to choose', help: 'Years held back to choose between different methods. Never used for learning.', tech: 'validation split' },
  check: { label: 'years used to check', help: 'Years kept sealed until the end and used once to check the estimate honestly.', tech: 'test split' },
  holds: { label: 'Checked on unseen years', help: 'The estimate beat both simple baselines on years it never saw, and its likely range was about right there.', tech: 'validated_calibration' },
  rawOnly: { label: 'Raw comparison only', help: 'Real satellite counts are shown, but the estimate has not passed every check for this place, so treat it as a comparison.', tech: 'observed_comparison' },
  demo: { label: 'Demo data', help: 'Made-up numbers in the real file format, used only to test the app. They are not real observations.', tech: 'ui_prototype' },
  noData: { label: 'no data for this month', help: 'Nothing was recorded for this month. Missing is never shown as zero.', tech: 'missing / unavailable' },
  partial: { label: 'part of the month only', help: 'The satellite record covers only part of this month, so the count may be too low.', tech: 'partial' },
  unusual: { label: 'unusually high / low for the season', help: 'Compared with the same month in other years, this month sits near the top or the bottom.', tech: 'anomaly flag' },
  snapshot: { label: 'data snapshot', help: 'A frozen copy of the data, so numbers do not change under you.', tech: 'snapshot' },
  baseline: { label: 'simple baseline', help: 'A very simple rule used as a yardstick. A method only counts as good if it beats these.', tech: 'B0_identity, B0_month_ratio' }
};

/** Plain names for model ids (shown in tables; the raw id sits in a tooltip or a closed details block). */
export const MODEL_PLAIN: Record<string, string> = {
  B0_identity: 'Copy the older satellite',
  B0_month_ratio: 'Simple ratio by month',
  B1_poisson: 'Statistical model',
  B2_xgb: 'Tree model',
  D1_mlp: 'Neural net'
};

export type StageKey = 'ui_prototype' | 'observed_comparison' | 'validated_calibration';
export const STAGE_PLAIN: Record<StageKey, { label: string; short: string; tone: 'demo' | 'obs' | 'val'; text: string }> = {
  ui_prototype: { label: 'Demo data', short: 'Demo', tone: 'demo', text: 'Made-up numbers in the real file format. They test the app; they are not results.' },
  observed_comparison: { label: 'Raw comparison only', short: 'Raw only', tone: 'obs', text: 'Real satellite data. The estimate has not passed every check here, so read it as a comparison, not a finished product.' },
  validated_calibration: { label: 'Checked on unseen years', short: 'Checked', tone: 'val', text: 'On years it never saw, the estimate beat both simple baselines and its likely range (8 in 10) was about right.' }
};

export const SPLIT_PLAIN: Record<string, string> = { train: 'Year used to learn', val: 'Year used to choose', test: 'Year used to check', backcast: 'Estimated past', none: 'not used' };
