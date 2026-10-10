# LUMOS FIRE CALENDAR
## Product requirements and execution plan

Prepared for M. Al Shahriar Hameem | Team Lumos | 9 October 2026

Version 1.0 - preparation and prototype blueprint. This document contains proposed methods and acceptance targets, not trained results. No application has been built or deployed in this research task.

**Product promise:** Choose a place. Understand its burning seasons. See whether an apparent change reflects burning activity, satellite differences, or incomplete observations.

**Confirmed decisions:** Local planners are the primary audience. Global browsing is desired, with Bangladesh and an international comparison area for detailed analysis. Aim for a useful prototype today, with a 48-hour fallback. Kaggle internet is disabled; compute is user-reported RTX PRO 6000 Blackwell with about 95 GiB VRAM and 175 GiB RAM. Hosting and model services must stay free. Claude Code will implement the application after this planning handoff.

## 1. The challenge in easy English

MODIS and VIIRS are heat-sensing instruments on satellites. They flag pixels containing unusually hot activity. MODIS active-fire pixels are nominally about 1 km across; VIIRS I-band detections are about 375 m. These are pixel sizes, not the smallest possible fire size or precise incident boundaries. VIIRS can detect more small features. [R2, R3]

Imagine photographing the same field with two cameras: the older camera shows a few bright patches, while a sharper camera separates them into more patches. An increase in the number of patches does not automatically mean more fires started. The viewing time, clouds, sensitivity and number of satellite passes also matter.

**Harmonization means putting the observations on a clearly defined, comparable basis.** There are three levels:

| Level | What we do | What we may honestly claim |
|---|---|---|
| Common format | Align fields, coordinates, times, units and provenance | The records can be processed together |
| Comparable summaries | Keep platform protocols fixed and use common areas/time windows | Users can compare specified observed activity measures |
| Statistical calibration | Learn a relationship during overlap; test on unseen periods/places | A reference-scale estimate, within its demonstrated support |

Harmonization cannot recover the exact small fires that an older instrument never observed. It cannot make clouds disappear. A hotspot is not necessarily one wildfire: it may be part of a larger fire, repeated observation of a fire, agricultural burning or a non-vegetation heat source. [R2, R3]

The official 2026 challenge asks for a web application with a **burning activity calendar for a selected area**, supporting interpretation of historical patterns and unusual periods. A live map alone misses the main objective. [R1]

**Illustrative example, not data:** MODIS reports 10 detected pixels and VIIRS reports 30 in an area. The app first explains the difference, then offers a validated adjustment if available. It never announces that fires tripled just from these counts.

## 2. Product concept and scope

Working name: **Lumos Fire Calendar**. This extends the team name shown in the reference; naming availability has not been checked.

Primary user: a planner or environmental analyst deciding when to increase monitoring, which periods deserve investigation, and how much confidence to place in a historical comparison. Secondary users: researchers, educators and challenge judges.

Core questions:

- When has satellite-observed burning usually been highest in this area?
- Is the selected month unusual compared with the same season in other supported years?
- How different are the MODIS and VIIRS records, and what adjustment was applied?
- Are there enough observations and validation evidence to interpret this result?
- Can I export the data and method behind the chart?

| Priority | Requirement | Release decision |
|---|---|---|
| P0 | Global map navigation, AOI selection and visible availability | Always required |
| P0 | Year-by-month calendar linked to map and time series | Always required |
| P0 | Separate raw MODIS, raw reference VIIRS and estimated series | Estimate enabled only after validation |
| P0 | Bangladesh and one international case with genuine sourced records | Required for a scientific demo; fixture-only build is a UI prototype |
| P0 | Sources, dates, units, coverage state, model status and CSV export | Always required |
| P0 | Responsive browser experience and cached selected-area snapshot | Always required |
| P1 | Model comparison, uncertainty and sensitivity views | Required when promoting a model |
| P1 | Precomputed plain-English explanation; optional Bangla interface | English first; translations reviewed before release |
| P2 | Free-text LLM assistant, DL, QML, QLLM, recent monitoring | Independent follow-on experiments |

