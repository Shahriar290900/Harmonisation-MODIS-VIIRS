# Lumos code review: bug scrutiny (2026-10-09)

**Scope:** `notebook_A/lumos_A_fetch.py`, `fixtures/make_fixture_bundle.py`, `notebook_B/lumos_B_train.py`, the generated notebooks, and the full-run export in `/tmp/lb_full/lumos_app_bundle` (run `20261009T112435Z`).

**Scratch checks** (`review/scratch/`): `harness_b1.py` (B up to B1: grid, 3×3, climatology, B1 from JSON) and `harness_ingest.py` (real-format CSVs into `ingest_file`). I also inspected the real NE `ne_10m_admin_1` file; FIRMS was blocked by the proxy.

## HIGH

### H1. The gate uses the wrong baseline, so the wrong model is selected
- **Where:** `lumos_B_train.py:1396`
- **Problem:** `BASELINE = "B1_poisson" if present`. Contract v1.1 says the baseline is the **better of B1_poisson and B0_month_ratio on val**.
- **Evidence:** `selection_frozen.json` has baseline B1 with a val AOI-month MAE of **18.25**. B0_month_ratio scores **7.48**. D1 was selected at 8.45, which only passes because the bar was set at 0.9×18.25. With the correct baseline the bar is 6.74. No candidate passes, so the selection should be **B0_month_ratio**.
- **Fix:** `BASELINE = min([m for m in ("B1_poisson","B0_month_ratio") if m in FULL_MODELS], key=lambda m: vm(m,"aoi_month"))`. Exclude BASELINE from the candidates. Note that if B0_month_ratio is selected, the release check "beats B0_month_ratio on test" can never be true, so it stays at `observed_comparison`. Say so in `release_reason`.

### H2. Activity records do not match contract §6
- **Where:** `lumos_B_train.py:1541, 1554, 1644`
- **Problem:** The contract defines `static_source_detections_modis` and `static_source_detections_viirs`. The code emits a single `static_source_detections`, which is the Aqua value only. `static_viirs` is computed (line 545) and then dropped. The exported schema sets `additionalProperties:false`, so B's own validator certifies the non-contract shape. "3,168 records schema-valid" means valid against B's schema, not against the contract.
- **Evidence:** keys of `activity/BGD/2020.json[0]` contain `static_source_detections` and neither contract key.
- **Fix:** Emit both keys. `_viirs` comes from `s(P["static_viirs"])` and is null before 2012 or when the file is missing. Update the schema accordingly.

### H3. AOI ids depend on Natural Earth spellings; the fixture's geography differs from real NE
- **Where:** `lumos_B_train.py:629–659`, `make_fixture_bundle.py:332–341`
- **Problem:** v1.1 requires matching on `iso_3166_2` (BD-A..BD-H, AU-NSW) with a name alias table. The code matches on `name` and builds ids with `slug(name)`. The real NE 10m file (downloaded and inspected) has **7** Bangladesh divisions, uses the old spellings `Chittagong` and `Barisal`, and has **no Mymensingh**. The fixture has 8 divisions with the new spellings.
  - The real export would contain `BGD-Chittagong` and `BGD-Barisal` and no `BGD-Mymensingh`.
  - The app built on the fixture expects `BGD-Chattogram`, `BGD-Barishal` and `BGD-Mymensingh`.
  - Real NE also has `Lord Howe Island` with `iso_3166_2 = AU-NSW`.
- **Fix:**
  - Key AOIs on ISO codes: `aoi_id = "BGD-" + iso_3166_2[-1]` or a fixed map such as `{"BD-B": "BGD-Chattogram", ...}`.
  - Dissolve all features that share an ISO code (this also brings in Lord Howe).
  - Apply the contract alias table to display names.
  - Document that Mymensingh (BD-H) is absent in NE, so its area sits inside Dhaka.
  - Make the fixture mirror real NE: 7 features, old spellings.

## MEDIUM

### M1. January 2012 VIIRS is a partial month but is treated as complete
- **Where:** `lumos_B_train.py:364`
- **Problem:** `PLATFORM_START_YM["snpp"] = 2012*12+0`. S-NPP FIRMS data (and the fixture) start on 2012-01-20.
- **Evidence:** In `activity/AUS/2012.json` for January: raw VIIRS is 101, est is 325, `extract_status` is "complete", and the anomaly is `low` with z = −2.17. That artefact also enters every January baseline.
- **Fix:** Start snpp at `2012*12+1`, which makes January 2012 VIIRS NaN and the record "partial". Alternatively keep the month but mark it partial and drop it from the anomaly baselines.

