# Lumos Fire Calendar — PRD v2.0

Owner: M. Al Shahriar Hameem · Team Lumos, Dhaka · NASA Space Apps 2026 — *Harmonization of MODIS and VIIRS Hot Spots* · 9 Oct 2026
Supersedes PRD v1.0 (`docs/PRD_v1_original.md`). v1 still holds wherever v2 is silent.

**Product promise:** Pick a place. See its burning seasons over 20+ years on one fair scale. Tell real change apart from satellite change.

---

## 1. The idea in easy English

- **MODIS** (2000–present) is an older heat camera with ~1 km pixels. **VIIRS** (2012–present) is sharper, with 375 m pixels. It catches small fires MODIS misses, so it typically records several times more hotspots for the same place. Fu et al. 2020 (first author Yuyun Fu) found that Aqua MODIS missed 65% of S-NPP VIIRS fire pixels in forests and 83% in low-biomass lands, in NE Asia, 2012-2017. It is a regional result; the size of the gap differs by place, so there is no single global MODIS-to-VIIRS multiplier (MODIS omission against ASTER is 86.2%, regional detection probability 7% to 26%).
- If you join the two records, a fire chart jumps upward in 2012 even when burning did not change. **Harmonization** removes that jump.
- Both satellites flew together from 2012 to 2024. We learn the relationship "when Aqua-MODIS saw *X* in this 5 km cell, in this month and setting, S-NPP VIIRS saw *Y*". We test it on years and places it never saw. Then we use it to turn 2003–2011 MODIS records into **"VIIRS-scale estimates"**, each with an error band.
- What it cannot do: recover individual small fires MODIS missed, see through clouds, or count wildfires. A hotspot is a hot pixel, not a fire incident.

What the user does with it: open a **year × month burning calendar** for Bangladesh, a division, New South Wales or California. See the usual burning season, unusual months, and raw MODIS vs raw VIIRS vs harmonized curves. Then export the evidence.

## 2. What changed from v1 (decisions of 9 Oct 2026; source facts corrected 10 Oct 2026, see `docs/SOURCE_CHECK.md`)

| Topic | v1 | v2 |
|---|---|---|
| Data acquisition | Manual FIRMS archive requests, MAP_KEY | **Public FIRMS yearly per-country CSVs, no key** (`/data/country/{modis\|viirs-snpp}/{YEAR}/…_{Country}.csv`). Tested with Bangladesh 2020/2024 and United States 2020 (`…_United_States.csv`); the route is undocumented on FIRMS's download page and may change. **2025 yearly files do not exist (404, checked 10 Oct 2026)**, so the last year is 2024 and 2025 shows as missing. The Area API (window 1-5 days, 5000 transactions per 10 min, no `NOAA21_SP` source) is optional and only for recent NRT data |
| Kaggle | One offline notebook + laptop download step | **Two notebooks.** A runs with internet ON (CPU/T4) to fetch data, boundaries and wheels. B runs offline on a GPU (T4 x2, or RTX PRO 6000 via a competition-attached notebook) and attaches A's output. No laptop step needed |
| Models | B0/B1/B2, other models later | Full stack, each part switchable. B0 ×3, B1 Poisson GLM, B2 XGBoost-GPU, D1 PyTorch MLP→ONNX, Q1 simulated VQC (8 qubits), Q2 QLLM (LLM-guided QML config search) |
| Gate | B2 vs B1 | A candidate must beat the **better of B1 and B0_month_ratio** by ≥10% on validation AOI-month MAE, with no >10% drop in the active subgroup. Otherwise the transparent ratio model ships |
| Regions | Names | Keyed on ISO 3166-2: `BGD`, `BGD-A…G` (7 Natural Earth divisions; Mymensingh is absent in NE and is included in its parent), `AUS`, `AUS-NSW`, `USA`, `USA-CA` (California, Natural Earth `US-CA`). Detailed regions (cell grids and B1 features) are `BGD`, `AUS-NSW` and `USA-CA`; whole-country `AUS` and `USA` are aggregates only (see CONTRACT v1.2 addendum and region registry) |
| Weights in app | Not defined | `weights.json` (B0/B1) is recomputable in plain JS. `model.onnx` (MLP) runs via onnxruntime-web. Per-cell `features/*.json` exported for BGD, NSW and California (USA-CA) |

Sources and corrections are tracked in `docs/SOURCE_CHECK.md` (dated corrections of 10 Oct 2026).

Precedent to cite: Zheng et al. 2026 (*Remote Sensing* 18:1650) fused Aqua and S-NPP and corrected for viewing angle. Giglio et al. 2025 warn against naively splicing the two series for local trends. Both support our approach.

Competition note: other Bangladesh teams (e.g. "kiln-watch") focus on brick kilns. Our edge is the honest harmonized calendar with uncertainty. FIRMS `type=2` (static sources like kilns) is shown as a separate layer.

