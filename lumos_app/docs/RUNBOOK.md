# Lumos Fire Calendar — Step-by-Step Runbook

Oct 10, 2026 · @Shahriar Hameem

Everything built so far passes its tests. Nothing has run on real NASA data or on the Blackwell GPU yet, so Phases 1–3 are the real test. This runbook has 9 phases, about 60 sections and over 250 steps; tick them off as you go.

## Health check (10 Oct 2026)

| Part | Status | Evidence |
| --- | --- | --- |
| Notebook A (fetch) | Passes on a local mirror | Downloader tests (retries, 404, rate limits, key redaction) pass; now fetches 3 countries (117 FIRMS files) |
| Notebook B (train) | Passed on synthetic data before the USA update (historical 2-country run; not re-run for 3 regions) | Quick run 130 s, 0 errors; bundle check 38/38; unit, resume and leakage tests pass. The three-region update (USA, California) is **not yet in the shipped `lumos_B_train.py`**: it still defines Bangladesh and Australia only and logs `panel: 2 countries` in its guide text. Steps 2.6.2, 2.6 check, 2.14.4a and 2.18.4 below describe the updated notebook (the target); see `lumos_app/STATUS.md` |
| Notebook guide cells | Added | 1.1–1.12 and 2.1–2.18, one markdown cell above every code cell |
| Web app: data workspace | Passes | Type check clean, unit tests and build OK at the earlier 10 Oct check (367 unit tests then); the three-region update is being re-tested, see `lumos_app/STATUS.md` |
| Web app: 3D landing | Passes | Last full browser run 81/82; the one timing test was fixed and passes |
| Real FIRMS download | Not run | The sandbox cannot reach NASA servers |
| Real-scale training (Australia, United States) | Not run | Australia was estimated at about 90M cell-months; the United States panel has not been sized |
| Real phones, real GPU frame rates | Not tested | Only emulated in headless Chromium |
| Public deployment | Not done | Waits for your go-ahead |

Known small issues, none blocking:

- The landing page also downloads the workspace code early (about 100 kB gzip).
- Layout breakpoints are read once; rotating a tablet may need a reload.
- The United States download (whole country, no bounding box) and its processing time and memory have not been measured on real data.
- Natural Earth has 7 Bangladesh divisions (no Mymensingh), so Mymensingh is counted inside its neighbour.
- Organizer rules on reusing preparation work are still unconfirmed (step 0.3.2).

## Regions covered (three-region spec, 10 Oct 2026)

| Region | FIRMS country file name | Areas of interest (AOI ids) | Detailed view (5 km cells and B1 features) |
| --- | --- | --- | --- |
| Bangladesh | `Bangladesh` | `BGD` + 7 divisions `BGD-A` … `BGD-G` | `BGD` (divisions have cell grids only) |
| Australia | `Australia` | `AUS` + `AUS-NSW` (New South Wales) | `AUS-NSW` only; whole-country `AUS` is aggregate only |
| United States | `United_States` | `USA` + `USA-CA` (California) | `USA-CA` only; whole-country `USA` is aggregate only |

- Notebook A downloads 3 countries × (25 MODIS + 14 VIIRS) years = **117 FIRMS files**, plus 2 Natural Earth files.
- The whole United States is downloaded (under 1 GB in total, no bounding box). "Bounded" is done in the app: country totals for `USA`, detailed grids only for `USA-CA`, the same pattern as `AUS` / `AUS-NSW`.
- The app opens on Bangladesh by default. Bangladesh, New South Wales and California are the three detailed regions.
- `schema_version` stays `1.0`. The extra AOIs are recorded in `lumos_app/CONTRACT.md`, §8 (v1.2 addendum: AOI set extended). Older bundles (Bangladesh and Australia only) remain valid.
- None of this has been run on real data yet.
- Notebook A is updated for three countries. Notebook B and its guide text (`STEP_INDEX.md`) are not yet. Until they are, the Phase 2 checks marked "three-region" (2.6.2, 2.6 AOI check, 2.14.4a, 2.18.4) will not match what the notebook prints. Do not start Phase 2 until Claude confirms Notebook B was updated.

## How to use this runbook

Work top to bottom. Every step has a number `phase.section.step` (for example 2.5.3) and a checkbox. Don't start a phase until the previous phase's gate is met.

- **Phases 1 and 2 match the notebooks exactly.** Each code cell in the Kaggle notebooks has a guide cell above it with the same section number, steps and checks. You can follow either the notebook or this doc.
- **"Check before moving on"** lists are the gate for each section. If a check fails, use that section's fix in Phase 8 before continuing.
- **Claude Code steps** (Phases 4–6) are prompts you paste into Claude Code with the repo open. The master prompt in the repo already holds the rules, so short prompts are enough.
- **Times are estimates.** Only the synthetic test runs were timed; write your real times next to each section.

&#91;embedded content: runbook roadmap · 9 phases, one gate each\]

Phases 1–3 run on Kaggle and your laptop; Phases 4–6 run in Claude Code; Phase 8 is the reference you return to whenever a check fails.

## Phase 0 — Prepare accounts, files and rules

Gate: you have both zips unpacked, a phone-verified Kaggle account, and you know what the organizers allow. About 30 minutes.

### 0.1 Accounts

- [ ] 0.1.1 Log in to kaggle.com and confirm your phone is verified (Settings → Phone verification). Internet ON in Notebook A needs it.
- [ ] 0.1.2 Check your weekly GPU quota on Kaggle (Settings → Quotas). Notebook B needs one RTX PRO 6000 session of up to 12 hours.
- [ ] 0.1.3 Optional: get a free FIRMS MAP\_KEY at firms.modaps.eosdis.nasa.gov/api/map\_key. Only needed for recent near-real-time data.
- [ ] 0.1.4 Create or log in to a GitHub account. You need it for free hosting in Phase 6.
- [ ] 0.1.5 Make sure Claude Code is installed on your laptop and signed in.

### 0.2 Files on your laptop

- [ ] 0.2.1 Download `Lumos_Fire_Calendar_App.zip` from this chat and unzip it to a folder such as `~/Projects/lumos_app`.
- [ ] 0.2.2 Install Node.js 20 or newer. Check with `node -v` in a terminal.
- [ ] 0.2.3 In the folder, run `npm install`. It takes 1–2 minutes.
- [ ] 0.2.4 Run `npm run dev` and open http://localhost:5173. Confirm the landing page loads with the DEMO DATA label.
- [ ] 0.2.5 Click **Open the fire calendar** and confirm the workspace loads. Stop the server with Ctrl+C.
- [ ] 0.2.6 Run `npm test`. Expect every unit test to pass (the count grows as tests are added; `lumos_app/STATUS.md` has the latest).
- [ ] 0.2.7 Run `git init` (if there is no `.git` folder), then `git add -A && git commit -m "baseline"`, so you can always roll back.
- [ ] 0.2.8 Keep `notebooks/lumos_A_fetch.ipynb` and `notebooks/lumos_B_train.ipynb` handy for Phase 1 and 2.

