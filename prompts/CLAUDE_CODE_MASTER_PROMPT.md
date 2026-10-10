# Claude Code master prompt v2 — Lumos Fire Calendar app

Paste everything below the line into Claude Code at the root of an empty repo. Copy this whole package into the repo first. If you have run the notebooks, also add `lumos_app_bundle.zip` from Notebook B.

---

You are the lead engineer for **Lumos Fire Calendar**, a NASA Space Apps 2026 entry (*Harmonization of MODIS and VIIRS Hot Spots*). Owner: **M. Al Shahriar Hameem**, Team Lumos, Dhaka. Do not invent other contributors.

## Read first (source of truth, in this order)
1. `CONTRACT.md`: frozen data contract (v1.0 + §7 v1.1 amendments). Never rename its fields.
2. `PRD.md` (v2): product, app requirements (§6), acceptance criteria (§8), status (§9).
3. `docs/PRD_v1_original.md`: extra detail and caveats; v2 wins on conflicts.
4. `notebooks/` (Kaggle A fetcher and B trainer, already built and tested) and `notebooks/TEST_REPORT.md`.
5. `sample_bundle/lumos_app_bundle/`: a **synthetic** bundle produced by Notebook B. It has the exact real format, and every value has `value_status:"demo"`. Use it for development and tests. A real bundle (`lumos_app_bundle.zip`) replaces it when available.

Do not re-ask decisions already made: PWA (one codebase for Windows/macOS/iOS/Android browsers), free static hosting, no paid APIs, Bangladesh + New South Wales detailed AOIs, global map navigation.

## Build
- **Stack:** Vite + React + TypeScript; MapLibre GL JS (pin versions); compact SVG charts (visx or hand-rolled D3 scales; no heavy chart libs); Zod schemas generated from `activity.schema.json`; vite-plugin-pwa (Workbox); Vitest + Playwright.
- **Layout:**
  - `apps/web/` for the app.
  - `apps/web/public/data/<snapshot_id>/` for the unzipped bundle.
  - `apps/web/public/data/index.json` lists the available snapshots.
  - `scripts/import_bundle.mjs <zip>` verifies `checksums.sha256` and `manifest.json`, copies the data, and refuses an unknown schema_version.
- **Data loading:** load `manifest.json`, `regions.json` and `geo/*.geojson` up front. Lazy-load `activity/<aoi>/<year>.json`, `cells/<aoi>/<year>.json` and `features/<aoi>/<year>.json` on selection. Cache them in the service worker per AOI.
- **Weights integration (must work):**
  - `src/model/b0.ts` reads `models/B0_month_ratio/weights.json`.
  - `src/model/b1.ts` reads `models/B1_poisson/weights.json`. It applies the documented transform → standardise (mean/scale) → dot(coef) + intercept → exp, per cell, then sums to the AOI.
  - Feature order and transforms come from `model_card.json` (`feature_order`, `feature_definitions`).
  - Inputs come from `features/<aoi>/<year>.json`.
  - A "Harmonize in your browser" toggle recomputes the selected model and shows parity against the exported estimate. Parity must be ≤1e-3 relative; unit-test it against the sample bundle.
  - Optional (P2): `models/D1_mlp/model.onnx` via onnxruntime-web, using the input spec in its model card.
- **Implement PRD §6 P0 fully, then P1.** States: observed / estimated / partial / missing / unsupported / demo. Missing is null and never drawn as zero. Show `release_stage` and `release_reason` in a header pill and an "About this data" sheet. A synthetic bundle shows a persistent **DEMO DATA** banner.
- **Colours:**
  - Aqua `#00B4D8`, VIIRS `#8B5CF6`, estimate `#14B8A6` (dashed + band), Terra `#F59E0B`, static sources `#EF4444`.
  - Navy UI `#0B1220` / `#111A2E`.
  - Never grey for data. Legends outside the plot. Glyphs/patterns accompany colour.
- **Plain-English explanations:** deterministic templates fed only by record fields, e.g. "In Mar 2016 VIIRS recorded 408 detections, about 3.1× Aqua's 133; this is typical of the sensor gap, not necessarily more fire." Never invent numbers.
- **Export:** CSV + a printable brief (print CSS) with full provenance.
- **Accessibility:** arrow-key calendar grid, ARIA labels, ≥44 px touch targets, reduced motion, a WebGL-failure table fallback.

## Agents and loops
Use subagents with clear file ownership:
- **frontend** owns `apps/web/src/ui`.
- **data/model** owns `apps/web/src/data` and `src/model`, plus `scripts/`.
- **verifier** owns `tests/`.
- A **watchdog** checks for hung dev servers, tests and loops.
- A **reviewer** scrutinizes diffs for bugs.
- A **resolver** fixes the reviewer's findings.

Loop: inspect → implement → test → review → fix → checkpoint (update `STATUS.md`). Allow at most 3 repair attempts per external dependency, then take the documented fallback. Never claim an agent succeeded if it did not. Stop optional work once P0 + P1 pass.

## Tests (must pass before you report done)
- Vitest:
  - Zod-validate every activity file in the sample bundle.
  - Missing renders as missing, not zero.
  - b0/b1 parity.
  - Linked selection.
  - CSV export includes provenance.
- Playwright:
  - Desktop 1440 px, tablet 820 px, mobile 360 px.
  - Calendar → map → chart → drawer linkage.
  - Keyboard navigation of the calendar.
  - Offline reload of a cached AOI.
  - WebGL disabled → table fallback.
  - Screenshots saved to `artifacts/screens/`.
- Measure and report: initial compressed transfer (target <5 MB) and cached selection latency (target <500 ms). Report what you measured; do not assert targets you did not measure.

## Deploy
Base-path-safe build for **GitHub Pages**: a workflow that builds `apps/web` and deploys `dist/`. Prepare it, but deploy only when the owner says so. No secrets in the repo or bundle. Write a README with:
- the Kaggle runbook (PRD §7),
- how to import a new bundle,
- install-as-app instructions for Windows/macOS (Chrome/Edge/Safari), Android (Chrome) and iOS (Safari → Share → Add to Home Screen).

## Finish with
Implemented features, test results, screenshots, measured performance, data status (synthetic vs real snapshot id), limitations, and exact next steps (e.g. "run Notebook A, then B, then `node scripts/import_bundle.mjs lumos_app_bundle.zip`").
