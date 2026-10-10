# Notebook B test report (2026-10-09)

**All numbers below come from the SYNTHETIC fixture** (`fixtures/out/lumos_bundle`, seed 20261009). They test the plumbing only. They say nothing about real fires or real model skill. The notebook detected the fixture through four flags (config_A, env_A, sources[].synthetic, FIXTURE marker file), so it forced `release_stage=ui_prototype` and `value_status=demo`.

## How it was run
Sandbox: Python 3.13, CPU only (2 cores), torch 2.14 (CPU), xgboost 3.4, pennylane 0.45.1.

```
python3 build_ipynb.py                       # lumos_B_train.py (percent format) -> lumos_B_train.ipynb (17 cells)
LUMOS_INPUT=.../fixtures/out LUMOS_WORK=<tmp> [LUMOS_QUICK=1] \
  jupyter nbconvert --to notebook --execute --ExecutePreprocessor.timeout=3600 lumos_B_train.ipynb
```

| run | result | wall time |
|---|---|---|
| quick (`LUMOS_QUICK=1`), nbconvert | passed end-to-end | 50 s |
| full (no QUICK), nbconvert | passed end-to-end | 10 min 28 s |
| quick + `LUMOS_QLLM_STUB=1` (test only) | Q2 loop, parse/clamp, duplicate fallback and figure all ran | 47 s |

Full-run stage timings (s): ingest 3.0 · panel 0.2 · B1 3.7 · B2 (3 seeds) 31.5 · D1 (3 seeds) 98 · Q1 (3 seeds) plus the classical models on the same subset 476 · evaluation and test 2.6 · export 4.3.
The network guard blocked 0 connection attempts, because none were made.

## Data checks (fixture)
- 75/75 sha256 matched. The missing file `viirs-snpp_2016_Australia` is NaN, never 0. In the export, AUS 2016 records are `extract_status: partial` and the estimate is used.
- Ingest: 141,557 raw rows; 95 exact duplicates removed; 123 rows quarantined, each with a reason (invalid lat, invalid date, negative frp).
- Panel: 3,213 cells × 288 months (2001–2024).
- Split rows: train 232,776 (spatial-holdout blocks excluded), val 77,112, test 77,112.
- AOIs: BGD plus 8 divisions, AUS, AUS-NSW.

## Metrics, full run (SYNTHETIC)
| model | val cell MAE | val AOI-month MAE | test cell MAE | test AOI-month MAE | test deviance | test coverage at 80% |
|---|---|---|---|---|---|---|
| B0_identity | 0.103 | 41.26 | 0.090 | 34.54 | 2.283 | 0.86 |
| B0_ratio | 0.136 | 7.05 | 0.120 | 6.77 | 2.309 | 0.80 |
| B0_month_ratio | 0.136 | 7.49 | 0.120 | 6.96 | 2.309 | 0.83 |
| B1_poisson | 0.163 | 18.25 | 0.151 | 15.83 | 0.408 | 0.82 |
| B2_xgb | 0.132 | 8.53 | 0.122 | 7.78 | 0.321 | 0.77 |
| **D1_mlp (selected)** | 0.131 | 8.45 | 0.121 | 9.14 | 0.307 | 0.77 |
| Q1_vqc (subset) | 0.151 | – | 0.134 | – | 0.384 | – |
| Q2_qllm | skipped: no local LLM | | | | | |

- Multi-seed val MAE (mean ± sd): B2 0.1321 ± 0.0000, D1 0.1285 ± 0.0037, Q1 0.169 ± 0.023.
- Matched-budget test (4,000 train rows, the same 20,000 eval rows for every model), Poisson deviance: D1@subset 0.329, B2@subset 0.362, **Q1 0.385**, B1@subset 0.414, B0 2.32.
- The PennyLane cross-check (lightning.qubit) gave a maximum |Δ⟨Z⟩| of 5.4e-7 against the built-in simulator, which passes.
- The D1 ONNX file matches onnxruntime: maximum relative difference 1.0e-6, which passes.
- All 3,168 activity records passed both the built-in validator and `jsonschema`, with 0 errors.

