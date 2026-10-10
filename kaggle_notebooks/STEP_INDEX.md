# Lumos Fire Calendar — step index

Every section with its steps and checks, exactly as written in the notebook guide cells (generated from the same text; if you change a guide cell, change this file too).

- Phase 1 = `notebooks/lumos_A_fetch.ipynb` (Kaggle, Internet ON, CPU or T4)
- Phase 2 = `notebooks/lumos_B_train.ipynb` (Kaggle, RTX PRO 6000 Blackwell, Internet OFF)
- Phase 3 = check the results (last cell of Notebook B)

## Phase 1 — Notebook A: fetch the data bundle

| Section | Cell | What it does | Est. time |
|---|---|---|---|
| 1.1 Create and configure the Kaggle notebook | manual | Manual: new notebook, import, Internet ON, CPU or T4, optional secret | 5 min |
| 1.2 Config | 1 | Countries, years, downloader limits, output folder | < 1 s |
| 1.3 Helpers | 2 | Imports, expected headers, logger with key redaction | < 5 s |
| 1.4 Polite downloader | 3 | Download engine: retries, back-off budget, circuit breaker, stall guard, cache | < 1 s |
| 1.5 Plan the downloads | 4 | Job lists and manifest read/write | < 1 s |
| 1.6 Download FIRMS country archives | 5 | Download 117 FIRMS yearly CSVs (default config) | 8–40 min |
| 1.7 Optional recent NRT data | 6 | Optional last 10 days of NRT detections (needs MAP_KEY) | < 1 s / ~1 min |
| 1.8 Boundaries | 7 | Natural Earth countries and admin-1 boundaries | < 2 min |
| 1.9 Offline wheelhouse | 8 | Download wheels for offline install in Notebook B | 1–5 min |
| 1.10 Manifests and README | 9 | Write sources.json, env_A.json, config_A.json, README_bundle.md | < 10 s |
| 1.11 Summary table | 10 | Table of every file's status and row count | < 5 s |
| 1.12 Final check and Save Version | 11 | Folder sizes, key leak check, then Save Version | < 1 min + commit run |

### Phase 1 · Section 1.1 — Create and configure the Kaggle notebook  (manual, notebook intro)
**What this step does:** Manual set-up in the Kaggle web UI before any cell runs. Nothing is executed.

**Steps**

