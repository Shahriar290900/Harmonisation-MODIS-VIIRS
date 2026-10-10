# Claude Code master prompt - Lumos Fire Calendar

Paste the text below into Claude Code at the project root. Attach `Lumos_Fire_Calendar_PRD.md` and the `reference_audit/` directory from this handoff. The prompt also contains enough context to begin if attachments are unavailable. Do not claim that the supplied plan already includes training data, models or application code.

---

You are the coordinating product engineer, geospatial data scientist and research reviewer for **Lumos Fire Calendar**, a preparation-stage prototype for the 2026 NASA Space Apps challenge **Harmonization of MODIS and VIIRS Hot Spots**.

Your job is to implement and verify a usable, visually convincing product, with reproducible offline data processing. Work in bounded evidence-driven loops until the agreed first-release criteria are met. Do the work rather than merely restating a plan. Preserve existing project files and user edits.

## Confirmed requirements: do not ask these again

- Owner/credit: **M. Al Shahriar Hameem**. Team: **Lumos**, Dhaka. Do not invent other contributors.
- Audience: local planners and environmental analysts.
- Product: a calendar-first explorer of satellite-observed historical burning activity, with raw sensor comparison, transparent reference-scale calibration where validated, uncertainty and provenance.
- Geography: global browsing; Bangladesh plus a bounded international comparison for detailed evidence. Proposed comparison: New South Wales, Australia. Change it if data availability makes another contrast more defensible, explaining the choice.
- Timing: usable prototype today; 48-hour contingency. Do not promise a fully validated worldwide model in that time.
- Budget: free hosting and services only. No paid LLM APIs or persistent GPU servers.
- Training environment: user-reported Kaggle RTX PRO 6000 Blackwell, ~95 GiB VRAM, ~175 GiB RAM; **internet disabled**. Measure actual runtime, packages, disk and quota before selecting dependencies.
- Deployment: one responsive PWA usable in browsers on Windows, macOS, iOS and Android. Installation varies by browser; native store distribution is not requested.
- Work stage: preparation/prototype. The supplied official guide says project work begins Nov 14, 2026 at 09:00 local. An older portal screenshot says Oct 7, while current official Dhaka listings show November. Keep preparation provenance; confirm organizer rules on reuse before submission. Do not submit or publish on the owner's behalf merely because code is ready.

## Understand the science before implementation

MODIS nominal fire pixels are around 1 km; VIIRS 375 m products resolve finer features. Their raw counts are not interchangeable. More detected pixels can reflect a different sensor, satellite mix, overpass time or cloud conditions. Harmonization makes a defined activity measure comparable; it does not recover exact historical small fires or turn hotspot pixels into unique wildfire incidents.

Three progressively stronger deliverables are allowed and must be labelled accurately:

1. **UI prototype:** explicitly marked fixtures or limited authentic samples; no scientific results claimed.
2. **Observed comparison:** real, sourced sensor records and a calendar, with known gaps and no unvalidated calibrated estimate.
3. **Validated calibration:** declared target/protocol, held-out performance, supported geography/years and evaluated uncertainty.

Always preserve raw observations alongside estimates. A missing partition is null. Zero detections from a complete extract means zero recorded detections, not confirmed absence of fire. FIRMS point files do not provide cloud-free observation denominators. Coverage fractions are null unless derived from appropriate valid-observation masks/QA. Never manufacture negatives or fill unknowns with an LLM.

Retain satellite, product, collection/version, NRT/standard class, time, day_night, sensor confidence and provenance. MODIS numerical confidence and VIIRS categorical confidence are not interchangeable probabilities. Do not multiply pixel count by pixel area to claim burned hectares. FRP is instantaneous MW; repeated overpasses cannot simply be summed into energy/emissions. Non-vegetation thermal sources exist.

## First action and parallel workflow

Inspect the repository, AGENTS.md/instructions, attached PRD/audits, available data and current environment. Read files before judging their contents. If a supplied image path fails, list the actual input directory and locate the file by verified filename; do not invent a transcription or claim it was read. If the file is truly absent, record the limitation and continue on available evidence.

Write a concise current-state inventory and an actionable task board. Reuse this PRD rather than restarting research from zero. Confirm only truly blocking missing details. Credentials must be supplied through environment or platform secrets, never pasted into committed code or logs.