Out of the first release: operational alerts, evacuation advice, verified wildfire counts, predicted fire spread, emissions accounting, automatic cause attribution and four separate native applications. These require different evidence or infrastructure.

**Global scope has three distinct meanings:** the map can navigate worldwide; actual downloaded observations cover stated areas/dates; calibration applies only to evaluated regions and input ranges. The interface must show all three separately. Global accessibility is feasible today; global scientific validation is a later milestone.

## 3. Reference review and corrections

The team reviewed every page of both PDFs (28 + 17 pages) and all five images. Both PDFs were text-read and visually inspected. All 70 unique URLs in the research PDF were attempted, alongside the guide's five unique embedded destinations and printed source URL. Images' visible source domains were also checked. The full URL ledger is included in the handoff bundle.

Some Space Apps pages returned 502; some NASA Earthdata pages returned 403; publisher/video endpoints included throttling or unavailable content. Official indexed text and accessible primary alternatives supported specific claims. A retrieved landing page is not proof of a successful dataset download. The linked YouTube video was identified but its transcript was not inspected. This is a complete review of the supplied files and an explicit access audit, not an assertion that every blocked web page or all recursively linked material was read.

| Reference | What it contributes |
|---|---|
| NASA Space Apps Challenge-1.pdf | Team Formation Guide, registration/team workflow, event and project-start rules; not a scientific challenge paper |
| NASA_MODIS_VIIRS_2026.pdf | Dataset/research starting pack, 17 pages, 136 link annotations and 70 unique URLs |
| IMG-20260927-WA0004.jpg | Four-minute local pitch guide, also mentioning a short nominee video |
| IMG-20261003-WA0003.jpg | Thirty-second pitch structure and timing guide |
| Screenshot_20261003_030822.jpg | Submission portal requirements and October deadline screenshot |
| Screenshot_20261003_030608.jpg | Registered team context |
| Screenshot_20261003_035720.jpg | Lumos/Dhaka and challenge summary |

Corrections that affect implementation:

- Current FIRMS Area API documentation says **1-5 days per request**, with **5,000 transactions per 10-minute interval**; cost can exceed one transaction per request. Do not hard-code the older 1-10-day assumption. [R4]
- The current Area API lists NOAA-21 NRT; it does not list a NOAA-21 standard-processing endpoint. Discover sources, never invent endpoint names. [R4]
- Historical standard products and recent NRT products need separate identities and replacement rules. Do not merge overlapping rows indiscriminately. [R4, R5]
- The pack's 2020 Northeast Asia comparison is **Fu et al.**, not Xu et al. Li et al. 2018 used **750 m VIIRS**; its fitted coefficients cannot simply be applied to 375 m products. [R7, R8]
- NASA notices/catalog descriptions disagree on November 1 versus November 2, 2026 for an S-NPP processing change. NOAA-20 archive and attribute-page start dates also differ. Resolve through current availability and product notices before acquisition; do not encode these uncertain dates as truth.

**Schedule:** The screenshot shows 7 October 2026, whereas current official Dhaka indexed information gives November dates. The supplied guide restricts project work to the event window beginning November 14, 09:00 local. You selected preparation/prototype planning. Keep this work labelled preparatory; confirm organizer rules on reuse before entering a prebuilt prototype. This does not block the present PRD or learning plan. No organizer has been contacted. [R1, R15]

## 4. Experience and visual design

Design direction: a precise, calm map workspace with strong contrast, generous chart labels and purposeful motion. Deep navy surfaces, warm amber for observed burning, cyan for MODIS, violet for VIIRS and teal for reference-scale estimates. Also use line styles, symbols and direct labels so color is never the only distinction. Avoid decorative fire particles, giant gauges and unsupported accuracy scores.