## Export tree (`lumos_app_bundle/`, zip 3.5 MB)
- `manifest.json`, `sources.json` (keys scrubbed), `regions.json`, `metrics.json`, `comparison.csv`, `activity.schema.json`, `checksums.sha256`
- `activity/<aoi>/<year>.json`: 11 AOIs × 24 years, 12 records each (264 files)
- `cells/<aoi>/<year>.json`: 10 AOIs (whole-AUS skipped) × 24 years (240 files)
- `geo/<aoi>.geojson`: 11 simplified boundaries
- `models/<id>/model_card.json` for all 8 models, plus `B1_poisson/weights.json`, `B2_xgb/model.json` and `D1_mlp/model.onnx`
- `figures/`: 6 PNGs (time series for BGD, AUS and AUS-NSW; model comparison; test scatter; QML subset comparison)

The run folder `runs/<ts>/` keeps `env_B.json`, `checksum_report.json`, `ingest/` (detections parquet, quarantine.parquet, aggregate, ingest log), `split_manifest.json`, `selection_frozen.json`, `metrics.json`, `run_log.json` and a copy of the bundle.

---
## Addendum: re-verification after fixes (coordinator, later run on 2026-10-09)
This run checks the build after the resolver applied the REVIEW.md and WATCHDOG.md fixes. It is still synthetic.
- Quick mode, nbconvert, end-to-end: **pass**, 2 min 19 s on CPU.
- The selected model is now **B0_month_ratio**, under the v1.1 gate (baseline = better of B1 and B0_month_ratio). No candidate beat it by 10% or more, and `release_reason` says so.
- `tests/check_bundle.py`: 28/28 pass. B1 and B0 recompute from `weights.json` + `features/*.json` (the JS app path) to about 1e-6.
- `tests/harness_b1.py`: pass.
  - Grid round-trip works, and 0 of 300 cells mismatch the 3×3 brute-force check (including negative iy).
  - Climatology uses train years only, and no VIIRS-derived features are used.
  - Jan 2012 is partial, and 2012 is labelled backcast.
- `tests/harness_ingest.py`, `tests/test_b_units.py` (XGBoost wall-clock cap, pip `--no-deps` fallback) and `tests/test_resume.py` (killed run resumes, tampered cache recomputed): pass.
- `notebook_A/test_notebook_A.py`: pass, including the key-leak check across all files.
- Regions are keyed on iso_3166_2 (BGD-A…G, AUS-NSW). Real Natural Earth has 7 BD divisions (no Mymensingh), and the fixture mirrors this.
- The bundle zip is about 2.6 MB (572 files).
- **Not yet tested:** real FIRMS files, real Australia scale, the Blackwell GPU, and Q2 with a real local LLM.

---
## Addendum: three-region update (W3-NOTEBOOK-B, 2026-10-10)
Notebook B now covers Bangladesh (`BGD` + `BGD-A..G`), Australia (`AUS` + `AUS-NSW`) and the United States (`USA` + `USA-CA`, California), per CONTRACT.md §8 (v1.2 addendum) and the §9 region registry. `schema_version` stays `1.0`. **All numbers below still come from the SYNTHETIC fixture** (`fixtures/out/lumos_bundle`, 3 countries, 122 source entries, seed 20261009) and test plumbing only. Nothing here says anything about real fires, real California, or real model skill.

### What changed in `lumos_B_train.py`
- Config: `AOI_COUNTRIES = [Bangladesh, Australia, United_States]` (FIRMS file slugs, exactly as in `sources.json`), `AOI_ADMIN1 = {Australia: [AU-NSW], United_States: [US-CA]}`, `EXPECTED_ADMIN1` and `ADMIN1_DISPLAY` (`US-CA` = California), `COUNTRY_ISO3` (`United_States` -> `USA`), `FEATURE_EXPORT_AOIS = [AUS-NSW, BGD, USA-CA]`, `CELLS_EXPORT_SKIP_AOIS = [AUS, USA]`.
- Explicit name mapping: FIRMS `United_States` -> ISO3 `USA` -> display `United States` (`COUNTRY_DISPLAY`, used for `regions.json` `country` and the AOI name). Natural Earth calls the country `United States of America` (`ADMIN`/`NAME`; `ADM0_A3` = `USA`); `ne_country_match()` matches on ISO3 first, then on the explicit `NE_ADMIN0_NAMES` table. The match is used for both admin-0 and admin-1 features.
- `US-CA` is matched on `iso_3166_2`, all features with that code are dissolved (`dissolve_features`), and cell centres are assigned by point-in-polygon on the dissolved (Multi)Polygon, so the Channel Islands count. The other US states in the Natural Earth file are ignored (`AOI_ADMIN1` filter).
- `regions.json` entries now also carry `parent` (null for countries) and `display_kind` (Country, Division for Bangladesh admin-1, State elsewhere); `country` is the display name. `cells_exported` / `features_exported` come from the two constants above. The B0_month_ratio weights `countries` map uses display names. B1 gets a `country_USA` one-hot term, B0_month_ratio gets `USA-01..USA-12`, the per-country subgroup metrics include `country:USA`.
- Figures: time series for every country and every admin-1 area that has B1 features (`BGD`, `AUS`, `AUS-NSW`, `USA`, `USA-CA`).
- Guide text and both `STEP_INDEX.md` copies: `panel: 3 countries`, new 2.6.2a (panel plan line), AOI check lists `USA` and `USA-CA`, new 2.14.4a, 2.18.4 figures, RSS note for Australia and the United States.