### M2. 2012 is labelled `split:"none"`; the contract backcast is 2003–2012
- **Where:** `lumos_B_train.py:678`, `:1612`
- **Problem:** line 678 applies `& (P["year"] < 2012)` and `split_of_year` stops at 2011, but `BACKCAST_SUMMARY` includes 2012.
- **Evidence:** the SPLIT code for 2012 rows is `[0]`.
- **Fix:** Label 2012 as `backcast` (value_status stays `observed` where VIIRS exists), or amend the contract. Either way, make the three places agree.

### M3. B1 does not have the raw `aqua_count` feature (v1.1)
- **Where:** `lumos_B_train.py:521–525, 832`
- **Problem:** `aqua_count` only goes in as log1p, so the log-link GLM can only fit a power law. That fits the very poor B1 AOI-month MAE (18.25, against 7.05 for a single ratio).
- **Fix:** add a B1-only `aqua_count_raw` (identity transform) feature and include it in `weights.json`.

## LOW
- **L1. The app cannot recompute B1/D1 predictions from the export (`model_card`, line 1664).** The B1 JSON on its own does reproduce B1 in plain numpy: n = 871, max relative difference 1.1e-7 (`harness_b1.py`). The ONNX input `x: float32[N,15]` is documented. But the 15 features (aqua_clim on train years only, 3×3 sum, frp, scan, terra, lat of the cell centre, `month-1` sin/cos, the country one-hot order AUS, BGD) are not defined in the card, and they are not in `cells/*.json`. **Fix:** add `feature_definitions` to the model cards, or state that the app shows only the precomputed `est`.
- **L2. `key_leak_check` stops after the first leaking file (`lumos_A_fetch.py:712–717`).** Later files are never scanned. **Fix:** scan everything, delete every hit, then return.
- **L3. A header-only file for the current year is treated as a full year of zeros (`lumos_B_train.py:509`).** `_max_ym` is None in that case, so the cap is skipped. **Fix:** if the file has 0 rows and `y >= RETRIEVED_YEAR`, mark it unavailable.
- **L4. The cell-export cutoff and size guard differ from the contract (`lumos_B_train.py:94, 1794`).** The cutoff is `est >= 0.5`, but the contract says ≥ 1. There is no check against the v1.1 budget of 15 MB per AOI-year. The largest fixture file is 125 KB, but real NSW will be much larger. **Fix:** set the cutoff to 1.0 and add the size check, raising the cutoff if the budget is exceeded.
- **L5. Missing Terra makes the estimate NaN, but `extract_status` ignores Terra (`lumos_B_train.py:1621`).** `terra_count` is a feature, so the record says "Source files missing" while `extract_status` says "complete". **Fix:** include Terra in `expected`, or name the missing file in `reason`.
- **L6.** B's sensor filter (`:463`) skips A's Area-API NRT files, so that path is dead. The v1.1 `--no-deps` pip fallback (`:339`) is missing.
- **Risk:** only 3,213 fixture cells tested; real Australia (>10⁵ cells) means multi-GB dense arrays. Watch RAM.

## Verified correct (with evidence)
- **Time parsing:** `'5'`→00:05, `'730'`→07:30, `'5.0'`→00:05. 23:59 on 31 Jan stays in January.
- **Platforms:** `N`→snpp; `1`/`N20`/`NOAA-20`/`J1`→noaa20, which is excluded from the target. Type ≠ 0 goes to `static`. `2.0NRT` is detected as NRT.
- **Versions and dedupe:** `6.1`/`6.03`/`61.03` are harmless strings. Exact dedupe removed 1 of 5 rows; `45` vs `0045` correctly kept. Header-only CSVs ingest fine.
- **Grid:** `floor` gives (−1, −1) for tiny negatives; ids round-trip; centres fall in their own cell; 3×3 matches brute force in 300/300 Australian cells (iy down to −794).
- **No leakage:** the climatology uses train years only, and there are no VIIRS-derived features.
- **Missing ≠ zero:** AUS and AUS-NSW 2016 have `raw_viirs:null`, `partial` and `estimated`.
- **2001–2002:** marked unsupported with `est` null.
- **Test protocol:** the anomaly baseline excludes the month itself. The test vault is opened once, after the frozen selection. Coverage is computed correctly (0.77 for D1).
- **Other:** synthetic forced to `ui_prototype`/`demo`; checksums 538/538 and manifest 537/537 match; both `.ipynb` are cell-identical to their `.py` (12/17 cells, no outputs); MAP_KEY redacted and B scrubs `/api/area/csv/<key>/`.
