# Lumos Fire Calendar: E2E report (Playwright 1.56.0, Chromium 1194)

Run date: 9 Oct 2026. Build: `npm run build`, served by `npm run preview` (:4173) through the Playwright webServer. The offline test starts its own preview servers on ports 4181–4183 and kills them. No servers were left running afterwards.
Data: synthetic fixture `lumos-20261009T182337Z-9e1ef412` (release stage `ui_prototype`).
Run with: `npx playwright test -c tests/playwright.config.ts` (or `npm run e2e`).
Viewports: desktop 1440×900, tablet 820×1180 with hasTouch, mobile 360×780 with hasTouch, isMobile and DPR 2.

**Result: 35 passed, 4 failed, 3 skipped.** The skips are by design: test 08 is mobile-only, and test 13 is skipped on tablet. All 4 failures are **app findings** (see below). None of them is a test bug.

## Pass/fail

| # | Test | Desktop | Tablet | Mobile | Notes |
|---|---|---|---|---|---|
| 01 | Load, DEMO DATA banner, "UI prototype" pill, no console errors | ✓ | ✓ | ✓ | 0 console errors and 0 page errors, map included (default GPU flags) |
| 02 | Linked selection (drawer, explain text, chart marker, map title, URL hash) and reload | ✓ | ✓ | ✓ | Hash `#aoi=BGD&y=2018&m=8&snap=…` is restored after reload |
| 03 | Keyboard: arrows, End; focus follows selection | ✓ | ✓ | ✓ | On mobile, Enter/Space on a cell does **not** open Evidence (see B4) |
| 04 | Missing ≠ zero: AUS 2016 (VIIRS file 404) | ✓ | ✓ | ✓ | All 12 cells are `partial` with a glyph and none is `is-zero`; the drawer shows S-NPP VIIRS as "—" |
| 05 | AOI switch BGD → BGD-B → AUS-NSW; 2001–2002 show ⊘ | ✓ | ✓ | ✓ | 12/12 unsupported for 2001 and 2002 in both AOIs; map, calendar and drawer titles update |
| 06 | Harmonize in browser: parity ✓ | ✓ | ✓ | ✓ | "✓ Parity, max rel. diff 0.0e+0 · 12 months · tol 0.001" |
| 07 | CSV export and print brief | ✓ | ✓ | ✓ | Header starts `snapshot_id,release_stage,aoi_id,…`, provenance columns present; file `lumos_BGD_<snap>_DEMO.csv`. Brief iframe contains snapshot, AOI, UTC, MODIS, UI prototype and DEMO |
| 08 | Mobile tabs keep selection; touch targets | – | – | **✘** | Selection is kept across Map, Evidence and Calendar. Fails only on a soft check (cell height); see B2 |
| 09 | Offline reload: shell + cached AOI; uncached AOI honest | **✘** | **✘** | **✘** | Shell, cached AOI, map cells and the "Offline — showing cached data" status all work. Fails on a soft check: no explicit "unavailable offline" message (B1) |
| 10 | `?nowebgl` gives the table fallback; calendar still works | ✓ | ✓ | ✓ | |
| 10b | `--disable-webgl --disable-webgl2` launch flags give the same fallback | ✓ | ✓ | ✓ | WebGL is confirmed unavailable in-page |
| 11 | Model panel: comparison rows; QML labelled research/simulated | ✓ | ✓ | ✓ | 6 model rows, 12 QML rows, badge reads "research — simulated on classical hardware" |
| 12 | Explainer opens, Escape closes it, focus returns to the opener | ✓ | ✓ | ✓ | |
| 13 | Performance (report only) | ✓ | – | ✓ | See measurements |

Screenshots are saved as `artifacts/e2e/<project>-<NN>-<name>.png`, 48 files in all. Failure traces are in `artifacts/e2e/test-results/`. Raw annotations are in `results.json`, and performance numbers are in `perf-desktop.json` and `perf-mobile.json`.

## Measurements (measured, not asserted)