### Grid, key packing and memory (USA with Alaska, Hawaii and territories)
- The Lambert cylindrical equal-area grid (R = 6371007.181 m, 5 km) is global and exactly 25 km2 per cell at every latitude. Tested for Attu (+172.9 E), Adak, Utqiagvik (71.3 N), Honolulu, Guam, American Samoa (-14.3), San Juan, Maine and the corners of the globe: all pack into the int64 key `(ix+5000)*10000 + (iy+2000)` (observed ix -4004..4003, iy -1275..1274, so iy+2000 stays in 0..9999), key and (ix, iy) round-trip, each cell centre lies in its own cell, and the spherical area recovered from the cell edges is 25 km2 (relative error below 1e-9). A 0.5 degree global lattice also packs, so no FIRMS file can overflow the key. Ingest now asserts this per file (`grid_key_in_range`); a violating file would be marked unusable, not silently aliased.
- Known limitation (unchanged by this work, documented): cells either side of the antimeridian (Aleutians, +-180) are about 8000 columns apart in key space, so the 3x3 neighbourhood does not wrap there. This affects a handful of Aleutian cells at most. At 71 N a cell is about 1.6 km wide east-west and 15.6 km tall north-south (same 25 km2); this is a property of the equal-area grid, not an error.
- Memory model: ingest aggregates sparse cell-month-platform rows only (the fixture: 203,632 raw rows -> 106,652 aggregate rows), and the cell universe per country is the set of cells with at least one detection, so the panel is sparse in space and dense in time. The new `panel plan:` log line (also `metrics.json` -> `panel_memory`, and `panel/panel_memory.json` in the run cache) prints cells per country, estimated panel GB (93 bytes per cell-month with 3 countries), and the peak while the largest country is built, then logs a WARNING if either exceeds 60% of free RAM. Real values are unmeasured: the FIRMS archives were not downloaded for this test (a trial download ran at a few KB/s and was abandoned). **Ceiling, not a measurement:** if every 25 km2 cell of the three countries had a detection, the panel would be about 19.7 GB (USA 393k cells, Australia 308k, Bangladesh 6k), against about 8.4 GB for the old two-country panel; peak while building about 15.3 GB. The real figure is lower because only cells with detections count. Whether it fits the Kaggle Blackwell machine is therefore open until the first real run prints the `panel plan:` line; the documented fallbacks are `RUN_QML = False`, then asking Claude Code to cap a country's panel.
- Fixture panel: 4,556 cells (Australia 2,202, Bangladesh 1,016, United States 1,338) x 300 months = 1,366,800 cell-months, 0.13 GB estimated, RSS 0.46 GB after the panel.

### Environment of these runs (not the earlier sandbox)
macOS 12 x86_64, Python 3.12.2, CPU only (4 cores, 8 GB RAM, about 3 GB free). A scratchpad venv with `--system-site-packages` added shapely 2.2.0, xgboost 1.7.6 (xgboost 2.x does not load against the system libomp here) and onnx 1.16.2 (newer onnx does not build). torch 2.2.2, pandas 2.2.2, numpy 1.26.4, scikit-learn 1.8.0, onnxruntime 1.19.2, nbconvert 7.16.4. PennyLane is not installed, so the Q1 PennyLane cross-check is skipped (the built-in simulator ran). XGBoost 1.7.6 ignores the `device=cuda` setting, so B2 in QUICK mode is much weaker than in the earlier report; ignore B2's numbers here.