Desktop composition: a compact top bar (area, period, data status); map on the left; calendar and historical comparison on the right; a bottom evidence drawer for the selected month. Mobile composition: area controls, then Calendar / Map / Evidence tabs with a touch-accessible bottom sheet. Retain the same selection between tabs. Chart legends stay outside plotting areas; export SVG and PNG without star markers.

User journey:

1. Open the app to a world view with supported regions highlighted. The app says exactly which snapshot is loaded.
2. Select Bangladesh, a subdivision, or the comparison area. Drawing a polygon requires a declared boundary method: snap to whole cells, label area-weighted cell intersections approximate, or recompute from point data for exact point inclusion.
3. Inspect a calendar with years as rows and months as columns. A cell shows observed activity or a labelled estimate, never an unlabeled mixture.
4. Select a month. The map and time series update together; the evidence drawer shows sensor observations, coverage and provenance.
5. Choose Compare sensors. See raw MODIS and reference VIIRS, then the calibrated estimate and interval where available.
6. Read Why this changed. The explanation uses computed statistics and says when sensor changes or missing coverage limit interpretation.
7. Download a brief and CSV carrying the selected area, date range, units, method, sources and model version.

| Display state | Required behavior |
|---|---|
| Observed | Show source platform/product and ingestion completeness |
| Estimated | Show reference scale, model ID, interval and support status |
| No recorded detections | Count may be zero in a complete point extract; state that coverage can remain unknown |
| Missing file / unavailable period | Null value and a patterned/empty calendar cell, never zero |
| Coverage limited / unknown | Visible indicator next to the interpretation |
| Outside calibrated support | Raw data only; adjustment disabled with a specific reason |
| Demonstration fixture | Persistent DEMO label; excluded from scientific metrics and exports by default |
| Offline snapshot | Retain cached charts and provenance; indicate snapshot age |

Signature demonstration: replay an area through time, show the two sensors' different records, then reveal the transparent calibrated comparison. Do not force the adjusted curve to become smooth; real changes must remain visible. All numerical values in the demonstration must come from an included dataset or be explicitly marked illustrative.

## 5. Data plan and acquisition

Use the smallest data package that can support the claim. Initial historical window: **2013-2024**, subject to complete standard-product availability. Extend earlier only after establishing a source-platform protocol that also exists in the earlier period. Start with Bangladesh and a bounded New South Wales, Australia comparison; this is a proposed case, not a claim that its data has been downloaded. Confirm data sufficiency before freezing the comparison boundary.

| Data | Role | First release | Access/caveat |
|---|---|---|---|
| MODIS standard active-fire, Terra/Aqua kept separate | Long history and source-side predictor | Required | FIRMS archive; preserve collection and platform [R5] |
| S-NPP VIIRS 375 m standard active-fire | Fixed reference during overlap | Required | FIRMS archive; never sum all VIIRS platforms as one stable target |
| NOAA-20/21 VIIRS | Additional observed layers and later transfer audit | Later | Availability differs by product; NOAA21_SP must not be invented [R4] |
| Valid-observation / fire masks | Separate observed non-detection from cloud/gaps | Required for coverage-adjusted incidence | Level-2/3 products and QA; a swath outline alone is insufficient [R3] |
| Historical land cover | Explain differences in vegetation/cropland | Optional today | Use year-appropriate product, not current land cover for all years |
| MODIS MCD64A1 / VIIRS VNP64A1 burned area | Corroborate seasonal patterns | Later | Separate target; MODIS burned area is not independent MODIS validation |
| Boundaries / Natural Earth | AOI geometry and light global basemap | Required | Public-domain world map; use more detailed licensed boundaries for local analysis [R13] |
| Weather, terrain, population | Context or future separate forecasting | Later | Each needs its own resolution, time alignment, license and purpose |
| Hugging Face / Roboflow fire datasets | Optional adjacent-task experiments | Not core | Camera imagery or incident labels do not automatically label satellite harmonization |

