# Parallax Fire: developer guide

The web app behind https://parallaxfire.netlify.app. For what it does and why, see the [main README](../README.md). For every other document, see the [documentation index](../docs/README.md).

## Stack
- **App:** React 18, TypeScript and Vite 6, built as an installable PWA. Hash routing (`#/live`, `#/calendar`, `#/map`, `#/sensors`, `#/story`, `#/method`, `#/data`).
- **3D Earth:** three.js 0.170 and GSAP. Satellites are propagated in the browser with satellite.js (SGP4).
- **Maps:** MapLibre GL 5 with an OpenFreeMap basemap, a NASA GIBS imagery layer, and a Natural Earth fallback when offline.
- **Live data:** Netlify Functions (TypeScript), cached at the CDN.
- **Data and model:** two Kaggle notebooks (Python, XGBoost) write a checksummed snapshot bundle that the app reads.

## Quick start
Needs Node 20 or later.
```bash
cd parallax_app
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run build        # type-check and build to parallax_app/dist
```
`npm run e2e` (Playwright) also exists, but its specs target an older layout and are out of date. The checks used for the current app are the goal scripts in `scripts/goals/` (see below and [`STATUS.md`](STATUS.md)).

The live-data endpoints (`/api/*`) are served by Netlify Functions. Under `npm run dev`, Vite serves them from the same files (see `apps/web/vite.config.ts`).

## Folders
| Path | What it holds |
|---|---|
| `apps/web/src/` | The app: `pages/` (one per route), `earth/` (3D Earth), `live/` (live map), `ui/` (calendar, charts, map), `data/` (loading and validation), `shell/` (navigation) |
| `apps/web/public/data/` | Data snapshots. `index.json` names the default (`parallax-20261010T190934Z-ce88f489`, the real Kaggle run). Two synthetic snapshots are kept for tests and carry a DEMO DATA tag. |
| `apps/web/public/` | Also: the manual PDF, Earth textures (`textures/SOURCES.md`), district outlines (`geo-admin2/SOURCES.json`), offline basemap, icons |
| `netlify/functions/` | Live-data endpoints (below) |
| `notebooks/` | Source and tests of the Kaggle notebooks (`*.py` builds the `.ipynb`; `tests/` run them on fixtures). The copies to upload to Kaggle are in [`../kaggle_notebooks/`](../kaggle_notebooks/). |
| `scripts/` | Bundle import, manual, checks, video and GIF builders (below) |
| `tests/` | `unit/` (Vitest) and `e2e/` (Playwright) |
| `docs/` | Specs, sources and the manual source |

## Regions
| Region | Areas (AOI ids) | Detail view (5 km cells) | Result on unseen years |
|---|---|---|---|
| Bangladesh (default) | `BGD` and 7 divisions `BGD-A` … `BGD-G`; 64 districts on the map | `BGD` | estimate holds up |
| United States | `USA` (totals) and `USA-CA` (California) | `USA-CA` | estimate holds up |
| Australia | `AUS` (totals) and `AUS-NSW` (New South Wales) | `AUS-NSW` | raw comparison only |

The region list comes from `regions.json` in the snapshot; nothing is hard-coded. Details: [`CONTRACT.md`](CONTRACT.md).

## Live-data functions
| Endpoint | Source | Caching |
|---|---|---|
| `/api/firms-live?scope=world[&src=modis,noaa20,noaa21,snpp]` | NASA FIRMS near-real-time global CSVs (last 24 h) | CDN cache; a failure is cached too, so NASA is not re-asked by every visitor |
| `/api/sats` | CelesTrak GP orbit elements for the five fire satellites | At most one request to CelesTrak every 2 hours |
| `/api/gibs-times` | NASA GIBS capabilities (latest available imagery day) | CDN cache |

Every source, endpoint and check is listed in [`docs/LIVE_SOURCES.md`](docs/LIVE_SOURCES.md).

## Data: from NASA FIRMS to the app
1. **Notebook A** (Kaggle, internet on) downloads the NASA FIRMS yearly country archives (MODIS C6.1 2001–2025, VIIRS S-NPP 2012–2025) for Bangladesh, the USA and Australia, and verifies them.
2. **Notebook B** (Kaggle GPU, internet off) builds 5 km × month features, trains on 2013–2020, chooses the method on 2021–2022, tests on 2023–2024, and exports `parallax_app_bundle.zip` (checksums plus a JSON schema).
3. `npm run import-bundle -- parallax_app_bundle.zip` checks the checksums and schema, copies the bundle into `apps/web/public/data/<snapshot_id>/`, and makes it the default.

Every Kaggle step with its checks: [`../kaggle_notebooks/STEP_INDEX.md`](../kaggle_notebooks/STEP_INDEX.md).

## Scripts
| Script | Does |
|---|---|
| `scripts/import_bundle.mjs` | Verify and import a snapshot bundle (`npm run import-bundle`) |
| `scripts/rehash_snapshot.mjs` | Recompute a snapshot's checksums after an intended change |
| `scripts/build_admin2.mjs` | Build the district layer from geoBoundaries |
| `scripts/manual/build_manual.mjs` | Build the PDF manual from the real snapshot |
| `scripts/goals/*.mjs` | Goal checks run during development in headless Brave (layout overlap, Earth, story, manual and more) |
| `scripts/video/make_video.mjs` | Build the pitch videos from the live site (frame-stepped capture, narration, subtitles, music) |
| `scripts/readme/make_gifs.mjs` | Record the README GIFs from the live site |

## Deploy
Netlify builds and publishes automatically on every push to `main`, using [`../netlify.toml`](../netlify.toml): base `parallax_app`, command `npm ci && npm run build`, publish `dist`, functions `netlify/functions`. The live site is https://parallaxfire.netlify.app.

**Install as an app:**
- Chrome or Edge on Windows, macOS or Android: use the Install icon or menu.
- Safari on macOS: File → Add to Dock.
- Safari on iOS: Share → Add to Home Screen.

## Rules the code keeps
Missing data is never shown as zero. Estimates are always labelled and drawn apart from observations. A hot spot is not a confirmed wildfire. Results are reported per region only. Synthetic snapshots keep the DEMO DATA tag. See [`../CLAUDE.md`](../CLAUDE.md).

## Licence
Code: MIT ([`../LICENSE`](../LICENSE)). Docs and media: CC BY 4.0 ([`../LICENSE-CONTENT.md`](../LICENSE-CONTENT.md)). Third-party data and libraries: [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