### Runs and results
| step | command (abridged) | result | wall time |
|---|---|---|---|
| unit tests | `python -I tests/test_b_units.py` (LUMOS_INPUT=fixtures/out) | ALL UNIT TESTS PASSED (42 checks: the 4 existing groups plus the new three-region config, name-mapping, grid and memory-plan groups) | 12 s |
| QUICK end-to-end (1st) | `jupyter nbconvert --execute lumos_B_train.ipynb`, LUMOS_INPUT=fixtures/out LUMOS_WORK=fixtures/out_b LUMOS_QUICK=1 | exit 0; ONNX export skipped (no `onnx` package yet), recorded in the model card | 108 s |
| QUICK end-to-end (2nd, final bundle) | same, after installing onnx 1.16.2 | exit 0; `ONNX parity: passed` (max rel diff 1.03e-06); 0 blocked network attempts | 113 s (timed stages 97.5 s) |
| bundle check | `python -I tests/check_bundle.py fixtures/out_b/lumos_app_bundle --fixture` | 55 passed, 0 failed | 3 s |
| `harness_b1.py` | marker-based exec to B2, JSON-only B1 reproduction, 3x3 brute force per country | pass: B1 JSON-only max rel diff 6.96e-07; 3x3 brute force 0/300 mismatches for each of Australia, Bangladesh and United_States (US cells span lat 29.7..65.8, ix -3379..-1649) | 20 s |
| `harness_ingest.py` | | pass | 4 s |
| `test_resume.py` | real SIGKILL + resume, simulated crash + resume, tampered cache, explicit resume | ALL RESUME TESTS PASSED | 452 s |

Stage timings of the final QUICK run (s): ingest 5.1 - panel 1.9 - B1 3.5 - B2 11.2 - D1 24.9 - export 15.7 - Q1 and classical subset 20.0 - export refresh 9.2.

### Final fixture bundle (`fixtures/out_b/`, for W4B)
- `lumos_app_bundle.zip` 3.56 MB (678 files, 18.1 MB unzipped) and the unzipped `lumos_app_bundle/`. `runs/<ts>/` keeps only the logs, metrics and ingest outputs (the 69 MB cache and the duplicate bundle copy were removed).
- 12 AOIs: `BGD`, `BGD-A..G`, `AUS`, `AUS-NSW`, `USA`, `USA-CA`; 25 years each; 3,600 activity records (12 x 25 x 12), 0 schema errors against both the built-in and the CONTRACT-derived schema.
- `cells/`: BGD, BGD-A..G, AUS-NSW, USA-CA (10 AOIs; none for `AUS` or `USA`); all years at the default cutoff, largest file 0.07 MB. `features/`: `AUS-NSW`, `BGD`, `USA-CA` (largest 0.21 MB). B1 recomputed from `features/*.json` + `weights.json` (the JS path) matches the notebook to 1.4e-06 relative, for all three feature AOIs.
- `regions.json`: `USA` (name and country "United States", bbox from Natural Earth admin-0), `USA-CA` ("California", country "United States", parent `USA`, `iso_3166_2` `US-CA`, `display_kind` State, bbox -124.41, 32.53, -114.12, 42.00). Figures: `timeseries_{BGD,AUS,AUS-NSW,USA,USA-CA}.png`, `model_comparison.png`, `test_scatter_aoi_month.png`, `qml_subset_comparison.png`.
- Release stage `ui_prototype`, every value `demo` (synthetic). Selected model (validation only): `B0_month_ratio` (no candidate beat it by 10% in this synthetic QUICK run). QUICK-mode test AOI-month MAE: B0_identity 43.4, B0_ratio 8.80, B0_month_ratio 8.74, B1_poisson 19.0, D1_mlp 9.24. These are plumbing numbers only.
- Not tested here: real FIRMS files for the United States, real-scale USA memory and time, the Blackwell GPU, PennyLane, Q2 with a real LLM, and a FULL (non-QUICK) run on this machine (not run: the earlier full run took 10 min 28 s on a faster setup and nothing in this update changes the model code).