Acquisition is a connected-machine step, separate from offline Kaggle. Prefer bounded archive requests for long histories instead of millions of short API calls. Check actual data availability before each batch. A FIRMS key or Earthdata account may be required; credentials belong in environment variables and must not enter public notebooks, URLs in logs or browser bundles.

Downloader requirements: request manifest, cache by source/version/AOI/date, bounded concurrency, timeouts, resumable chunks, checksums, retry log and schema validation. Respect Retry-After for 429 responses. Apply exponential backoff with jitter for transient failures and stop on authentication/permission errors. Never rotate identities or keys to bypass quotas. API rate allowance is not an invitation to run at its ceiling. [R4]

Priority sequence: (1) a tiny authentic sample to validate schema; (2) two regional archive subsets; (3) calendar aggregates; (4) supported calibration; (5) broader global observed summaries. If archive preparation is delayed, ship a clearly labelled UI prototype and continue acquisition; do not substitute invented global data.

Dataset volume, archive completion time and notebook disk quota remain unmeasured. The GPU cannot remove these acquisition bottlenecks. Stop expanding acquisition once the first credible story is supported.

## 6. Scientific method and data contracts

Freeze an initial target: **monthly number of retained detected pixels from one reference VIIRS platform in a fixed analysis area**. Call a predicted value `estimated_viirs_reference_detections`. This is a reference-scale observed-activity estimate, not a count of real fires or a cloud-corrected incidence rate.

Use Aqua as the initial MODIS source protocol and S-NPP as the initial reference; keep Terra separate. Fix day/night and quality-filter policies and retain both raw and filtered counts. If multiple source protocols are later combined, validate their transfer separately. Data from a new satellite cannot silently increase sampling in a historical trend.

Unit of modelling: a fixed equal-area analysis cell of approximately 5 km by 5 km per UTC calendar month, then aggregate to AOIs. Grid size is a design starting point; test 1/5/10 km sensitivity if data permits. Do not fit complex models on only two country-level time series and pretend that correlated records are independent experiments.

Ingestion steps: validate coordinates and times; retain original row and file identity; reject/quarantine invalid rows; parse times in UTC; keep original confidence categories; deduplicate exact repeat ingestion; spatially assign cell IDs; aggregate by platform/product/month; record extract completeness. Do not remove genuine repeat overpasses merely because their points are close.

**Zero semantics:** A complete detection-file extract can support 'zero recorded detections' for that source/area/month. It cannot establish cloud-free observation or 'no fires'. If the extract is incomplete, the count is null. Valid coverage fractions require appropriate masks/QA; otherwise they remain null with `coverage_status=unknown`.

| Entity | Minimum fields |
|---|---|
| Source manifest | ID, URL/DOI, product, collection, processing stream, platform, area, dates, retrieval time, bytes, SHA-256, license/attribution, completeness |
| Raw detection | Stable ingestion key, manifest ID, latitude/longitude, UTC time, platform/product, original confidence, FRP MW, scan/track, day_night, sensor-specific brightness, original fields |
| Monthly activity | AOI/cell ID, exclusive period bounds, raw source/reference counts, extract status, coverage status, estimate/interval, model ID, value status, provenance IDs |
| Model card | Target/protocol, features with availability/provenance, excluded features, split hashes, geography/years, metrics and subgroup counts, interval method, limitations, runtime and artifacts |
| App manifest | Schema version, snapshot ID, checksums, geographic/data/model availability, build time, source catalog and aggregate paths |

Store raw data immutably and derived tables as partitioned Parquet. Serve compact JSON by area/year to the first app. Aggregate uncertainty through block resampling or a joint error model; do not simply sum cell-level interval endpoints and call the result a calibrated AOI interval.

