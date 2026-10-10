# RESOLUTION: Lumos Fire Calendar PWA (2026-10-09)

Inputs: `review_app/REVIEW.md` (B1, H1–H4, M1–M9, 7 lows), `review_app/WATCHDOG.md` (F1–F8) and `artifacts/e2e/E2E_REPORT.md` (B1–B4).
`apps/web/src/types.ts` is **unchanged**. UI-only states (`unavailable`, `loading`) live in `ui/glyphs.ts` as `CellState`. No dependencies were added.

## Final runs
| Command | Result |
|---|---|
| `npm test` | **364 passed** (8 files: 352 existing or updated, plus the new `tests/unit/resolution.test.ts`) |
| `npm run build` | ok (tsc + vite, 39 precache entries) |
| `npm run e2e` | **39 passed, 3 skipped** (the skips are by design), 0 failed. No vite or chromium processes left afterwards. |
| `npx vitest run --config review_app/scratch/vitest.config.mjs` | 4 passed. B0 nullMismatch **0** (was 9). The CSV reason cell is neutralised. Zod on 11 MB of cells: **206 ms** (was 2208 ms). No expectations changed. |
| Screens | `artifacts/screens/{desktop,tablet,mobile}*.png`, plus new `*-unavailable.png`, all inspected. The desktop flex layout regressed once (the grid stopped filling the panel). That was fixed, and the screens were regenerated and checked. |

## Findings
| ID | Status | Evidence / change |
|---|---|---|
| **B1** `.`/`..` snapshot_id | fixed | `scripts/import_bundle.mjs`: `SNAP_RE=^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and no `..`. `assertChild(out,dest)` runs before any rename or rm. The import is staged in OS tmp, then moved by rename (with an EXDEV fallback). The replace path uses a backup and restores it on failure. Tests: 7 bad ids leave `--out` untouched. |
| H3 unlisted files / no content check | fixed | Unlisted files and symlinks → refuse. Zod (`scripts/bundle_schema.mjs`) checks the manifest, `regions.json` and the activity files (up to 1000, sampled above that) before the switch. Tests cover the unlisted file, the bad manifest and the bogus activity file. |
| F4/F5 + low "staging/index" | fixed | `extractZip` cleans up inside itself. Caps: 20k entries, 500 MB expanded (declared and actual), 300 MB zip. `finally` removes every temp dir. `index.json` is written atomically. A test asserts no `/tmp/lumos-*` or `--out/.*` leftovers. Unit tests now clean their own temp dirs. |
| M9 note: keep-existing | fixed | Keeping existing snapshots is now the default; overwrite with `--replace`. |
| **H1/F2/E2E-B1** | fixed | `api.loadActivityYears` (allSettled) returns ok/absent/error per year. `useActivity` exposes per-year status, a retry, and whether the failure looks offline. Calendar shows **Unavailable**: dotted amber outline, ↯ glyph, legend entry, banner with Retry, and an Evidence message with retry. While loading, cells show a skeleton shimmer, never "Missing". e2e 09: uncached AOI offline = `{"unavailable":300}`, honest message true. |
| **H2** | fixed | `manifest.files` decides: a listed file that 404s, returns an HTML fallback or fails validation is an **error**. An unlisted file is **absent**, with no request. Unit test covers 404, HTML, network failure and unlisted. |
| M9 status text | fixed | "Offline — showing areas you've opened before"; online text: "opened areas work offline". Activity is not precached (by choice), so the honest unavailable state is what you see. |
| **H4** | fixed | `parseCellsFile`: Zod on the header, an O(n) width loop, and type checks on 256 sampled rows. Cells and features sit in an LRU of 12 entries. Raw text is no longer cached. Test: a 200 KB file is checked in under 50 ms. |
| M1 | fixed | B0 returns null when the record, the Aqua count or the exported estimate is missing. `parity()` counts `nullMismatch` and fails on it. Harmonize lists the mismatched months. Scratch test: 0 mismatches. |
| M2 | fixed | The popup uses `setDOMContent` and `textContent`. |
| M3 | fixed | `neutralizeFormula` handles strings only. Numbers such as `-1.25` stay numeric (tested). |
| M4 | fixed | New 2012 / VIIRS-present backcast text (tested). Pre-2012 wording is unchanged. |
| M5 | fixed | `MapPanel` gets `monthState`: "No data this month (missing, not zero)", a partial-month note, and "unavailable" with retry. |
| M6 | fixed | `effectiveExtract`: a month that is partial only because of Terra counts as complete for state and headline. The Terra field shows "— (Terra unavailable…)", and the explain text adds a note. |
| M7 | fixed (UI) | `shownAnomalyFlag` hides ▲/▼ in the calendar, the badges and the mobile summary unless the month is observed or estimated. The explain text and Evidence say why it is hidden. The legend tooltip notes it too. |
| M8 | fixed | Validation runs on every change of `[core, aoiId, year]`, against regions and `manifest.aois`. No fetch happens until the selection is valid. |
| F1 | fixed | 15 s AbortController timeout. `FetchError` carries a friendly message. Boot errors use `friendlyError`. Tested. |
| F3 | fixed | `useCore` has an `alive` guard. |
| F6 | fixed | `shots.mjs`: try/finally close, `waitUntil:'load'`, a 3-minute watchdog, and a new unavailable-state shot. |
| F7 | fixed | `store.holdSync()` limits hash/localStorage writes to at most 1 per second during replay and flushes on stop. Unit test. |
| F8 | already resolved | The Playwright config exists and works. |
| E2E-B2 touch | fixed | Mobile cells are 44×44 in a horizontally scrolling grid with a sticky year column, and the view auto-scrolls to the selection. Pill, select and "?" are 44 px. e2e 08 now asserts every size as a hard check. |
| E2E-B3 | fixed | `cellText`: `<1` for estimates between 0 and 1, `≈0` for an estimated exact zero, and `0` (with `is-zero`) only for an observed zero. |
| E2E-B4 | fixed | Enter or Space on a cell opens Evidence on mobile and the drawer on desktop. e2e 03 asserts it. |
| Low: rank | fixed | Shown as "of baseline+1 years". |
| Low: unsupported label | fixed | "Unsupported (no estimate)". |
| Low: b1 transform | fixed | Throws instead of defaulting to log1p (tested). |
| Low: Harmonize raw diff | fixed | Shows `maxRelDiffRaw` and explains the rounding allowance. |
| Low: TopBar aria | fixed | The `aria-label` is on the `<button>`. |
| Low: split ARIA | fixed | The split cell has `role="gridcell"`. |

## Tests changed for intended behaviour
- `import_bundle.test.ts`: re-importing the same snapshot now needs `replace: true`. Regression tests were added.
- `store.test.ts`: added a holdSync test.
- e2e `03`, `08`, `09`: the old soft "finding" checks are now hard assertions of the fixed behaviour.

## Open
- None blocking.
- Possible follow-ups: per-platform extract statuses from Notebook B, which would remove the regex parse in M6, and a Web Worker for cells parsing (optional; not needed at current sizes).
