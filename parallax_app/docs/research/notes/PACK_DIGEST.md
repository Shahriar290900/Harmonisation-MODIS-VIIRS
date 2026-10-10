# PACK_DIGEST: NASA_MODIS_VIIRS_2026.pdf (written by R1-READER, 10 Oct 2026)

Source read in full: `docs/research/source/NASA_MODIS_VIIRS_2026.txt` (17 pages, 15 sections) and `pdf_link_annotations.txt` (70 unique links; the file has 69 newline characters but the last line has none, so there are 70 URLs; the brief said 69; no plain-text URLs exist in the pack body).
Pack is dated "Research snapshot: 3 October 2026" and is a team-prepared pack, not an official NASA text. Everything below is what the PACK says. Nothing here is verified against the live sources yet; the verification queue is in `ledger.json` and in `messages/R2..R5.md`. Page numbers are PDF pages (p#).

Pack sources are cited as "p#/section". Where I add a comparison to our PRD v2.0 / CONTRACT v1.2 / SOURCE_CHECK (9 Oct) I say so.

---

## 1. Pack's thesis and recommended product (p1-3, section 1)

- Task framing: a "sensor-harmonization problem before it is a mapping problem". MODIS ~1 km nominal; VIIRS ~375 m, detects more small hotspots; raw counts create a false jump (p2).
- Flagship: web app with a "2000-to-present Burning Activity Calendar" for an AOI, plus a "Sensor Lab" (raw MODIS vs VIIRS, overlap calibration, uncertainty, validation) (p2). Bangladesh as first demo AOI plus at least one contrasting international AOI.
- "Must-use": FIRMS standard/archive MODIS Terra/Aqua and VIIRS S-NPP/NOAA-20/NOAA-21. "Strong validation/context": MCD64A1, VNP64A1, land-cover stratification, optional GlobFire / Global Fire Atlas (p2).
- Scientific differentiator claimed: "resolution-aware, season-aware and land-cover-aware overlap calibration instead of a single global count multiplier" (p2). UX differentiator: calendar first, then map; every result shows sensor mix, uncertainty, source/version (p2).
- What not to claim: do not call every hotspot a wildfire; do not present a historical anomaly score as an exact future-fire prediction (p2, p8, p14).
- What "harmonize" means (p3): common analytical unit (same AOI/grid and time unit), use the overlap period (from 2012 MODIS and S-NPP overlap) for empirical calibration, preserve sensor provenance (observed vs calibrated vs mixed), expose uncertainty. Judge one-liner: "We turn two incompatible satellite eras into one transparent, uncertainty-aware fire-activity calendar".
- MVP vs stretch table (p2): MVP = precomputed historical standard FIRMS + live/NRT endpoint for recent days; monthly/seasonal cross-sensor calibration in overlap with holdout; AOI selector, map, 26-year calendar, raw-vs-harmonized panel, anomaly view; Bangladesh + one international region. Stretch = weather, land cover, population, burned-area validation; cell-level robust regression/GAM or calibrated gradient boosting; event clustering/replay, export; free-draw global AOI. ML only where it solves calibration/anomaly/classification; narrative assistant only if grounded in computed metrics.
- Final scope (p17): "five things": (1) defensible overlap calibration, (2) 26-year burning calendar, (3) raw-vs-harmonized Sensor Lab, (4) map drilling into calendar cells, (5) provenance/uncertainty panel.

## 2. Data catalog as stated in the pack (p4-6, sections 2-4)

Core NASA FIRMS (p4):

| Dataset | Res | Coverage per pack | Pack's note |
|---|---|---|---|
| MODIS Terra C6.1 | 1 km | 01 Nov 2000-present, standard + NRT | morning overpass |
| MODIS Aqua C6.1 | 1 km | 03 Jul 2002-present | afternoon overpass; "combine or model separately" |
| VIIRS S-NPP | 375 m | 20 Jan 2012-present* | primary overlap sensor |
| VIIRS NOAA-20 | 375 m | archive lists 01 Apr 2018-present | modern redundancy |
| VIIRS NOAA-21 | 375 m | 17 Jan 2024-present, "NRT and archive availability" | newest stream |
| MCD64A1 V6.1 | 500 m monthly | Nov 2000-present, raster/Earth Engine | secondary validation |
| VNP64A1 V2 | 500 m monthly | Jan 2012-present | VIIRS-era BA comparison |
| NASA GIBS fire layers | tiles | WMTS/WMS/MVT | fast visuals, "not a substitute for tabular science data" |

- *Operational note p4: "FIRMS states that delivery of S-NPP satellite data products will cease on 1 Nov 2026 and recommends transition to NOAA-20 and NOAA-21." Advice: make the source registry configurable; do not hard-code S-NPP. Repeated in the risk table p15.
- Metadata inconsistency flagged p4: archive page lists NOAA-20 from 01 Apr 2018, VIIRS field page displays 01 Jan 2020. Advice: use archive/API availability for download windows, store source and version in provenance.
- Fields worth keeping (p4-5): lat/lon, acq_date+acq_time (UTC), satellite, confidence (MODIS 0-100; VIIRS low/nominal/high), frp (MW), scan/track ("actual pixel dimensions vary across scan"), daynight, type ("MODIS: standard product only; VIIRS: standard product/version dependent").
- Data-quality rule p5: prefer FIRMS standard (science-quality) for history; "NRT data are later replaced by standard data, typically after a lag of a few months". NRT only for a "what is happening now" panel.

Supporting layers (p5-6): MCD12Q1 V6.1 (yearly 500 m, 2001-2024), ESA WorldCover 2021 (10 m), MOD11A1 / VNP21A1D LST, EONET v3 (event labels, "not full ground truth"), GPM IMERG, NASA-USDA soil moisture, MERRA-2, NASA POWER daily API, GFED5/5.1, Global Fire Atlas (individual fires 2003-2016), GlobFire v2 (event perimeters 2001-2021), geoBoundaries (ADM0/1/2), WorldPop, ERA5-Land.
- Validation caution p6: MCD64A1 and derivatives (GlobFire, Global Fire Atlas) "are not fully independent truth for active-fire detection. MCD64A1 itself uses MODIS active-fire information." Call them secondary/consistency validation.

Access paths (p6, 4.1):

| Path | Pack statement |
|---|---|
| Archive Download | Historical standard CSV/JSON/SHP; country/year workflows; "Earthdata login/email workflow" |
| Active Fire downloads | last 24h/48h/7d; "Earthdata login for some downloads" |
| Area API | "CSV by sensor, bbox, 1-5 day range and optional date"; free MAP_KEY |
| MAP_KEY | free; "current page states 5000 transactions / 10 minutes" |
| Data Availability API | check SP/NRT date availability by sensor; needs MAP_KEY |
| Fire Data Academy | NASA notebooks/tutorials |
| GIBS | high-rate map visualization via WMTS/WMS/MVT; recommended by FIRMS for large transaction rates; keyless for many services |
| Worldview | visual inspection |

Earth Engine IDs (p6, 4.2): FIRMS (MODIS NRT), `NASA/LANCE/SNPP_VIIRS/C2`, `NASA/LANCE/NOAA20_VIIRS/C2`, `MODIS/061/MCD64A1`, `NASA/VIIRS/002/VNP64A1`. Recommended access strategy p6: historical = download/precompute standard FIRMS once; live demo = Area API for recent hotspots; basemap = GIBS; validation/context = Earth Engine.

## 3. Recommended scientific method (p7-8, section 5)

Pipeline (p7), 12 steps: (1) ingest and freeze provenance (source product, version, satellite, acq UTC, ingestion date on each row); (2) canonical schema, raw fields unchanged; (3) AOI and grid: AOI-day/month for MVP, "better: H3 or a 5 km equal-area-ish working grid"; (4) quality filtering (flag low confidence and non-vegetation/static; do not silently delete; keep counts before/after); (5) dedupe/cluster only if UI shows "fire systems" (DBSCAN/HDBSCAN), keep raw pixel counts; (6) overlap pairs, 2012-present, near-simultaneous overpasses where feasible else day/month units with limitation noted; (7) transparent baseline: robust seasonal scale factors (median or robust regression), preferably stratified by month and land cover; (8) optional GLM/GAM/Huber/negative binomial with MODIS count, MODIS FRP, month, land cover, scan/track/view proxies; gradient boosting only if it improves held-out years without destroying interpretability; (9) at least two harmonized outputs: detection activity and FRP activity, converted to monthly percentile/z-score for display; (10) uncertainty by bootstrapping calibration years or fold-to-fold error; mark pre-2012 as "model-adjusted, not direct VIIRS observations"; (11) validate with holdout years and burned-area/event data, report MAE/RMSE/correlation/peak agreement; (12) precompute compact Parquet/JSON.

Baseline formula (p7): r_m = median[(VIIRS activity + eps)/(MODIS activity + eps)] per month m over overlap years; pre-VIIRS estimate = MODIS x r_m; use CV and show variability. Alternative for sparse cells: regression on log1p counts/FRP. Calendar display = percentile vs same AOI and calendar month ("92nd historical percentile for April"), "avoids implying a universal physical unit".

Naming (p7-8): good = "Harmonized hotspot activity", "VIIRS-equivalent historical activity", "Burning Activity Percentile". Avoid = "wildfire count" and "fire probability / prediction".

Literature implications (p13): resolution bias fundamental; FRP not sensor-invariant (varies with scale, season, ecosystem, view geometry); use matched observations when possible; land cover matters (low-biomass/cropland vs forest); "aggregate before overfitting: stable 5 km/day or AOI/day comparison"; show uncertainty.

## 4. Validation plan (p8, section 6)

Test table: temporal holdout (fit on earlier overlap years, hold out e.g. 2024-2025; lower error than raw MODIS and stable monthly bias); sensor continuity (plot before/after 2012); seasonality (monthly climatology before/after calibration); land-cover slices (forest/cropland/grassland); FRP consistency (matched units, report residuals, do not assume equality); burned-area timing (active-fire peak dates vs MCD64A1/VNP64A1; not independent truth); event-level check (GlobFire / Global Fire Atlas / EONET / imagery); robustness (with/without low-confidence or static-source filters).
Metrics: MAE or median absolute error on held-out overlap units; RMSE only if outliers matter; R-squared or Spearman; monthly peak agreement / seasonal rank correlation; calibration uncertainty (bootstrap, CV, fold spread); coverage fraction (valid days/cells).

## 5. UI plan (p8-9, section 7)

Six main screens + export: AOI Explorer; Burning Calendar (26 years x 12 months heatmap, click a cell); Sensor Lab (Raw/Harmonized toggle, overlap scatter, model, uncertainty); Anomaly View (percentile/z-score vs same-month climatology); Context (land cover/rainfall/LST/population); Method & Provenance; Export (stretch).
Bangladesh presets suggested: Chattogram Hill Tracts, Sundarbans, Sylhet, north-west agricultural burn region; contrast region e.g. Mediterranean, boreal, tropical forest.
Details judges notice: sensor colour/toggle by Terra, Aqua, S-NPP, NOAA-20, NOAA-21; "Standard archive" vs "NRT" badge; calendar legend = percentile or normalized activity, never raw count across eras; click-through from cell to map with raw sensor values; uncertainty badge with tooltip; no-data state different from zero; accessible colours (not red/green alone).

## 6. Architecture and data model (p9-10, section 8)

Stack suggested: Python + Polars/Pandas + GeoPandas/H3 ETL; DuckDB or Postgres/PostGIS; FastAPI; Next.js/React; MapLibre or Leaflet; ECharts/Plotly; GIBS tiles.
Canonical raw columns: sensor, satellite (Terra/Aqua/S-NPP/NOAA20/NOAA21), datetime_utc, lat, lon, frp_mw, confidence_raw, confidence_class, daynight, type_raw, scan_km, track_km, source_version, processing_class (standard/nrt/rt/urt, "do not mix silently").
Derived calendar table: aoi_id/grid_id, date/year/month, modis_count, viirs_count, modis_frp, viirs_frp, cluster_count, harmonized_count, harmonized_frp, activity_percentile, anomaly_z, uncertainty, source_mix, quality_flags.

## 7. Similar projects and resources (p10-12, sections 9-10)

- IGNIS (github.com/Hisernberg/ignis-public, MIT per pack): same-challenge 2026 public submission; 26-year calendar, FIRMS/GIBS, DBSCAN, FRP, anomaly/trend, Bangladesh module. Pack warns (p10): "do not copy its code, wording, UI, datasets, or claimed results".
- MODIS-VIIRS-fires (Meredith Franklin, MIT): R, FIRMS CSVs to UTM, HDBSCAN persistent combustion sources.
- hotspot-disambiguation (LINKS), wildfire dataset pipeline (JasmineW6214), viirs-modis-fire-map, fireMap (MIT reported), FireSight, Call for Code fires-api-nodejs, fire-map (kjaymiller): architecture and UI references only.
- Competitor team pages: Celestial X (ETL, dedup calendar), Ember Almanac (25-year harmonized calendar). Pack: "a plain fire map will not stand out".
- HF datasets: LINKS hotspot-disambiguation (2.23 GB, ~500k stratified sample, EFFIS cross-ref, CC BY 4.0; "Do not treat Europe-trained labels as Bangladesh ground truth"), Indonesian Wildfire Panel 2012-2025 (0.25 deg monthly, Parquet, CC BY 4.0), wildfire-dataset-pipeline.
- Kaggle (Vijayveer Singh): dataset "NASA FIRMS Active Fire Data (MODIS/VIIRS)" (reported 4 files, ~138 MB), TabNet and PCA notebooks. Pack: cite and prefer NASA FIRMS as authoritative.
- Roboflow (3 image datasets): "not substitutes for FIRMS hotspot records"; only for optional CV module after the calendar is done.

## 8. Papers to read (p12-13, section 11)

Giglio, Schroeder & Justice 2016 (C6 MODIS active fire); Schroeder et al. 2014 (VIIRS 375 m); Li et al. 2018 (FRP VIIRS vs MODIS: varies with spatial scale, season/ecosystem, MODIS view angle); "Xu et al. 2020" (MODIS vs VIIRS in NE Asia forests and low-biomass lands; major detection differences, duplicate removal / near-simultaneous comparisons); Giglio et al. 2018 (C6 MODIS burned area); Andela et al. 2019 (Global Fire Atlas); Artes et al. 2019 (GlobFire); Urbanelli et al. 2023 (hotspot-vs-wildfire ML in Europe); Artes et al./2024 (active-fire dating accuracy for Landsat BA maps; agreement varies by biome, distance, fire size). The pack gives no numbers from these papers (no coefficients). The only link-to-paper mapping we can infer: mdpi 12/18/2870 = the NE Asia paper; PMC6110110 probably Giglio 2016 (UNVERIFIED); doi 10.1029/2017JD027823 = Li 2018; doi 10.1016/j.rse.2013.12.008 = Schroeder 2014; doi 10.1016/j.rse.2018.08.005 = Giglio 2018 BA; essd 11/529/2019 = Andela 2019; doi 10.1038/s41597-019-0312-2 = GlobFire; arxiv 2308.02508 = Urbanelli 2023; doi 10.1016/j.isprsjprs.2024.02.014 = Artes 2024; ORNL DAAC 1642 = Global Fire Atlas dataset (all mappings from memory except mdpi, UNVERIFIED until R3 fetches).

## 9. Timing, roles, submission (p1-2, 12-14)

- Portal screenshot (Bangladesh): 240-second video + publicly accessible source link; "displayed submission end of 07 Oct 2026, 11:59 PM"; "Re-check the portal timezone and status before final submission" (p2, p12-14).
- Four-day plan Oct 3-7 (p12): day 1 data/MAP_KEY/Earthdata/baseline; day 2 aggregation + holdout validation; day 3 stratification only if baseline stable; day 4 freeze; Oct 7 final video "3:45-3:55".
- Roles (p13-14): science lead, data/backend lead, frontend/GIS lead, UX/QA, story/video/docs.
- 240 s video script (p14): 0:00-0:25 problem; 0:25-1:05 Bangladesh raw overlap discontinuity; 1:05-1:50 harmonization on; 1:50-2:35 calendar click; 2:35-3:10 anomaly + context/validation; 3:10-3:35 metrics/method panel; 3:35-4:00 impact.
- Hygiene checklist (p14): public repo opens in incognito; no MAP_KEY / Earthdata / HF tokens committed; README lists every dataset + licence/attribution, "NASA is not implied to endorse the app"; data build date, product versions, standard/NRT visible; video <= 240 s and shows only features that exist; fallback/no-data states tested.

## 10. Risk table in the pack (p14-15, section 14)

Hotspot != wildfire; no detection != no fire (represent missing separately from zero); sensor resolution mismatch; FRP mismatch; NRT vs standard; Type-field version issue; S-NPP transition; validation dependence (MCD64A1 not independent); competition overlap.
- Type-field issue, verbatim (p15): "FIRMS reports a historical Collection-2 Vxx14IMGML Type-field bug in product versions 1/2, corrected and reprocessed to v3 in May 2025. Use current processed versions; keep source version in provenance; avoid mixing old cached files."

---

## CONFLICTS and GAPS vs our PRD v2.0 / CONTRACT v1.2 / SOURCE_CHECK (ranked by consequence)

Legend: CONFLICT = the pack and our docs state different facts or different instructions. GAP = pack recommends something our plan lacks. CHECK = needs fetch to settle. All pack statements are the pack's, not verified.

1. CONFLICT/CHECK, deadline and calendar (pack p2, p12, p14 vs PRD header/section 9). Pack: submission ends 07 Oct 2026 11:59 PM (portal screenshot), four-day plan Oct 3-7. PRD header says "9 Oct 2026"; PRD section 9 says "Official project window starts 14 Nov 2026. Confirm organizer rules on reusing preparation work". Today is 10 Oct 2026. If the pack's deadline is right the deadline has already passed; if PRD is right the window opens 14 Nov. Settle from spaceappsbd.com and the official challenge page (ledger S068 and S057, group A). Also the pack's own deliverable rules (240 s video, public source link) are missing from PRD acceptance criteria.
2. CONFLICT/CHECK, S-NPP cessation (pack p4, p15). Pack: S-NPP delivery ceases 1 Nov 2026, switch to NOAA-20/21. Our whole design makes S-NPP the reference platform (CONTRACT section 3, years VIIRS 2012-2025, splits 2013-2024). Historical S-NPP archive files are probably unaffected (UNVERIFIED), but the 2026 file will end by about 1 Nov 2026, the NRT layer (PRD P2) cannot use S-NPP after that, and "future continuity" of the reference sensor ends. Needs R2 to read the exact FIRMS wording (what stops: NRT only? standard processing? archive?).
3. CONFLICT/CHECK, NOAA-21 and NOAA-20 availability (pack p4). Pack: NOAA-21 from 17 Jan 2024 "NRT and archive availability"; NOAA-20 archive from 01 Apr 2018 vs field page 01 Jan 2020. SOURCE_CHECK: "No NOAA21_SP" in Area API sources, archive start dates same as pack, `viirs-noaa20` folder name unverified, 2025 NOAA-20 files "not yet published". CONTRACT maps satellite code `1` to NOAA-20; pack does not give raw codes for NOAA-20/21 (UNVERIFIED which strings appear in CSVs, e.g. "N20", "N21").
4. CONFLICT, Aqua start date. Pack p4: Aqua from 03 Jul 2002. PRD section 5 / SOURCE_CHECK: Aqua 2002-07-04 (CONTRACT: Aqua full years 2003+). One-day discrepancy; verify on FIRMS download page. Not decision relevant (2002 is `unsupported`) but should be consistent in provenance.
5. CONFLICT/CHECK, access route. Pack p6: Archive Download is an "Earthdata login/email workflow"; Active Fire downloads need Earthdata login for some; pack day-1 plan: "Get MAP_KEY + Earthdata access". Ours: keyless yearly country CSV URLs `/data/country/{modis|viirs-snpp}/{YEAR}/...`, direct-tested for Bangladesh 2020/2024 and HEAD for USA 2020 (SOURCE_CHECK #5). The pack never mentions this path. R2 must re-verify no-login access still works for the 3 countries (esp. `Australia`, `United_States` for MODIS and VIIRS) and for 2025/2026 files, and whether the page documents it as supported.
6. CONFLICT/CHECK, Area API window "1-5" vs the "1-10" in the brief. The pack (p6) and SOURCE_CHECK (#1, direct) both say 1-5 days. The "1-10" figure appears nowhere in the pack or our docs; if the live page now says 10 it would be a new change. R2 should quote the live page. Our CONTRACT uses `{1..5}`.
7. CONFLICT, calendar window and training window. Pack p2: "2000-to-present", 26-year calendar, "From 2012 onward MODIS and S-NPP overlap", holdout "e.g. hold out 2024-2025" (p8). Ours: calendar 2001-2025 (MODIS files 2001-2025), Aqua protocol backcast 2003-2012 (2001-2002 `unsupported`), train 2013-2020, val 2021-2022, test 2023-2024, 2012 excluded as partial, 2025 not in any split. Differences: 2000 (Terra from 1 Nov 2000) not used; Terra not pooled (pack says combine or model separately, so allowed); 2025 not used for test (pack example uses 2024-2025). Our choices are defensible but must be explained; the app should not claim "26-year" or "2000" (ours is 25 calendar years, 2001-2025, 23 of them calibrated: 2003-2025).
8. CONFLICT/risk, `type` field. Pack p5: `type` for VIIRS is "standard product/version dependent", MODIS "standard product only" (i.e. may be absent in NRT rows); p15: VIIRS Type-field bug in versions 1/2, reprocessed to v3 in May 2025. CONTRACT section 3 makes `type == 0` the main measure and counts non-zero as static. Risks: rows with missing/blank type, old cached files with the bug (the pack warns "avoid mixing old cached files"), 2025 files mixing versions. Needs a rule for null `type` (CONTRACT says nothing) and a check of `version` column per file. R2 to confirm what the bug was and which VIIRS versions/years it affects.
9. CONFLICT/CHECK, author of the NE Asia paper. Pack p12 says "Xu et al. (2020)" for the MDPI Remote Sensing paper "Fire Detection and Fire Radiative Power in Forests and Low-Biomass Lands in Northeast Asia: MODIS versus VIIRS" (link mdpi 12/18/2870). PRD and SOURCE_CHECK cite "Fu et al. 2020, Remote Sensing 12:2870" (SOURCE_CHECK #10 says direct). Same article, one author name wrong. R3 to read the page and fix the citation we use (PRD uses "MODIS missed 65-83% of VIIRS fire pixels" and "monthly FRP slope 1.22-1.32").
10. GAP, no burned-area / event / land-cover validation in our plan. Pack p6-8 lists MCD64A1/VNP64A1 timing check, GlobFire/Global Fire Atlas/EONET event check, land-cover slices (forest/crop/grass), robustness with/without low-confidence and static filters. Ours: validation only on FIRMS-to-FIRMS holdout (time + 100 km blocks); no land-cover feature; no confidence-filter sensitivity. Pack also says these validators are "not independent", so they can only be secondary consistency checks, and must be labelled so. Candidate cheap additions for R5 to rank: seasonal-peak agreement with MCD64A1 (needs a download, probably out of scope), confidence/static robustness (cheap, uses data we already have).
11. GAP, FRP output. Pack p8, p10: keep two outputs (detection activity and FRP activity). Ours: count only (FRP only as feature). Fu et al. FRP slopes are in PRD but not used. Stretch.
12. GAP, percentile display. Pack p7: show activity as percentile vs AOI/calendar-month climatology. Ours: anomaly rank / zscore_log / flag in the evidence drawer. Calendar legend semantics differ (pack: percentile or normalized, never raw count across eras).
13. DIFFERENCE, calibration baseline form. Pack baseline = median of per-month ratios (VIIRS+eps)/(MODIS+eps) over overlap years, stratified by month and land cover. Ours B0_month_ratio = per country x month ratio of sums over train (Sum viirs / Sum aqua), plus B1 Poisson GLM. Not contradictory, but the pack's median-of-ratios baseline with epsilon is a distinct, robust variant (B0 median ratio) that is not in our model table. Land-cover stratification missing.
14. DIFFERENCE, spatial and temporal support. Pack suggests AOI-day/month or H3/5 km grid and matching near-simultaneous overpasses. Ours: exact 5 km Lambert CEA x UTC month with no overpass matching. Note for caveats: Aqua and S-NPP both ~13:30 local overpass is from memory (UNVERIFIED); the pack never states overpass times except Terra "morning", Aqua "afternoon".
15. DIFFERENCE, S-NPP-only reference vs "VIIRS S-NPP/NOAA-20/NOAA-21" in the pack. Our protocol uses only S-NPP; pack p4 anticipates S-NPP ending, which affects only 2026+ for us.
16. DIFFERENCE, NRT vs standard lag. Pack p5: "typically after a lag of a few months". SOURCE_CHECK #1: "SP replaces NRT after ~5 months" (Archive page). The CONTRACT treats `version` containing NRT as NRT; our 2025 yearly files may be partly NRT-versioned; the lag matters for what fraction of 2025 is standard. R2 to check wording.
17. GAP, submission hygiene items. Pack p14 requires: README listing every dataset and licence/attribution, statement that NASA does not endorse, data build date/product versions visible, public repo in incognito, no keys. Ours: attributions and "no key" handling exist in A; licence/endorsement text not in the PRD acceptance list.
18. NOT a conflict but important, scope inflation in the pack: global free-draw AOI, Next.js/FastAPI/DuckDB stack, H3, GIBS tiles, EE-based NRT. Ours is a static PWA with 3 regions (BGD, AUS-NSW, USA-CA). The pack explicitly marks free-draw global AOI and extra context layers as stretch. Region set (Bangladesh, Australia, USA) matches "Bangladesh first + contrasting international AOI". The pack's suggested BGD presets (Chattogram Hill Tracts, Sundarbans, Sylhet, NW) vs our 7 Natural Earth divisions.
19. Things in our docs that the pack does NOT support or mention (cannot be cited to the pack): Zheng et al. 2026 and Giglio et al. 2025 (SOURCE_CHECK direct from MDPI/UMD, still ours), the Kaggle two-notebook design, country-CSV route, 65-83% omission figure (attributed to Fu in our docs).
20. Pack-internal inconsistency to watch: pack says "26-year" calendar but also quotes a competitor "25-year"; period 2000-2026 partial-year handling is not specified.

## Where the pack is silent (facts the build needs, now queued as verification)

Exact current FIRMS Area API sources list and the real day-range cap; exact wording of S-NPP cessation; MODIS Terra/Aqua end-of-mission or orbit-drift notices (UNVERIFIED from memory that both are being phased out; the pack says nothing); NOAA-20/21 CSV `satellite` codes; whether `viirs-noaa20` country-CSV folders exist; confidence semantics for filtering; licences of the datasets (NASA open data policy for FIRMS, CC BY for WorldCover etc.); numbers from the papers.

## Link inventory

70 unique links, see `ledger.json` (ids S001..S070 in annotation order). Counts: group A (NASA/FIRMS/space-apps) 26, group B (science/data portals incl. Earth Engine catalog pages on developers.google.com) 26, group C (GitHub/Kaggle/HF/Roboflow) 18. Priority-1 rows: A 9, B 7, C 0.