Historical backcasts may use only features available in the historical period. Exclude VIIRS observations from predictors when predicting pre-VIIRS reference-scale activity. Show an extrapolation flag or no estimate outside training support. Keep genuine observed VIIRS and synthetic reference-scale predictions as separate fields and chart styles.

Anomaly definition: compare a month with the same month in a frozen historical baseline on the same metric/platform. Require sufficient baseline years and comparable coverage status. For the prototype, at least five baseline years is a proposed minimum, not a statistical guarantee. Show baseline sample size; use empirical ranks as exploratory summaries and avoid exaggerated percentile precision. Missing or inconsistent support disables the anomaly claim. This describes retrospective unusual activity; it is not a validated advance warning or forecast.

## 7. Models, evaluation and GPU use

| Family | Concrete task | Today | Promotion requirement |
|---|---|---|---|
| B0: raw identity / climatology | Establish reference error and seasonality | Required | Always retain for comparison |
| B1: regularized count or log-scale calibration | Map MODIS summaries to fixed VIIRS observed-activity target | First candidate | Reliable blocked validation and clear interpretation |
| B2: gradient-boosted trees | Learn nonlinear source/context relationships | If time/data permit | Meaningful improvement over B1 on fixed holdouts |
| D1: small MLP / temporal model | Compare learned nonlinear/time representations | Later | Same target/splits and sufficient independent examples |
| LLM explanation | Turn computed evidence into plain language | Templates first | Every number traceable; abstain on missing evidence |
| Simulated QML | Small kernel/circuit benchmark on the same task | Later | Fair subset and classical comparison; measured benefit |
| QLLM | LLM-assisted choice of small simulated quantum configurations | Later | Same search budget; no access to final test labels |

For this project, QLLM is explicitly defined as **LLM-assisted QML experimentation**. It is not a quantum-powered LLM. The name must not imply quantum advantage. A numerical LLM predictor may be benchmarked separately, but is not an assumed superior model.

Predeclare splits before training. Proposed calendar split: 2013-2020 training, 2021-2022 validation and 2023-2024 final temporal holdout, adjusted only for verified availability before inspecting results. Add held-out spatial blocks within regions, with buffered neighbors; evaluate transfer to the other region separately. Group nearby fire activity spanning cells/month boundaries where possible. Fit imputation, scaling, feature selection and hyperparameters without test leakage. Random hotspot-row splits are unacceptable.

Report MAE, RMSE, signed bias, sample counts and calendar-peak agreement; stratify by region, season, land cover and activity level. Report uncertainty interval coverage and width when intervals are shown. Do not use R-squared or a single 'accuracy' percentage as the whole result. For sparse counts avoid MAPE. Evaluate active and low-activity subsets so a zero-heavy score cannot dominate.

Proposed gate: B2 should improve validation MAE by at least 10% over B1 without a greater than 10% degradation in well-supported major subgroups. Select the model and all thresholds using training/validation only. Freeze them, then open the final temporal/geographic test once for an independent audit. Do not tune again on that test. Fix support definitions before evaluation; intervals must have measured coverage. If evidence is inconclusive, retain B1 or the observed comparison. This gate is a product decision, not a reported scientific result.

A failed final audit triggers an honest exploratory/no-calibration release or a new preregistered study with a new test set, not retuning on the same test.

A calibrated match to VIIRS establishes agreement with that reference, not perfect detection of all fires. Use independent higher-resolution interpretation where available for a separate audit. Burned-area products can corroborate timing but may share inputs with the calibration data. Never erase a true event merely to make a sensor-transition chart smoother. [R7, R8]

Use the large GPU for controlled tree/DL experiments, broader regional validation and uncertainty resampling. CUDA-core count alone does not establish throughput. Run optional models sequentially in separate processes, checkpoint outputs and reclaim memory. Limit optional QML initially to 6-10 qubits and a small stated subset, comparing classical methods on the identical subset as well as the full data. Simulation uses classical compute and does not demonstrate quantum speedup. Published QML benchmarking gives strong reason to keep classical baselines. [R9]

