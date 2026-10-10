# Lumos Fire Calendar PWA: code review (2026-10-09)

**Scope:** `apps/web/src/**` and `scripts/import_bundle.mjs`, checked against CONTRACT §6–7, PRD §5–6 and `notebooks/lumos_B_train.py` / `tests/check_bundle.py`.

**Scratch evidence** (`review_app/scratch/`, run with `npx vitest run --config review_app/scratch/vitest.config.mjs`): parity over every AOI-year, Zod performance, CSV/brief escaping, and import attacks.

## BLOCKER

**B1. `import_bundle.mjs:15,114–124`: a `snapshot_id` of `.` or `..` deletes the data or public directory.**
- **Problem:** `SNAP_RE = /^[A-Za-z0-9_.-]{1,128}$/` accepts `.` and `..`. Then `dest = path.join(out, id)` resolves to `out` itself or to its parent, and `fs.rmSync(dest, {recursive:true})` deletes it.
- **Evidence:** importing a manifest with `"snapshot_id":"."` deleted the whole `--out` directory, including the other snapshot and `index.json`. With `..` it would delete `apps/web/public`.
- **Fix:**
  - Require `/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/` and reject any id containing `..`.
  - Assert `path.dirname(dest) === path.resolve(out)` before calling `rmSync`.

## HIGH

**H1. `ui/useAppData.ts:36` + `Calendar.tsx:70`: loading, network errors and validation errors all render as "Missing (not zero)".**
- **Problem:** `loadActivityRange` uses `Promise.all`, so one bad year (Zod failure, 500, uncached offline) rejects the whole AOI. `useActivity` has no `.catch`, so `map` stays `null`, and `Calendar` renders every cell as "Missing (not zero)". This also flashes during every normal load. Offline, the status line says "showing cached data" over a fully hatched calendar.
- **Fix:** track loading/error/ok and render a skeleton or error banner; use `Promise.allSettled` so a bad year marks only its row.

**H2. `data/api.ts:81–87`: a 404 or an SPA-HTML fallback for an activity file is silently treated as data that is genuinely absent.**
- **Problem:** after a deploy mismatch or a stale precached `index.json`, real data shows as missing.
- **Fix:** `manifest.files` lists every activity file. Treat a 404 for a listed file as an error (see H1). Return `null` only when the manifest does not list the file.

**H3. `import_bundle.mjs:55–97`: checksum enforcement covers only the files listed, and content is never validated.**
- **Problem:** `copyDir` copies every file, so an unlisted `unlisted_extra.js` and a bogus `activity/BGD/2016.json` were imported (tested). A manifest missing `release_stage`/`aois`/`years` became the default, and the app then shows "Could not load".
- **Fix:** copy only listed files, and run the app's Zod schemas over the bundle before the rename; refuse on any error.

**H4. `api.ts:159` / `schemas.ts:101–109`: cells files are parsed and Zod-validated on the main thread, and cached twice.**
- **Evidence:** an 11 MB file (250k rows, within budget) took 1.0 s to parse plus **4.4 s** in `CellsFileSchema`, freezing the UI on each map year change. `getText` also caches the raw text beside the parsed object, with no eviction.
- **Fix:** validate the header plus a typed row loop, ideally in a Web Worker; cache only parsed results, in a small LRU.

## MEDIUM

**M1. `model/b0.ts:24` + `harmonize.ts:44,103`: the browser B0 shows 0 for months whose export is null, and parity ignores null-pattern mismatches.**
- **Evidence:** `AUS-NSW` and all `BGD*` AOIs, 2025-09 (`extract=partial`, exported est `null`): the browser computes `0`, and Harmonize prints "0". That is missing rendered as zero.
- **Problem:** `parity()` skips any month where one side is null, so this mismatch never fails the check.
- **Fix:** mask browser months to `null` where the exported estimate is null; count null-vs-number as a parity failure.

**M2. `ui/MapPanel.tsx:107`: XSS through `Popup.setHTML`.**
- **Problem:** `cell_id` comes from bundle JSON, and `CellsFileSchema` accepts any string.
- **Fix:** build a DOM node and set its `textContent`, or use `escapeHtml(p.id)`.

**M3. `data/export.ts:40–44`: CSV formula injection.**
- **Problem:** quoting doesn't stop Excel evaluating `"=HYPERLINK(...)"`; `reason` and `aoi_id` pass through unchanged (tested).
- **Fix:** for string values only (keep numbers such as `-1.2` intact), prefix with `'` when the value matches `/^[=+\-@\t\r]/`.