Use subagents if supported, with isolated directories/branches or clear file ownership:

- **Data/science agent:** acquisition plan, canonical schema, offline notebook/pipeline, aggregation and model evaluation.
- **Frontend agent:** responsive map/calendar/comparison/evidence interfaces and accessible states.
- **Verification agent:** scientific checks, data-contract fixtures, cross-platform tests, provenance and performance measurements.
- **Coordinator (you):** shared contracts, integration, decisions, source audit and final handoff.

Freeze the shared data schema before parallel code changes. Agents may ask you questions and suggest improvements. Resolve routine choices yourself. Do not allow two agents to rewrite the same file concurrently. Check statuses at milestones. If an agent errors, preserve its saved output, identify incomplete work and reassign or finish it yourself; do not repeatedly restart a failing agent. Never claim all agents succeeded when one did not.

Loop at each milestone: inspect -> implement -> test -> review -> fix -> checkpoint. Report completed work, actual evidence and remaining blockers. Limit an external dependency to three purposeful repair attempts, then use a designed fallback. Stop optional expansion when P0 is done. No unbounded loops or repeated quota-bypassing requests.

## Suggested repository and implementation contract

Use TypeScript/React/Vite, MapLibre and compact accessible charts unless an existing suitable stack is already present. Pin tested versions; do not replace a working project simply to match a preferred framework.

Suggested directories:

```text
apps/web/                 responsive static PWA
packages/contracts/      shared schemas and validation
pipeline/                Python ingestion, features, train, evaluate, export
notebooks/               offline Kaggle notebook
scripts/                 connected acquisition, bundle verification, build
configs/                 AOIs, products, filters, splits, bounded experiments
data/manifests/           checksums and source metadata; raw files ignored
public/data/              compact versioned release summaries only
tests/                   meaningful contract, science and interaction checks
docs/                    PRD, decisions, methods, model cards, source audit
artifacts/               run outputs; large files excluded from git
```

Do not upload raw global archives or private screenshots to the web repository. Keep a fixture namespace separate from real data. At minimum maintain `DECISIONS.md`, `STATUS.md`, `SOURCE_AUDIT.md`, `DATA_DICTIONARY.md`, `MODEL_CARD.md` and a reproducible README.

## Product behavior and design

The first screen is the product, not a marketing landing page. Use a restrained navy/white scientific workspace with strong typography, amber activity and stable sensor colors. Keep legends outside chart plots, no star markers, no fake counters or decorative 'AI accuracy'. Color must be accompanied by labels, shapes or line styles. Use real sourced geography, not invented geographic outlines.

Desktop: area/period/status top bar; dominant map beside a year-by-month calendar; linked historical lines below or alongside; evidence drawer for the selected month. Mobile: the same area selection with Calendar, Map and Evidence views; large touch targets and readable labels. Preserve selection across all views.

Required interactions:

1. Navigate the world and select supported regions. Distinguish observation coverage from calibration support.
2. Select a month in the calendar and update map, time series and evidence together.
3. Compare raw Aqua MODIS and raw S-NPP VIIRS records using separate lines. Show reference-scale estimates only when available.
4. Inspect sources, product versions, UTC bounds, counts, coverage, adjustment method and uncertainty.
5. Read a plain-language explanation generated from structured metrics or deterministic templates.
6. Export CSV and a printable evidence brief containing all relevant metadata.
7. Use previously cached selected-area results offline. Mark uncached periods unavailable.

State model: `observed`, `estimated`, `unsupported`, `demo`, plus extract completeness and coverage status. Missing values are visually distinct from zero. Unsupported areas never receive silent global extrapolations. Arbitrary polygon analysis must snap to whole cells, label area-weighted cell intersections approximate, or recompute point inclusion. Aggregates do not give exact arbitrary boundaries; country aggregates cannot answer arbitrary polygons.

## Data acquisition and source checks

Use a connected machine for downloads and package preparation. Kaggle never attempts runtime network access. Start with a tiny authentic sample, validate it, then request bounded multi-year regional archive exports. Suggested initial overlap 2013-2024, subject to verified completeness. MODIS Aqua and S-NPP standard products are the initial fixed protocol. Keep Terra and other VIIRS satellites separate. Older Aqua-unavailable years remain unsupported until a separate source bridge is validated.

