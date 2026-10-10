# Lumos Fire Calendar — PRD v2.0

Owner: M. Al Shahriar Hameem · Team Lumos, Dhaka · NASA Space Apps 2026 — *Harmonization of MODIS and VIIRS Hot Spots* · 9 Oct 2026
Supersedes PRD v1.0 (`docs/PRD_v1_original.md`). v1 still holds wherever v2 is silent.

**Product promise:** Pick a place. See its burning seasons over 20+ years on one fair scale. Tell real change apart from satellite change.

---

## 1. The idea in easy English

- **MODIS** (2000–present) is an older heat camera with ~1 km pixels. **VIIRS** (2012–present) is sharper, with 375 m pixels. It catches small fires MODIS misses, so it typically records several times more hotspots for the same place. Fu et al. 2020 found MODIS missed 65–83% of VIIRS fire pixels in NE Asia.
- If you join the two records, a fire chart jumps upward in 2012 even when burning did not change. **Harmonization** removes that jump.
- Both satellites flew together from 2012 to 2024. We learn the relationship "when Aqua-MODIS saw *X* in this 5 km cell, in this month and setting, S-NPP VIIRS saw *Y*". We test it on years and places it never saw. Then we use it to turn 2003–2011 MODIS records into **"VIIRS-scale estimates"**, each with an error band.
- What it cannot do: recover individual small fires MODIS missed, see through clouds, or count wildfires. A hotspot is a hot pixel, not a fire incident.

What the user does with it: open a **year × month burning calendar** for Bangladesh, a division, or New South Wales. See the usual burning season, unusual months, and raw MODIS vs raw VIIRS vs harmonized curves. Then export the evidence.

## 2. What changed from v1 (decisions, all verified 9 Oct 2026)

| Topic | v1 | v2 |
|---|---|---|
| Data acquisition | Manual FIRMS archive requests, MAP_KEY | **Public FIRMS yearly per-country CSVs, no key** (`/data/country/{modis\|viirs-snpp}/{YEAR}/…_{Country}.csv`). Verified with Bangladesh 2020/2024. The Area API is optional and only for recent NRT data |
| Kaggle | One offline notebook + laptop download step | **Two notebooks.** A runs with internet ON (CPU/T4) to fetch data, boundaries and wheels. B runs offline on the Blackwell GPU and attaches A's output. No laptop step needed |
| Models | B0/B1/B2, other models later | Full stack, each part switchable. B0 ×3, B1 Poisson GLM, B2 XGBoost-GPU, D1 PyTorch MLP→ONNX, Q1 simulated VQC (8 qubits), Q2 QLLM (LLM-guided QML config search) |
| Gate | B2 vs B1 | A candidate must beat the **better of B1 and B0_month_ratio** by ≥10% on validation AOI-month MAE, with no >10% drop in the active subgroup. Otherwise the transparent ratio model ships |
| Regions | Names | Keyed on ISO 3166-2: `BGD`, `BGD-A…G` (7 Natural Earth divisions; Mymensingh is absent in NE and is included in its parent), `AUS`, `AUS-NSW` |
| Weights in app | Not defined | `weights.json` (B0/B1) is recomputable in plain JS. `model.onnx` (MLP) runs via onnxruntime-web. Per-cell `features/*.json` exported for BGD and NSW |

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
[Kaggle Notebook B  — internet OFF, RTX PRO 6000 Blackwell]
  verify → ingest/quarantine → 5 km equal-area grid × month → frozen splits
  → B0/B1/B2/D1 (+Q1/Q2 research) → gate → test opened once → intervals
  → backcast 2003–2012 → anomalies → lumos_app_bundle.zip
        │  download zip
        ▼
[PWA — React + Vite + MapLibre, static hosting (GitHub Pages)]
  public/data/<snapshot>/…  ← unzipped bundle;  weights.json / model.onnx for in-browser recompute
  Works in browsers on Windows, macOS, iOS, Android; installable; cached regions work offline
