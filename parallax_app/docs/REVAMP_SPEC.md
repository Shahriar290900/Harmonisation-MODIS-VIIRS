# Parallax Fire — revamp spec (v2 experience)

Owner feedback (12 Nov): charts and graphs look broken, too much jargon, no proper navigation, the map is "just a shape, not the actual world map", wants sections for what the app does / how it works, pages for monitoring and for how the estimates work, live feeds, ideas from gods-eye-view, **no placeholders or simulated content — real data only**.

Verified cause of "broken charts": the workspace is a fixed one-screen dashboard designed for a 900 px tall viewport. On the owner's laptop (1440×900 screen, ~760 px viewport) the compare chart is cut in half, calendar rows overlap the legend, and the map is a 200 px strip.

Follow `docs/UI_DESIGN_BRIEF.md` (tokens, type, motion, icons, a11y) and the repo `CLAUDE.md`. Dark space theme by default; light theme on the toggle must keep working.

## 1. Principles
1. **One job per page.** No fixed-height dashboards. Pages scroll naturally; every chart and map gets a guaranteed size.
2. **Plain language first.** A 12-year-old should follow every heading and label. Technical terms live behind a "Details" disclosure or a glossary tooltip (`<Term>`).
3. **Real data only.** Every number, point, image and status on screen comes from the real snapshot (`public/data/parallax-20261010T190934Z-ce88f489`), a live feed, or is absent with an honest message. No lorem, no mock series, no "coming soon", no fake counters. Illustrations of a concept are allowed only when labelled "illustration".
4. **Honesty rules stay** (CLAUDE.md): missing ≠ zero, estimates labelled and separate, a hotspot is not a confirmed wildfire, per-region results only.
5. **No forecasting claims.** The product does not predict future fires. The "how it works" page explains the *estimate of past VIIRS-scale counts* and its measured error. Never use "prediction", "forecast" or "early warning" for it.

## 2. Navigation and routes (hash routing, deep-linkable)
Persistent app shell: left rail on desktop (icon + label, collapsible), bottom bar on phones (5 items + "More"). Brand "Parallax Fire · by Team Lumos" top-left; theme toggle and help (tour) top-right; footer credit "Created by M Al Shahriar Hameem".

| Route | Nav label | Page job |
|---|---|---|
| `#/` | Home | Story landing (exists): what it does, how it works, pick a place. Keep the 3D intro; cut jargon; end with clear buttons into the pages below. |
| `#/live` | Live | Real globe / world map with today's satellite hotspots, satellite imagery, where the satellites are now. HUD style inspired by gods-eye-view. |
| `#/calendar` | Calendar | Pick a place → year × month burning calendar, selected-month summary in plain words. |
| `#/map` | Map | Real basemap for the selected place and month: 5 km cells, districts (Bangladesh), sensor looks. |
| `#/sensors` | Two satellites | Big chart: MODIS vs VIIRS vs estimate over time for the selected place; the 2012 step explained. |
| `#/method` | How it works | How the estimate is learned and checked, in plain steps, with the real per-region results from `manifest.release_regions` / `metrics.json`; what it cannot tell you. |
| `#/data` | Data & sources | Where every number comes from (sources.json), downloads (CSV, brief), licences, credits, snapshot facts. |

- Selection (place, year, month) is shared across pages and kept in the URL as query-style params after the route: `#/calendar?aoi=BGD&y=2024&m=3`. Legacy links `#aoi=BGD&y=2024&m=3` and `#/app` must still open the Calendar page.
- A compact **place picker** (search + grouped list: country → division/state) sits in the page header of Calendar, Map and Two satellites.
- Each page has an `<h1>`, a one-sentence plain description, and "next step" buttons at the bottom linking to related pages.

## 3. Language (glossary — use the left column in the UI)
| Plain label used in UI | Technical term (only in Details/tooltip) |
|---|---|
| place / area | AOI |
| satellite fire detections (hot spots) | active-fire pixels |
| older satellite (MODIS, 1 km) | Aqua/Terra MODIS C6.1 |
| sharper satellite (VIIRS, 375 m) | S-NPP VIIRS 375 m |
| estimate on the sharper satellite's scale | estimated_viirs_reference_detections, harmonized |
| likely range (8 in 10) | 80% interval |
| estimated past (before 2012) | backcast |
| years used to learn / to choose / to check | train / validation / test split |
| checked on unseen years: holds up | validated_calibration |
| raw comparison only (estimate not good enough here) | observed_comparison |
| no data for this month | missing / unavailable |
| part of the month only | partial |
| unusually high / low for the season | anomaly flag |
| simple ratio / statistical model / tree model / neural net | B0 / B1 / B2 / D1 |

