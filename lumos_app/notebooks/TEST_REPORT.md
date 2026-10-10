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
