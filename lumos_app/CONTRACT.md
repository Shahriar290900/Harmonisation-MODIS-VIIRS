# Lumos Fire Calendar — frozen shared contract v1.0 (2026-10-09)

Read together with the v1.1 amendments (sec 7), the v1.2 addendum and region registry (sec 8-9) and the data-source corrections and USA caveats (sec 10, 2026-10-10). Where sec 10 corrects a statement in sec 1-6, sec 10 wins.

Owner: M. Al Shahriar Hameem, Team Lumos (Dhaka). Do not change this file without the coordinator.

## 0. Two-notebook Kaggle design (user constraint)
- RTX PRO 6000 Blackwell only runs with internet OFF, and (owner's account of Kaggle) only in a notebook with the competition `arc-prize-2026-arc-agi-3` attached; whether other use of that machine risks moderation action is unconfirmed and is the owner's decision. Internet ON gives only T4 x2. Notebook B also runs on T4 x2 with Internet OFF and no competition (31 GiB RAM, one T4 used).
- **Notebook A `lumos_A_fetch.ipynb`** (internet ON, CPU or T4): downloads everything to `/kaggle/working/lumos_bundle/`, then the user clicks Save Version.
- **Notebook B `lumos_B_train.ipynb`** (internet OFF, GPU T4 x2 or RTX PRO 6000): attach A's output (Add Input → Notebook Output). It must make **zero network calls**. Bundle located by globbing `/kaggle/input/**/lumos_bundle/manifests/sources.json`.
- Both notebooks run outside Kaggle too: `LUMOS_ROOT` env var overrides paths (local testing: `LUMOS_INPUT=<dir containing lumos_bundle>`, `LUMOS_WORK=<output dir>`).

## 1. Data sources (tested 2026-10-09; corrected 2026-10-10, see sec 10)
Primary, no key needed — FIRMS yearly per-country CSVs (tested, but this route is not documented on FIRMS's download page and may change):
- `https://firms.modaps.eosdis.nasa.gov/data/country/modis/{YEAR}/modis_{YEAR}_{Country}.csv` (MODIS C6.1, Terra+Aqua)
- `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/{YEAR}/viirs-snpp_{YEAR}_{Country}.csv` (VIIRS 375 m S-NPP)
- Optional `viirs-noaa20` / `viirs-noaa21` folders: returned 404 at the same URL pattern on 10 Oct 2026 (R5_VERIFY, FINDINGS). Keep `TRY_NOAA20 = False`.
Country names use underscores for spaces (e.g. `United_States`). Default countries: `Bangladesh`, `Australia`, `United_States` (FIRMS file name `United_States`, e.g. `modis_2020_United_States.csv`, `viirs-snpp_2020_United_States.csv`; HEAD-checked 2001-2024 on 10 Oct 2026: about 767 MB for MODIS + VIIRS, excluding 2025; Australia about 1762 MB, Bangladesh about 15 MB; no bbox streaming needed); optional extra training countries config list (e.g. `India`, `Myanmar`).
Years requested: MODIS 2001–2025, VIIRS-SNPP 2012–2025. **2025 yearly country files do not exist** (HTTP 404 on 10 Oct 2026, checked for all three countries), so the last available year is 2024. Notebook A therefore expects 111 `ok` and 6 `missing` records (3 countries × MODIS+VIIRS 2025), never zero missing and not `error`. Missing files are logged, never fabricated, and the calendar shows 2025 as missing.
Optional (only if Kaggle Secret `FIRMS_MAP_KEY` exists): Area API `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{SOURCE}/{W,S,E,N}/{1..5}/{YYYY-MM-DD}` for recent NRT; day range 1 to 5; 5000 transactions/10 min; sources list has no `VIIRS_NOAA21_SP`; bounded, cached, Retry-After honoured. Never write the key to disk/logs.
Boundaries: Natural Earth `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson` (basemap) and `.../ne_10m_admin_1_states_provinces.geojson` (Bangladesh divisions, New South Wales, California). Public domain.

CSV columns:
- MODIS: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type` (satellite codes `A` = Aqua, `T` = Terra, or the long names Aqua/Terra in some files; confidence 0–100)
- VIIRS: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type` (satellite codes `N` = S-NPP, `N20` = NOAA-20, `N21` = NOAA-21; confidence l/n/h; the old `1` for NOAA-20 is accepted only as a legacy alias)
- `type`: 0 presumed vegetation fire, 1 volcano, 2 other static land source (e.g. kilns/industry), 3 offshore. `acq_time` HHMM UTC (may lose leading zeros → zero-pad to 4). `version` containing `NRT` = near-real-time; else standard. Treat `version` as an opaque string (observed: 6.2, 6.03, 61.03 for MODIS, 2 for VIIRS). NRT rows have no `type` value (see sec 10).

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
- Platform: MODIS `A`/`Aqua`→`aqua`, `T`/`Terra`→`terra`; VIIRS `N`→`snpp`, `N20`/`1`→`noaa20`, `N21`→`noaa21`.
- Main measure: `type == 0` detections, plus rows with no `type` value (NRT rows, see sec 10). Non-zero types counted separately (`static_count`).
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
**Being redesigned (10 Oct 2026):** the review found that one pooled stage over all 12 AOIs (nested AOIs counted twice, absolute-count MAE dominated by whole-country AUS and USA) and one pooled `interval_empirical_holdout_coverage` stamped on every record say nothing about a single region such as `USA-CA`. The release stage and the coverage figure are to be decided and reported per detailed region (`BGD`, `AUS-NSW`, `USA-CA`) or labelled as pooled. Until that change lands, read the stage as "pooled over all regions" and do not quote it as evidence for one region. The field names and the three stage values above stay as they are; the exact per-region shape will be recorded here when it is fixed.

## 7. v1.1 amendments (coordinator, 2026-10-09)
- sources.json is a top-level list; `local_path` relative to lumos_bundle/; extra keys `kind`, `synthetic` allowed. Consumers ignore unknown keys.
- `status: error` is treated exactly like `missing` (NaN, never zero).
- manifest.json may carry `synthetic`, `value_status_default`, `release_reason`; metrics.json may carry `notes`.
- Q1/Q2 are research comparisons on a bounded subset, never selection candidates for the app estimate.
- Whole-country AUS cell grids are not exported; AUS-NSW and BGD are (superseded and extended by the v1.2 addendum below). Cell file budget target <= 15 MB per AOI-year (raise est cutoff if exceeded and record it).
- Natural Earth admin-1 matching uses `iso_3166_2` (BD-A..BD-H, AU-NSW, US-CA), names via alias table (Chittagong=Chattogram, Barisal=Barishal).
- Wheelhouse pins: pennylane and pennylane-lightning pinned to one version; B installs with --no-deps fallback if numpy conflict, never upgrades torch/numpy.

## 8. v1.2 addendum: AOI set extended (coordinator, 2026-10-10)
`schema_version` stays `"1.0"`: the record shape is unchanged and old bundles (BGD, BGD-A..G, AUS, AUS-NSW only) remain valid. Consumers must treat the AOI list as data (from `regions.json`), never as a hard-coded list.
- AOI set is now three regions: Bangladesh (`BGD` + `BGD-A..BGD-G`), Australia (`AUS` + `AUS-NSW`), United States (`USA` + `USA-CA`, California, Natural Earth `iso_3166_2` `US-CA`).
- ISO3 map used for country ids and AOI prefixes: Bangladesh = `BGD`, Australia = `AUS`, United States = `USA`. FIRMS country names: `Bangladesh`, `Australia`, `United_States`.
- USA is not bounded at download time (A fetches the whole-country files). "Bounded" is realised at app level: whole-country `USA` gets activity aggregates only; detailed cell grids and B1 features exist only for `USA-CA`, mirroring `AUS` / `AUS-NSW`.
- Cell grids (`cells/<aoi>/<year>.json`) are exported for every AOI except whole-country `AUS` and `USA` (`CELLS_EXPORT_SKIP_AOIS` = `AUS`, `USA`): i.e. `BGD` and its divisions, `AUS-NSW`, `USA-CA`. The B1 feature export (`features/<aoi>/<year>.json`) is exported for `BGD`, `AUS-NSW` and `USA-CA` only. The 15 MB per AOI-year budget logic is unchanged (raise est cutoff if exceeded and record it).
- `regions.json` `kind` stays `country|admin1` (no zod change). The UI label comes from `display_kind` in the registry below; it may also be derived in app code from `country` + `kind` (admin1 in BGD = Division, elsewhere = State).
- Default selected region in the app stays `BGD`. The landing region gallery is data-driven over `regions.json`; `BGD`, `AUS-NSW` and `USA-CA` are all first-class detailed regions (cells and features available), `AUS` and `USA` are aggregate-only countries (no cells).
- Missing is never zero; synthetic data stays labelled `DEMO` / `FIXTURE_NOT_REAL_DATA`. Neither the AOI extension nor this addendum is a validation claim.

## 9. Region registry
Single source of truth for W2/W3/W4. `parent` is the containing `aoi_id` (`-` for country). `cells_exported` / `features_exported` = cell grid file and B1 feature file produced for that AOI.

| aoi_id | name | country | kind | parent | cells_exported | features_exported | display_kind |
|---|---|---|---|---|---|---|---|
| BGD | Bangladesh | Bangladesh | country | - | yes | yes | Country |
| BGD-A | Barishal | Bangladesh | admin1 | BGD | yes | no | Division |
| BGD-B | Chattogram | Bangladesh | admin1 | BGD | yes | no | Division |
| BGD-C | Dhaka | Bangladesh | admin1 | BGD | yes | no | Division |
| BGD-D | Khulna | Bangladesh | admin1 | BGD | yes | no | Division |
| BGD-E | Rajshahi | Bangladesh | admin1 | BGD | yes | no | Division |
| BGD-F | Rangpur | Bangladesh | admin1 | BGD | yes | no | Division |
| BGD-G | Sylhet | Bangladesh | admin1 | BGD | yes | no | Division |
| AUS | Australia | Australia | country | - | no | no | Country |
| AUS-NSW | New South Wales | Australia | admin1 | AUS | yes | yes | State |
| USA | United States | United States | country | - | no | no | Country |
| USA-CA | California | United States | admin1 | USA | yes | yes | State |

Notes: `BGD` divisions keep the existing behaviour: they have their own cell grids (every AOI not in `CELLS_EXPORT_SKIP_AOIS` gets cells) but no B1 feature files (`FEATURE_EXPORT_AOIS` = `BGD`, `AUS-NSW`, `USA-CA`). `CELLS_EXPORT_SKIP_AOIS` = `AUS`, `USA`. `regions.json` entries carry `cells_exported` and `features_exported` booleans (matching this table) plus optional `iso_3166_2`, `natural_earth_names`, `note`; consumers ignore unknown keys. Division letter-to-name mapping follows Natural Earth `iso_3166_2` BD-A..BD-G (BD-H Mymensingh is absent in NE and is included in its parent division, so there is no `BGD-H`). Names use the alias table (Chittagong=Chattogram, Barisal=Barishal). Detailed regions for the landing/gallery (cells and features): `BGD`, `AUS-NSW`, `USA-CA`; default selection `BGD`.

## 10. Data-source corrections (2026-10-10) and USA caveats

Dated corrections from the research review (`docs/research/FINDINGS.md`, `docs/research/notes/R5_VERIFY.md`, FIRMS checks of 10 Oct 2026 from the owner's machine). They refine sec 1-6; where they differ, this section wins.

### 10.1 Data-source corrections
- **No 2025 yearly country files.** HEAD returned 404 for `modis_2025_*` and `viirs-snpp_2025_*` for Bangladesh, Australia and United_States; 2001-2024 return 200 (R5_VERIFY item 1). Last available year is 2024. Notebook A expects **111 ok + 6 missing**, `error=0`. 2025 is `missing` (null), never zero. Splits (train 2013-2020, val 2021-2022, test 2023-2024) still work.
- The yearly country route is **undocumented** (FIRMS's download page only links a JavaScript `/country/` page). It is tested, not guaranteed.
- Area API: day range 1 to 5; sources `LANDSAT_NRT`, `MODIS_NRT`, `MODIS_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_NRT`, `VIIRS_SNPP_NRT`, `VIIRS_SNPP_SP` (no `NOAA21_SP`); 5000 transactions per 10 min (S027, S029, S031).
- Satellite codes: MODIS `A`, `T`; VIIRS `N`, `N20`, `N21` (S032, S033).
- Start dates: Aqua 3 Jul 2002, Terra 1 Nov 2000 (S032). S-NPP 2012-01-20 (S037). The NOAA-20 start differs between two FIRMS pages (2018-04-01 vs 2020-01-01); unresolved.
- **S-NPP end of science data delivery:** NASA's page says delivery of all Suomi NPP VIIRS science data products will cease on 2 Nov 2026 (S020). Historical 2013-2024 data used here are unaffected; future and NRT use of the S-NPP reference are affected. Scope for archive vs NRT is not stated. Keep the raw bundle and its sha256 manifest.
- **`type` null rule.** `type` exists only in standard data (MCD14DL, VNP14IMGT), so NRT rows have no `type` value (S032, S033). Rows with a missing `type` count as main (`type == 0` or null), matching Notebook B. `type` may be uninformative in old vintages (MODIS Bangladesh 2012: all 3,251 rows are type 0; unverified). A possible FIRMS Type-field bug from the research pack is UNVERIFIED; report a sensitivity run with and without the type filter.
- Burned-area products (MCD64A1, VNP64A1, GlobFire) are built from active-fire detections, so they are **not independent** of the hotspots they would check. Use them only as secondary monthly checks at 3 to 6 km, never as ground truth (S015, S012, S017).
- **No single global MODIS-to-VIIRS multiplier is defensible:** MODIS omission against ASTER is 86.2% overall and the regional detection probability ranges from 7% to 26% (S055). That is why ratios are per country and month.
- Fu et al. 2020 (*Remote Sensing* 12:2870) has first author **Yuyun Fu** (Crossref), not "Xu". Abstract: MODIS missed 65% (forests) and 83% (low-biomass lands) of VIIRS fire pixels, NE Asia, 2012-2017. The 1.22-1.32 FRP slopes are not in the abstract (UNVERIFIED).
- Real submission dates are **UNVERIFIED**: the research pack says 7 Oct 2026, the PRD says a project window from 14 Nov 2026. The owner must read the official page in a browser.

### 10.2 USA-specific caveats
- **Not only CONUS.** The 2020 US MODIS file includes Alaska and Hawaii (measured latitude 18.97 to 69.51, longitude -164.9 to -67.6). Whole-country `USA` pools CONUS, Alaska and Hawaii under one `country_USA` term and one set of month ratios. `USA-CA` inherits the national `USA` month ratios and country term, so its harmonization assumes California behaves like the US average.
- **Not only wildfire.** `type 0` is "presumed vegetation fire"; for the US it mixes wildfires with prescribed burning and agricultural or crop-residue burning (domain knowledge, not measured here). Use the word "hotspot", not "wildfire". Small agricultural and prescribed burns are where MODIS misses most.
- **Type 1/2/3 rows are excluded from the main count.** 2020 MODIS US file: 148,412 type 0 versus 5,205 type 2, 200 type 1 and 31 type 3 rows (measured by the reviewer). They are counted separately as static-source detections.
- **Boundaries.** The Natural Earth 110m US bounding box in `regions.json` (-171.79 to -66.96) omits the Aleutians west of 180. California is assigned by cell-centre point-in-polygon against the Natural Earth admin-1 polygon `US-CA`.
- **Antimeridian.** In FIRMS the western Aleutians have positive longitudes (about +172 to +180). A bounding box misses every detection at longitude > 0 in Alaska, and the 3x3 neighbourhood feature does not wrap at +/-180. Aleutian detections west of the antimeridian are therefore a known limitation (affects `USA` only, not `USA-CA`).
- **Download size** (HEAD `Content-Length` summed over 2001-2024, MODIS + VIIRS S-NPP, 10 Oct 2026): United_States about 767 MB, Australia about 1762 MB, Bangladesh about 15 MB. 2025 is excluded because it does not exist. Processing time and memory for the US panel are unmeasured.
- No California-specific accuracy figure exists yet. Nothing in this contract is a validation claim for `USA-CA`.
