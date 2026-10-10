# Lumos Fire Calendar (NASA Space Apps 2026, Team Lumos)

This is a harmonized MODIS + VIIRS burning-activity calendar, built as a single PWA that runs on Windows, macOS, iOS and Android browsers.

## Regions
| Region | Areas (AOI ids) | Detailed view (5 km cells, B1 features) |
|---|---|---|
| Bangladesh (default) | `BGD` + 7 divisions `BGD-A` … `BGD-G` | `BGD` |
| Australia | `AUS` + `AUS-NSW` (New South Wales) | `AUS-NSW` |
| United States | `USA` + `USA-CA` (California) | `USA-CA` |

Whole-country `AUS` and `USA` show aggregates only. The region list is read from `regions.json` in the data snapshot, not hard-coded. Details: `CONTRACT.md` §8–9.

## Quick start
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run build && npm run e2e   # Playwright: desktop, tablet and mobile
```
`apps/web/public/data/` currently holds a **SYNTHETIC demo snapshot** (real format, fake numbers). The app shows a DEMO DATA banner while it is loaded.

## Real data
1. On Kaggle, run `notebooks/lumos_A_fetch.ipynb` with internet ON (it requests 117 FIRMS files: Bangladesh, Australia, United States; the 6 files for 2025 do not exist, so expect 111 ok and 6 missing), then save a version.
2. Run `notebooks/lumos_B_train.ipynb` with internet OFF on T4 x2 or RTX PRO 6000 (see `../KAGGLE_HANDOFF.md` for both options). Add Notebook A's output as an input.
3. Download `lumos_app_bundle.zip`, then run `node scripts/import_bundle.mjs lumos_app_bundle.zip`. The script verifies checksums and the schema, then makes the bundle the default snapshot.

## Deploy (free)
Build with `BASE_PATH=/<repo>/ npm run build` and publish `dist/` to GitHub Pages.

**Install as an app:**
- Chrome or Edge (Windows, macOS, Android): use the Install icon or menu.
- Safari on macOS: File → Add to Dock.
- iOS Safari: Share → Add to Home Screen.

## Docs
- `PRD.md`, `CONTRACT.md`, `CLAUDE_CODE_MASTER_PROMPT.md`, `STATUS.md`
- `../KAGGLE_HANDOFF.md` (click-by-click Kaggle guide), `docs/RUNBOOK.md`
- `docs/SOURCE_CHECK.md`
- `review_app/` (code review, watchdog and resolution reports)
- `artifacts/e2e/E2E_REPORT.md`