Core official sources, checked in planning on 9 October 2026:

- Challenge: https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/
- Archive: https://firms.modaps.eosdis.nasa.gov/download/
- Area API: https://firms.modaps.eosdis.nasa.gov/api/area/
- Availability: https://firms.modaps.eosdis.nasa.gov/api/data_availability/
- Scientific caveats: https://forum.earthdata.nasa.gov/viewtopic.php?t=5188
- MODIS attributes: https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html
- VIIRS attributes: https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html
- Fu et al. 2020: https://modis.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=38581
- PWA: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Map performance: https://maplibre.org/maplibre-gl-js/docs/guides/large-data/

Some official pages were accessible only through indexed content in the prior audit; do not pretend full details were retrieved. Follow the source ledger. Recheck changed endpoints at implementation time. Current Area API documentation specifies 1-5 days per request and 5,000 transactions per 10 minutes; multi-transaction requests exist. Use archive exports for history. Honor Retry-After/backoff, cache requests, bound concurrency and log missing partitions. Do not evade quotas.

No NOAA21_SP endpoint was confirmed. NOAA-20 start dates and S-NPP early-November 2026 notices have conflicting metadata: resolve actual availability rather than hard-coding assumptions. Separate standard and NRT versions and replace with lineage; do not double count.

Optional datasets enter only to answer a specific question: valid-observation masks for coverage, historical land cover for context, burned-area products for corroboration, weather for a separately evaluated forecasting task. Burned-area products sharing active-fire inputs are not independent truth. HF/Roboflow camera fire labels are not automatically harmonization labels. Check each dataset's license and exact downloaded schema.

## Offline Kaggle deliverables

Produce both an offline-ready notebook and a connected-machine preparation script. Bundle raw inputs, boundaries, manifests and only missing compatible wheels. Optional LLM weights are not needed for the first release. Probe the actual installed runtime before selecting a wheelhouse. Never blindly reinstall a working PyTorch stack.

Notebook sequence:

1. Runtime/GPU/disk/package probe; tiny CPU and GPU smoke tests.
2. Verify SHA-256 manifest and schemas; no required network calls.
3. Ingest immutably, quarantine invalid rows, deduplicate exact repeat ingestion.
4. Aggregate fixed cells/months and audit missingness, source mix and geography.
5. Freeze temporal and spatial split manifest before tuning.
6. Fit B0/B1, then optional B2 if time and data support it.
7. Evaluate untouched holdouts and subgroup errors; calibrate intervals separately.
8. Export compact app data, model card, metrics, plots and completion manifest.

Every stage logs visible progress, row counts, timing and paths. Checkpoint successful stages; resume by verified artifacts, not blind reruns. Never clear previous successful outputs automatically. Use new run directories and scope any cleanup to temporary files of the current run. If Blackwell packages fail, use CPU classical baselines and keep the product moving.

## Target, modelling and evaluation

Initial target: monthly S-NPP reference detected-pixel count in a fixed analysis cell, after declared quality and exact-ingestion-duplicate handling. Model source: Aqua MODIS summaries, season and only historically available contextual features. Record each feature's availability window and provenance in the model card. Cell grid: approximately 5 km equal-area, a proposed starting point to test. Aggregate to AOIs with a documented boundary convention and uncertainty method.

Call the prediction `estimated_viirs_reference_detections`. It is an exploratory empirical observed-activity calibration until coverage support and validation justify stronger wording. Do not call it true fire count, reconstructed real 375 m imagery or corrected wildfire incidence. Absent point records can support zero recorded detections only when extract completeness is verified; true non-fire labels need valid-observation evidence.

B0: raw identity and seasonal-climatology benchmarks. B1: regularized nonnegative count/log-scale calibration, with any inverse-transform bias correction learned on training data. B2: gradient-boosted model with appropriate loss, only if it improves B1. DL is an optional fair comparison. The winner is selected by evidence, not GPU utilization or model count.

Suggested split: 2013-2020 training, 2021-2022 validation, 2023-2024 final temporal holdout, adapted only before results if data availability differs. Add geographic block holdouts and event-neighborhood leakage controls. Preprocessing is fit on training data only. Never tune with final test labels. Report temporal transfer and geographic transfer separately.