## 3. Users and core questions (unchanged)

Planners and environmental analysts, plus judges, researchers and educators. Their questions:
1. When is burning usually highest here?
2. Is this month unusual for its season?
3. How different are the sensors, and what adjustment was applied?
4. How much can I trust it?
5. Can I export the evidence?

## 4. System architecture

```
[Kaggle Notebook A  — internet ON, CPU/T4]
  FIRMS yearly country CSVs (MODIS C6.1, VIIRS S-NPP) ─┐
  Natural Earth admin-0 / admin-1 GeoJSON ─────────────┤→ /kaggle/working/lumos_bundle/  (+ sha256 manifest)
  pip wheels (pennylane, onnx…) ───────────────────────┘
        │  Save Version → "Add Input → Notebook Output"
        ▼
[Kaggle Notebook B  — internet OFF, GPU: T4 x2 or RTX PRO 6000]
  verify → ingest/quarantine → 5 km equal-area grid × month → frozen splits
  → B0/B1/B2/D1 (+Q1/Q2 research) → gate → test opened once → intervals
  → backcast 2003–2012 → anomalies → lumos_app_bundle.zip
        │  download zip
        ▼
[PWA — React + Vite + MapLibre, static hosting (GitHub Pages)]
  public/data/<snapshot>/…  ← unzipped bundle;  weights.json / model.onnx for in-browser recompute
  Works in browsers on Windows, macOS, iOS, Android; installable; cached regions work offline
```

The frozen data contract is in **`CONTRACT.md`** (v1.0, the v1.1 amendments in §7, the v1.2 addendum and region registry in §8-9, and the data-source corrections and USA caveats in §10). It is the single source of truth for field names, file layout and the scientific protocol.

## 5. Scientific protocol (summary of CONTRACT §3–5)

- **Source** = Aqua MODIS. **Reference** = S-NPP VIIRS. Terra is shown separately and never pooled. The target uses `type==0` (vegetation) detections only. Type 2 static sources are counted separately per sensor.
- **Grid:** Lambert cylindrical equal-area, 5 km cells (exactly 25 km²). The unit is cell × UTC month.
- **Missing ≠ zero:**
  - A missing, errored or header-only file gives null.
  - Months before the product start date (Aqua 2002-07-03, S-NPP 2012-01-20) and months after the last date in a current-year file are `partial`. They are excluded from training and baselines.
  - `coverage_fraction` is always null, because FIRMS gives no cloud-free denominator.
- **Splits:** train 2013–2020, val 2021–2022, test 2023–2024. 20% of 100 km spatial blocks are held out. The test set sits behind a "vault" that opens once, after the selection is frozen.
- **Features:** Aqua counts, day/night, FRP, confidence, scan, Terra count, 3×3 neighbourhood, month sin/cos, latitude, train-only climatology, country. **No VIIRS-derived predictors.**
- **Metrics:** MAE, RMSE, bias and Poisson deviance at cell-month and AOI-month level. Subgroups: active/inactive, country, season, spatial holdout. No "accuracy %", no MAPE.
- **Intervals:** 80% multiplicative intervals from validation residual quantiles. Empirical coverage on test is reported.
- **Burned-area products** (MCD64A1, VNP64A1, GlobFire) are not independent of the active-fire detections, so they are secondary checks only, never ground truth.
- **Reading real results (no pre-judged outcome).** When the first real bundle arrives, inspect whether the estimated series is continuous across 2012. A visible jump and no jump are both valid outcomes; record what you see and report it as it is. Do not tune the model, features or thresholds on the test years (2023-2024). Continuity at 2012 is a sanity check, not evidence that the 2003-2011 backcast is accurate: there is no VIIRS reference before 2012, so backcast skill is only extrapolated from 2013+ held-out years. Peak months and known events (for example the 2019-20 Australian fires) are things to look at and note, not pass/fail gates.
- **Release stage** (shown in the app header; being redesigned so it is decided and shown per detailed region, see `CONTRACT.md` §6):
  - `ui_prototype`: synthetic fixture data.
  - `observed_comparison`: real data, but calibration not proven.
  - `validated_calibration`: the selected model beats both B0_identity and B0_month_ratio on test, and interval coverage is within ±10 points of nominal.
- **QML/QLLM honesty:**
  - Q1 runs on a bounded 4,000-row subset and is compared with every classical model retrained on the same subset.
  - Q2 uses an LLM that sees only the search space and validation history, with an equal trial budget against random search.
  - If no local LLM is attached, Q2 is reported as skipped.
  - Simulation runs on classical hardware, so we make no quantum-advantage claim. Q1 and Q2 are research panels, not the app's estimator.