```

The frozen data contract is in **`CONTRACT.md`** (v1.0 plus the v1.1 amendments in §7). It is the single source of truth for field names, file layout and the scientific protocol.

## 5. Scientific protocol (summary of CONTRACT §3–5)

- **Source** = Aqua MODIS. **Reference** = S-NPP VIIRS. Terra is shown separately and never pooled. The target uses `type==0` (vegetation) detections only. Type 2 static sources are counted separately per sensor.
- **Grid:** Lambert cylindrical equal-area, 5 km cells (exactly 25 km²). The unit is cell × UTC month.
- **Missing ≠ zero:**
  - A missing, errored or header-only file gives null.
  - Months before the product start date (Aqua 2002-07-04, S-NPP 2012-01-20) and months after the last date in a current-year file are `partial`. They are excluded from training and baselines.
  - `coverage_fraction` is always null, because FIRMS gives no cloud-free denominator.
- **Splits:** train 2013–2020, val 2021–2022, test 2023–2024. 20% of 100 km spatial blocks are held out. The test set sits behind a "vault" that opens once, after the selection is frozen.
- **Features:** Aqua counts, day/night, FRP, confidence, scan, Terra count, 3×3 neighbourhood, month sin/cos, latitude, train-only climatology, country. **No VIIRS-derived predictors.**
- **Metrics:** MAE, RMSE, bias and Poisson deviance at cell-month and AOI-month level. Subgroups: active/inactive, country, season, spatial holdout. No "accuracy %", no MAPE.
- **Intervals:** 80% multiplicative intervals from validation residual quantiles. Empirical coverage on test is reported.
- **Release stage** (shown in the app header):
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

1. **Notebook A** (`notebooks/lumos_A_fetch.ipynb`):
   - Create a new Kaggle notebook and upload the .ipynb.
   - Settings → **Internet ON**, Accelerator **None** (or T4).
   - Run All, about 10–30 min. Check that the summary table has no `error` rows.
   - **Save Version → Save & Run All.**
2. **Notebook B** (`notebooks/lumos_B_train.ipynb`):
   - Create a new notebook and upload it.
   - **Add Input → Notebook Output → Notebook A.**
   - Optional: Add Input → Models → e.g. Qwen2.5-7B-Instruct (Transformers) to enable Q2.
   - Accelerator **RTX PRO 6000**, Internet **OFF**.
   - Run All. Expect roughly 30–90 min on real data; this is not yet measured.
   - If it crashes, re-run. It auto-resumes from verified checkpoints. Wall-clock caps: `XGB_MAX_MINUTES`, `QLLM_MAX_MINUTES`.
3. Download `/kaggle/working/lumos_app_bundle.zip` (Output tab). Give it to Claude Code, which unzips it to `apps/web/public/data/<snapshot_id>/`.
4. **First real-data check:**
   - `manifest.release_stage` and `release_reason`.
   - `figures/timeseries_BGD.png`.
   - The Australia memory/time log in `run_log.json`.

## 8. Acceptance criteria

These keep the v1 IDs. New or changed:
- **DATA-03:** every activity record validates against `activity.schema.json`, and `tests/check_bundle.py` passes on the real bundle.
- **SCI-04:** the gate and release-stage logic are reproduced in `release_reason`. A synthetic bundle always gives `demo`.
- **APP-W1:** the browser B0/B1 recompute matches the exported estimate within 1e-3 relative.
- **PERF-01:** first view < 5 MB compressed, with region data lazy-loaded. A bundle above 100 MB triggers a cutoff raise in B.
- **UX-04:** all six state glyphs are distinguishable in greyscale.

## 9. Status (honest)

| Item | State |
|---|---|
| Source audit | Done. 12 items checked, verified/unverified marked (`docs/SOURCE_CHECK.md`) |
| Notebook A | Built, tested against a local mirror (429/503/404/HTML/403/cache/key-redaction). **Not yet run against real FIRMS** |
| Notebook B | Built and tested end-to-end on a synthetic fixture (quick and full mode), plus unit, resume, export-parity and leakage tests. **Not yet run on real data or the Blackwell GPU** |
| Code review / watchdog / resolver loop | 1 full loop done. All high findings fixed and re-verified (`review/`, `notebooks/TEST_REPORT.md`) |
| App | Not built. Next step is Claude Code with `CLAUDE_CODE_MASTER_PROMPT.md` |
| Event rules | Official project window starts 14 Nov 2026. Confirm organizer rules on reusing preparation work |

Synthetic-fixture numbers in the test reports are plumbing checks only, not scientific results.

## 10. Risks and fallbacks

- **FIRMS file naming or availability changes:** A logs `missing` and keeps going; the Area API with MAP_KEY is the fallback.
- **Kaggle image Python differs between A and B, so wheels won't install:** Q1 uses the built-in torch simulator anyway. PennyLane is only a cross-check.
- **XGBoost/PyTorch lacks Blackwell support:** CPU fallback with capped samples and wall-clock caps; B0/B1 always finish. The app bundle is exported **before** the Q1/Q2 research stages.
- **The model does not beat the ratio baseline:** ship the ratio estimate with `observed_comparison` status and state this plainly. That is a legitimate finding.