## 8. Offline Kaggle execution

The notebook must perform **zero required network calls**. Prepare all inputs on a connected machine, upload them as Kaggle Datasets, then attach them before execution. Internet-disabled execution is a design constraint, not a recoverable download error.

Offline bundle layout:

- `data/raw/` - bounded NASA source files with original names and manifests.
- `data/context/` - boundaries and only the historical auxiliary data actually used.
- `wheelhouse/` - missing wheels and dependencies matched to the actual Kaggle Python/Linux/CUDA runtime.
- `manifests/` - checksums, schema, source catalog, license records, split/config definitions.
- `weights/` - optional complete model/tokenizer/config assets; omit for first release.
- `smoke_test/` - small real subset, expected schema and deterministic checks.

Notebook stages: environment probe; verify bundle; ingest/audit; construct aggregates; freeze split; B0/B1; optional B2; evaluate; export; produce completion manifest. Each stage emits visible progress, elapsed time, row counts and output paths. Runs use new IDs; never clear successful artifacts or delete attached datasets.

Probe actual GPU name, available memory, Python version, drivers, disk and installed packages. Test a small forward/backward GPU operation and a small tree fit before long jobs. PyTorch and PennyLane GPU compatibility are separate checks. Use the working installed stack first; do not blindly replace it with downloaded wheels. If GPU dependencies fail, run the scoped classical baseline on CPU. The prototype must not depend on repairing a quantum stack. [R10, R11]

Example export contract: `manifest.json`, `sources.json`, `regions.json`, `activity/<aoi>/<year>.json`, `models/<id>/model_card.json`, `metrics.json`, chart SVG/PNG, optional CPU-loadable model and `checksums.sha256`. The web app consumes this bundle; it never calls Kaggle or exposes notebook credentials.

The present research has not downloaded training archives, measured your runtime, run models or produced evaluation scores. Claude should begin with a small schema check and report exactly which prerequisites are still missing.

## 9. Cross-platform architecture and hosting

Build one responsive **Progressive Web App (PWA)** rather than four independent native codebases. The same web application can be used on Windows, macOS, iOS and Android; installation behavior differs by browser. Keep a normal browser path everywhere. Older Macs may use the browser even when newer Safari offers Add to Dock. No App Store release is implied. [R12]

Recommended implementation: TypeScript, React and Vite; MapLibre for mapping; a compact chart library or accessible SVG; a service worker; schema validation; static versioned data. These are design choices. Pin tested dependency versions during implementation rather than assuming latest packages are compatible. MapLibre's guidance supports clustering, data reduction and tiling for large datasets. [R14]

Data flow: connected acquisition -> verified offline bundle -> Kaggle aggregation/calibration -> compact versioned outputs -> static web hosting -> browser. The production app has no GPU dependency. Add a thin API only when a demonstrated requirement cannot be satisfied with static partitions.

Map plan: ship a lightweight Natural Earth global outline/background and bounded regional geometry with attribution. Add imagery only if its network availability, licensing and performance are acceptable. Global raw hotspots must be clustered/aggregated or tiled, not loaded as one giant GeoJSON. Country-wide aggregates cannot answer an arbitrary drawn polygon; expose polygon calculations only where cell-level data is present. [R13, R14]

Free deployment candidate: GitHub Pages for a public, noncommercial challenge prototype. Current documentation allows public repositories on GitHub Free, with a published-site limit of 1 GB and soft bandwidth limit of 100 GB/month. Recheck terms and actual payload before deployment. This is not an unlimited global-scale production service. Proposed initial compressed data budget: under 100 MB, loaded by region, with under 5 MB for first meaningful view. [R16]

No database, login or paid LLM service is needed for the first version. Precompute narratives or use deterministic explanation templates. A future assistant can translate questions into validated filters and describe results, but free static hosting alone does not provide persistent server-side LLM inference.