## 4. Maps (the real world, not an outline)
- **Basemap:** real vector basemap with land, water, borders, roads and place labels (keyless, attribution shown), dark and light variants following the theme. Fallback to the existing Natural Earth outline style when tiles cannot load (offline), with a visible "offline basemap" note.
- **Imagery layer (toggle):** NASA GIBS satellite imagery (true colour, today/yesterday; night lights) so the user sees the actual Earth.
- **Globe:** the Live page uses MapLibre's globe projection (atmosphere, smooth fly-to), not a decorative sphere.
- Data layers keep their meaning and legend; sensor looks stay "display style only".

## 5. Live page (monitoring) — real feeds only
Layers, each with a source line, a timestamp and an honest state (loading / none in area / feed unavailable):
1. Hot spots, last 24 h — NASA FIRMS near-real-time (MODIS, VIIRS), worldwide.
2. Satellite imagery — NASA GIBS (daily true colour; geostationary if verified).
3. Satellites now — where Terra, Aqua, S-NPP, NOAA-20, NOAA-21 are, their ground track and when they next pass (orbit elements from a public catalogue, propagated in the browser).
4. Optional, only if verified keyless and licence-clean: reported wildfire events (NASA EONET), US incident perimeters (NIFC/WFIGS), weather context.
5. Cameras: ground cameras only if their terms allow embedding; otherwise the satellite imagery is the "camera" and is labelled as such. Never show a fake or looping video.
HUD: corner frame, UTC clock, layer panel, legend, "detected by" tags on hover, sensor looks (1–4), reduced-motion safe.

## 6. Charts
- Responsive SVG with a fixed aspect and **min-height 280 px (220 px on phones)**; never clipped by a parent; axis labels readable (≥ 11 px); direct labels; legend outside the plot; log/linear switch explained in words; gaps for missing data; keyboard focus + table fallback.
- Calendar: rows never overlap the legend; the grid scrolls inside its own area on small screens; cell numbers readable; hatched = no data.
- Every chart root carries `data-chart="<name>"`; the calendar grid `data-cal-grid`, its legend `data-cal-legend`.

## 7. Contracts between tracks
- Shell (track A) owns: `src/App.tsx`, `src/experience/Router.tsx`, `src/state/store.ts`, `src/shell/**` (new: `AppShell.tsx`, `Nav.tsx`, `PlacePicker.tsx`, `Term.tsx`, `glossary.ts`), `src/pages/**` except `LivePage.tsx`, `src/styles/shell.css` (new), `src/ui/TopBar.tsx`, `src/ui/Tour.tsx`, `src/ui/Evidence.tsx`, `src/ui/ModelPanel.tsx`, `src/ui/Explainer.tsx`, `src/ui/Harmonize.tsx`, landing copy in `src/experience/landing/*.tsx` (text only, not Embers).
  - Pages: `HomePage` (wraps the landing), `CalendarPage`, `MapPage`, `SensorsPage`, `MethodPage`, `DataPage`. Nav element: `<nav data-nav>` with links `a[data-route="live|calendar|map|sensors|method|data|home"]`; each page root `<main data-page="<route>">` with one `<h1>`.
  - Until track B lands, the Live nav item is hidden (no placeholder page).
- Charts (track C) owns: `src/ui/CompareChart.tsx`, `src/ui/Calendar.tsx`, `src/ui/scale.ts`, `src/charts/**` (new helpers), `src/styles/charts.css` (new), chart code inside `src/experience/landing/Story.tsx` (JumpChart, FairScale, CalendarStory SVG only).
- Live (track B) owns: `src/pages/LivePage.tsx`, `src/live/**` (new), `src/ui/MapPanel.tsx`, `src/ui/LiveLayer.tsx`, `src/ui/DistrictLayer.tsx`, `src/ui/SensorLook.tsx`, `src/styles/live.css`, `src/data/live.ts`, `netlify/functions/**`, `apps/web/vite.config.ts`, `package.json` (only to add `satellite.js`).
- Shared read-only for all: `src/data/api.ts`, `schemas.ts`, `types.ts`, `model/**`, `ui/Tip.tsx`, `ui/theme.ts`.