## 6. App requirements (Claude Code builds this)

**P0, always required**

1. **Calendar first:** years as rows, months as columns. Each cell shows its value and state glyph: observed (solid disc) / estimated (ring with centre dot) / partial (pie with a missing slice) / missing (hatched square) / unsupported (circle with a bar) / unavailable (cloud with a strike) icons, drawn with Lucide-style SVG, plus a rectangular DEMO tag. No pill shapes and no emoji. Colour is never the only cue.
2. **Map** (MapLibre): Natural Earth basemap; AOI polygons from `geo/*.geojson`; 5 km cells from `cells/<aoi>/<year>.json` for the selected month, coloured by the active series. A map failure never hides the calendar or the table.
3. **Compare sensors chart:** Aqua cyan `#00B4D8` solid; VIIRS violet `#8B5CF6` solid with markers; Terra amber `#F59E0B` thin; estimate teal `#14B8A6` dashed with an 80% band. Legend sits outside the plot; log/linear toggle. These are strong colours, never grey for data.
4. **Evidence drawer** for the selected month: raw counts, static-source counts, estimate with interval and empirical coverage, extract status, split label, model id and card, provenance (source file ids with sha256), anomaly (rank, baseline years, flag), and plain-English text from deterministic templates.
5. **Linked selection:** AOI × month stays the same across calendar, map, chart and drawer, and survives switching mobile tabs.
6. **Export:** CSV of activity records and a printable evidence brief containing AOI, UTC bounds, units, method, sources, snapshot and release stage.
7. **Model panel:** comparison table from `comparison.csv`, plus the QML-subset panel clearly labelled "research, simulated".
8. **PWA:** manifest, icons, service worker, cached-region offline mode with snapshot age shown, and an update prompt.
9. **Responsive:**
   - Desktop: top bar, map left, calendar + chart right, drawer at the bottom.
   - Mobile (360 px): Calendar / Map / Evidence tabs and a bottom sheet with ≥44 px targets.
   - Keyboard navigable calendar grid (arrow keys); a table fallback when WebGL is missing.

**P1:** a "Harmonize it yourself" toggle that recomputes the B0/B1 estimate in the browser from `weights.json` + `features/*.json`, proving the weights are live, with a parity check against the exported estimate. Also: a scrubbable replay animation of the calendar over the years, and an optional Bangla UI.

**P2:** ONNX MLP in-browser via onnxruntime-web, a recent NRT layer (`recent/`, labelled "near-real-time, not harmonized"), and a free-text assistant (needs a free inference path; out of scope for v1).

**Visual direction:** deep navy workspace (`#0B1220` / `#111A2E`), white text, amber `#F59E0B` reserved for "burning activity" emphasis, Inter/IBM Plex fonts, subtle motion that respects `prefers-reduced-motion`. No fake counters, no "AI accuracy" badges.

## 7. Kaggle runbook (for Hameem)

The click-by-click version is `../KAGGLE_HANDOFF.md`. Summary:

1. **Notebook A** (`kaggle_notebooks/lumos_A_fetch.ipynb`):
   - Create a new Kaggle notebook named `lumos_A_fetch` and import the .ipynb.
   - Settings → **Internet ON**, Accelerator **None** (CPU).
   - Save Version → **Save & Run All.** Time is not measured yet (estimate 8-40 min; 117 files, the Australia and US files are the largest).
   - Expect `ok=111, missing=6, error=0`. The 6 missing files are the 2025 yearly files (3 countries × MODIS and VIIRS), which FIRMS does not publish. Any `error` row is a problem.
2. **Notebook B** (`kaggle_notebooks/lumos_B_train.ipynb`), Internet OFF, A's output attached (Add Input → Notebook Output). Two documented options:
   - **(a) GPU T4 x2, no competition.** 31 GiB RAM, 4 CPUs. Safe for the account. B uses one T4. Slower and RAM-limited; the US panel size is unmeasured.
   - **(b) RTX PRO 6000**, only via a new notebook with the competition `arc-prize-2026-arc-agi-3` attached and Internet OFF (177 GiB RAM, 48 CPUs). A search summary of the competition page says other use of that machine could risk moderation action (UNCONFIRMED); the owner decides.
   - Leave the environment on the default (latest). The probe showed torch 2.11 with `sm_120` working on the default image; do not pick old pinned images.
   - Optional: Add Input → Models → e.g. Qwen2.5-7B-Instruct (Transformers) to enable Q2 (needs the RTX machine; otherwise Q2 reports skipped).
   - Time is not measured on real data yet. Wall-clock caps: `XGB_MAX_MINUTES`, `QLLM_MAX_MINUTES`. If it crashes inside a live session, Run All again to resume from verified checkpoints.