**M4. `data/explain.ts:18`: the backcast sentence is false for 2012.**
- **Problem:** the notebook labels 2012 as `split:'backcast'` while VIIRS is observed (see the sample, 2012-11: viirs 53). The text says "VIIRS did not exist yet".
- **Fix:** use different wording when `raw_viirs_reference_detections` is non-null or the year is 2012 or later ("in the backcast period; observed VIIRS also shown").

**M5. `ui/MapPanel.tsx:164`: a missing month shows "0 active cells this month".**
- **Problem:** the map never consults the record's `extract_status` or value. In the sample, 2025-11 is `missing`, and the legend implies zero activity.
- **Fix:** pass `deriveDisplayState(record)` into `MapPanel` and show "No data (missing, not zero)" or "partial month".

**M6. `data/api.ts:240–243`: a non-target platform can downgrade the display state.**
- **Problem:** `extract_status` combines Aqua, Terra and S-NPP, so a missing Terra file makes every month `partial`; the observed VIIRS is then hidden and the chart lines dropped, although Terra is never in the target.
- **Fix:** have B emit per-platform statuses, or at least ignore Terra-only partial months.

**M7. Anomaly marks appear on partial months.**
- **Problem:** 36 partial records in the sample carry a `high`/`low` flag. The calendar (`Calendar.tsx:86`) and the Evidence badges show ▲/▼, while the same record's `reason` says partial months are "excluded from … anomaly".
- **Fix:** for `partial` months, suppress the triangle or annotate it "anomaly from Aqua-based estimate".

**M8. `App.tsx:38–42`: the selection is validated only once, when `core` loads.**
- **Problem:** a later `#aoi=XYZ` or `#y=1995` (from a hashchange or a pasted link) loads 25 404s and shows a nameless all-missing calendar.
- **Fix:** depend on `[core, sel.aoiId, sel.year]`, or validate inside `store.set` against known regions and years.

**M9. `PwaStatus.tsx:18` + `vite.config.ts` runtime caching: "works offline" is claimed when only visited AOI-years are cached.**
- **Problem:** activity, cells and features files use runtime CacheFirst and are not precached. An unvisited AOI offline hits H1.
- **Fix:** precache `activity/**` (it is small), or show "offline: this area isn't cached".
- **Note:** versioned snapshot paths make CacheFirst safe, except when the importer replaces an existing snapshot (the default). Make `--keep-existing` the default.

## LOW

- **`Evidence.tsx:66`:** rank is shown "of `baseline_years`", but that count excludes the month itself (`lumos_B_train.py:1634`); use `+1` as `explain.ts` does.
- **`glyphs.ts:4` / `api.ts:241`:** `value_status:'unsupported'` is also emitted for 2025 months with missing or partial sources. The label "Unsupported (no Aqua protocol)" is wrong for those months. Use "Unsupported (no estimate)".
- **`b1.ts:23`:** a missing `transform` defaults every feature to `log1p`. That turns negative `lat` (AUS) into 0 and log1p's the month sin/cos values. Throw instead.
- **`Harmonize.tsx:51`:** it shows only the diff after the rounding allowance (often "0.0e+0"). Also show `maxRelDiffRaw`.
- **`TopBar.tsx:52`:** `aria-label` on a `<span>` inside the compact "?" button isn't the button's name. Put it on the `<button>`.
- **`Calendar.tsx:90`:** the split `<div>` inside `role="row"` has no `gridcell`/`rowheader` role, which is invalid ARIA grid structure.
- **`import_bundle.mjs:120,135`:** staging dir can be left in `public/data`; `index.json` write isn't atomic.

## Verified OK
- **Import safety:** zip-slip (`../`, absolute paths, drive letters) is rejected (tested), symlinks are skipped, and every listed checksum is enforced.
- **Paths:** fetches are `BASE_URL`-relative and routing is hash-only, so GitHub Pages subpaths work.
- **Lifecycle:** `alive` flags stop stale responses. MapLibre and the replay interval are cleaned up.
- **Escaping and Zod:** `briefHtml` is fully escaped. Zod accepts real `observed`/`estimated` values, extra keys and a null anomaly.
- **B0/B1 math:** it matches the notebook and `check_bundle.py` (`ISO3-MM` keys, global-r fallback, log1p, `(z−mean)/scale`, 0-based month_sin, `aqua_count_raw`). The B1 worst diff is 5.5e-7.
- **Parity allowance:** subtracting `quantum/2` is **sound**. The export is `round(t,2)`, so a correct recomputation can differ by up to 0.005, and the allowance weakens detection by at most that. Without it, B0 falsely fails (raw worst 1.5e-3 at small values). The real gap is M1.
