# STATUS (10 Oct 2026)

All numbers below come from runs on **synthetic data** in a headless sandbox, not from real FIRMS data and not from real devices. They are plumbing checks, not scientific results.

## Current state
- **Regions:** Bangladesh (`BGD` + 7 divisions `BGD-A..G`), Australia (`AUS` + `AUS-NSW`) and the United States (`USA` + `USA-CA`, California). The app opens on Bangladesh. `BGD`, `AUS-NSW` and `USA-CA` are the detailed regions (5 km cell grids and B1 features); whole-country `AUS` and `USA` are aggregates only. See `CONTRACT.md` §8-9.
- **Notebook A** (`kaggle_notebooks/lumos_A_fetch.ipynb`): fetches 3 countries, 117 FIRMS yearly files requested. **2025 yearly files do not exist (404, checked 10 Oct 2026)**, so the expected result is 111 ok + 6 missing + 0 error. Tested against a local mirror and a synthetic fixture. Not run on Kaggle yet.
- **Notebook B** (`kaggle_notebooks/lumos_B_train.ipynb`): now covers Bangladesh, Australia (+NSW) and the United States (+California). Run on the synthetic fixture only. **Not yet reviewed on real data**; its real-scale memory and time (especially the United States panel) are unmeasured.
- **Kaggle probes (10 Oct 2026, tiny workloads):** torch 2.11 with `sm_120`, XGBoost GPU and a bf16 matmul worked on RTX PRO 6000; torch and XGBoost GPU also worked on T4 x2. Details in `docs/kaggle/KAGGLE_ENV.md`. Notebook B itself has not run on Kaggle.
- **App:** PRD §6 P0 and P1 (browser harmonization, replay) are built, plus the 3D landing and the redesign. Not done: P1 Bangla UI, P2 (ONNX in browser, assistant), testing on real iOS or Android devices, deployment (waits for the owner's go-ahead).
- **Data in the app:** synthetic only, labelled `DEMO` / `FIXTURE_NOT_REAL_DATA`. Missing is never zero.

## Tests (last runs, synthetic data)
- **Unit tests:** 446 pass in the last full run.
- **Browser (Playwright e2e):** 95 pass, 39 skip (by design), 1 timing test (L05, reduced-motion transition on desktop) fails in the full run but passes alone with its timeout widened. This is a timing-sensitive test, not a fixed one.
- **Measured (headless Chromium in the sandbox, software WebGL, not real devices):** first view about 531,022 bytes gzip in the last perf spec run. Frame rates on real GPUs and phones are unverified.
- Counts change as tests are added. Re-run `npm test` and `npm run e2e` for the current figure before quoting one.

## Known issues and open items
- **Release stage per region is being redesigned.** The review found that one pooled stage (and one pooled interval-coverage number stamped on every record) covers all 12 AOIs, which is not evidence for a single region such as `USA-CA`. The per-region rule will be recorded in `CONTRACT.md` §6. Until then, read the stage as "pooled over all regions".
- Partial months can carry hard 0 counts (for example Aqua before 3 Jul 2002, S-NPP before 20 Jan 2012). The `extract_status` of `partial` marks them; CSV readers must check it.
- The landing route downloads the workspace code early (about 100 kB gzip); layout breakpoints are read once.
- Unmeasured on real data: US download and processing time, memory, and the 15 MB per AOI-year cell budget for `USA-CA`.
- Real-data results for any region are not yet known, so **no accuracy or calibration claim is made**.

## Source corrections (10 Oct 2026)
Dated in `docs/SOURCE_CHECK.md` and `CONTRACT.md` §10: no 2025 yearly files; the yearly route is undocumented; Area API window 1-5 days and no `NOAA21_SP`; satellite codes A, T, N, N20, N21; Aqua starts 3 Jul 2002; S-NPP science data delivery scheduled to cease 2 Nov 2026; NRT rows have no `type`; Fu et al. 2020 is correct (first author Yuyun Fu); burned-area products are not independent checks; no single global MODIS-to-VIIRS multiplier is defensible. **Real challenge submission dates are UNVERIFIED** (pack: 7 Oct 2026; PRD: window from 14 Nov 2026): the owner must read the official page.

## History (condensed)
- **9 Oct:** first app build and agent review loop (watchdog, reviewer, e2e verifier, resolver); details in `review_app/RESOLUTION.md`.
- **10 Oct:** 3D landing route (Three.js globe, GSAP story), rectangular tags, Lucide icons; second review loop (`review_exp/RESOLUTION.md`).
- **10 Oct:** owner decision to cover three regions; `CONTRACT.md` §8-9 added; Notebooks A and B and the app were updated for `USA` / `USA-CA` by separate roles. A review round on all three regions (`review_loop/`) is in progress and its findings are still being fixed.