3. Download `/kaggle/working/lumos_app_bundle.zip` (Output tab). Give it to Claude Code, which unzips it to `apps/web/public/data/<snapshot_id>/`.
4. **First real-data check:**
   - `manifest.release_stage` and `release_reason`.
   - `figures/timeseries_BGD.png`, `timeseries_AUS-NSW.png`, `timeseries_USA-CA.png`.
   - The ingest time and memory per country in `run_log.json` (Australia and the United States are unmeasured).

## 8. Acceptance criteria

These keep the v1 IDs. New or changed:
- **DATA-03:** every activity record validates against `activity.schema.json`, and `tests/check_bundle.py` passes on the real bundle.
- **SCI-04:** the gate and release-stage logic are reproduced in `release_reason`. A synthetic bundle always gives `demo`.
- **APP-W1:** the browser B0/B1 recompute matches the exported estimate within 1e-3 relative.
- **PERF-01:** first view < 5 MB compressed, with region data lazy-loaded. A bundle above 100 MB triggers a cutoff raise in B.
- **UX-04:** all six state glyphs are distinguishable in greyscale.

## 9. Status (honest, 10 Oct 2026)

| Item | State |
|---|---|
| Source audit | Done, with dated corrections of 10 Oct 2026 (`docs/SOURCE_CHECK.md`, `docs/research/`) |
| Notebook A | Built and tested against a local mirror and a synthetic 3-country fixture. FIRMS responds from the owner's machine (HEAD checks done), but the full 117-file download has **not been run on Kaggle**. Expected result: 111 ok, 6 missing (2025), 0 error |
| Notebook B | Covers Bangladesh, Australia (+NSW) and the United States (+California). Run on the synthetic fixture only; **not reviewed or run on real data**. Kaggle probes showed the GPU stack works on T4 x2 and RTX PRO 6000 with tiny workloads |
| App | P0 and P1 built and tested on synthetic data (see `STATUS.md` for current test counts). Not tested on real phones or a real snapshot; not deployed |
| Release stage per region | Being redesigned (see `CONTRACT.md` §6): one pooled stage is not evidence for a single region |
| Code review / watchdog / resolver loops | Earlier loops done on the app; a review round covering all three regions is in progress (`review_loop/`) |
| Event rules | The pack says submission closed 7 Oct 2026; this PRD said the project window starts 14 Nov 2026. **UNVERIFIED**: read the official page and confirm the dates and the rule on reusing preparation work |

Synthetic-fixture numbers in the test reports are plumbing checks only, not scientific results. No accuracy or calibration claim is made for any region.

## 10. Risks and fallbacks

- **FIRMS file naming or availability changes:** A logs `missing` and keeps going; the Area API with MAP_KEY is the fallback.
- **Kaggle image Python differs between A and B, so wheels won't install:** Q1 uses the built-in torch simulator anyway. PennyLane is only a cross-check.
- **XGBoost/PyTorch lacks Blackwell support:** a small Kaggle probe (10 Oct 2026) showed torch 2.11 with `sm_120` and XGBoost GPU working on the default image, but B itself has not run there. If it fails, CPU fallback with capped samples and wall-clock caps; B0/B1 always finish. The app bundle is exported **before** the Q1/Q2 research stages.
- **The model does not beat the ratio baseline:** ship the ratio estimate with `observed_comparison` status and state this plainly. That is a legitimate finding.
- **The FIRMS yearly route changes, or 2025 stays absent:** the calendar ends at 2024 and 2025 is shown as missing. Getting 2025 needs the FIRMS archive form (login) or an Area API key; neither is part of this run.
- **S-NPP science data delivery ends 2 Nov 2026 (NASA page):** the reference sensor is used for 2013-2024 only, so this run is unaffected, but future and NRT use of S-NPP is. Keep the raw bundle and its sha256 manifest.

### USA caveats (what the UI and any write-up must say)

Full detail with measurements is in `CONTRACT.md` §10.2.

- The US file includes Alaska and Hawaii (measured latitude 18.97 to 69.51 in the 2020 MODIS file), not only the lower 48. Whole-country `USA` pools them under one country term.
- Type 0 ("presumed vegetation fire") mixes wildfire with prescribed and agricultural burning. Say "hotspot", not "wildfire". Rows of type 1, 2 and 3 are excluded from the main count (2020 MODIS: 148,412 type 0 versus 5,205 type 2, 200 type 1, 31 type 3).
- `USA-CA` uses the national month ratios and country term; California-specific accuracy is unmeasured.
- Natural Earth 110m US bounding box omits the Aleutians west of 180; the Aleutians and the 3x3 neighbourhood feature are limited at the antimeridian.
- Download size 2001-2024 (MODIS + VIIRS): United States about 767 MB, Australia about 1762 MB, Bangladesh about 15 MB (2025 does not exist). US processing time and memory are unmeasured.