PWA requirements: HTTPS, manifest, appropriately sized icons, offline shell, selected-area snapshot cache, update notice and cache versioning. Test install guidance per browser. Offline means cached areas/periods only, not the whole planet. Include an accessible table fallback if WebGL is unavailable. Respect reduced motion and avoid hover-only controls. [R12]

## 10. Execution plan and review loops

This is a proposed compressed build schedule, not a promise that archive preparation or full validation can finish in one day. It starts after inputs and runtime access are available. Since you selected preparation, apply the schedule to an allowed prototype stage and check event reuse rules before submission.

| Elapsed effort | Deliverable | Exit gate |
|---|---|---|
| 0-1 hour | Repository, actual-runtime probe, source/availability manifest, tiny sample | Schema and dependencies understood |
| 1-3 hours | Regional ingestion and aggregate export; UI shell in parallel | One authentic selected-area calendar works |
| 3-5 hours | Second region, linked comparison, B0/B1 if data ready | Raw/estimated states and evidence are truthful |
| 5-7 hours | Responsive/PWA behavior, export, provenance, error states | Main planner journey passes desktop/mobile checks |
| 7-8 hours | Review, screenshots, demo narrative, handoff status | Usable prototype; no unsupported claims |
| 8-24 hours | Complete archives/holdouts; optional B2 and intervals | Scientific evidence reaches release gate |
| 24-48 hours | Wider supported summaries and robustness fixes | Expand only what has passed checks |
| Later | Coverage-aware correction, DL, LLM, QML/QLLM | Each experiment earns inclusion |

Claude agent work can run in parallel with isolated ownership: data/science owns ingestion and manifests; frontend owns map/calendar/layout; QA owns test scenarios and evidence review; coordinator owns shared schema, integration and acceptance. Agents may ask the coordinator questions or propose improvements. Only ask you when the answer changes scope, scientific interpretation, cost or access. Do not ask the same confirmed questions again.

Loop: inspect evidence -> propose smallest next improvement -> implement -> test -> review failure -> revise -> record status. Use at most three bounded repair attempts for an external dependency; then document the blocker and take the designed fallback. Never repeat rate-limited calls indefinitely. Stop when P0 requirements and scientific labels pass; do not keep adding models after the usable product is ready.

Priority if time runs out: first protect truthful data states and source traceability; then finish calendar/map interaction; then calibration; then polish; then optional models. A polished fixture-only interface is labelled a UI prototype. A real-data comparison without validated calibration is labelled observed comparison. A validated calibration release must include its held-out metrics and supported scope.

## 11. Acceptance criteria and demonstration

| ID | Test | Pass condition |
|---|---|---|
| DATA-01 | Import and provenance | Every displayed value traces to a snapshot and source manifest; invalid rows quarantined |
| DATA-02 | Missing/zero distinction | Missing partitions are null; zero recorded detections never means confirmed no fire |
| SCI-01 | Sampling control | Platforms, collection, day/night and quality protocols explicit; no silent satellite pooling |
| SCI-02 | Model honesty | Only supported estimates appear; holdout metrics/model card present; no fabricated accuracy |
| SCI-03 | Temporal/geographic leakage | Frozen split manifest; neighboring/event overlap handling documented |
| UX-01 | Linked workflow | Area/month selection synchronizes calendar, map, chart and evidence |
| UX-02 | Meaningful comparison | Raw sensors and estimates clearly distinguished; missing estimates explained |
| UX-03 | Cross-platform | Keyboard and touch journeys pass at 360px, tablet and desktop widths; real iOS/Android checks reported separately from emulation |
| PERF-01 | Payload/response | Target under 5 MB initial compressed payload; cached selection responds within 500 ms on tested device; measure, do not claim in advance |
| OFF-01 | Offline | Previously cached region/calendar/source metadata work offline; uncached content has honest unavailable state |
| EXPORT-01 | Portable evidence | CSV/brief include AOI, UTC bounds, metric, units, source IDs, snapshot and model status |
| SEC-01 | Credential isolation | No API keys, registration IDs, private source links or secrets in repository/build/export |
| DEMO-01 | Reproducibility | Clean build/import from documented inputs; health/status file identifies remaining limitations |

