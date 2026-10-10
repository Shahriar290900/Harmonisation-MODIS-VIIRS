# Lumos Fire Calendar — frozen shared contract v1.0 (2026-10-09)

Owner: M. Al Shahriar Hameem, Team Lumos (Dhaka). Do not change this file without the coordinator.

## 0. Two-notebook Kaggle design (user constraint)
- RTX PRO 6000 Blackwell only runs with internet OFF. Internet ON gives only T4 x2.
- **Notebook A `lumos_A_fetch.ipynb`** (internet ON, CPU or T4): downloads everything to `/kaggle/working/lumos_bundle/`, then the user clicks Save Version.
- **Notebook B `lumos_B_train.ipynb`** (internet OFF, Blackwell): attach A's output (Add Input → Notebook Output). It must make **zero network calls**. Bundle located by globbing `/kaggle/input/**/lumos_bundle/manifests/sources.json`.
- Both notebooks run outside Kaggle too: `LUMOS_ROOT` env var overrides paths (local testing: `LUMOS_INPUT=<dir containing lumos_bundle>`, `LUMOS_WORK=<output dir>`).

## 1. Data sources (verified 2026-10-09)
Primary, no key needed — FIRMS yearly per-country CSVs:
- `https://firms.modaps.eosdis.nasa.gov/data/country/modis/{YEAR}/modis_{YEAR}_{Country}.csv` (MODIS C6.1, Terra+Aqua)
- `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/{YEAR}/viirs-snpp_{YEAR}_{Country}.csv` (VIIRS 375 m S-NPP)
- Optional `viirs-noaa20` folder (name unverified; try, log 404).
Country names use underscores for spaces (e.g. `United_States`). Default countries: `Bangladesh`, `Australia`; optional extra training countries config list (e.g. `India`, `Myanmar`).
Years: MODIS 2001–2025, VIIRS-SNPP 2012–2025; missing files are logged, never fabricated.
Optional (only if Kaggle Secret `FIRMS_MAP_KEY` exists): Area API `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{SOURCE}/{W,S,E,N}/{1..5}/{YYYY-MM-DD}` for recent NRT; 5000 transactions/10 min; bounded, cached, Retry-After honoured. Never write the key to disk/logs.
Boundaries: Natural Earth `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson` (basemap) and `.../ne_10m_admin_1_states_provinces.geojson` (Bangladesh divisions, New South Wales). Public domain.

CSV columns:
- MODIS: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type` (satellite Aqua/Terra; confidence 0–100)
- VIIRS: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type` (satellite N=S-NPP, 1=NOAA-20; confidence l/n/h)
- `type`: 0 presumed vegetation fire, 1 volcano, 2 other static land source (e.g. kilns/industry), 3 offshore. `acq_time` HHMM UTC (may lose leading zeros → zero-pad to 4). `version` containing `NRT` = near-real-time; else standard.

## 2. Bundle layout written by A
```
lumos_bundle/
  raw/firms_country/{modis|viirs-snpp|viirs-noaa20}/{YEAR}/{original filename}.csv
  raw/firms_api/...                (optional)
  context/ne_110m_admin_0_countries.geojson
  context/ne_10m_admin_1_states_provinces.geojson
  wheelhouse/*.whl                 (pennylane etc.; for B's offline pip install --no-index)
  manifests/sources.json           list of {id,url,local_path,sensor,country,year,http_status,bytes,sha256,rows,retrieved_utc,status: ok|missing|error,note}
  manifests/env_A.json             python version, platform, pip freeze subset
  manifests/config_A.json          countries, years, flags used
  README_bundle.md
```

## 3. Processing protocol in B (fixed before training)
- Parse UTC time from acq_date + zero-padded acq_time. Quarantine rows with invalid lat/lon/date/frp<0 (write `quarantine.parquet` with reason).
- Exact-duplicate removal only (all original columns identical). Never drop close-in-space repeats.
- Platform: MODIS `Aqua`→`aqua`, `Terra`→`terra`; VIIRS `N`→`snpp`, `1`→`noaa20`.
- Main measure: `type == 0` detections. Non-zero types counted separately (`static_count`).
- **Source protocol = Aqua MODIS; reference = S-NPP VIIRS.** Terra kept as a separate feature/series, never pooled into the target.
- Grid: Lambert cylindrical equal-area, R = 6371007.181 m, x = R·λ, y = R·sin φ, cell size 5000 m. `cell_id = f"{ix}_{iy}"`, ix=floor(x/5000), iy=floor(y/5000). Exactly equal-area (25 km²).
- Unit of modelling: cell × UTC calendar month. Cell universe per country = cells with ≥1 detection (either sensor, any year). Zero counts filled only for months whose source files are `ok` for that sensor/year/country; else NaN (missing ≠ zero).
- Splits (temporal, frozen): train 2013–2020, val 2021–2022, test 2023–2024 (opened once, at the end). Spatial holdout: 100 km blocks (20×20 cells), 20% of blocks by deterministic hash → excluded from train; reported separately. Saved as `split_manifest.json` with hashes.
- Backcast period: Aqua full years 2003–2012 (Aqua starts mid-2002) → `estimated`. 2001–2002: `unsupported` (no Aqua protocol).

## 4. Target & features
Target `viirs_snpp_count` (type 0, cell-month). Prediction name: `estimated_viirs_reference_detections`.
Allowed features (all available pre-2012): aqua_count, aqua_day, aqua_night, aqua_frp_sum, aqua_frp_mean, aqua_conf_mean, aqua_scan_mean, terra_count, aqua_count_3x3 (neighbourhood sum), month (sin/cos), lat of cell centre, country id, aqua climatology for that cell-month computed on train years only. VIIRS-derived features are FORBIDDEN as predictors.