Check before moving on:

- [ ] The demo app runs locally and the unit tests pass.

### 0.3 Event rules and timing

- [ ] 0.3.1 Open the official challenge page in a browser (the sandbox could not read it): spaceappschallenge.org → 2026 → Harmonization of MODIS and VIIRS Hot Spots. Note the stated objectives.
- [ ] 0.3.2 Ask your Dhaka local organizer whether work prepared before the event window (14 Nov 2026) may be entered. Write the answer here.
- [ ] 0.3.3 Note the submission deadline, the video length limit and whether a public code link is required.
- [ ] 0.3.4 Decide your team list. Today the credits name only M. Al Shahriar Hameem; add teammates in the app footer if they join.

Check before moving on:

- [ ] You know the deadline and the reuse rule, written in this doc.

## Phase 1 — Notebook A: fetch NASA data (internet ON)

Gate: a committed version of `lumos_A_fetch` whose Output tab holds `lumos_bundle/` with no `error` files. About 30–60 minutes. These steps are identical to the guide cells inside the notebook.

### 1.1 Create and configure the Kaggle notebook

Manual set-up in the Kaggle web UI before any cell runs. Nothing is executed.

- [ ] 1.1.1 On kaggle.com click **Create → New Notebook**.
- [ ] 1.1.2 In the editor, **File → Import Notebook** and upload `notebooks/lumos_A_fetch.ipynb`. Rename the notebook `lumos_A_fetch` (Notebook B's instructions use this name).
- [ ] 1.1.3 Right-hand panel **Settings → Internet: ON** (Kaggle only allows this on a phone-verified account).
- [ ] 1.1.4 **Settings → Accelerator: None** (CPU) or **GPU T4**. No GPU is needed here.
- [ ] 1.1.5 Leave **Settings → Environment** on the default (latest) image. Notebook B must use the same image, or the offline wheels may not install.
- [ ] 1.1.6 *(Optional, only for recent near-real-time data)* **Add-ons → Secrets → Add a new secret** named `FIRMS_MAP_KEY` with your free FIRMS MAP\_KEY, and tick it for this notebook. Then set `FETCH_API_NRT = True` in 1.2.
- [ ] 1.1.7 Start the session (the power button, or run the first cell) and follow 1.2 to 1.12 cell by cell, or use **Run All**.

Check before moving on:

- [ ] The Settings panel shows Internet ON and the accelerator you chose.
- [ ] The notebook shows 24 cells: the intro, a guide cell above each of the 11 code cells, and the Next phase cell at the end.

### 1.2 Config

Sets the countries, year ranges, politeness limits for the downloader and the output folder (`/kaggle/working/lumos_bundle`). It only defines settings and prints nothing.

- [ ] 1.2.1 Check `COUNTRIES` (default Bangladesh, Australia and United_States; a space in a name becomes an underscore). Leave `EXTRA_COUNTRIES = []` unless you were asked to add training countries; each extra country adds download time.
- [ ] 1.2.2 Leave `MODIS_YEARS` (2001–2025) and `VIIRS_YEARS` (2012–2025) as they are.
- [ ] 1.2.3 Set `FETCH_API_NRT = True` only if you added the `FIRMS_MAP_KEY` secret in 1.1.6. Otherwise leave it `False`.
- [ ] 1.2.4 Leave `TRY_NOAA20 = False` (that FIRMS folder is unverified; it would only log 404s).
- [ ] 1.2.5 Leave the politeness settings (`MAX_WORKERS = 4`, `MAX_RETRIES = 3`, `BACKOFF_BUDGET_S`, `CIRCUIT_BREAKER_N`, `FILE_DEADLINE_S`) unless FIRMS is rate-limiting you heavily.
- [ ] 1.2.6 Run the cell. Do not set any `LUMOS_*` environment variables on Kaggle; they are for local tests only.

Check before moving on:

- [ ] The cell finishes with no output and no error.

### 1.3 Helpers

Imports the libraries and defines the expected FIRMS CSV headers, the Natural Earth file names, rough country boxes for the optional Area API, a timestamped logger that hides the MAP\_KEY, and a SHA-256 helper. Nothing is downloaded.

- [ ] 1.3.1 Run the cell.
- [ ] 1.3.2 Note that every later log line starts with `[   12.3s]`, the seconds since this cell ran.

Check before moving on:

- [ ] No `ImportError` (in particular for `requests`).

### 1.4 Polite downloader

Defines the download engine: retries that respect `Retry-After`, a global back-off budget, a per-host circuit breaker, a stall guard, header and GeoJSON validation, atomic file writes, and a cache keyed on SHA-256. Nothing is downloaded yet.

- [ ] 1.4.1 Run the cell.
- [ ] 1.4.2 Know the behaviour you will see later: a 404 is recorded as `missing`, a 401 or 403 stops all requests to that host, and 429 or 5xx responses are retried up to `MAX_RETRIES` times.
- [ ] 1.4.3 A file whose first line is not the expected FIRMS header (for example an HTML error page) is rejected and recorded as `error`.

Check before moving on:

- [ ] The cell finishes with no output and no error.

### 1.5 Plan the downloads

Defines the job lists (FIRMS yearly country files, optional Area API requests, the Natural Earth files) and the functions that read and write `manifests/sources.json`.

- [ ] 1.5.1 Run the cell.
- [ ] 1.5.2 For reference, each FIRMS file comes from `https://firms.modaps.eosdis.nasa.gov/data/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv` and is saved under `lumos_bundle/raw/firms_country/<sensor>/<year>/`.

Check before moving on:

- [ ] The cell finishes with no output and no error.

### 1.6 Download FIRMS country archives

Downloads every FIRMS yearly country CSV (MODIS 2001–2025 and VIIRS S-NPP 2012–2025 for each country), validates each file, and writes the manifest as it goes. Files already downloaded in this session are reused if their SHA-256 matches.

- [ ] 1.6.1 Run the cell. The first lines show the Python version, the bundle path and the base URLs.
- [ ] 1.6.2 Look for `FIRMS country archives: 117 files, 4 workers` (3 countries × (25 MODIS + 14 VIIRS) years with the default config).
- [ ] 1.6.3 Watch the per-file lines `[  i/117] ok|missing|error <id> <rows> <MB> <note>`. Ids use the underscore name, for example `modis_2020_United_States`. The Australia and United_States files are the largest and take longest.
- [ ] 1.6.4 Lines like `HTTP 429 for ... retry 1/3 in 12.0s` are normal: the downloader is waiting as FIRMS asked.
- [ ] 1.6.5 If you see `circuit breaker` or `HTTP 403; stopping all requests`, the remaining files from that host are recorded as `error`.
- [ ] 1.6.6 Wait for the closing line `FIRMS country archives: done in ...s (ok=..., missing=..., error=...)`.

Check before moving on:

- [ ] The closing line shows `error=0`.
- [ ] `missing` appears only for files FIRMS really does not have (a 404). They are recorded as missing, never filled with zeros.
- [ ] Any 2025 file FIRMS has not filled yet shows `ok`, `0 rows` and the note `header-only file (0 data rows)`. That is expected.
- [ ] `/kaggle/working/lumos_bundle/manifests/sources.json` exists (Output panel on the right).

### 1.7 Optional recent NRT data

Only when `FETCH_API_NRT = True` and a MAP\_KEY is found: downloads the last 10 days of near-real-time detections from the FIRMS Area API, at most 5 days per request. The key is never printed or saved.

- [ ] 1.7.1 Run the cell.
- [ ] 1.7.2 Default setting: look for `Area API (NRT) disabled (FETCH_API_NRT=False).` and move on.
- [ ] 1.7.3 With the secret: look for `FIRMS MAP_KEY found (value hidden). Fetching recent NRT detections.` followed by a `done` line.

Check before moving on:

- [ ] One of the two messages above appears.
- [ ] If NRT ran, the manifest URLs show `{MAP_KEY}` instead of the key.

### 1.8 Boundaries

Downloads the Natural Earth GeoJSON files (world countries; states and provinces) into `lumos_bundle/context/` and checks each is a valid FeatureCollection.

- [ ] 1.8.1 Run the cell.
- [ ] 1.8.2 Look for `Natural Earth boundaries: 2 files, 4 workers`, then two `ok` lines with a feature count. Notebook B later cuts the Bangladesh divisions, New South Wales and California out of the states-and-provinces file.

Check before moving on:

- [ ] The closing line shows `ok=2, missing=0, error=0`.

### 1.9 Offline wheelhouse

Downloads wheels for PennyLane, PennyLane-Lightning, ONNX and onnxscript (plus XGBoost if missing) into `lumos_bundle/wheelhouse/`. Notebook B installs these with the internet off.

- [ ] 1.9.1 Run the cell. Look for `Wheelhouse: downloading [...] for Python 3.x.y`.
- [ ] 1.9.2 Watch one line per package: `wheel ok <name>` or `wheel FAILED <name>`.
- [ ] 1.9.3 Read the closing line `Wheelhouse: N wheel files, X MB`.

Check before moving on:

- [ ] `pennylane` and `pennylane-lightning` show `wheel ok`.
- [ ] The wheel count is greater than 0.

### 1.10 Manifests and README

Writes `manifests/sources.json`, `manifests/env_A.json` (Python version, packages, GPU, wheelhouse), `manifests/config_A.json` and `README_bundle.md`.

- [ ] 1.10.1 Run the cell.
- [ ] 1.10.2 Look for `Wrote manifests/sources.json, env_A.json, config_A.json, README_bundle.md`.
- [ ] 1.10.3 Note the Python version in the README. Notebook B must run on the same version.

Check before moving on:

- [ ] All four files exist under `/kaggle/working/lumos_bundle/`.

### 1.11 Summary table

Prints a table of every FIRMS file (rows: sensor and year; columns: country; cells: `ok <rows>`, `missing` or `error`), then counts by status and the note for every error.

- [ ] 1.11.1 Run the cell.
- [ ] 1.11.2 Scan the table column by column. MODIS should be `ok` for 2001–2025 and VIIRS S-NPP for 2012–2025.
- [ ] 1.11.3 Read `All records by status: {...}` and any `ERROR <id> - <note>` lines.

Check before moving on:

- [ ] The table has no `error` cells.
- [ ] `missing` cells are only years FIRMS does not publish. Write down any you see.

### 1.12 Final check and Save Version

Prints folder sizes, scans every file for the MAP\_KEY (deleting any that contain it), removes partial downloads and logs the final instruction. Kaggle keeps `/kaggle/working` as the notebook output.

- [ ] 1.12.1 Run the cell and read the folder sizes (`raw`, `context`, `wheelhouse`, `manifests`).
- [ ] 1.12.2 Look for `key leak check: passed`.
- [ ] 1.12.3 Look for the last line `Done. Outputs are files under /kaggle/working/lumos_bundle (no zip). Now: Save Version -> 'Save & Run All'.`
- [ ] 1.12.4 Click **Save Version** (top right) → **Save & Run All (Commit)** → **Save**. The committed version re-runs the whole notebook in a fresh session; that is expected.
- [ ] 1.12.5 Wait until the version shows as finished successfully (the notebook's **Versions** list).
- [ ] 1.12.6 Open that version's **Output** tab and confirm `lumos_bundle/` is listed.

Check before moving on:

- [ ] `key leak check: passed`.
- [ ] `raw` is the largest folder and `context` is not empty.
- [ ] The committed version's Output tab shows `lumos_bundle/manifests/sources.json`.

## Phase 2 — Notebook B: train offline on the Blackwell GPU

Gate: `lumos_app_bundle.zip` is on your computer, `blocked network attempts: 0`, and no HONEST NOTE (synthetic) banner. Roughly 30–90 minutes on real data (not yet measured). These steps are identical to the guide cells inside the notebook.

### 2.1 Attach inputs and pick the GPU

Manual set-up in the Kaggle web UI before any cell runs.

- [ ] 2.1.1 On kaggle.com click **Create → New Notebook**, then **File → Import Notebook** and upload `notebooks/lumos_B_train.ipynb`.
- [ ] 2.1.2 Right-hand panel **Add Input → Notebook Output**, search for `lumos_A_fetch` and add its latest successful version.
- [ ] 2.1.3 *(Optional, enables Q2 in 2.16)* **Add Input → Models**, pick an instruct model such as Qwen2.5-7B-Instruct, framework **Transformers**. Its weights must fit in min(30 GB, half the free RAM, 85% of free VRAM).
- [ ] 2.1.4 **Settings → Accelerator: RTX PRO 6000** (Blackwell).
- [ ] 2.1.5 **Settings → Internet: OFF**. The Blackwell GPU is only offered with Internet OFF, and this notebook blocks all network sockets anyway.
- [ ] 2.1.6 Leave **Settings → Environment** on the same image as Notebook A.
- [ ] 2.1.7 Start the session and follow 2.2 to 2.18, or use **Run All**. Do not set `LUMOS_INPUT`, `LUMOS_WORK` or `LUMOS_QUICK` on Kaggle; they are for local tests only.

Check before moving on:

- [ ] The **Input** panel lists Notebook A's output (and the model, if you added one).
- [ ] The Settings panel shows the RTX PRO 6000 accelerator and Internet OFF.

### 2.2 Config and switches

Sets offline variables, run switches, seeds, epochs, time budgets, split years and gate thresholds; finds Notebook A's bundle; creates a new run folder or resumes the latest unfinished one.

- [ ] 2.2.1 For the first real run leave `RUN_XGB`, `RUN_DL`, `RUN_QML` and `RUN_QLLM` all `True`. Set one to `False` only to skip that model.
- [ ] 2.2.2 Budgets in minutes: `XGB_MAX_MINUTES` 120, `DL_MAX_MINUTES` 120, `QLLM_MAX_MINUTES` 90. To change one, edit the default string inside `os.environ.get(...)`.
- [ ] 2.2.3 Change switches or budgets before the first run only: a change starts a fresh run folder instead of resuming.
- [ ] 2.2.4 Run the cell.
- [ ] 2.2.5 Read the log line `Lumos Notebook B B-1.1.0 · run <timestamp> · QUICK_TEST=False · input=/kaggle/input · bundle=... · work=/kaggle/working`.
- [ ] 2.2.6 After a crash, a second Run All shows `(RESUMED)` and `resuming run ...: checkpointed stages [...]`.

Check before moving on:

- [ ] `QUICK_TEST=False`.
- [ ] `bundle=` points to a folder under `/kaggle/input/` ending in `lumos_bundle`.
- [ ] No `WARNING: N bundles found` line (if there is one, remove the extra inputs and run again).

### 2.3 Offline guard and environment probe

Blocks every non-local network connection, records Python, RAM, disk, CPU and package versions, runs a small GPU smoke test and writes `env_B.json`.

- [ ] 2.3.1 Run the cell.
- [ ] 2.3.2 Look for `network guard installed: all non-loopback sockets/DNS are refused`.
- [ ] 2.3.3 Read the printed JSON: `device_selected`, `smoke_test`, `ram` and `disk_work`.
- [ ] 2.3.4 Read the `GPU:` line (name, VRAM, compute capability, CUDA version, bf16 support).

Check before moving on:

- [ ] `"device_selected": "cuda"` and `"smoke_test"` shows `"ok": true`.
- [ ] The `GPU:` line names the RTX PRO 6000 Blackwell.

### 2.4 Verify the bundle

Checks the SHA-256 of every downloaded file, detects the synthetic-fixture markers, and installs PennyLane offline from Notebook A's wheels without touching torch or numpy.

- [ ] 2.4.1 Run the cell.
- [ ] 2.4.2 Read `sources: N entries; checksum ok=..., mismatches=..., missing files=..., unhashed=...`.
- [ ] 2.4.3 Read `SYNTHETIC=... [...]`.
- [ ] 2.4.4 Read `offline pip: {...}` and its `import_check` entry.

Check before moving on:

- [ ] `mismatches=0` and `missing files=0`.
- [ ] `SYNTHETIC=False []` on real data. `True` means the test fixture is attached and every number will be demo data.
- [ ] `import_check` says `pennylane importable` (or you accept the built-in simulator fallback).

### 2.5 Ingest the fire records

Reads every usable FIRMS file, removes exact duplicates, quarantines invalid rows with a reason, assigns each detection to a 5 km cell and UTC month, and counts per satellite (vegetation fires as the main count, static sources such as kilns separately). Checkpointed.

- [ ] 2.5.1 Run the cell.
- [ ] 2.5.2 Watch one line per file: `ingest [  i/N] <id> rows=... quarantined=... last=YYYY-MM-DD ...s · RSS ... GB`.
- [ ] 2.5.3 `skipped (...)` lines are files that were missing or failed 2.4; they stay unavailable, never zero.
- [ ] 2.5.4 If NRT data was fetched, look for `ingest NRT ...: N detections (recent observed layer only; not used for training)`.
- [ ] 2.5.5 Read the closing line `ingested X raw rows; duplicates removed Y; quarantined Z; aggregate rows W` and the quarantine reason counts.

Check before moving on:

- [ ] Quarantined rows are under 1% of raw rows (the fixture had 123 of 141,557).
- [ ] No `INGEST ERROR` lines.
- [ ] RSS stays well below the RAM shown in 2.3.

### 2.6 Grid, panel, features and areas

Marks each country, satellite and month as complete, partial or missing (never zero), builds the cell × month arrays with model features, and assigns cells to Bangladesh and its divisions, Australia and New South Wales, and the United States and California.

- [ ] 2.6.1 Run the cell.
- [ ] 2.6.2 Read `panel <country>: N cells` per country, then `panel: 3 countries, N cells × M months = ... cell-months (2001–2025)`.
- [ ] 2.6.3 Read the `availability <country> <platform>: complete=... partial=[...] missing=...` lines.
- [ ] 2.6.4 A `NOTE: BD-H (Mymensingh) is absent from this Natural Earth file ...` line is expected.
- [ ] 2.6.5 Read `Bangladesh: k cells assigned to the nearest division (≤0.1°), u cells unassigned ...`.
- [ ] 2.6.6 Read one `AOI <id> <kind> <name> cells=...` line per area.

Check before moving on:

- [ ] Aqua lists `2002-07` as partial and S-NPP lists `2012-01` as partial (each satellite's first month).
- [ ] The AOI lines include `BGD`, `BGD-A` …, `AUS`, `AUS-NSW`, `USA` and `USA-CA`, each with cells > 0.
- [ ] Unassigned Bangladesh cells are a small share of `BGD` cells (offshore detections).

### 2.7 Freeze the splits

Holds out 20% of 100 km blocks, labels years train 2013–2020, validation 2021–2022, test 2023–2024 and backcast 2003–2012, writes `split_manifest.json`, and seals the test rows so they can be opened only once.

- [ ] 2.7.1 Run the cell.
- [ ] 2.7.2 Read `split rows: {'train': ..., 'val': ..., 'test': ...}`.

Check before moving on:

- [ ] All three counts are greater than 0.
- [ ] Train is roughly 3 times validation, and validation and test are similar (fixture: 232,776 / 77,112 / 77,112).
- [ ] `runs/<ts>/split_manifest.json` exists.

### 2.8 Baselines B0 and B1

Defines the metrics and fits the simple baselines: B0\_identity (estimate = Aqua count), B0\_ratio (one global ratio), B0\_month\_ratio (one ratio per country and month) and B1 Poisson regression.

- [ ] 2.8.1 Run the cell.
- [ ] 2.8.2 Read `B0 global ratio r = ...`: VIIRS detections per Aqua detection in the training years.
- [ ] 2.8.3 Read `B1 fitted on N rows, n_iter=k, features=...`.
- [ ] 2.8.4 A line `B1 solver newton-cholesky: ... trying next` means the fallback solver was used; fine if B1 then fits.

Check before moving on:

- [ ] `r` is above 1 (VIIRS sees more, smaller fires).
- [ ] `n_iter` is greater than 1 and no `MODEL B1_poisson: failed` line.

### 2.9 XGBoost B2

Trains a Poisson XGBoost model on the GPU for 3 seeds (early stopping, `XGB_MAX_MINUTES` cap) and keeps the best seed.

- [ ] 2.9.1 Run the cell.
- [ ] 2.9.2 Watch `[N] val-poisson-nloglik:...` every 100 rounds.
- [ ] 2.9.3 Read one `B2 seed s: best_it=... val MAE=... dev=... (...s)` line per seed.

Check before moving on:

- [ ] No `xgboost cuda unavailable` line (that means CPU fallback).
- [ ] Three seed lines with similar validation deviance.

### 2.10 PyTorch MLP D1

Trains a Poisson neural network (128-128-64, bf16 on GPU) for 3 seeds with early stopping (`DL_MAX_MINUTES` cap). ONNX export happens in 2.14.

- [ ] 2.10.1 Run the cell.
- [ ] 2.10.2 Watch `D1 seed s epoch e/40: train_loss=... val_dev=...` every 5 epochs.
- [ ] 2.10.3 Read one `D1 seed s: epochs=... val MAE=... dev=...` line per seed.

Check before moving on:

- [ ] `val_dev` falls over the first epochs and there are no `nan` losses.
- [ ] Three seed lines.

### 2.11 Validation gate and selection

Scores every model on 2021–2022. The baseline is the better of B1 and B0\_month\_ratio; another model wins only if at least 10% better without being more than 10% worse on active cells. Builds 80% intervals and writes `selection_frozen.json` before the test years are touched.

- [ ] 2.11.1 Run the cell.
- [ ] 2.11.2 Read `SELECTED (validation only): <model>; gate baseline <model> val AOI-month MAE=...`.
- [ ] 2.11.3 Read the table of `val_cell_MAE`, `val_active_MAE`, `val_AOI_MAE` and `val_dev` per model.

Check before moving on:

- [ ] Every model you trained has a row in the table.
- [ ] `runs/<ts>/selection_frozen.json` exists.
- [ ] Write down the selected model here: \_\_\_\_\_\_\_\_. It is the app's estimator.

### 2.12 Open the test set once

Opens 2023–2024 exactly once, scores every model, measures 80% interval coverage, and sets the release stage (`validated_calibration` only if the chosen model beats both B0 baselines on test with coverage within ±10 points; otherwise `observed_comparison`).

- [ ] 2.12.1 Run the cell once. Do not run it a second time on its own.
- [ ] 2.12.2 Read `TEST SPLIT OPENED at <time> (selection frozen at .../selection_frozen.json)`.
- [ ] 2.12.3 Read `RELEASE STAGE: <stage> — <reason>`.

Check before moving on:

- [ ] On real data the stage is `observed_comparison` or `validated_calibration`, never `ui_prototype`.
- [ ] The reason lists test area-month MAE for the selected model and both B0 baselines, plus coverage (aim: near 0.80).

### 2.13 Backcast and anomalies

Builds each area's monthly series, applies the selected model to make VIIRS-scale estimates from 2003 with 80% intervals, and flags each month high, low, normal or insufficient against the same month in other years.

- [ ] 2.13.1 Run the cell.
- [ ] 2.13.2 Read `backcast summary: {...}`: per area, `est_total_2003_2012`, `aqua_total_2003_2012` and `months_estimated`.

Check before moving on:

- [ ] `months_estimated` is about 109 per area when all Aqua years are available.
- [ ] `est_total_2003_2012` is larger than `aqua_total_2003_2012` (the estimate is on the VIIRS scale).

### 2.14 Export the app bundle

Writes the full app bundle before the research stages (activity records, cell grids, features, weights incl. ONNX with a parity check, model cards, metrics, figures, manifest, checksums) and zips it to `/kaggle/working/lumos_app_bundle.zip`.

- [ ] 2.14.1 Run the cell.
- [ ] 2.14.2 Read `activity records: N; schema errors: 0 (validator: ...)`.
- [ ] 2.14.3 Read `ONNX parity: {...}`.
- [ ] 2.14.4 Lines `cells <aoi> <year>: est cutoff raised to ...` mean a large file was trimmed to its 15 MB budget; expected for large areas.
- [ ] 2.14.4a Cell grids (`cells/<aoi>/<year>.json`) are written for `BGD` and its divisions, `AUS-NSW` and `USA-CA` only; whole-country `AUS` and `USA` have none. B1 feature files (`features/<aoi>/<year>.json`) exist for `BGD`, `AUS-NSW` and `USA-CA`.
- [ ] 2.14.5 Read `app bundle [core (before research stages Q1/Q2)]: ... zip ... MB`.

Check before moving on:

- [ ] `schema errors: 0`.
- [ ] ONNX parity shows `passed` true (unless D1 was skipped).
- [ ] `lumos_app_bundle.zip` exists and is well under 100 MB.

### 2.15 Research: simulated quantum Q1

Trains an 8-qubit, 3-layer simulated quantum circuit on a fixed 4,000-row subset for 3 seeds, cross-checks it against PennyLane, and retrains every classical model on the same subset for a fair comparison. Research only; never the app's estimator.

- [ ] 2.15.1 Run the cell.
- [ ] 2.15.2 Watch `Q1 seed s epoch e/80: val_dev=...` progress lines.
- [ ] 2.15.3 Read one `Q1 seed s: epochs=... val(subset) MAE=... dev=...` line per seed.
- [ ] 2.15.4 Read `Q1 PennyLane cross-check: {...}`.

Check before moving on:

- [ ] Three Q1 seed lines.
- [ ] The cross-check shows a tiny maximum difference (fixture: 5.4e-7), or says PennyLane was not available.
- [ ] No `subset <model> failed` lines (or note which ones).

### 2.16 Research: QLLM Q2

If a local instruct LLM is attached, runs an equal-budget search over Q1 circuit designs: 12 random trials against 12 LLM-proposed trials. The LLM sees only the search space and validation results. Without a model, Q2 is honestly marked skipped.

- [ ] 2.16.1 Run the cell.
- [ ] 2.16.2 Read `Q2 LLM search: {...}` (size cap, free memory, any model too large).
- [ ] 2.16.3 With a model attached, watch `Q2[random] trial t: ...` and `Q2[llm] trial t: ...` lines.
- [ ] 2.16.4 Read the closing line `Q2 status: ...`.

Check before moving on:

- [ ] With a model: `Q2 status: ok`.
- [ ] Without a model: `Q2 status: skipped skipped: no local LLM within the size cap ...` (expected, honest).
- [ ] `too_large` in the search report is empty.

### 2.17 Research results and bundle refresh

Scores Q1, the subset models and the best Q2 designs on a bounded test subset, then rewrites metrics, model cards, manifest, checksums and zip, and marks the run complete.

- [ ] 2.17.1 Run the cell.
- [ ] 2.17.2 Read `app bundle [final (research stages appended)]: ... zip ... MB`.

Check before moving on:

- [ ] That line appears and the zip size is close to the one from 2.14.
- [ ] `runs/<ts>/stages.json` has `"complete": true`.

### 2.18 Final summary and download

Prints one row per model, the subset comparison, the selected model with release stage and reason, the Q2 status, paths, device and blocked network attempts, then shows the figures.

- [ ] 2.18.1 Run the cell and read the summary table.
- [ ] 2.18.2 Read `Selected model (validation only): ... | release stage: ...`.
- [ ] 2.18.3 Read `Device: cuda ... blocked network attempts: 0`.
- [ ] 2.18.4 Look at the figures (time series for BGD, AUS-NSW and USA-CA, plus AUS and USA if present, model comparison, test scatter, QML subset comparison).
- [ ] 2.18.5 Download `lumos_app_bundle.zip` from the **Output** panel now, or commit with **Save Version → Save & Run All**. Interactive session files disappear when the session stops.

Check before moving on:

- [ ] `blocked network attempts: 0`.
- [ ] `Device: cuda`.
- [ ] No HONEST NOTE banner on real data.
- [ ] `lumos_app_bundle.zip` is saved on your computer.

## Phase 3 — Check the results before trusting them

Gate: the bundle passes `check_bundle.py`, the figures look physically sensible, and you have written down the release stage you will claim. About 45 minutes, on your laptop.

### 3.1 Unpack and read the manifest

- [ ] 3.1.1 Unzip `lumos_app_bundle.zip` into a scratch folder (not into the app yet).
- [ ] 3.1.2 Open `manifest.json`. Check `synthetic` is `false`.
- [ ] 3.1.3 Note `snapshot_id`, `release_stage`, `selected_model_id` and the years covered.
- [ ] 3.1.4 Read `release_reason` in full. It must name the test area-month MAE of the selected model and both B0 baselines, plus interval coverage.
- [ ] 3.1.5 Open `sources.json` and confirm no URL contains your MAP\_KEY (it should show `{MAP_KEY}` if NRT ran).

Check before moving on:

- [ ] `release_stage` is `observed_comparison` or `validated_calibration`.

### 3.2 Run the automatic bundle check

- [ ] 3.2.1 In a terminal in the app folder: `python3 notebooks/tests/check_bundle.py <scratch>/lumos_app_bundle` (no `--fixture` flag).
- [ ] 3.2.2 Read the PASS/FAIL list. It checks checksums, schema, missing-vs-zero, browser recompute of B0/B1 and file sizes.
- [ ] 3.2.3 If anything fails, copy the output into Claude Code with: "Explain this check\_bundle failure and fix Notebook B if needed."

Check before moving on:

- [ ] 0 failed.

### 3.3 Look at the figures

- [ ] 3.3.1 Open `figures/timeseries_BGD.png`. The teal estimate should run into the violet VIIRS line around 2012 with no step.
- [ ] 3.3.2 Check Aqua (cyan) sits below VIIRS (violet) almost every month.
- [ ] 3.3.3 Check Bangladesh peaks in its dry season (roughly February–April). If the peak is elsewhere, flag it in 3.5.
- [ ] 3.3.4 Open `figures/timeseries_AUS-NSW.png`. Look for the 2019–20 Black Summer spike in VIIRS. It is a real event and must stay visible.
- [ ] 3.3.4a Open `figures/timeseries_USA-CA.png`. Check the VIIRS line sits above Aqua and the estimate runs into VIIRS around 2012 with no step. Note California's peak months; do not assume them in advance. If a figure for `USA` or `AUS` exists, check the same.
- [ ] 3.3.5 Open `figures/test_scatter_aoi_month.png`. Points should hug the diagonal, with no big group far above or below.
- [ ] 3.3.6 Open `figures/model_comparison.png` and `figures/qml_subset_comparison.png`. Note which model wins and how Q1 compares on the matched subset.

Check before moving on:

- [ ] No visible jump at 2012 in the harmonized series.
- [ ] Black Summer is visible in NSW.
- [ ] California and Bangladesh show no visible jump at 2012 either.

### 3.4 Sanity-check the numbers

- [ ] 3.4.1 From the notebook log (2.8.2), note the global VIIRS/Aqua ratio `r`. Expect several times more VIIRS than Aqua detections; Fu et al. 2020 found MODIS missed most VIIRS fire pixels.
- [ ] 3.4.2 Open `comparison.csv`. Find the test area-month MAE of the selected model, B0\_identity and B0\_month\_ratio.
- [ ] 3.4.3 Check interval coverage on test is between 0.70 and 0.90 for an 80% interval.
- [ ] 3.4.4 Check the active-cell subgroup errors are not much worse than the all-cell errors.
- [ ] 3.4.5 Open `activity/AUS/2016.json`, `activity/USA/2016.json` or any month with a missing source. Missing values must be `null`, never `0`.
- [ ] 3.4.6 Open `runs/<ts>/run_log.json` on Kaggle and note Australia's and the United States' ingest time and peak memory for future runs.

Check before moving on:

- [ ] Ratio, MAE and coverage are written into this doc.

### 3.5 Decide what you will claim

- [ ] 3.5.1 If `validated_calibration`: you may say "calibrated MODIS to VIIRS scale, tested on 2023–2024 held-out data", quoting the MAE and coverage.
- [ ] 3.5.2 If `observed_comparison`: say "we show both sensors side by side; our calibration did not beat a simple ratio on held-out years". This is a legitimate, honest result.
- [ ] 3.5.3 Never claim true fire counts, burned area or a quantum advantage.
- [ ] 3.5.4 Note Q2's status (ok or skipped) for the pitch.

### 3.6 If the results look wrong

- [ ] 3.6.1 Too few cells or many `missing` files: re-check Phase 1's summary table, then re-run Notebook A.
- [ ] 3.6.2 Coverage far from 0.80: ask Claude Code to review the interval method in Notebook B section 2.11.
- [ ] 3.6.3 Out of memory on Australia or the United States: set `RUN_QML = False` first, then ask Claude Code to cap that country's panel.
- [ ] 3.6.4 Any re-run: change one thing at a time and record it in this doc.

## Phase 4 — Load real data into the app with Claude Code

Gate: the app runs locally on the real snapshot, the DEMO label is gone, and all tests pass. About 1–2 hours.

### 4.1 Open the project in Claude Code

- [ ] 4.1.1 Copy `lumos_app_bundle.zip` into the app folder root.
- [ ] 4.1.2 Open a terminal in the app folder and start Claude Code (`claude`).
- [ ] 4.1.3 Paste: "Read CLAUDE\_CODE\_MASTER\_PROMPT.md, PRD.md, CONTRACT.md and STATUS.md. Summarise the current state in 10 lines and wait."
- [ ] 4.1.4 Check the summary mentions the two routes (landing and workspace) and the synthetic sample snapshot.

### 4.2 Import the real bundle

- [ ] 4.2.1 Paste: "Run `node scripts/import_bundle.mjs lumos_app_bundle.zip`. Show me the output."
- [ ] 4.2.2 Confirm the import verified the checksums and schema and set the new snapshot as default.
- [ ] 4.2.3 If it refuses because the snapshot exists, ask it to re-run with `--replace`.
- [ ] 4.2.4 Paste: "Keep the synthetic snapshot available for tests but make the real snapshot the default."
- [ ] 4.2.5 Commit: "Commit with message 'import real snapshot \<id>'."

Check before moving on:

- [ ] `apps/web/public/data/index.json` lists the real snapshot as default.

### 4.3 Look at it

- [ ] 4.3.1 Run `npm run dev` and open http://localhost:5173.
- [ ] 4.3.2 Landing: the DEMO DATA label is gone, the globe shows real hotspots, and the hero numbers changed.
- [ ] 4.3.3 Scroll the story. The 2012-jump chart now uses real Bangladesh data.
- [ ] 4.3.4 Gallery: each card's peak month matches what you saw in 3.3.
- [ ] 4.3.5 Open the workspace. The release-stage label matches the manifest.
- [ ] 4.3.6 Select Bangladesh, March of a recent year. Check the evidence drawer's numbers against `activity/BGD/<year>.json`.
- [ ] 4.3.7 Turn on **Harmonize in your browser**. The parity badge must pass.
- [ ] 4.3.8 Select New South Wales, December 2019. The Black Summer spike shows in the calendar and chart.
- [ ] 4.3.8a Select California (`USA-CA`) and a recent year. Check the evidence drawer's numbers against `activity/USA-CA/<year>.json`. Then select the whole `USA` and confirm it shows the country calendar and chart but no 5 km cell map layer.
- [ ] 4.3.9 Export CSV and Print brief once; check they carry the new snapshot id.
- [ ] 4.3.10 Open Models: the comparison table shows real metrics; QML is labelled research.

### 4.4 Run every test on real data

- [ ] 4.4.1 Paste: "Run npm test, npm run build and npm run e2e. Fix only tests that assumed the synthetic fixture, keep a fixture project for them, and report anything else as a bug."
- [ ] 4.4.2 Review its list of changed tests before accepting.
- [ ] 4.4.3 Paste: "Measure first-load transfer for the landing and the workspace on the real snapshot, and the largest data file. Report against PRD §8 PERF-01."
- [ ] 4.4.4 If any cells file exceeds 15 MB, ask it to raise the cutoff in Notebook B 2.14 and note it.

Check before moving on:

- [ ] Unit, build and e2e all green.
- [ ] First view under 5 MB compressed.

### 4.5 Update copy that depended on synthetic data

- [ ] 4.5.1 Paste: "Search the landing and explainer copy for wording that only made sense with synthetic data and update it from the real manifest and metrics. Never hard-code numbers."
- [ ] 4.5.2 If release stage is `observed_comparison`, ask it to make sure the hero and honesty section say so plainly.
- [ ] 4.5.3 Commit.

## Phase 5 — Review loops and polish

Gate: one full review loop on the real-data build closes with no high or medium findings open. About 2–4 hours, mostly agent time.

### 5.1 Fix the known small issues

- [ ] 5.1.1 Paste: "Fix review\_exp/RESOLUTION.md open item L3: the landing route should not download the workspace chunk until the user heads to the workspace (prefetch on CTA hover is fine)."
- [ ] 5.1.2 Paste: "Fix open item L4: re-read layout breakpoints on resize and orientation change."
- [ ] 5.1.3 Paste: "Make notebooks/tests/test\_notebook\_A.py run from the repo layout and add the fixture generator path."
- [ ] 5.1.4 Run `npm test && npm run build && npm run e2e`. Commit.

### 5.2 Run the review team (Claude Code subagents)

- [ ] 5.2.1 Paste: "Spawn three subagents in parallel, read-only: a code reviewer (bugs, honesty, a11y), a watchdog (hung processes, render loops, hangs) and an e2e verifier (desktop, tablet, 360 px mobile). Each writes a report in review\_real/."
- [ ] 5.2.2 Add: "Also start a monitor that checks every 2 minutes whether each subagent is still writing files, and flags any silent for 10 minutes."
- [ ] 5.2.3 When reports arrive, paste: "Spawn a resolver subagent to fix all high and medium findings and cheap lows, then re-run every test. Max 3 attempts per item; document anything left open."
- [ ] 5.2.4 Read `review_real/RESOLUTION.md` yourself. Reject any fix that hides data or softens an honesty label.
- [ ] 5.2.5 Commit.

Check before moving on:

- [ ] No high or medium findings open.

### 5.3 Design polish

- [ ] 5.3.1 Paste: "Take screenshots at 1440, 820 and 390 px of hero, story, gallery, index, workspace and drawer, and critique them like an Awwwards juror. List the top 5 improvements."
- [ ] 5.3.2 Accept only improvements that keep: no pill shapes, Lucide 3D icons, strong data colours, no fake counters.
- [ ] 5.3.3 Check every icon-only button has a label (screen reader) and every state symbol reads in greyscale.
- [ ] 5.3.4 Check reduced motion: enable it in your OS and confirm the landing becomes static and transitions are instant.
- [ ] 5.3.5 Commit.

### 5.4 Real-device testing

- [ ] 5.4.1 Run `npm run build && npm run preview -- --host` and note the network URL.
- [ ] 5.4.2 On your Android phone (same Wi-Fi), open that URL in Chrome. Scroll the whole landing; note any stutter.
- [ ] 5.4.3 On an iPhone or iPad, open it in Safari. Check the sticky sections, the hero height and the bottom tabs.
- [ ] 5.4.4 On a Windows or Mac laptop, test Chrome, Edge and Safari.
- [ ] 5.4.5 Write any device bug into this doc with the device, browser and a screenshot, then ask Claude Code to fix it.

Check before moving on:

- [ ] Landing and workspace work on at least one Android and one iOS device.

## Phase 6 — Deploy free and install on every device

Gate: a public GitHub Pages URL that installs as an app on Windows, macOS, Android and iOS. About 1 hour.

### 6.1 Prepare the repository

- [ ] 6.1.1 On github.com create a new **public** repository, for example `lumos-fire-calendar`.
- [ ] 6.1.2 Paste into Claude Code: "Check that no secrets, MAP\_KEYs, registration screenshots or raw FIRMS archives are in the repo or dist. Report file sizes over 10 MB."
- [ ] 6.1.3 Paste: "Add the GitHub remote \<your repo URL> and push main."
- [ ] 6.1.4 Paste: "Add a GitHub Actions workflow that builds with BASE\_PATH=/lumos-fire-calendar/ and deploys dist to GitHub Pages."
- [ ] 6.1.5 On GitHub: **Settings → Pages → Source: GitHub Actions**.

### 6.2 Deploy and verify

- [ ] 6.2.1 Push; wait for the Actions run to turn green.
- [ ] 6.2.2 Open `https://<user>.github.io/lumos-fire-calendar/`. The landing loads.
- [ ] 6.2.3 Click into the workspace and back. Deep links like `#aoi=BGD&y=2016&m=3` work.
- [ ] 6.2.4 Open DevTools → Network: no 404s for data files.
- [ ] 6.2.5 DevTools → Application: the manifest and service worker are registered.
- [ ] 6.2.6 Turn on airplane mode, reload: the visited areas still work; unvisited ones say not cached.
- [ ] 6.2.7 Paste: "Run the e2e suite against the live URL (read-only)."

### 6.3 Install as an app

- [ ] 6.3.1 Windows or macOS, Chrome or Edge: the install icon in the address bar → Install.
- [ ] 6.3.2 macOS Safari: **File → Add to Dock**.
- [ ] 6.3.3 Android Chrome: menu → **Install app** (or Add to Home screen).
- [ ] 6.3.4 iOS Safari: **Share → Add to Home Screen**.
- [ ] 6.3.5 Open each installed app once offline to confirm the shell loads.

Check before moving on:

- [ ] Installed and working on all four platforms.

## Phase 7 — Space Apps submission and pitch

Gate: submission filed before the deadline with the live link, code link, video and NASA data sources. Spread over the event weekend.

### 7.1 Before the event window

- [ ] 7.1.1 Re-read the organizer's answer on reusing preparation work (0.3.2) and follow it exactly.
- [ ] 7.1.2 If preparation work may not be entered, plan to rebuild during the event from this runbook; the notebooks and PRD make that fast.
- [ ] 7.1.3 Register the team and challenge on the Space Apps site if not done.

### 7.2 Write the project page

- [ ] 7.2.1 One-sentence summary: "Lumos puts NASA's MODIS and VIIRS fire records on one fair scale and shows each place's burning calendar, with honest error bars."
- [ ] 7.2.2 Problem: the 2012 jump caused by the sharper VIIRS camera (two-camera analogy).
- [ ] 7.2.3 What we built: the calendar workspace, the harmonized series, the 3D story, offline install on every device.
- [ ] 7.2.4 Results: the release stage, test MAE against baselines, interval coverage (from Phase 3).
- [ ] 7.2.5 Limits: not fire counts, not burned area, cloud gaps unknown, Mymensingh boundary.
- [ ] 7.2.6 NASA data used: FIRMS MODIS C6.1 and VIIRS 375 m S-NPP (country yearly files); Natural Earth boundaries.
- [ ] 7.2.7 Research extras: simulated QML and QLLM compared fairly against classical models, no advantage claimed.
- [ ] 7.2.8 Credits: M. Al Shahriar Hameem, Team Lumos, Dhaka (plus any teammates).

### 7.3 Record the demo video

- [ ] 7.3.1 Follow the 4-minute outline in PRD v1 §11 (two-camera problem → Bangladesh calendar → compare sensors → calibration and held-out result → NSW and California, mobile, offline → limits and next step).
- [ ] 7.3.2 Record the landing scroll at 1440 px with reduced motion OFF.
- [ ] 7.3.3 Show the workspace on a phone, installed as an app.
- [ ] 7.3.4 Show the Harmonize-in-your-browser parity badge (proof the trained weights are live).
- [ ] 7.3.5 Keep it within the length limit from 0.3.3. Add captions.
- [ ] 7.3.6 Prepare a 30-second version for the local pitch.

### 7.4 Submit

- [ ] 7.4.1 Paste the live URL, the GitHub link, the video link and the project text.
- [ ] 7.4.2 Open every link in a private window to confirm it is public.
- [ ] 7.4.3 Submit before the deadline; screenshot the confirmation.
- [ ] 7.4.4 Tag the repo: "Create a git tag `space-apps-2026-submission` and push it."

### 7.5 Pitch day

- [ ] 7.5.1 Install the app on the demo laptop and phone the night before; load Bangladesh, NSW and California once so they are cached.
- [ ] 7.5.2 Test the venue Wi-Fi; if it fails, demo offline.
- [ ] 7.5.3 Prepare answers: why not just multiply by a ratio (we tested that; it is our baseline), how do you handle clouds (we don't claim to), why Bangladesh (kilns and crop burning season).
- [ ] 7.5.4 Rehearse the 4-minute and 30-second versions twice with a timer.

## Phase 8 — Troubleshooting and after the event

### 8.1 Fixes for common problems

| Where | Symptom | Fix |
| --- | --- | --- |
| 1.1 | Internet toggle greyed out | Verify your phone number on Kaggle |
| 1.6 | Many `HTTP 429` lines | Normal waiting; if the back-off budget runs out, re-run the cell later (cached files are reused) |
| 1.6 | `HTTP 403; stopping all requests` | FIRMS refused this session; wait an hour, then re-run |
| 1.6 | `error` for one file | Re-run the cell; only failed files are fetched again |
| 1.9 | `wheel FAILED pennylane` | Fine: Notebook B uses its built-in quantum simulator |
| 2.1 | Blackwell not offered | Internet must be OFF; check your GPU quota |
| 2.2 | `WARNING: N bundles found` | Remove the extra inputs, keep one Notebook A version |
| 2.3 | `device_selected: cpu` | GPU smoke test failed; the run continues on CPU with capped models (slower) |
| 2.4 | `SYNTHETIC=True` | You attached the test fixture; attach Notebook A's real output instead |
| 2.4 | Checksum mismatches | Re-commit Notebook A and re-attach the new version |
| 2.5–2.6 | Kernel dies (out of memory) | Re-run all: it resumes from checkpoints. If it repeats, set `RUN_QML = False` |
| 2.9 | `xgboost cuda unavailable` | CPU fallback with a capped sample; acceptable |
| 2.16 | Q2 skipped | Attach a Transformers instruct model under the size cap, or accept skipped |
| Any | Session timed out at 12 h | Start a new session and Run All; finished stages resume |
| 3.2 | `check_bundle.py` fails | Paste the output to Claude Code |
| 4.2 | Import refused | Read the reason; schema version or checksum problems mean re-export from Notebook B |
| 5.4 | Stutter on a phone | Ask Claude Code to lower the phone quality tier for that device |
| 6.2 | 404s on GitHub Pages | BASE\_PATH must match the repo name |

### 8.2 Keep agents from getting stuck

- [ ] 8.2.1 For any long Claude Code task, ask for a 2-minute progress monitor that flags subagents silent for 10 minutes.
- [ ] 8.2.2 Give every subagent clear file ownership so two agents never edit the same file.
- [ ] 8.2.3 Cap repairs at 3 attempts per item; then document and move on.
- [ ] 8.2.4 After each loop, ask for the test totals and read the RESOLUTION file yourself.

### 8.3 After the event

- [ ] 8.3.1 Add more countries (India, Myanmar) in Notebook A 1.2.1 and retrain to test whether the calibration transfers.
- [ ] 8.3.2 Add a coverage-aware correction using valid-observation masks (needed before any "fire occurrence" claim).
- [ ] 8.3.3 Add NOAA-20 and NOAA-21 VIIRS as separate observed layers.
- [ ] 8.3.4 Add the Bangla interface (PRD P1).
- [ ] 8.3.5 Run the ONNX MLP in the browser (PRD P2).
- [ ] 8.3.6 Write a short paper or blog post on the honest-harmonization method, citing Fu et al. 2020 and Zheng et al. 2026.