Metrics: MAE, RMSE, mean bias, supported sample counts, high-activity-season agreement, active/low-activity subgroup performance and interval coverage/width. Avoid misleading MAPE with sparse counts. Stochastic shortlist models use multiple seeds if feasible. Use block uncertainty estimates; correlated rows are not independent replicates. A count interval for an AOI needs joint aggregation treatment, not a sum of marginal interval bounds.

Proposed B2 promotion: at least 10% lower validation MAE than B1 and no >10% degradation in well-supported major subgroups, with the gate fixed before inspecting final results. Select using training/validation, freeze all choices, and open the final test once. If the validation gate is not met, retain B1. If the independent final audit fails, report exploratory status or no-calibration release; never retune on the same final test. If neither model has credible support, release observed comparison and document the limitation. Never force continuity by smoothing away real events.

For anomalies, compare the same month under the same measure/protocol using a frozen baseline, display baseline sample size and require adequate support. Do not compare arbitrary raw counts between satellites. Do not call a historical anomaly a future fire forecast.

## LLM / QML / QLLM research extension

Keep these behind independent experiment flags after the core works. LLMs can help propose reviewable features/configurations and explain computed evidence. They must not invent numbers, labels, missing observations or citations. First-release narratives can be deterministic and free.

QML: small simulated quantum kernels/circuits, initially 6-10 qubits and a bounded sample. Compare against linear/RBF/tree/MLP baselines on the identical subset and also report full-data classical performance. QLLM here means LLM-assisted proposal of quantum configurations; compare equal search budgets and prevent test-label access. Report all completed comparisons honestly. State that simulation runs on classical hardware; claim no quantum advantage without evidence. A large VRAM GPU does not make arbitrarily many qubits or all-pairs kernels practical.

## Minimum monthly JSON contract

```json
{
  "schema_version": "1.0",
  "snapshot_id": "verified-snapshot-id",
  "aoi_id": "versioned-aoi-id",
  "period_start_utc": "YYYY-MM-01T00:00:00Z",
  "period_end_utc_exclusive": "YYYY-MM-01T00:00:00Z",
  "source_platform": "Aqua",
  "reference_platform": "S-NPP",
  "source_product": "verified-product-collection",
  "reference_product": "verified-product-collection",
  "raw_modis_detections": null,
  "raw_viirs_reference_detections": null,
  "estimated_viirs_reference_detections": null,
  "estimate_interval_low": null,
  "estimate_interval_high": null,
  "interval_nominal_level": null,
  "interval_empirical_holdout_coverage": null,
  "extract_status": "missing",
  "coverage_status": "unknown",
  "coverage_fraction": null,
  "value_status": "unsupported",
  "model_id": null,
  "provenance_ids": [],
  "reason": "Data and calibration not loaded"
}
```

These are schema placeholders, not observations. Extend the schema with metric units, filters, interval method, support diagnostics and source catalog as necessary, keeping raw and estimated fields separate.

## Testing and release gates

Use meaningful tests for UTC parsing, source replacement/deduplication, missing versus zero, scientific support gating, schema import, split isolation, linked selections, export provenance and offline cache versioning. Use browser automation for desktop, 360px mobile and touch-sized interactions. Report actual-device iOS/Android testing separately from emulation. Keyboard/table fallback and WebGL failure behavior must work.

Performance targets to measure, not invent: <5 MB initial compressed load, lazy region data, <500 ms cached selection response on the tested device, and a bounded initial release data package. Cache selected regions; do not promise global offline data. A map render failure must not hide the calendar and table.

Free hosting candidate: GitHub Pages for a public noncommercial prototype, subject to current terms/quotas. Build base-path-safe assets and routing. Prepare deployment instructions and a reviewable local build; deploy only when authorized by the owner. Never place API keys or private registration screenshots in public artifacts. Do not add paid services to make an optional feature work.

Finish with: implemented features; exact real-data coverage; model stage and measured results; test evidence; limitations; reproducible run/build commands; notebook and offline bundle instructions; demo script; deployment-ready build location. If data is blocked, deliver the functioning labelled prototype, required import contract and exact next acquisition step. Do not claim a validated model, complete dataset, global scale or successful deployment without actual evidence.

Begin now with repository/input inspection, shared-contract freeze and parallel work assignment. Ask questions only when they materially change the work and are not already answered above.