| Metric | Desktop | Mobile | Target |
|---|---|---|---|
| First-view requests (SW blocked) | 39 | 39 | — |
| First view, decoded bytes | 2.08 MB | 2.08 MB | — |
| First view, **compressed transfer** (`PerformanceResourceTiming.transferSize`; vite preview gzips) | **0.66 MB** | **0.65 MB** | < 5 MB ✓ |
| First view, gzip -6 estimate / brotli estimate (Node zlib on bodies) | 0.50–0.51 MB / 0.41 MB | 0.51 / 0.42 MB | |
| Largest assets (gzip) | maplibre-gl.js 256 KB, index.js 101 KB, NE basemap geojson 69 KB, manifest.json 24 KB | | |
| SW precache, downloaded in the background after first load (from build output) | 39 entries, 2.49 MB raw | | not counted above |
| Cached selection latency, from cell click to drawer heading updated (+1 rAF), median of 10 | **31 ms** (max 71) | **54 ms** (max 85) | < 500 ms ✓ |
| Time to calendar populated | 2.0 s | 9.9 s* | — |

\*The mobile time-to-calendar was measured while two workers and spare preview servers were running, so it is noisy. Do not quote it.

Region data loads lazily: only BGD activity, cells and geo files appear on first view.

## APP BUGS / findings

**B1. Offline, an uncached AOI is labelled "missing in the snapshot" instead of "not available offline"** (severity: **Medium**: honesty, PRD §6.8)
- Repro: load the app, reload once so the service worker controls the page, then pick Chattogram. Go fully offline (server stopped) and reload: Chattogram renders from cache ✓. Then pick Sylhet (BGD-G), which was never visited.
- Actual: all 300 cells show ▨ "Missing (not zero)". The drawer says "No record exists for this month in the snapshot". No offline or unavailable message appears. Nothing claims zero ✓, but the text is factually wrong: the records do exist, they just are not cached.
- Likely cause: `apps/web/src/ui/useAppData.ts` `useActivity()` has no `.catch`. A failed `loadActivityRange` leaves `map=null`, and `Calendar.tsx` maps `!map` to `'missing'`. `Evidence.tsx` and `data/explain.ts` then show the no-record text. Fix: carry an `error/offline` state and render "Not cached for offline use: reconnect to load <AOI>". `useCells` and `useGeo` swallow errors in the same way, so the map shows "No cell grid exported", which is also inaccurate. It may also cause an unhandled promise rejection.

**B2. Touch targets below 44 px on mobile (360 px)** (severity: **Medium**: a11y; PRD §6.9 "≥44 px targets")
- Measured sizes:

  | Element | Size (px) | Meets 44 px? |
  |---|---|---|
  | Tab buttons | 120×58 | ✓ |
  | **Calendar cells** | **23×17** | ✗ |
  | **Release pill** | 113×**30** | ✗ |
  | **AOI select** | 123×**42** | ✗ |
  | **"?" explainer button** | **40**×44 | ✗ |
  | Models, Evidence→ and Replay buttons | 44 high | ✓ |

- A 23×17 cell on a 12-column grid is hard to hit. If 44 px cells are not feasible, mitigate with a larger hit area (padding, or a pointer-events overlay), or a row-tap that opens a month picker. The others need fixes in `styles/app.css` (`.pill`, `.field select`, `.icon-btn`/`.btn--ghost` min-width).

**B3. Desktop "0" for estimated summer months is indistinguishable from observed zero by number alone** (severity: **Low**: observation, not asserted)
- Example: BGD 2003–2011 Jun–Sep show "◐ 0". The glyph does distinguish it, so UX-04 holds. Consider showing "<1" or the interval for estimates rounded to 0. File: `ui/Calendar.tsx` (`fmtCompact`).

**B4. Mobile: Enter/Space on a focused calendar cell does nothing** (severity: **Low**)
- Arrow keys select, but there is no keyboard path from a cell to the Evidence tab other than tabbing to "Evidence →". Suggest that Enter/Space opens the evidence tab or bottom sheet in compact mode. File: `ui/Calendar.tsx` `onKey`.

## Test-infrastructure notes
- `context.setOffline(true)` and even `context.route('**', abort)` do **not** block fetches made by the service worker in this Chromium build, so the uncached AOI still loaded from the network. Test 09 therefore kills a private preview server to get real offline. Without this, the offline test gives a false pass.
- In test 13 the gzip estimate for one CSS asset was recorded as 0 because of a timing race (about 10 KB too low). `transferSize` is the authoritative compressed number.
- Fixed test bugs during the run: a missing outputDir for the CSV dump (07), a perf timeout and a blocking compression step (13), and the offline method (09).