## 5. Models (flag-gated; each independent; failures logged, never block export)
| id | model | flag |
|---|---|---|
| B0_identity | est = aqua_count | always |
| B0_ratio | global ratio Σviirs/Σaqua on train | always |
| B0_month_ratio | per country×month ratio on train | always |
| B1_poisson | sklearn PoissonRegressor on log1p features (standardised) → JSON coefficients | always |
| B2_xgb | XGBoost `objective=count:poisson`, `device=cuda` if available else cpu | RUN_XGB |
| D1_mlp | PyTorch MLP, Poisson NLL, → ONNX | RUN_DL |
| Q1_vqc | simulated variational quantum regressor, 6–10 qubits, bounded subset (≤ 4000 train rows); PennyLane if importable else built-in torch statevector simulator; compared with classical models on the SAME subset | RUN_QML |
| Q2_qllm | LLM-assisted search over Q1 configs (n_qubits, layers, encoding, entangler, lr); LLM sees only validation metrics; equal trial budget vs random search; LLM from `/kaggle/input/**` (Transformers, local_files_only) else skipped | RUN_QLLM |

Selection on validation only. Gate (v1.1: MAE measured at AOI-month level; active-subgroup check at cell-month; baseline = better of B1_poisson and B0_month_ratio on val; B1 also gets raw aqua_count as a feature): a model replaces B1 only if val MAE ≥ 10% lower and no >10% degradation in active subgroup (cells with aqua_count>0). Then test opened once; all models' test metrics reported.
Metrics: MAE, RMSE, mean bias, Poisson deviance, n; at cell-month and AOI-month level; subgroups: active/inactive, country, season. No MAPE, no "accuracy %".
Intervals: AOI-month multiplicative interval from validation residual quantiles of log((y+1)/(ŷ+1)) at 80% nominal; empirical coverage measured on test and reported.

## 6. App export bundle (written by B to `/kaggle/working/lumos_app_bundle/`, also zipped)
```
manifest.json      {schema_version:"1.0", snapshot_id, created_utc, release_stage: "ui_prototype"|"observed_comparison"|"validated_calibration", selected_model_id, aois:[...], years:[...], files:{path:sha256}}
sources.json       copy of A's sources (no keys)
regions.json       [{aoi_id, name, country, kind: country|admin1, bbox, geometry_path, supported_calibration: bool}]
geo/<aoi_id>.geojson   simplified boundary
activity/<aoi_id>/<year>.json   12 monthly records, schema below
cells/<aoi_id>/<year>.json      {"cell_size_m":5000,"proj":"lambert-cea","columns":["cell_id","lon","lat","month","aqua","viirs","est"],"rows":[...]}  (only rows with aqua>0 or viirs>0 or est>=1)
models/<model_id>/model_card.json
models/B1_poisson/weights.json  {feature_names, mean, scale, coef, intercept, link:"log"}
models/B2_xgb/model.json        (if run)
models/D1_mlp/model.onnx        (if run)
metrics.json       all models × splits × levels
comparison.csv     same, flat
figures/*.png
checksums.sha256
```
Monthly record (one per AOI-month):
```json
{"schema_version":"1.0","snapshot_id":"...","aoi_id":"BGD","period_start_utc":"2020-03-01T00:00:00Z","period_end_utc_exclusive":"2020-04-01T00:00:00Z",
 "source_platform":"Aqua","reference_platform":"S-NPP","source_product":"MODIS C6.1 (FIRMS country CSV)","reference_product":"VIIRS 375m S-NPP (FIRMS country CSV)",
 "raw_modis_detections":123,"raw_modis_terra_detections":80,"raw_viirs_reference_detections":456,"static_source_detections_modis":12,"static_source_detections_viirs":30,
 "estimated_viirs_reference_detections":440.2,"estimate_interval_low":380.0,"estimate_interval_high":510.0,"interval_nominal_level":0.8,"interval_empirical_holdout_coverage":0.78,
 "extract_status":"complete|partial|missing","coverage_status":"unknown","coverage_fraction":null,
 "value_status":"observed|estimated|unsupported|demo","split":"train|val|test|backcast|none",
 "anomaly":{"baseline_years":8,"rank":7,"zscore_log":1.2,"flag":"high|normal|low|insufficient"},
 "model_id":"B1_poisson","provenance_ids":["modis_2020_Bangladesh","viirs-snpp_2020_Bangladesh"],"reason":"..."}
```
Null where unknown; never 0 for missing. `coverage_fraction` is always null (FIRMS points give no cloud-free denominator).
Release stage: `validated_calibration` only if selected model beats B0_identity and B0_month_ratio on test AOI-month MAE and interval coverage within ±10 pts of nominal; else `observed_comparison`; fixtures → `ui_prototype` with `value_status:"demo"`.

## 7. v1.1 amendments (coordinator, 2026-10-09)
- sources.json is a top-level list; `local_path` relative to lumos_bundle/; extra keys `kind`, `synthetic` allowed. Consumers ignore unknown keys.
- `status: error` is treated exactly like `missing` (NaN, never zero).
- manifest.json may carry `synthetic`, `value_status_default`, `release_reason`; metrics.json may carry `notes`.
- Q1/Q2 are research comparisons on a bounded subset, never selection candidates for the app estimate.
- Whole-country AUS cell grids are not exported; AUS-NSW and BGD are. Cell file budget target <= 15 MB per AOI-year (raise est cutoff if exceeded and record it).
- Natural Earth admin-1 matching uses `iso_3166_2` (BD-A..BD-H, AU-NSW), names via alias table (Chittagong=Chattogram, Barisal=Barishal).
- Wheelhouse pins: pennylane and pennylane-lightning pinned to one version; B installs with --no-deps fallback if numpy conflict, never upgrades torch/numpy.