- [ ] 1.1.1 On kaggle.com click **Create → New Notebook**.
- [ ] 1.1.2 In the editor, **File → Import Notebook** and upload `notebooks/lumos_A_fetch.ipynb`. Rename the notebook `lumos_A_fetch` (Notebook B's instructions use this name).
- [ ] 1.1.3 Right-hand panel **Settings → Internet: ON** (Kaggle only allows this on a phone-verified account).
- [ ] 1.1.4 **Settings → Accelerator: None** (CPU) or **GPU T4**. No GPU is needed here.
- [ ] 1.1.5 Leave **Settings → Environment** on the default (latest) image. Notebook B must use the same image, or the offline wheels may not install.
- [ ] 1.1.6 *(Optional, only for recent near-real-time data)* **Add-ons → Secrets → Add a new secret** named `FIRMS_MAP_KEY` with your free FIRMS MAP_KEY, and tick it for this notebook. Then set `FETCH_API_NRT = True` in 1.2.
- [ ] 1.1.7 Start the session (the power button, or run the first cell) and follow 1.2 to 1.12 cell by cell, or use **Run All**.

**Check before moving on**

- [ ] The Settings panel shows Internet ON and the accelerator you chose.
- [ ] The notebook shows 24 cells: this intro, a guide cell above each of the 11 code cells, and the Next phase cell at the end.

**If it fails:** If the Internet toggle is greyed out, verify your phone number in Kaggle account settings. If Import Notebook fails, create the notebook with **File → Upload Notebook** instead.

**Time:** estimate: 5 min

### Phase 1 · Section 1.2 — Config  (cell 1)
**What this cell does:** Sets the countries, year ranges, politeness limits for the downloader and the output folder (`/kaggle/working/lumos_bundle`). It only defines settings and prints nothing.

**Steps**

- [ ] 1.2.1 Check `COUNTRIES` (default Bangladesh, Australia and United_States; a space in a name becomes an underscore). Leave `EXTRA_COUNTRIES = []` unless you were asked to add training countries; each extra country adds download time.
- [ ] 1.2.2 Leave `MODIS_YEARS` (2001–2025) and `VIIRS_YEARS` (2012–2025) as they are.
- [ ] 1.2.3 Set `FETCH_API_NRT = True` only if you added the `FIRMS_MAP_KEY` secret in 1.1.6. Otherwise leave it `False`.
- [ ] 1.2.4 Leave `TRY_NOAA20 = False` (that FIRMS folder is unverified; it would only log 404s).
- [ ] 1.2.5 Leave the politeness settings (`MAX_WORKERS = 4`, `MAX_RETRIES = 3`, `BACKOFF_BUDGET_S`, `CIRCUIT_BREAKER_N`, `FILE_DEADLINE_S`) unless FIRMS is rate-limiting you heavily.
- [ ] 1.2.6 Run the cell. Do not set any `LUMOS_*` environment variables on Kaggle; they are for local tests only.

**Check before moving on**

- [ ] The cell finishes with no output and no error.

**If it fails:** A `SyntaxError` means an edit broke a list or a quote. Compare your edit with the defaults above it and run the cell again.

**Time:** estimate: under 1 s

### Phase 1 · Section 1.3 — Helpers  (cell 2)
**What this cell does:** Imports the libraries and defines the expected FIRMS CSV headers, the two Natural Earth file names, rough country boxes for the optional Area API, a timestamped logger that hides the MAP_KEY, and a SHA-256 helper. Nothing is downloaded.

**Steps**

- [ ] 1.3.1 Run the cell.
- [ ] 1.3.2 Note that every later log line starts with `[   12.3s]`, the seconds since this cell ran.

**Check before moving on**

- [ ] No `ImportError` (in particular for `requests`).

**If it fails:** An `ImportError` means the image is unusual. Make sure the environment is the default Kaggle image (1.1.5), restart the session and run 1.2 and 1.3 again.

**Time:** estimate: under 5 s

### Phase 1 · Section 1.4 — Polite downloader  (cell 3)
**What this cell does:** Defines the download engine: one HTTP session per worker thread, retries that respect `Retry-After`, a global back-off budget, a per-host circuit breaker, a stall guard for streams that trickle, header and GeoJSON validation, atomic rename of finished files, and a cache that reuses files whose SHA-256 still matches the manifest. Nothing is downloaded yet.

**Steps**

- [ ] 1.4.1 Run the cell.
- [ ] 1.4.2 Know the behaviour you will see later: a 404 is recorded as `missing`, a 401 or 403 stops all requests to that host, and 429 or 5xx responses are retried up to `MAX_RETRIES` times.
- [ ] 1.4.3 A file whose first line is not the expected FIRMS header (for example an HTML error page) is rejected and recorded as `error`.

**Check before moving on**

- [ ] The cell finishes with no output and no error.

**If it fails:** An error here almost always means 1.2 or 1.3 was not run first. Run them, then this cell again.

**Time:** estimate: under 1 s

### Phase 1 · Section 1.5 — Plan the downloads  (cell 4)
**What this cell does:** Defines the job lists (FIRMS yearly country files, the optional Area API requests, the two Natural Earth files) and the functions that read and write `manifests/sources.json`. Nothing is downloaded yet.

**Steps**

- [ ] 1.5.1 Run the cell.
- [ ] 1.5.2 For reference, each FIRMS file comes from `https://firms.modaps.eosdis.nasa.gov/data/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv` and is saved under `lumos_bundle/raw/firms_country/<sensor>/<year>/`.

**Check before moving on**

- [ ] The cell finishes with no output and no error.

**If it fails:** Run 1.2 to 1.4 first, then this cell again.

**Time:** estimate: under 1 s

### Phase 1 · Section 1.6 — Download FIRMS country archives  (cell 5)
**What this cell does:** Downloads every FIRMS yearly country CSV (MODIS 2001–2025 and VIIRS S-NPP 2012–2025 for each country) with bounded concurrency, validates each file, and writes `manifests/sources.json` every `MANIFEST_EVERY_N` files and at the end. Files already downloaded in an earlier run of this session are reused if their SHA-256 matches.

**Steps**

- [ ] 1.6.1 Run the cell. The first lines show the Python version, the bundle path and the FIRMS and Natural Earth base URLs.
- [ ] 1.6.2 Look for `FIRMS country archives: 117 files, 4 workers` (3 countries × (25 MODIS + 14 VIIRS) years with the default config).
- [ ] 1.6.3 Watch the per-file lines `[  i/117] ok|missing|error <id> <rows> <MB> <note>`. Ids use the underscore name, for example `modis_2020_United_States`. The Australia and United_States files are the largest and take longest.
- [ ] 1.6.4 Lines like `HTTP 429 for ... retry 1/3 in 12.0s` are normal: the downloader is waiting as FIRMS asked.
- [ ] 1.6.5 If you see `circuit breaker` or `HTTP 403; stopping all requests`, the remaining files from that host are recorded as `error` with a `skipped: host ... refused earlier` note.
- [ ] 1.6.6 Wait for the closing line `FIRMS country archives: done in ...s (ok=..., missing=..., error=...)`.

**Check before moving on**

- [ ] The closing line shows `error=0`.
- [ ] `missing` appears only for files FIRMS really does not have (a 404). They are recorded as missing, never filled with zeros.
- [ ] Any 2025 file that FIRMS has not filled yet shows `ok`, `0 rows` and the note `header-only file (0 data rows)`. That is expected.
- [ ] `/kaggle/working/lumos_bundle/manifests/sources.json` exists (Output panel on the right).

**If it fails:** For `error` rows caused by 429, 5xx, timeouts or a tripped circuit breaker, wait a few minutes and run this cell again: good files are reused (note `cached`) and only the failed ones are fetched. For 403, check that Internet is ON. A disk-full error is recorded per file and the run keeps going.

**Time:** estimate: 8–40 min (depends on FIRMS speed; United_States file sizes are known but its download time is unmeasured; real data not yet tested)

### Phase 1 · Section 1.7 — Optional recent NRT data  (cell 6)
**What this cell does:** Only when `FETCH_API_NRT = True` and a MAP_KEY is found: downloads the last `API_NRT_DAYS` days (default 10) of near-real-time VIIRS and MODIS detections from the FIRMS Area API, in requests of at most 5 days. Otherwise it logs that the step is off. The key is never printed or saved.

**Steps**

- [ ] 1.7.1 Run the cell.
- [ ] 1.7.2 Default setting: look for `Area API (NRT) disabled (FETCH_API_NRT=False).` and move on.
- [ ] 1.7.3 With the secret: look for `FIRMS MAP_KEY found (value hidden). Fetching recent NRT detections.` followed by `FIRMS Area API (NRT): ... files` and a `done` line.

**Check before moving on**

- [ ] One of the two messages above appears.
- [ ] If NRT ran, the manifest URLs show `{MAP_KEY}` instead of the key.

**If it fails:** `FETCH_API_NRT=True but no FIRMS_MAP_KEY secret/env found` means the secret is not attached: **Add-ons → Secrets**, tick `FIRMS_MAP_KEY` for this notebook and run the cell again. Or set `FETCH_API_NRT = False`; Notebook B works without NRT data.

**Time:** estimate: under 1 s when off; about 1 min when on

### Phase 1 · Section 1.8 — Boundaries  (cell 7)
**What this cell does:** Downloads the two Natural Earth GeoJSON files (world countries; states and provinces) into `lumos_bundle/context/` and checks that each is a valid FeatureCollection.

**Steps**

- [ ] 1.8.1 Run the cell.
- [ ] 1.8.2 Look for `Natural Earth boundaries: 2 files, 4 workers`, then two `ok` lines with a feature count in the rows column.

**Check before moving on**

- [ ] The closing line shows `ok=2, missing=0, error=0`.

**If it fails:** Run the cell again (it reuses anything already downloaded). Do not move on without these files: Notebook B needs them for the region polygons and the Bangladesh division, New South Wales and California areas.

**Time:** estimate: under 2 min

### Phase 1 · Section 1.9 — Offline wheelhouse  (cell 8)
**What this cell does:** Runs `pip download --only-binary=:all:` for PennyLane, PennyLane-Lightning, ONNX and onnxscript (plus XGBoost if it is not installed), one package at a time, into `lumos_bundle/wheelhouse/`. Notebook B installs these with the internet off.

**Steps**

- [ ] 1.9.1 Run the cell. Look for `Wheelhouse: downloading [...] for Python 3.x.y`.
- [ ] 1.9.2 Watch one line per package: `wheel ok <name>` or `wheel FAILED <name>`.
- [ ] 1.9.3 Read the closing line `Wheelhouse: N wheel files, X MB`.

**Check before moving on**

- [ ] `pennylane` and `pennylane-lightning` show `wheel ok`.
- [ ] The wheel count is greater than 0.

**If it fails:** Run the cell again to retry a failed package. If PennyLane still fails, Notebook B still runs: its quantum stage (2.15) falls back to the built-in torch simulator and skips the PennyLane cross-check.

**Time:** estimate: 1–5 min

### Phase 1 · Section 1.10 — Manifests and README  (cell 9)
**What this cell does:** Writes `manifests/sources.json` (one record per requested file), `manifests/env_A.json` (Python version, packages, GPU, wheelhouse result), `manifests/config_A.json` (the settings used) and a readable `README_bundle.md`.

**Steps**

- [ ] 1.10.1 Run the cell.
- [ ] 1.10.2 Look for `Wrote manifests/sources.json, env_A.json, config_A.json, README_bundle.md`.
- [ ] 1.10.3 Note the Python version in that README (also in `env_A.json`). Notebook B must run on the same version.

**Check before moving on**

- [ ] All four files exist under `/kaggle/working/lumos_bundle/`.

**If it fails:** Usually a disk or permission problem in `/kaggle/working`. Check free disk in the session panel, then run the cell again.

**Time:** estimate: under 10 s

### Phase 1 · Section 1.11 — Summary table  (cell 10)
**What this cell does:** Prints a table of every FIRMS country file (rows: sensor and year; columns: country; cells: `ok <rows>`, `missing` or `error`), then the count of all records by status and the note for every error.

**Steps**

- [ ] 1.11.1 Run the cell.
- [ ] 1.11.2 Scan the table column by column. MODIS should be `ok` for 2001–2025 and VIIRS S-NPP for 2012–2025.
- [ ] 1.11.3 Read `All records by status: {...}` and any `ERROR <id> - <note>` lines below it.

**Check before moving on**

- [ ] The table has no `error` cells.
- [ ] `missing` cells are only years FIRMS does not publish. Write down any you see.

**If it fails:** For `error` cells, run 1.6 again (good files are reused), then 1.7 to 1.11. If an error remains after two tries, note the id and the reason; Notebook B treats it exactly like a missing year (unknown, not zero).

**Time:** estimate: under 5 s

### Phase 1 · Section 1.12 — Final check and Save Version  (cell 11)
**What this cell does:** Prints the size of each top-level folder in the bundle, scans every file for the MAP_KEY (any file that contains it is deleted), removes leftover partial downloads and logs the final instruction. There is no zip: Kaggle keeps `/kaggle/working` as the notebook output.

**Steps**

- [ ] 1.12.1 Run the cell and read the folder sizes (`raw`, `context`, `wheelhouse`, `manifests`, `README_bundle.md`).
- [ ] 1.12.2 Look for `key leak check: passed`.
- [ ] 1.12.3 Look for the last line `Done. Outputs are files under /kaggle/working/lumos_bundle (no zip). Now: Save Version -> 'Save & Run All'.`
- [ ] 1.12.4 Click **Save Version** (top right) → choose **Save & Run All (Commit)** → **Save**. The committed version runs the whole notebook again in a fresh session, so it downloads everything again; that is expected.
- [ ] 1.12.5 Wait until the version shows as finished successfully (bottom-left version status, or the notebook's **Versions** list).
- [ ] 1.12.6 Open that version and its **Output** tab, and confirm `lumos_bundle/` is listed.

**Check before moving on**

- [ ] `key leak check: passed`.
- [ ] `raw` is the largest folder and `context` is not empty.
- [ ] The committed version's Output tab shows `lumos_bundle/manifests/sources.json`.

**If it fails:** `key leak check: FAILED (offending files removed)` should never happen. Run 1.6 to 1.12 again so the removed files are downloaded again, then commit. If the committed version fails, open its log, fix the cause (usually FIRMS errors) and commit again.

**Time:** estimate: under 1 min for the cell; the commit run takes about as long as the whole notebook (estimate 10–30 min)

### Next phase: Phase 2 — Train in Notebook B

**Check before you continue**

- [ ] The committed version of this notebook finished successfully (see **Versions**).
- [ ] Its **Output** tab lists `lumos_bundle/manifests/sources.json`.
- [ ] The summary table (1.11) had no `error` cells, or you wrote down each remaining one.
- [ ] `key leak check: passed` (1.12).
- [ ] You noted the Python version from `README_bundle.md`; Notebook B must use the same Kaggle environment.
- [ ] The wheelhouse has PennyLane wheels (1.9), or you accept that Q1 uses the built-in simulator.
- [ ] Now open `notebooks/lumos_B_train.ipynb` and start at **Phase 2 · Section 2.1** in its first cell.

## Phase 2 — Notebook B: train and export

| Section | Cell | What it does | Est. time |
|---|---|---|---|
| 2.1 Attach inputs and pick the GPU | manual | Manual: import, add A's output (+ optional model), RTX PRO 6000, Internet OFF | 5 min |
| 2.2 Config and switches | 1 | Switches, budgets, locate A's bundle, create or resume the run folder | < 10 s |
| 2.3 Offline guard and environment probe | 2 | Block the network, probe RAM/disk/GPU, torch smoke test | < 1 min |
| 2.4 Verify the bundle | 3 | SHA-256 check of every file, synthetic detection, offline PennyLane install | 1–3 min |
| 2.5 Ingest the fire records | 4 | Clean, quarantine and aggregate detections to 5 km cell × month | 5–15 min |
| 2.6 Grid, panel, features and areas | 5 | Availability rules, cell × month feature panel, areas of interest | 2–10 min |
| 2.7 Freeze the splits | 6 | Train/val/test years, 20% spatial holdout, sealed test vault | < 1 min |
| 2.8 Baselines B0 and B1 | 7 | Metrics; B0 ratio baselines; B1 Poisson regression | 2–10 min |
| 2.9 XGBoost B2 | 8 | Poisson XGBoost, 3 seeds, wall-clock capped | 5–30 min |
| 2.10 PyTorch MLP D1 | 9 | Poisson MLP, 3 seeds, wall-clock capped | 5–30 min |
| 2.11 Validation gate and selection | 10 | Score on validation, apply the gate, freeze the selection | < 3 min |
| 2.12 Open the test set once | 11 | One-time test evaluation, interval coverage, release stage | < 2 min |
| 2.13 Backcast and anomalies | 12 | 2003–2012 VIIRS-scale estimate, intervals, anomaly flags | < 5 min |
| 2.14 Export the app bundle | 13 | Write and zip the app bundle (before research stages) | 2–10 min |
| 2.15 Research: simulated quantum Q1 | 14 | Research: simulated variational quantum regressor on a 4,000-row subset | 5–20 min |
| 2.16 Research: QLLM Q2 | 15 | Research: LLM-guided vs random search over Q1 designs (needs a local model) | < 1 min / 20–90 min |
| 2.17 Research results and bundle refresh | 16 | Research scores on a test subset; refresh bundle metrics and zip | < 3 min |
| 2.18 Final summary and download | 17 | Summary table, release stage, figures, download the zip | < 1 min |

### Phase 2 · Section 2.1 — Attach inputs and pick the GPU  (manual, notebook intro)
**What this step does:** Manual set-up in the Kaggle web UI before any cell runs. Nothing is executed.

**Steps**

- [ ] 2.1.1 On kaggle.com click **Create → New Notebook**, then **File → Import Notebook** and upload `notebooks/lumos_B_train.ipynb`.
- [ ] 2.1.2 Right-hand panel **Add Input → Notebook Output**, search for your Notebook A (`lumos_A_fetch`) and add its latest successful version.
- [ ] 2.1.3 *(Optional, enables Q2 in 2.16)* **Add Input → Models**, pick an instruct model such as Qwen2.5-7B-Instruct, framework **Transformers**. Its weights must fit in min(30 GB, half the free RAM, 85% of free VRAM).
- [ ] 2.1.4 **Settings → Accelerator: RTX PRO 6000** (Blackwell).
- [ ] 2.1.5 **Settings → Internet: OFF**. The Blackwell GPU is only offered with Internet OFF, and this notebook blocks all network sockets anyway.
- [ ] 2.1.6 Leave **Settings → Environment** on the same image as Notebook A (the default, latest).
- [ ] 2.1.7 Start the session and follow 2.2 to 2.18 cell by cell, or use **Run All**. Do not set `LUMOS_INPUT`, `LUMOS_WORK` or `LUMOS_QUICK` on Kaggle; they are for local tests only.

**Check before moving on**

- [ ] The **Input** panel lists Notebook A's output (and the model, if you added one).
- [ ] The Settings panel shows the RTX PRO 6000 accelerator and Internet OFF.

**If it fails:** If Notebook A does not appear under Notebook Output, its committed version has not finished or produced no output: go back to 1.12. If the RTX PRO 6000 is not offered, switch Internet OFF first; if it is still missing, your account has no quota for it this week (the notebook still runs on another GPU or on CPU, much more slowly).

**Time:** estimate: 5 min

### Phase 2 · Section 2.2 — Config and switches  (cell 1)
**What this cell does:** Sets offline environment variables, the run switches, seeds, epochs, wall-clock budgets, split years and gate thresholds; finds Notebook A's bundle under `/kaggle/input` (depth-limited search); and creates a new run folder `runs/<UTC timestamp>/` or resumes the latest unfinished run with the same inputs and settings.

**Steps**

- [ ] 2.2.1 For the first real run leave `RUN_XGB`, `RUN_DL`, `RUN_QML` and `RUN_QLLM` all `True`. Set one to `False` only to skip that model (without an attached model, Q2 is skipped honestly anyway).
- [ ] 2.2.2 Budgets in minutes come from environment variables with defaults: `XGB_MAX_MINUTES` 120, `DL_MAX_MINUTES` 120, `QLLM_MAX_MINUTES` 90. To change one on Kaggle, edit the default string inside `os.environ.get(...)`.
- [ ] 2.2.3 Change switches or budgets before the first run only: they are part of the run fingerprint, so a change starts a fresh run folder instead of resuming.
- [ ] 2.2.4 Run the cell.
- [ ] 2.2.5 Read the log line `Lumos Notebook B B-1.1.0 · run <timestamp> · QUICK_TEST=False · input=/kaggle/input · bundle=... · work=/kaggle/working`.
- [ ] 2.2.6 After a crash, a second Run All shows `(RESUMED)` and `resuming run ...: checkpointed stages [...]`.

**Check before moving on**

- [ ] `QUICK_TEST=False`.
- [ ] `bundle=` points to a folder under `/kaggle/input/` that ends in `lumos_bundle`.
- [ ] No `WARNING: N bundles found` line (if there is one, remove the extra inputs and run again).

**If it fails:** `FileNotFoundError: No lumos_bundle/manifests/sources.json under /kaggle/input` means Notebook A's output is not attached: redo 2.1.2. `LUMOS_RESUME_RUN=...: no .../stages.json` means that variable is set by mistake: remove it.

**Time:** estimate: under 10 s

### Phase 2 · Section 2.3 — Offline guard and environment probe  (cell 2)
**What this cell does:** Installs a network guard (every non-loopback socket connection and DNS lookup is refused and recorded), records Python, RAM, disk, CPU and package versions, runs a small torch forward/backward smoke test on the GPU, picks the device and writes `env_B.json`.

**Steps**

- [ ] 2.3.1 Run the cell.
- [ ] 2.3.2 Look for `network guard installed: all non-loopback sockets/DNS are refused`.
- [ ] 2.3.3 Read the printed JSON: `device_selected`, `smoke_test`, `ram` and `disk_work`.
- [ ] 2.3.4 Read the `GPU:` line (name, VRAM, compute capability, CUDA version, bf16 support).

**Check before moving on**

- [ ] `"device_selected": "cuda"` and `"smoke_test"` shows `"ok": true`.
- [ ] The `GPU:` line names the RTX PRO 6000 Blackwell.

**If it fails:** `device_selected: cpu` means no usable GPU: the accelerator is not set, or the installed torch build does not support this GPU (the smoke test `error` says which). The notebook still runs on CPU with capped samples and one seed for B2 and D1, but much more slowly. Fix the accelerator in 2.1.4, restart the session and Run All.

**Time:** estimate: under 1 min

### Phase 2 · Section 2.4 — Verify the bundle  (cell 3)
**What this cell does:** Reads `sources.json`, checks for the synthetic-fixture markers, and checks the SHA-256 of every file marked `ok`. A file that is missing or does not match is skipped, and a manifest `error` is treated exactly like `missing`. If `RUN_QML` is on, it then installs PennyLane offline from Notebook A's wheelhouse, pinning torch, numpy, scipy, pandas and scikit-learn so they are never upgraded (with a `--no-deps` retry).

**Steps**

- [ ] 2.4.1 Run the cell.
- [ ] 2.4.2 Read `sources: N entries; checksum ok=..., mismatches=..., missing files=..., unhashed=...`.
- [ ] 2.4.3 Read `SYNTHETIC=... [...]`.
- [ ] 2.4.4 Read `offline pip: {...}` and its `import_check` entry.

**Check before moving on**

- [ ] `mismatches=0` and `missing files=0`.
- [ ] `SYNTHETIC=False []` on real data. `True` means the synthetic test fixture is attached: every number will be demo data.
- [ ] `import_check` says `pennylane importable` (or you accept the built-in simulator fallback).

**If it fails:** Mismatches or missing files mean Notebook A's output is incomplete or corrupted: commit Notebook A again (1.12) and attach the new version. Skipped files are never used, so the run can continue, but those years become unavailable. `pennylane NOT importable` only affects the Q1 cross-check.

**Time:** estimate: 1–3 min (hashing several GB)

### Phase 2 · Section 2.5 — Ingest the fire records  (cell 4)
**What this cell does:** Reads every usable FIRMS file, removes exact duplicate rows, quarantines rows with an invalid latitude, longitude or date, negative FRP or an unknown satellite (each with a reason), assigns every detection to a 5 km equal-area cell and UTC month, and aggregates counts per platform (type 0 vegetation fires as the main count, other types as static sources). Optional NRT files go to a separate recent layer that is never used for training. The result is checkpointed.

**Steps**

- [ ] 2.5.1 Run the cell.
- [ ] 2.5.2 Watch one line per file: `ingest [  i/N] <id> rows=... quarantined=... last=YYYY-MM-DD ...s · RSS ... GB`.
- [ ] 2.5.3 `skipped (...)` lines are files that were missing or failed 2.4; they stay unavailable, never zero.
- [ ] 2.5.4 If NRT data was fetched, look for `ingest NRT ...: N detections (recent observed layer only; not used for training)`.
- [ ] 2.5.5 Read the closing line `ingested X raw rows; duplicates removed Y; quarantined Z; aggregate rows W` and the quarantine reason counts printed below it.

**Check before moving on**

- [ ] Quarantined rows are under 1% of raw rows (the fixture had 123 of 141,557).
- [ ] No `INGEST ERROR` lines.
- [ ] RSS stays well below the RAM shown in 2.3.

**If it fails:** A file with `INGEST ERROR` is marked unusable (treated as missing) and the run continues; the traceback is in `runs/<ts>/ingest/ingest_log.json`. If the kernel dies (out of memory), restart and Run All: the run resumes from the last verified checkpoint.

**Time:** estimate: 5–15 min on real data (fixture: 3 s; real data untested)

### Phase 2 · Section 2.6 — Grid, panel, features and areas  (cell 5)
**What this cell does:** Decides for every country, platform and month whether data is complete, partial or missing (header-only files, platform outages, months after the last date of a current-year file and months before a satellite's start are missing or partial, never zero), builds the cell × month arrays with the model features (3×3 neighbourhood, train-only climatology, month, latitude, country), checkpoints them, then assigns cells to the areas of interest: each country plus Bangladesh's divisions, New South Wales and California, using the Natural Earth polygons.

**Steps**

- [ ] 2.6.1 Run the cell.
- [ ] 2.6.2 Read `panel <country>: N cells` for each country, then `panel: 3 countries, N cells × M months = ... cell-months (2001–2025)`.
- [ ] 2.6.2a Before the panel is built, read `panel plan: ... panel arrays ≈ X GB, peak while building the largest country ≈ Y GB (free RAM Z GB)`. A `WARNING: estimated panel memory exceeds 60% of free RAM` line means the kernel may run out of memory; write down the numbers (they are also in `metrics.json` under `panel_memory`).
- [ ] 2.6.3 Read the `availability <country> <platform>: complete=... partial=[...] missing=...` lines.
- [ ] 2.6.4 A `NOTE: BD-H (Mymensingh) is absent from this Natural Earth file ...` line is expected: Natural Earth's Dhaka polygon still contains Mymensingh.
- [ ] 2.6.5 Read `Bangladesh: k cells assigned to the nearest division (≤0.1°), u cells unassigned ...`.
- [ ] 2.6.6 Read one `AOI <id> <kind> <name> cells=...` line per area.

**Check before moving on**

- [ ] Aqua availability lists `2002-07` as partial and S-NPP lists `2012-01` as partial (the satellites' first months).
- [ ] The AOI lines include `BGD`, the Bangladesh divisions (`BGD-A` ...), `AUS`, `AUS-NSW`, `USA` and `USA-CA`, each with cells > 0.
- [ ] Unassigned Bangladesh cells are a small share of the `BGD` cells (offshore detections).

**If it fails:** If the kernel dies here (Australia and the United States are the largest arrays), restart and Run All: ingest is reused from its checkpoint. Note the RSS in the log for the report; real Australia and United States scale is untested. The United States file includes Alaska, Hawaii and territories, but only cells with at least one detection enter the panel, so memory grows with the number of such cells, not with the area. If AOIs are missing, the Natural Earth files from 1.8 are missing from the bundle.

**Time:** estimate: 2–10 min (fixture: under 1 s)

### Phase 2 · Section 2.7 — Freeze the splits  (cell 6)
**What this cell does:** Holds out 20% of 100 km blocks (chosen by a fixed hash), labels years as train 2013–2020, validation 2021–2022, test 2023–2024 and backcast 2003–2012, keeps only rows with all features and the target available, writes `split_manifest.json` with row counts and hashes, and seals the test rows in a vault that can be opened only once.

**Steps**

- [ ] 2.7.1 Run the cell.
- [ ] 2.7.2 Read `split rows: {'train': ..., 'val': ..., 'test': ...}`.

**Check before moving on**

- [ ] All three counts are greater than 0.
- [ ] Train is roughly 3 times validation (8 years minus the held-out blocks against 2 years), and validation and test are similar (fixture: 232,776 / 77,112 / 77,112).
- [ ] `runs/<ts>/split_manifest.json` exists.

**If it fails:** A count of 0 means VIIRS or Aqua data is missing for those years: check the availability lines in 2.6 and the summary table from 1.11.

**Time:** estimate: under 1 min

### Phase 2 · Section 2.8 — Baselines B0 and B1  (cell 7)
**What this cell does:** Defines the metrics (MAE, RMSE, bias and Poisson deviance at cell-month and area-month level) and fits the simple baselines: B0_identity (estimate = Aqua count), B0_ratio (one global VIIRS/Aqua ratio), B0_month_ratio (one ratio per country and calendar month) and B1, a Poisson regression on the features (checkpointed).

**Steps**

- [ ] 2.8.1 Run the cell.
- [ ] 2.8.2 Read `B0 global ratio r = ...`: how many S-NPP VIIRS detections there are per Aqua detection in the training years.
- [ ] 2.8.3 Read `B1 fitted on N rows, n_iter=k, features=...`.
- [ ] 2.8.4 A line `B1 solver newton-cholesky: ... trying next` means the fallback solver was used; that is fine if B1 then fits.

**Check before moving on**

- [ ] `r` is above 1 (VIIRS sees more, smaller fires than MODIS).
- [ ] `n_iter` is greater than 1 and there is no `MODEL B1_poisson: failed` line.

**If it fails:** If B1 fails, it is recorded as failed and dropped; the gate in 2.11 then uses B0_month_ratio as its baseline and the run continues. An out-of-memory crash here: restart and Run All (resumes).

**Time:** estimate: 2–10 min

### Phase 2 · Section 2.9 — XGBoost B2  (cell 8)
**What this cell does:** If `RUN_XGB` is on: trains a Poisson XGBoost model on the GPU for each of 3 seeds (up to 3,000 rounds, early stopping after 100) inside the `XGB_MAX_MINUTES` wall-clock budget, and keeps the seed with the lowest validation deviance (checkpointed). On CPU it uses a capped sample, one seed and at most 800 rounds.

**Steps**

- [ ] 2.9.1 Run the cell.
- [ ] 2.9.2 Watch the progress lines `[N] val-poisson-nloglik:...` every 100 rounds.
- [ ] 2.9.3 Read one `B2 seed s: best_it=... val MAE=... dev=... (...s)` line per seed.

**Check before moving on**

- [ ] No `xgboost cuda unavailable` line (that means it fell back to CPU).
- [ ] Three seed lines, with similar validation deviance.

**If it fails:** `B2: wall-clock budget reached` keeps the best model so far; that is fine. If B2 crashes, it is recorded as failed and the run continues. To skip it, set `RUN_XGB = False` in 2.2 before a fresh Run All (this starts a new run folder).

**Time:** estimate: 5–30 min on the GPU, capped by XGB_MAX_MINUTES (120) (fixture, 3 seeds on CPU: 32 s)

### Phase 2 · Section 2.10 — PyTorch MLP D1  (cell 9)
**What this cell does:** If `RUN_DL` is on: trains a Poisson neural network (layers 128-128-64, bf16 on the GPU) for each of 3 seeds, up to 40 epochs with early stopping after 5, inside the `DL_MAX_MINUTES` budget, and keeps the best seed (checkpointed). The ONNX export happens in 2.14. On CPU it uses a capped sample and one seed.

**Steps**

- [ ] 2.10.1 Run the cell.
- [ ] 2.10.2 Watch `D1 seed s epoch e/40: train_loss=... val_dev=...` every 5 epochs.
- [ ] 2.10.3 Read one `D1 seed s: epochs=... val MAE=... dev=...` line per seed.

**Check before moving on**

- [ ] `val_dev` falls over the first epochs and there are no `nan` losses.
- [ ] Three seed lines.

**If it fails:** `wall-clock budget reached` keeps the best epoch; that is fine. If D1 crashes, it is recorded as failed and the run continues. To skip it, set `RUN_DL = False` in 2.2 before a fresh Run All.

**Time:** estimate: 5–30 min on the GPU, capped by DL_MAX_MINUTES (120) (fixture, 3 seeds on CPU: 98 s)

### Phase 2 · Section 2.11 — Validation gate and selection  (cell 10)
**What this cell does:** Scores every full-panel model on the validation years. The baseline is the better of B1 and B0_month_ratio by validation area-month MAE. Another model replaces it only if it is at least 10% better and not more than 10% worse on active cells (Aqua count > 0); the best passing model wins. It also builds 80% intervals from validation residuals and writes `selection_frozen.json` before the test years are touched.

**Steps**

- [ ] 2.11.1 Run the cell.
- [ ] 2.11.2 Read `SELECTED (validation only): <model>; gate baseline <model> val AOI-month MAE=...`.
- [ ] 2.11.3 Read the table of `val_cell_MAE`, `val_active_MAE`, `val_AOI_MAE` and `val_dev` per model.

**Check before moving on**

- [ ] Every model you trained has a row in the table.
- [ ] `runs/<ts>/selection_frozen.json` exists.
- [ ] Write down the selected model; it is the app's estimator.

**If it fails:** An error here usually means every model failed earlier. Scroll up for `MODEL ...: failed` lines and fix the first one.

**Time:** estimate: under 3 min

### Phase 2 · Section 2.12 — Open the test set once  (cell 11)
**What this cell does:** Opens the sealed test years (2023–2024) exactly once, scores every full-panel model, measures how often the true area-month value falls inside the 80% interval, and sets the release stage: synthetic data gives `ui_prototype`; beating both B0_identity and B0_month_ratio on test with coverage within ±10 points gives `validated_calibration`; otherwise `observed_comparison`.

**Steps**

- [ ] 2.12.1 Run the cell once. Do not run it a second time on its own.
- [ ] 2.12.2 Read `TEST SPLIT OPENED at <time> (selection frozen at .../selection_frozen.json)`.
- [ ] 2.12.3 Read `RELEASE STAGE: <stage> — <reason>`.

**Check before moving on**

- [ ] On real data the stage is `observed_comparison` or `validated_calibration`, never `ui_prototype`.
- [ ] The reason lists the test area-month MAE of the selected model and both B0 baselines, and the interval coverage (aim: near 0.80).

**If it fails:** `Test split already opened once — refusing a second look` means this cell was run again by itself. Restart the session and Run All: the run resumes from checkpoints and the test set is opened once in the new session.

**Time:** estimate: under 2 min

### Phase 2 · Section 2.13 — Backcast and anomalies  (cell 12)
**What this cell does:** For every area it sums the monthly series (unavailable months stay empty, partial months are shown but not modelled), applies the selected model to produce the VIIRS-scale estimate from 2003 with its 80% interval, builds the harmonised series (observed VIIRS where available, otherwise the estimate) and flags each month as high, low, normal or insufficient against the same calendar month in other years.

**Steps**

- [ ] 2.13.1 Run the cell.
- [ ] 2.13.2 Read `backcast summary: {...}`: per area, `est_total_2003_2012`, `aqua_total_2003_2012` and `months_estimated`.

**Check before moving on**

- [ ] `months_estimated` is about 109 per area (2003–2011 plus January 2012) when all Aqua years are available.
- [ ] `est_total_2003_2012` is larger than `aqua_total_2003_2012` (the estimate is on the VIIRS scale).

**If it fails:** If `months_estimated` is much lower, Aqua files were missing for some years: check the summary table from 1.11 and the availability lines in 2.6.

**Time:** estimate: under 5 min

### Phase 2 · Section 2.14 — Export the app bundle  (cell 13)
**What this cell does:** Writes the app bundle before the research stages: monthly activity records per area and year (validated against `activity.schema.json`), cell grids (15 MB per file budget), B1 input features for BGD, AUS-NSW and USA-CA, the optional recent NRT layer, scrubbed sources, regions and boundaries, model weights (B1 JSON, B2 JSON, D1 ONNX with an onnxruntime parity check), model cards, metrics, `comparison.csv`, figures, manifest and checksums. It copies the bundle to `/kaggle/working/lumos_app_bundle/` and zips it to `/kaggle/working/lumos_app_bundle.zip`.

**Steps**

- [ ] 2.14.1 Run the cell.
- [ ] 2.14.2 Read `activity records: N; schema errors: 0 (validator: ...)`.
- [ ] 2.14.3 Read `ONNX parity: {...}`.
- [ ] 2.14.4 Lines `cells <aoi> <year>: est cutoff raised to ...` mean a cell file was over budget and its cutoff was raised and recorded; that is expected for large areas.
- [ ] 2.14.4a Cell grids (`cells/<aoi>/<year>.json`) are written for `BGD` and its divisions, `AUS-NSW` and `USA-CA` only; whole-country `AUS` and `USA` have none. B1 feature files (`features/<aoi>/<year>.json`) exist for `BGD`, `AUS-NSW` and `USA-CA`.
- [ ] 2.14.5 Read `app bundle [core (before research stages Q1/Q2)]: ... zip ... MB`.

**Check before moving on**

- [ ] `schema errors: 0`.
- [ ] ONNX parity shows `passed` true (unless D1 was skipped).
- [ ] `/kaggle/working/lumos_app_bundle.zip` exists, and its size is well under 100 MB.

**If it fails:** `activity records failed schema validation` stops the run: this is a bug, so save the log and report it. An ONNX or XGBoost export error is recorded in the model card and the export continues. Even if a later stage crashes, this zip is already safe.

**Time:** estimate: 2–10 min (fixture: 4 s)

### Phase 2 · Section 2.15 — Research: simulated quantum Q1  (cell 14)
**What this cell does:** If `RUN_QML` is on: draws a bounded training subset (4,000 rows, stratified by Aqua count > 0, with inverse-probability weights) and up to 20,000 validation rows, trains an 8-qubit, 3-layer variational circuit on a built-in torch state-vector simulator for 3 seeds, cross-checks it against PennyLane, and retrains every classical model on the identical subset for a fair comparison. This is research only, simulated on classical hardware; it never becomes the app's estimator.

**Steps**

- [ ] 2.15.1 Run the cell.
- [ ] 2.15.2 Watch `Q1 seed s epoch e/80: val_dev=...` progress lines.
- [ ] 2.15.3 Read one `Q1 seed s: epochs=... val(subset) MAE=... dev=...` line per seed.
- [ ] 2.15.4 Read `Q1 PennyLane cross-check: {...}`.

**Check before moving on**

- [ ] Three Q1 seed lines.
- [ ] The cross-check shows a tiny maximum difference (the fixture gave 5.4e-7), or says PennyLane was not available.
- [ ] No `subset <model> failed` lines (or note which ones).

**If it fails:** A Q1 failure is recorded and does not touch the app bundle written in 2.14. To skip it, set `RUN_QML = False` in 2.2 before a fresh Run All.

**Time:** estimate: 5–20 min on the GPU (fixture, full mode on CPU including the subset models: 476 s)

### Phase 2 · Section 2.16 — Research: QLLM Q2  (cell 15)
**What this cell does:** If `RUN_QLLM` is on and Q1 succeeded: looks for a local instruct LLM under `/kaggle/input` (prefers Qwen, then Gemma, within the size cap). Without one, Q2 is honestly marked skipped. With one, it runs an equal-budget search over Q1 circuit designs, alternating random proposals and LLM proposals trial by trial (12 trials each, 30 epochs per trial, capped by `QLLM_MAX_MINUTES`). The LLM sees only the search space and its own validation history; an unparseable or duplicate reply falls back to a random proposal and is logged.

**Steps**

- [ ] 2.16.1 Run the cell.
- [ ] 2.16.2 Read `Q2 LLM search: {...}` (size cap, free RAM and VRAM, any model that was too large).
- [ ] 2.16.3 With a model attached, watch `Q2[random] trial t: ... → val dev ...` and `Q2[llm] trial t: ...` lines.
- [ ] 2.16.4 Read the closing line `Q2 status: ...`.

**Check before moving on**

- [ ] With a model attached: `Q2 status: ok`.
- [ ] Without a model: `Q2 status: skipped skipped: no local LLM within the size cap ...`. That is the expected, honest result.
- [ ] `too_large` in the search report is empty.

**If it fails:** A model listed under `too_large` must be swapped for a smaller one (a 7B model in bf16 is about 15 GB). `transformers not importable` or any crash marks Q2 failed; the app bundle is unaffected. To skip it, set `RUN_QLLM = False` in 2.2 before a fresh Run All.

**Time:** estimate: under 1 min when skipped; 20–90 min with a model, capped by QLLM_MAX_MINUTES (90)

### Phase 2 · Section 2.17 — Research results and bundle refresh  (cell 16)
**What this cell does:** Scores Q1, the subset-trained classical models, the full-data models and the best Q2 designs on a bounded subset (up to 20,000 rows) of the test rows already opened in 2.12, then rewrites the app bundle's metrics, model cards, manifest, checksums and zip, and marks the run complete.

**Steps**

- [ ] 2.17.1 Run the cell.
- [ ] 2.17.2 Read `app bundle [final (research stages appended)]: ... zip ... MB`.

**Check before moving on**

- [ ] That line appears and the zip size is close to the one from 2.14.
- [ ] `runs/<ts>/stages.json` now has `"complete": true`.

**If it fails:** `research test-subset evaluation failed (app bundle unaffected)` is not fatal: the core bundle from 2.14 stands, refreshed without research test numbers.

**Time:** estimate: under 3 min

### Phase 2 · Section 2.18 — Final summary and download  (cell 17)
**What this cell does:** Prints one row per model (status, scope, validation and test MAE, deviance, interval coverage), the matched-budget subset comparison, the selected model with the release stage and reason, the Q2 status, the run folder and bundle paths, the device and the number of blocked network attempts, then shows the figures. On synthetic data it prints a clear HONEST NOTE banner.

**Steps**

- [ ] 2.18.1 Run the cell and read the summary table.
- [ ] 2.18.2 Read `Selected model (validation only): ... | release stage: ...`.
- [ ] 2.18.3 Read `Device: cuda ... blocked network attempts: 0`.
- [ ] 2.18.4 Look at the figures below (time series for BGD, AUS-NSW and USA-CA, plus AUS and USA, model comparison, test scatter, QML subset comparison).
- [ ] 2.18.5 Download `/kaggle/working/lumos_app_bundle.zip`: right-hand **Output** panel (or the committed version's **Output** tab) → `lumos_app_bundle.zip` → **Download**. Files in an interactive session disappear when it stops, so download now or commit with **Save Version → Save & Run All**.

**Check before moving on**

- [ ] `blocked network attempts: 0`.
- [ ] `Device: cuda`.
- [ ] No HONEST NOTE banner on real data (the banner means the synthetic fixture was used).
- [ ] `lumos_app_bundle.zip` is saved on your computer.

**If it fails:** If the figures do not show, open them in the bundle's `figures/` folder. If the download stalls, download the `lumos_app_bundle/` folder from the Output panel instead.

**Time:** estimate: under 1 min, plus download time

### Next phase: Phase 3 — Check the results

**Check before you continue**

- [ ] Open `manifest.json` in the bundle: `release_stage` is `observed_comparison` or `validated_calibration`, `synthetic` is false, and `release_reason` makes sense.
- [ ] Open `figures/timeseries_BGD.png`: the estimate continues smoothly into the VIIRS series with no jump at 2012, and Aqua sits below VIIRS.
- [ ] Open `metrics.json` or `comparison.csv`: note the selected model and its test interval coverage (aim: near 0.80).
- [ ] Open `runs/<ts>/run_log.json` (in `/kaggle/working`): note the timings and the RSS memory for Australia and the United States (ingest and panel lines).
- [ ] Run `python notebooks/tests/check_bundle.py <unzipped lumos_app_bundle>` locally (without `--fixture`); it must pass on the real bundle (DATA-03).
- [ ] Q2 shows `ok` if you attached a model, or `skipped` if you did not; never anything in between.
- [ ] Give `lumos_app_bundle.zip` to Claude Code, which unzips it to `apps/web/public/data/<snapshot_id>/`.

## Counts

- Phase 1: 12 sections, 46 steps, 21 checks, 7 hand-off checks
- Phase 2: 18 sections, 72 steps, 47 checks
- Phase 3: 7 checks