Four-minute demonstration outline, adapted from the supplied pitch references:

- 0:00-0:30: explain the two-camera problem and the planner's question.
- 0:30-1:10: select Bangladesh and show the burning calendar.
- 1:10-2:00: compare raw sensor records and inspect provenance.
- 2:00-2:50: reveal supported calibration, interval and one held-out result; if unavailable, explicitly show the observed-comparison stage.
- 2:50-3:25: show the international comparison, mobile layout and cached view.
- 3:25-4:00: explain what is useful now, its limitations and the next validation step.

The references mention a 240-second local video/public code link and a short nominee video, but the current applicable submission rules require confirmation. Do not publish automatically. Identify NASA data sources in the submission. Team credit for this planning pack: M. Al Shahriar Hameem; do not infer additional contributors.

## 12. Source register and handoff

All links were checked on 9 October 2026. Status describes access in this research environment, not permanent website availability. Broader dataset/repository links and detailed limitations appear in the full source audit bundle.

- **R1 - Official challenge:** https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/ - official indexed summary; direct fetch 502.
- **R2 - NASA FIRMS FAQ / pixel definitions:** https://www.earthdata.nasa.gov/data/tools/firms/faq and https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs - official indexed content; direct 403.
- **R3 - NASA scientific caveats:** https://forum.earthdata.nasa.gov/viewtopic.php?t=5188 - accessible; cloud/missing data, heat-source interpretation and FRP caveats.
- **R4 - FIRMS Area API:** https://firms.modaps.eosdis.nasa.gov/api/area/ - accessible; sources, query windows and transaction limits.
- **R5 - FIRMS archive:** https://firms.modaps.eosdis.nasa.gov/download/ - accessible landing page; archive payloads not downloaded in this task.
- **R6 - Availability:** https://firms.modaps.eosdis.nasa.gov/api/data_availability/ - source/date discovery; recheck during acquisition.
- **R7 - Fu et al. 2020:** https://modis.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=38581 and https://doi.org/10.3390/rs12182870 - NASA abstract verified; publisher throttled.
- **R8 - Li et al. 2018:** https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2017JD027823 - full article accessed; 750 m VIIRS comparison.
- **R9 - QML benchmarking:** https://arxiv.org/abs/2403.07059 - author abstract accessed; a reason for fair classical controls, not proof about this unrun task.
- **R10 - XGBoost GPU:** https://xgboost.readthedocs.io/en/stable/gpu/index.html - official documentation accessed.
- **R11 - GPU compatibility:** https://pytorch.org/blog/pytorch-2-7/ and https://docs.pennylane.ai/projects/lightning/en/stable/lightning_gpu/device.html - official docs; actual Kaggle compatibility remains to test.
- **R12 - PWA support:** https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable - accessed; browser differences preserved.
- **R13 - Natural Earth:** https://www.naturalearthdata.com/about/terms-of-use/ - accessible, public-domain terms.
- **R14 - MapLibre large data:** https://maplibre.org/maplibre-gl-js/docs/guides/large-data/ - official guide accessed.
- **R15 - Event guide / Dhaka:** https://www.spaceappschallenge.org/resources/team-formation-guide/ and https://www.spaceappschallenge.org/2026/local-events/dhaka/ - supplied full guide plus current official indexed information; schedule conflicts recorded.
- **R16 - GitHub Pages limits:** https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits - official documentation accessed; recheck before deployment.

Handoff contents: this PRD in Markdown and PDF, a self-contained Claude Code master prompt, a source URL ledger, complete reference review notes and modelling recommendations. Source access is documented; no model performance, global dataset completeness, deployment or scientific result is implied.
