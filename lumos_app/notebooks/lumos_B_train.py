# %% [markdown]
# # Lumos Fire Calendar — Notebook B: harmonise MODIS Aqua → VIIRS S-NPP (Phase 2)
#
# **NASA Space Apps 2026 · Harmonization of MODIS and VIIRS Hot Spots · Team Lumos (Dhaka)** · contract v1.0 + v1.1 + v1.2 amendments
#
# ## Purpose
# Two satellite instruments watch the same fires. **MODIS** (on Aqua, since mid-2002) sees the Earth with 1 km pixels; **VIIRS** (on S-NPP, since 20 Jan 2012) uses 375 m pixels and so spots many more, smaller fires. Think of two cameras photographing the same street at night: the newer camera has a sharper sensor and counts more lit windows. If you join the old camera's counts (2003–2011) to the new camera's counts (2012+), it looks as if fires suddenly multiplied in 2012. That jump is an artefact of the camera change.
#
# This notebook learns, on years when **both** instruments flew (training 2013–2020), how many VIIRS S-NPP detections match a given pattern of Aqua MODIS detections in the same 5 km × 5 km cell and month. It then applies that mapping back to 2003–2012 to give a **retrospective, VIIRS-scale estimate**: one continuous fire calendar on the VIIRS scale, with honest uncertainty bands. Terra MODIS is kept as a separate series and never pooled into the target. 2001–2002 are *unsupported* (no full Aqua year). 2012 is labelled `backcast`; where VIIRS was observed in 2012, both values are shown.
#
# **Time frame, in plain words.** Our S-NPP history is 2013–2024 (training 2013–2020, validation 2021–2022, test 2023–2024). NASA has announced that delivery of all Suomi NPP VIIRS science data products ceases on 2 Nov 2026, so S-NPP is a closing reference: this calendar is a *retrospective* harmonisation, not a forecast. Aqua MODIS started on 3 July 2002, so July 2002 is a partial month and 2003 is the first full Aqua year. FIRMS has no yearly country files for 2025 yet (they answer 404): Notebook A marks them `missing`, and this notebook treats a missing year as *unavailable, never zero* (the calendar then shows 2025 as missing).
#
# It runs on Kaggle on the **RTX PRO 6000 Blackwell with Internet OFF**, reads only Notebook A's output, and exports `/kaggle/working/lumos_app_bundle.zip` for the app.
#
# **Outputs:**
# * `runs/<UTC timestamp>/`: ingest parquet, quarantine, split manifest, metrics, logs and **stage checkpoints** (`stages.json` + `cache/`; earlier runs are never deleted).
# * `lumos_app_bundle/` + `lumos_app_bundle.zip`: the app export (contract §6). The bundle is written **before** the research-only quantum stages (Q1/Q2) and refreshed after them, so a crash in Q1/Q2 never costs the app bundle.
#
# Each code cell below has a guide cell above it with the same numbering as the runbook: **Phase 2 → Section 2.x → Step 2.x.y**.
#
# ## Phase map
#
# | Section | Cell | What it does | Est. time |
# |---|---|---|---|
# | 2.1 Attach inputs and pick the GPU | manual | Manual: import, add A's output (+ optional model), RTX PRO 6000, Internet OFF | 5 min |
# | 2.2 Config and switches | 1 | Switches, budgets, locate A's bundle, create or resume the run folder | < 10 s |
# | 2.3 Offline guard and environment probe | 2 | Block the network, probe RAM/disk/GPU, torch smoke test | < 1 min |
# | 2.4 Verify the bundle | 3 | SHA-256 check of every file, synthetic detection, offline install of PennyLane and ONNX packages | 1–3 min |
# | 2.5 Ingest the fire records | 4 | Clean, quarantine and aggregate detections to 5 km cell × month | 5–15 min |
# | 2.6 Grid, panel, features and areas | 5 | Availability rules, cell × month feature panel, areas of interest | 2–10 min |
# | 2.7 Freeze the splits | 6 | Train/val/test years, 20% spatial holdout, sealed test vault | < 1 min |
# | 2.8 Baselines B0 and B1 | 7 | Metrics; B0 ratio baselines; B1 Poisson regression | 2–10 min |
# | 2.9 XGBoost B2 | 8 | Poisson XGBoost, 3 seeds, wall-clock capped | 5–30 min |
# | 2.10 PyTorch MLP D1 | 9 | Poisson MLP, 3 seeds, wall-clock capped | 5–30 min |
# | 2.11 Validation gate and selection | 10 | Score on validation, apply the gate, freeze the selection | < 3 min |
# | 2.12 Open the test set once | 11 | One-time test evaluation, per-region interval coverage, per-region release stage | < 2 min |
# | 2.13 Backcast and anomalies | 12 | 2003–2012 VIIRS-scale estimate, intervals, anomaly flags | < 5 min |
# | 2.14 Export the app bundle | 13 | Write and zip the app bundle (before research stages) | 2–10 min |
# | 2.15 Research: simulated quantum Q1 | 14 | Research: simulated variational quantum regressor on a 4,000-row subset | 5–20 min |
# | 2.16 Research: QLLM Q2 | 15 | Research: LLM-guided vs random search over Q1 designs (needs a local model) | < 1 min / 20–90 min |
# | 2.17 Research results and bundle refresh | 16 | Research scores on a test subset; refresh bundle metrics and zip | < 3 min |
# | 2.18 Final summary and download | 17 | Summary table, release stage, figures, download the zip | < 1 min |
#
# Times are estimates for real data on the Blackwell GPU, which has not been tested yet (PRD: roughly 30–90 min in total). Measured fixture timings are in `notebooks/TEST_REPORT.md`.
#
# ## Phase 2 · Section 2.1 — Attach inputs and pick the GPU
# **What this step does:** Manual set-up in the Kaggle web UI before any cell runs. Nothing is executed.
#
# **Steps**
#
# - [ ] 2.1.1 On kaggle.com click **Create → New Notebook**, then **File → Import Notebook** and upload `notebooks/lumos_B_train.ipynb`.
# - [ ] 2.1.2 Right-hand panel **Add Input → Notebook Output**, search for your Notebook A (`lumos_A_fetch`) and add its latest successful version.
# - [ ] 2.1.3 *(Optional, enables Q2 in 2.16)* **Add Input → Models**, pick an instruct model such as Qwen2.5-7B-Instruct, framework **Transformers**. Its weights must fit in min(30 GB, half the free RAM, 85% of free VRAM).
# - [ ] 2.1.4 **Settings → Accelerator: RTX PRO 6000** (Blackwell).
# - [ ] 2.1.5 **Settings → Internet: OFF**. The Blackwell GPU is only offered with Internet OFF, and this notebook blocks all network sockets anyway.
# - [ ] 2.1.6 Leave **Settings → Environment** on the same image as Notebook A (the default, latest).
# - [ ] 2.1.7 Start the session and follow 2.2 to 2.18 cell by cell, or use **Run All**. Do not set `LUMOS_INPUT`, `LUMOS_WORK` or `LUMOS_QUICK` on Kaggle; they are for local tests only.
#
# **Check before moving on**
#
# - [ ] The **Input** panel lists Notebook A's output (and the model, if you added one).
# - [ ] The Settings panel shows the RTX PRO 6000 accelerator and Internet OFF.
#
# **If it fails:** If Notebook A does not appear under Notebook Output, its committed version has not finished or produced no output: go back to 1.12. If the RTX PRO 6000 is not offered, switch Internet OFF first; if it is still missing, your account has no quota for it this week (the notebook still runs on another GPU or on CPU, much more slowly).
#
# **Time:** estimate: 5 min
#
# ## Important warnings
#
# - **No network in this notebook.** It makes zero network calls and actively blocks every non-loopback socket and DNS lookup. Everything comes from Notebook A's bundle (and an optional local model).
# - **Synthetic versus real.** If the input is the synthetic test fixture (detected by four separate markers), the notebook forces `release_stage = ui_prototype` and `value_status = demo`, and prints an HONEST NOTE banner. Those numbers say nothing about real fires.
# - **Keys are never printed.** Notebook B needs no key; `sources.json` is scrubbed again before export.
# - **Honesty rules:** missing source files are never treated as zero (header-only or truncated current-year files, platform outages and partial first months are detected); selection uses validation only; the test years (2023–2024) are opened exactly once, at the end.
# - **The release stage is decided per region, not once for everything.** The gate uses three non-overlapping evaluation regions: Bangladesh (`BGD`), New South Wales (`AUS-NSW`) and California (`USA-CA`). Whole-country `AUS` and `USA` and the Bangladesh divisions overlap those regions (they would be counted twice) and are reported separately, never gated. `validated_calibration` needs the selected model to beat both B0_identity and B0_month_ratio on test AOI-month MAE in every gated region, and every region's 80% interval coverage within ±10 points of 0.80. Each region has only 24 test AOI-months (12 months × 2 years), so these coverage numbers are coarse; the notebook says so in the reason.
# - **Type rule.** `type` exists only in standard FIRMS data; near-real-time (NRT) rows have no `type`. Standard rows with `type == 0` are the main count, other types are static sources, standard rows without a `type` are counted nowhere, and NRT rows are never used for training (they stay in a separate recent layer or mark their month partial).
# - **Research stages are research.** Q1 and Q2 are simulated on classical hardware; no quantum-advantage claim, and they never become the app's estimator.
#
# **If the kernel dies** (out of memory, timeout), Run All again in the same session: the latest unfinished run with the same inputs and settings is resumed (checksum-verified ingest, panel and model artefacts are reused). Force a specific run with `LUMOS_RESUME_RUN=<run_id>`, or disable resuming with `LUMOS_AUTO_RESUME=0`.
#
# **Local testing:** `LUMOS_INPUT=<dir containing lumos_bundle> LUMOS_WORK=<out dir> LUMOS_QUICK=1`. Budgets (env, minutes): `XGB_MAX_MINUTES`, `QLLM_MAX_MINUTES`, `DL_MAX_MINUTES`.
#
# ## Done when
#
# - [ ] Every cell 1–17 ran without an exception.
# - [ ] `RELEASE STAGE` (2.12) is `observed_comparison` or `validated_calibration` (not `ui_prototype`), and one `RELEASE REGION <id>` line per gated region (BGD, AUS-NSW, USA-CA) explains that region's outcome. The overall stage is the weakest region's.
# - [ ] `schema errors: 0` (2.14).
# - [ ] `blocked network attempts: 0` and `Device: cuda` in the final summary (2.18).
# - [ ] `lumos_app_bundle.zip` is downloaded to your computer.

# %% [markdown]
# ## Phase 2 · Section 2.2 — Config and switches
# **What this cell does:** Sets offline environment variables, the run switches, seeds, epochs, wall-clock budgets, split years and gate thresholds; finds Notebook A's bundle under `/kaggle/input` (depth-limited search); and creates a new run folder `runs/<UTC timestamp>/` or resumes the latest unfinished run with the same inputs and settings.
#
# **Steps**
#
# - [ ] 2.2.1 For the first real run leave `RUN_XGB`, `RUN_DL`, `RUN_QML` and `RUN_QLLM` all `True`. Set one to `False` only to skip that model (without an attached model, Q2 is skipped honestly anyway).
# - [ ] 2.2.2 Budgets in minutes come from environment variables with defaults for the first real run: `XGB_MAX_MINUTES` 45, `DL_MAX_MINUTES` 45, `QLLM_MAX_MINUTES` 45 (the real-data speed is unmeasured; raise them after the first run has shown the B2 and D1 timings). To change one on Kaggle, edit the default string inside `os.environ.get(...)`.
# - [ ] 2.2.3 Change switches or budgets before the first run only: they are part of the run fingerprint, so a change starts a fresh run folder instead of resuming.
# - [ ] 2.2.4 Run the cell.
# - [ ] 2.2.5 Read the log line `Lumos Notebook B B-1.2.0 · run <timestamp> · QUICK_TEST=False · input=/kaggle/input · bundle=... · work=/kaggle/working`.
# - [ ] 2.2.6 After a crash, a second Run All shows `(RESUMED)` and `resuming run ...: checkpointed stages [...]`.
#
# **Check before moving on**
#
# - [ ] `QUICK_TEST=False`.
# - [ ] `bundle=` points to a folder under `/kaggle/input/` that ends in `lumos_bundle`.
# - [ ] No `WARNING: N bundles found` line (if there is one, remove the extra inputs and run again).
#
# **If it fails:** `FileNotFoundError: No lumos_bundle/manifests/sources.json under /kaggle/input` means Notebook A's output is not attached: redo 2.1.2. `LUMOS_RESUME_RUN=...: no .../stages.json` means that variable is set by mistake: remove it.
#
# **Time:** estimate: under 10 s

# %%
# ===================== CONFIG =====================
import os, sys, json, time, math, hashlib, glob, re, shutil, zipfile, traceback, platform, subprocess, warnings, random
import datetime as dt
from pathlib import Path

for _k in ["HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"]:
    os.environ[_k] = "1"
os.environ["WANDB_MODE"] = "disabled"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["PIP_NO_INDEX"] = "1"

QUICK_TEST = os.environ.get("LUMOS_QUICK", "0") == "1"
CODE_VERSION = "B-1.2.0"     # 1.2.0: per-region release gate, region-level interval coverage, path scrubbing, explicit type rule

RUN_XGB = True
RUN_DL = True
RUN_QML = True
RUN_QLLM = True

SEEDS = [0, 1, 2]
QML_QUBITS = 8
QML_LAYERS = 3
QML_MAX_TRAIN = 4000
QML_MAX_EVAL = 20000
QLLM_TRIALS = 12

XGB_ROUNDS, XGB_EARLY = 3000, 100
XGB_CPU_MAX_ROWS = 4_000_000     # CPU fallback: capped training sample, 1 seed, ≤ XGB_CPU_ROUNDS rounds
XGB_CPU_ROUNDS = 800
XGB_VERBOSE = 100                # progress line every N boosting rounds
DL_EPOCHS, DL_PATIENCE = 40, 5
D1_CPU_MAX_ROWS = 2_000_000      # torch on CPU: capped training sample, 1 seed
QML_EPOCHS, QML_PATIENCE = 80, 12
QLLM_EPOCHS = 30
LOG_EVERY_EPOCHS = 5             # progress line every N epochs (D1, Q1, Q2)
B1_MAX_TRAIN = 4_000_000
B1_ALPHA = 1e-4

XGB_MAX_MINUTES = float(os.environ.get("XGB_MAX_MINUTES", "45"))      # wall-clock cap, whole B2 stage (all seeds); first real run: 45, raise after seeing B2 timing
DL_MAX_MINUTES = float(os.environ.get("DL_MAX_MINUTES", "45"))        # wall-clock cap, whole D1 stage; first real run: 45
QLLM_MAX_MINUTES = float(os.environ.get("QLLM_MAX_MINUTES", "45"))    # wall-clock cap, Q2 (both arms truncated equally); only used when a model is attached

if QUICK_TEST:
    XGB_ROUNDS, XGB_EARLY = 40, 10
    DL_EPOCHS, DL_PATIENCE = 3, 2
    QML_EPOCHS, QML_PATIENCE = 4, 3
    QLLM_EPOCHS = 2
    QLLM_TRIALS = 3
    QML_MAX_TRAIN = 600
    QML_MAX_EVAL = 3000
    XGB_VERBOSE = 10
    LOG_EVERY_EPOCHS = 1

TRAIN_YEARS = list(range(2013, 2021))
VAL_YEARS = [2021, 2022]
TEST_YEARS = [2023, 2024]
BACKCAST_YEARS = list(range(2003, 2013))     # contract §3: Aqua full years 2003–2012 (2012: VIIRS also shown where observed)
UNSUPPORTED_YEARS = [2001, 2002]
BLOCK_CELLS = 20            # 100 km blocks
HOLDOUT_FRACTION = 0.20
INTERVAL_LEVEL = 0.80
GATE_MAE_IMPROVEMENT = 0.10
GATE_SUBGROUP_DEGRADATION = 0.10
GATE_BASELINE_CANDIDATES = ["B1_poisson", "B0_month_ratio"]   # v1.1: baseline = better of these two on val AOI-month MAE
# v1.2 review H1: the gate and the release stage use NON-OVERLAPPING evaluation regions only. BGD (country) is used instead of its seven
# divisions, AUS-NSW instead of whole AUS, USA-CA instead of whole USA, so no detection is counted twice and whole-country counts
# (which dominate absolute-count MAE) never decide the gate. Whole-country AUS / USA and the BGD divisions are reported separately.
GATE_UNITS = ["BGD", "AUS-NSW", "USA-CA"]
GATE_UNITS_SG = "gate_units"                 # subgroup key under metrics aoi_month: all gated regions pooled
RELEASE_ORDER = {"ui_prototype": 0, "observed_comparison": 1, "validated_calibration": 2}   # release_stage = the weakest gated region
COVERAGE_TOLERANCE = 0.10                    # |empirical coverage − 0.80| ≤ 0.10 in every gated region (n = 24 test AOI-months per region: coarse)
MEMORY_OPTIONAL_COUNTRIES = ["United_States"]   # dropped (documented) only if the panel estimate exceeds MEMORY_GUARD_FRACTION of free RAM
MEMORY_GUARD_FRACTION = 0.90
ANOMALY_MIN_BASELINE = 5
ANOMALY_Z = 1.0
CELL_EST_MIN = 1.0          # contract §6: cells json keeps rows with aqua>0 or viirs>0 or est>=this
CELL_EST_LADDER = [1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0]   # raised (and recorded) if an AOI-year file exceeds the budget
CELL_FILE_BUDGET_MB = float(os.environ.get("LUMOS_CELL_BUDGET_MB", "15"))       # v1.1 budget per AOI-year cells file
FEATURE_EXPORT_AOIS = ["AUS-NSW", "BGD", "USA-CA"]    # per-cell B1 input features (features/<aoi>/<year>.json) so the app can recompute B1 (v1.2: + USA-CA)
FEATURE_FILE_BUDGET_MB = float(os.environ.get("LUMOS_FEATURE_BUDGET_MB", "15"))
PLATFORM_OUTAGE_MIN = 30    # a MODIS platform with 0 rows in a country-month while the other has ≥ this → outage (missing, not zero)
# v1.2 addendum (CONTRACT §8): three regions. Country keys are the FIRMS file names exactly as in sources.json (`United_States`);
# the display name (regions.json `country`, AOI `name`) replaces `_` by a space; Natural Earth names the country differently
# (admin-0 `ADMIN`/`NAME` = "United States of America", `ADM0_A3` = USA), so the NE match is an explicit table, not string equality.
AOI_COUNTRIES = ["Bangladesh", "Australia", "United_States"]
COUNTRY_ISO3 = {"Bangladesh": "BGD", "Australia": "AUS", "India": "IND", "Myanmar": "MMR", "Nepal": "NPL", "Bhutan": "BTN",
                "United_States": "USA", "Indonesia": "IDN", "Thailand": "THA", "Brazil": "BRA", "Canada": "CAN"}
COUNTRY_DISPLAY = {"United_States": "United States"}            # FIRMS slug → display; every other slug → slug.replace("_", " ")
NE_ADMIN0_NAMES = {"United_States": ["United States of America", "United States"]}   # NE admin-0/admin-1 country names, tried after the ISO3 match
AOI_ADMIN1 = {"Australia": ["AU-NSW"], "United_States": ["US-CA"]}       # keyed on Natural Earth iso_3166_2 (v1.1); Bangladesh: all divisions
# v1.1 display-name alias table (modern spellings); ISO 3166-2 BD-A..BD-H
ADMIN1_DISPLAY = {"BD-A": "Barishal", "BD-B": "Chattogram", "BD-C": "Dhaka", "BD-D": "Khulna", "BD-E": "Rajshahi",
                  "BD-F": "Rangpur", "BD-G": "Sylhet", "BD-H": "Mymensingh", "AU-NSW": "New South Wales", "US-CA": "California"}
ADMIN1_DISPLAY_KIND = {"Bangladesh": "Division"}   # UI label for admin-1 areas (CONTRACT §9 display_kind); other countries: State
NAME_ALIASES = {"Chittagong": "Chattogram", "Barisal": "Barishal", "Jessore": "Jashore", "Bogra": "Bogura", "Comilla": "Cumilla"}
EXPECTED_ADMIN1 = {"Bangladesh": ["BD-A", "BD-B", "BD-C", "BD-D", "BD-E", "BD-F", "BD-G", "BD-H"], "Australia": ["AU-NSW"], "United_States": ["US-CA"]}
CELLS_EXPORT_SKIP_AOIS = ["AUS", "USA"]  # v1.1/v1.2: whole-country AUS and USA cell grids are not exported; AUS-NSW, USA-CA, BGD (+divisions) are
WRITE_DETECTIONS_PARQUET = os.environ.get("LUMOS_WRITE_DETECTIONS", "0") == "1"   # off by default (minutes + ~1 GB on real data)
LLM_MAX_BYTES_CAP = 30e9    # LLM weights cap: min(30 GB, 0.5 × free RAM) (and ≤ 0.85 × free VRAM on GPU)
INPUT_WALK_MAX_DEPTH = 6    # depth-limited search of /kaggle/input
LUMOS_QLLM_STUB = os.environ.get("LUMOS_QLLM_STUB", "0") == "1"   # TEST ONLY: stub "LLM" exercises the loop; never a real result
STOP_AFTER = os.environ.get("LUMOS_STOP_AFTER", "")              # TEST ONLY: simulate a crash right after this stage

INPUT_ROOT = Path(os.environ.get("LUMOS_INPUT", os.environ.get("LUMOS_ROOT", "/kaggle/input")))
WORK = Path(os.environ.get("LUMOS_WORK", "/kaggle/working"))

R_EARTH = 6371007.181
CELL_M = 5000.0
IX_OFF, IY_OFF, KEY_MUL = 5000, 2000, 10000

TIMINGS = {}
LOG = []
def log(msg):
    line = f"[{dt.datetime.now(dt.timezone.utc).strftime('%H:%M:%S')}] {msg}"
    LOG.append(line); print(line, flush=True)

def rss_gb():
    try:
        import psutil
        return psutil.Process().memory_info().rss / 1e9
    except Exception:
        try:
            for l in open("/proc/self/status"):
                if l.startswith("VmRSS:"): return int(l.split()[1]) / 1e6
        except Exception: pass
    return float("nan")

def free_ram_gb():
    try:
        import psutil
        return psutil.virtual_memory().available / 1e9
    except Exception:
        try:
            mem = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
            return mem.get("MemAvailable", 0) / 1e6
        except Exception: return float("nan")

def country_display(c):
    """FIRMS country slug → display name (`United_States` → `United States`)."""
    return COUNTRY_DISPLAY.get(c, c.replace("_", " "))

def ne_country_match(props, iso, c):
    """True if a Natural Earth admin-0 or admin-1 feature belongs to FIRMS country slug `c` (ISO3 `iso`): ISO3 in ADM0_A3/ISO_A3/adm0_a3
    first, else one of the explicit NE names (`NE_ADMIN0_NAMES`, e.g. United_States → 'United States of America'), else the slug with spaces."""
    if iso in (props.get("ADM0_A3"), props.get("ISO_A3"), props.get("adm0_a3")): return True
    names = NE_ADMIN0_NAMES.get(c, []) + [c.replace("_", " ")]
    return any(props.get(k) in names for k in ("ADMIN", "NAME", "admin"))

def panel_memory_plan(cells_per_country, nm, n_base_cols, n_countries=None):
    """Estimate (before any dense array is allocated) the size of the cell × month panel. Only cells with >=1 detection (either sensor,
    any year) enter the universe (CONTRACT §3), so the panel is sparse in space; the dense part is cells × `nm` months.
    bytes per cell-month in the final panel `P`: `n_base_cols` float32 base columns + gcell, m (int32) + cidx, year (int16) + month (int8)
    + month_sin, month_cos, lat (float32) + one float32 one-hot per country + holdout/SPLIT/FEAT_OK/TARGET_OK (1 byte each).
    Peak while a country is built: ~22 dense float32 temporaries of that country plus the finished base columns of the others."""
    nco = n_countries or len(cells_per_country)
    cells = int(sum(cells_per_country.values())); cm = cells * nm
    per_cm = n_base_cols * 4 + 4 + 4 + 2 + 2 + 1 + 3 * 4 + 4 * nco + 4
    big = int(max(cells_per_country.values())) if cells_per_country else 0
    peak_build = (big * nm * 22 * 4 + (cells - big) * nm * n_base_cols * 4) / 1e9
    return {"n_cells": cells, "cells_per_country": {k: int(v) for k, v in cells_per_country.items()}, "n_months": int(nm), "cell_months": int(cm),
            "bytes_per_cell_month": int(per_cm), "panel_gb": round(cm * per_cm / 1e9, 2), "peak_country_build_gb": round(peak_build, 2)}

def grid_key_in_range(ix, iy):
    """True where (ix, iy) packs into the int64 cell key `(ix+IX_OFF)*KEY_MUL + (iy+IY_OFF)` without aliasing (0 <= iy+IY_OFF < KEY_MUL, ix+IX_OFF >= 0)."""
    import numpy as _np
    ix = _np.asarray(ix); iy = _np.asarray(iy)
    return (ix + IX_OFF >= 0) & (iy + IY_OFF >= 0) & (iy + IY_OFF < KEY_MUL)

def memory_guard(cells_per_country, nm, n_base_cols, free_gb, optional=None, fraction=None):
    """Fail-soft memory guard for the panel (review L; real USA scale is UNMEASURED). `panel_memory_plan` is computed from the REAL number of
    cells with detections per country (not a ceiling). If max(panel GB, peak-while-building GB) exceeds `fraction` × free RAM, the optional
    country with the most cells (default: United_States) is dropped from the panel instead of letting the kernel be killed; the drop is
    logged, recorded in metrics (`panel_memory.guard`) and the AOI list simply lacks it (consumers treat the AOI list as data). Nothing is
    dropped when free RAM is unknown or the estimate fits. Returns (kept cells_per_country, dropped countries, plan of the kept set)."""
    optional = MEMORY_OPTIONAL_COUNTRIES if optional is None else optional
    fraction = MEMORY_GUARD_FRACTION if fraction is None else fraction
    kept, dropped = dict(cells_per_country), []
    plan = panel_memory_plan(kept, nm, n_base_cols)
    if free_gb is None or not math.isfinite(free_gb): return kept, dropped, plan
    while kept and max(plan["panel_gb"], plan["peak_country_build_gb"]) > fraction * free_gb:
        cand = [c for c in kept if c in optional]
        if not cand: break
        drop = max(cand, key=lambda c: kept[c]); dropped.append(drop); kept.pop(drop)
        plan = panel_memory_plan(kept, nm, n_base_cols)
    return kept, dropped, plan

# ---- review M-path: no developer-local absolute path may reach the exported bundle (public snapshot) ----
_ABS_PATH_RES = [(re.compile(r"(?<![\w.:/-])/Users/[^\s\"'<>,;)\]}\\]+"), "<local-path>"),
                 (re.compile(r"(?<![\w.:/-])/home/[^\s\"'<>,;)\]}\\]+"), "<local-path>"),
                 (re.compile(r"(?<![\w.:/-])/kaggle/(?:input|working|temp|lib)(?:/[^\s\"'<>,;)\]}\\]*)?"), "<kaggle-path>"),
                 (re.compile(r"[A-Za-z]:\\\\(?:Users|home)[^\s\"'<>,;)\]}\\]*"), "<local-path>")]
LOCAL_PATH_MARKERS = (b"/Users/", b"/kaggle/", b"/home/")      # scanned for in every exported file

def _local_path_subs():
    """(absolute path string, placeholder) pairs for this run, longest first. Documented placeholders: <run> <work> <bundle> <input> <home> <local-path> <kaggle-path>."""
    out = []
    for ph, nm_ in [("<run>", "RUN_DIR"), ("<work>", "WORK"), ("<bundle>", "BUNDLE"), ("<input>", "INPUT_ROOT")]:
        if nm_ in globals():
            for s in {str(globals()[nm_]), str(Path(globals()[nm_]).resolve())}:
                if s.startswith("/") and len(s) > 1: out.append((s, ph))
    h = str(Path.home())
    if h.startswith("/") and len(h) > 1: out.append((h, "<home>"))
    return sorted(set(out), key=lambda x: -len(x[0]))

def scrub_str(s):
    """Replace this run's absolute paths by placeholders, then any remaining /Users/…, /home/…, /kaggle/… path by a generic placeholder."""
    s = str(s)
    for a, ph in _local_path_subs(): s = s.replace(a, ph)
    for rx, ph in _ABS_PATH_RES: s = rx.sub(ph, s)
    return s

def scrub_obj(o):
    if isinstance(o, str): return scrub_str(o)
    if isinstance(o, dict): return {(scrub_str(k) if isinstance(k, str) else k): scrub_obj(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [scrub_obj(v) for v in o]
    return o

def scrub_bundle_files(root, scrub=True):
    """Safety net over EVERY exported file: text files (json/csv/geojson/txt/md/sha256) containing a local-path marker are rewritten
    with scrub_str; binary files with a marker are only reported. Returns [(relative path, marker, action)]. Run before hashing."""
    hits = []
    for p in sorted(Path(root).rglob("*")):
        if not p.is_file(): continue
        data = p.read_bytes()
        found = [m for m in LOCAL_PATH_MARKERS if m in data]
        if not found: continue
        if scrub and p.suffix.lower() in (".json", ".csv", ".geojson", ".txt", ".md", ".sha256"):
            new = scrub_str(data.decode("utf-8", errors="replace"))
            p.write_text(new, encoding="utf-8")
            left = [m for m in LOCAL_PATH_MARKERS if m in new.encode("utf-8")]
            hits.append((str(p.relative_to(root)), found[0].decode(), "scrubbed" if not left else "STILL_PRESENT"))
        else:
            hits.append((str(p.relative_to(root)), found[0].decode(), "binary_not_scrubbed"))
    return hits

class Timer:
    def __init__(self, name): self.name = name
    def __enter__(self): self.t = time.time(); return self
    def __exit__(self, *a):
        TIMINGS[self.name] = round(time.time() - self.t, 2)
        log(f"timing {self.name}: {TIMINGS[self.name]} s · RSS {rss_gb():.2f} GB · free RAM {free_ram_gb():.1f} GB")

def jdump(obj, path, indent=None):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=indent, allow_nan=False, default=_json_default)
    os.replace(tmp, path)

def _json_default(o):
    import numpy as _np
    if isinstance(o, (_np.integer,)): return int(o)
    if isinstance(o, (_np.floating,)): return None if not _np.isfinite(o) else float(o)
    if isinstance(o, (_np.bool_,)): return bool(o)
    if isinstance(o, _np.ndarray): return o.tolist()
    if isinstance(o, Path): return str(o)
    raise TypeError(f"not JSON serialisable: {type(o)}")

def clean_json(o):
    """Recursively replace NaN/inf by None so json.dump(allow_nan=False) succeeds."""
    import numpy as _np
    if isinstance(o, dict): return {str(k): clean_json(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean_json(v) for v in o]
    if isinstance(o, (float, _np.floating)): return float(o) if math.isfinite(float(o)) else None
    if isinstance(o, (_np.integer,)): return int(o)
    if isinstance(o, (_np.bool_,)): return bool(o)
    return o

def sha256_file(path, chunk=1 << 22):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b: break
            h.update(b)
    return h.hexdigest()

# ---- depth-limited search (watchdog #9): never an unbounded recursive glob over /kaggle/input ----
def walk_limited(root, want, max_depth=INPUT_WALK_MAX_DEPTH, stop_after=None):
    """Yield paths p under root (depth ≤ max_depth) with want(dirpath, filenames) → list of hits; stops early."""
    root = Path(root); n = 0
    if not root.exists(): return
    base_depth = len(root.parts)
    for dirpath, dirnames, filenames in os.walk(root):
        depth = len(Path(dirpath).parts) - base_depth
        if depth >= max_depth: dirnames[:] = []
        # never walk the Kaggle `competitions` mount (project rule: no competition data is read, not even folder names)
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and not (depth == 0 and d == "competitions"))
        for hit in want(Path(dirpath), filenames):
            yield hit; n += 1
            if stop_after and n >= stop_after: return

def locate_bundle(root: Path) -> Path:
    root = Path(root)
    direct = [root / "manifests" / "sources.json", root / "lumos_bundle" / "manifests" / "sources.json"]
    cands = [p for p in direct if p.exists() and p.parent.parent.name == "lumos_bundle"]
    if not cands:
        cands = list(walk_limited(root, lambda d, fs: [d / "sources.json"] if ("sources.json" in fs and d.name == "manifests"
                                                                              and d.parent.name == "lumos_bundle") else [],
                                  max_depth=INPUT_WALK_MAX_DEPTH + 2, stop_after=8))
    cands = sorted(set(cands), key=lambda p: (-p.stat().st_mtime, str(p)))
    if not cands:
        raise FileNotFoundError(f"No lumos_bundle/manifests/sources.json under {root} (depth ≤ {INPUT_WALK_MAX_DEPTH + 2}). "
                                "Attach Notebook A output (Add Input → Notebook Output).")
    if len(cands) > 1: log(f"WARNING: {len(cands)} bundles found; using newest: {cands[0]}")
    return cands[0].parent.parent

BUNDLE = locate_bundle(INPUT_ROOT)

# ---- run folder + resume (watchdog #2): reuse the latest incomplete run with identical inputs+config ----
_CFG_FP = {"code": CODE_VERSION, "quick": QUICK_TEST, "seeds": SEEDS, "years": [TRAIN_YEARS, VAL_YEARS, TEST_YEARS],
           "flags": [RUN_XGB, RUN_DL, RUN_QML, RUN_QLLM], "xgb": [XGB_ROUNDS, XGB_EARLY], "dl": [DL_EPOCHS, DL_PATIENCE],
           "b1": [B1_MAX_TRAIN, B1_ALPHA], "block": [BLOCK_CELLS, HOLDOUT_FRACTION],
           "budgets_min": [XGB_MAX_MINUTES, DL_MAX_MINUTES, QLLM_MAX_MINUTES], "gate": [GATE_UNITS, COVERAGE_TOLERANCE]}
FINGERPRINT = hashlib.sha256((sha256_file(BUNDLE / "manifests" / "sources.json") + json.dumps(_CFG_FP, sort_keys=True)).encode()).hexdigest()
STAGE_ORDER = ["ingest", "panel", "B1_poisson", "B2_xgb", "D1_mlp", "export_core", "Q1_vqc", "Q2_qllm", "final"]

def _find_resume():
    runs = WORK / "runs"
    want = os.environ.get("LUMOS_RESUME_RUN", "").strip()
    if want:
        d = runs / want
        if not (d / "stages.json").exists(): raise FileNotFoundError(f"LUMOS_RESUME_RUN={want}: no {d}/stages.json")
        st = json.load(open(d / "stages.json"))
        if st.get("fingerprint") != FINGERPRINT:
            log(f"WARNING: LUMOS_RESUME_RUN={want} has a different input/config fingerprint; cached stages will be re-verified "
                "but ingest/panel/models are recomputed")
            st["stages"] = {}
        return d, st
    if os.environ.get("LUMOS_AUTO_RESUME", "1") != "1" or not runs.exists(): return None, None
    for d in sorted([p for p in runs.iterdir() if p.is_dir()], reverse=True):
        try: st = json.load(open(d / "stages.json"))
        except Exception: continue
        if not st.get("complete") and st.get("fingerprint") == FINGERPRINT and st.get("stages"):
            return d, st
    return None, None

_rd, _st = _find_resume()
if _rd is not None:
    RUN_DIR, RUN_TS = _rd, _rd.name
    STAGE_STATE = _st
    STAGE_STATE.setdefault("resumes", []).append(dt.datetime.now(dt.timezone.utc).isoformat())
    RESUMED = True
else:
    RUN_TS = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    RUN_DIR = WORK / "runs" / RUN_TS
    RUN_DIR.mkdir(parents=True, exist_ok=False)
    STAGE_STATE = {"run_id": RUN_TS, "fingerprint": FINGERPRINT, "complete": False, "stages": {}, "resumes": []}
    RESUMED = False
APP_STAGE = RUN_DIR / "lumos_app_bundle"
APP_FINAL = WORK / "lumos_app_bundle"
APP_ZIP = WORK / "lumos_app_bundle.zip"
CACHE = RUN_DIR / "cache"
RECOMPUTED = set()          # stages recomputed in this session → all later stages are recomputed too

def _save_stages():
    jdump(STAGE_STATE, RUN_DIR / "stages.json", indent=1)

def stage_save(name, files=(), meta=None):
    """Checkpoint a finished stage: sha256 of every artefact (relative to RUN_DIR) + small JSON meta."""
    STAGE_STATE["stages"][name] = {"done_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                                   "files": {str(Path(f).relative_to(RUN_DIR)): sha256_file(f) for f in files},
                                   "meta": clean_json(meta or {})}
    _save_stages()

def stage_load(name):
    """Return the stage meta if the stage was checkpointed AND every artefact verifies by sha256 AND no earlier stage was
    recomputed in this session; else None (stage must be recomputed)."""
    st = STAGE_STATE["stages"].get(name)
    if not st: RECOMPUTED.add(name); return None
    earlier = STAGE_ORDER[:STAGE_ORDER.index(name)] if name in STAGE_ORDER else []
    if any(e in RECOMPUTED for e in earlier):
        log(f"RESUME: stage {name} invalidated (an earlier stage was recomputed)"); RECOMPUTED.add(name); return None
    for rel, h in st["files"].items():
        p = RUN_DIR / rel
        if not p.exists() or sha256_file(p) != h:
            log(f"RESUME: stage {name} artefact {rel} missing/changed → recompute"); RECOMPUTED.add(name); return None
    log(f"RESUME: stage {name} reused from {RUN_TS} ({len(st['files'])} artefacts verified by sha256)")
    return st.get("meta") or {}

def stop_hook(name):
    """TEST ONLY: LUMOS_STOP_AFTER=<stage> simulates a kernel crash right after that stage's checkpoint."""
    if STOP_AFTER == name:
        _save_stages()
        raise RuntimeError(f"LUMOS_STOP_AFTER={name}: simulated crash after stage '{name}' (checkpoint written)")

_save_stages()
log(f"Lumos Notebook B {CODE_VERSION} · run {RUN_TS}{' (RESUMED)' if RESUMED else ''} · QUICK_TEST={QUICK_TEST} · "
    f"input={INPUT_ROOT} · bundle={BUNDLE} · work={WORK}")
if RESUMED: log(f"resuming run {RUN_TS}: checkpointed stages {list(STAGE_STATE['stages'])}")

# %% [markdown]
# ## Phase 2 · Section 2.3 — Offline guard and environment probe
# **What this cell does:** Installs a network guard (every non-loopback socket connection and DNS lookup is refused and recorded), records Python, RAM, disk, CPU and package versions, runs a small torch forward/backward smoke test on the GPU, picks the device and writes `env_B.json`.
#
# **Steps**
#
# - [ ] 2.3.1 Run the cell.
# - [ ] 2.3.2 Look for `network guard installed: all non-loopback sockets/DNS are refused`.
# - [ ] 2.3.3 Read the printed JSON: `device_selected`, `smoke_test`, `ram` and `disk_work`.
# - [ ] 2.3.4 Read the `GPU:` line (name, VRAM, compute capability, CUDA version, bf16 support).
#
# **Check before moving on**
#
# - [ ] `"device_selected": "cuda"` and `"smoke_test"` shows `"ok": true`.
# - [ ] The `GPU:` line names the RTX PRO 6000 Blackwell.
#
# **If it fails:** `device_selected: cpu` means no usable GPU: the accelerator is not set, or the installed torch build does not support this GPU (the smoke test `error` says which). The notebook still runs on CPU with capped samples and one seed for B2 and D1, but much more slowly. Fix the accelerator in 2.1.4, restart the session and Run All.
#
# **Time:** estimate: under 1 min

# %%
# ===================== OFFLINE GUARD + ENVIRONMENT PROBE =====================
import socket
_LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0", ""}
_orig_connect, _orig_connect_ex, _orig_getaddrinfo = socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo
BLOCKED_CONNECTIONS = []

def _is_local(addr):
    if isinstance(addr, (tuple, list)) and addr:
        h = str(addr[0])
    else:
        return True   # AF_UNIX paths etc.
    return h in _LOCAL_HOSTS or h.startswith("127.")

def _guard_connect(self, address):
    if self.family == getattr(socket, "AF_UNIX", None) or _is_local(address):
        return _orig_connect(self, address)
    BLOCKED_CONNECTIONS.append(str(address))
    raise ConnectionRefusedError(f"Lumos Notebook B is offline-only; blocked connection to {address!r}")

def _guard_connect_ex(self, address):
    if self.family == getattr(socket, "AF_UNIX", None) or _is_local(address):
        return _orig_connect_ex(self, address)
    BLOCKED_CONNECTIONS.append(str(address))
    raise ConnectionRefusedError(f"Lumos Notebook B is offline-only; blocked connection to {address!r}")

def _guard_getaddrinfo(host, *a, **k):
    if host is None or str(host) in _LOCAL_HOSTS or str(host).startswith("127."):
        return _orig_getaddrinfo(host, *a, **k)
    BLOCKED_CONNECTIONS.append(f"dns:{host}")
    raise socket.gaierror(f"Lumos Notebook B is offline-only; blocked DNS lookup of {host!r}")

socket.socket.connect = _guard_connect
socket.socket.connect_ex = _guard_connect_ex
socket.getaddrinfo = _guard_getaddrinfo
log("network guard installed: all non-loopback sockets/DNS are refused")

import numpy as np
import pandas as pd
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

def pkg_version(name):
    try:
        from importlib.metadata import version
        return version(name)
    except Exception:
        return None

def env_probe():
    info = {"utc": dt.datetime.now(dt.timezone.utc).isoformat(), "python": sys.version, "platform": platform.platform(),
            "quick_test": QUICK_TEST, "run_id": RUN_TS}
    try:
        du = shutil.disk_usage(WORK); info["disk_work"] = {"total_gb": round(du.total / 1e9, 1), "free_gb": round(du.free / 1e9, 1)}
    except Exception as e: info["disk_work"] = str(e)
    try:
        import psutil
        vm = psutil.virtual_memory(); info["ram"] = {"total_gb": round(vm.total / 1e9, 1), "available_gb": round(vm.available / 1e9, 1)}
    except Exception:
        try:
            mem = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
            info["ram"] = {"total_gb": round(mem["MemTotal"] / 1e6, 1), "available_gb": round(mem.get("MemAvailable", 0) / 1e6, 1)}
        except Exception as e: info["ram"] = str(e)
    info["cpu_count"] = os.cpu_count()
    info["packages"] = {p: pkg_version(p) for p in ["numpy", "pandas", "scikit-learn", "xgboost", "torch", "pennylane",
                         "pennylane-lightning", "pennylane-lightning-gpu", "shapely", "pyarrow", "onnx", "onnxruntime",
                         "matplotlib", "transformers", "jsonschema", "polars", "psutil"]}
    dev = "cpu"
    try:
        import torch
        info["torch_cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            p = torch.cuda.get_device_properties(0)
            info["gpu"] = {"name": p.name, "vram_gb": round(p.total_memory / 1e9, 1), "capability": f"{p.major}.{p.minor}",
                           "count": torch.cuda.device_count(), "cuda": torch.version.cuda, "bf16": torch.cuda.is_bf16_supported()}
            dev = "cuda"
        t0 = time.time()
        a = torch.randn(1024, 1024, device=dev, requires_grad=True)
        loss = (a @ a.T).tanh().sum(); loss.backward()
        if dev == "cuda": torch.cuda.synchronize()
        ok = bool(torch.isfinite(a.grad).all().item())
        info["smoke_test"] = {"device": dev, "ok": ok, "seconds": round(time.time() - t0, 3)}
        if not ok: raise RuntimeError("non-finite gradient in smoke test")
    except Exception as e:
        info["smoke_test"] = {"device": dev, "ok": False, "error": repr(e)}
        dev = "cpu"
    info["device_selected"] = dev
    return info, dev

with Timer("env_probe"):
    ENV, DEVICE = env_probe()
import torch
TORCH_DEVICE = torch.device(DEVICE)
def _cuda_cc_major():
    try: return int(torch.cuda.get_device_capability(0)[0])
    except Exception: return 0
# review P5: bf16 autocast only where bf16 is native (compute capability >= 8.0, Ampere or newer; a T4 is 7.5 and would emulate it slowly)
AMP_BF16 = bool(DEVICE == "cuda" and _cuda_cc_major() >= 8)
ENV["amp_bf16"] = AMP_BF16
jdump(ENV, RUN_DIR / "env_B.json", indent=1)
print(json.dumps({k: ENV[k] for k in ["device_selected", "smoke_test", "ram", "disk_work"] if k in ENV}, indent=1))
if "gpu" in ENV: print("GPU:", ENV["gpu"])

# %% [markdown]
# ## Phase 2 · Section 2.4 — Verify the bundle
# **What this cell does:** Reads `sources.json`, checks for the synthetic-fixture markers, and checks the SHA-256 of every file marked `ok`. A file that is missing or does not match is skipped, and a manifest `error` is treated exactly like `missing`. If `RUN_QML` is on, it then installs PennyLane offline from Notebook A's wheelhouse, pinning torch, numpy, scipy, pandas and scikit-learn so they are never upgraded (with a `--no-deps` retry).
#
# **Steps**
#
# - [ ] 2.4.1 Run the cell.
# - [ ] 2.4.2 Read `sources: N entries; checksum ok=..., mismatches=..., missing files=..., unhashed=...`.
# - [ ] 2.4.3 Read `SYNTHETIC=... [...]`.
# - [ ] 2.4.4 Read `offline pip: {...}` and its `import_check` entry.
#
# **Check before moving on**
#
# - [ ] `mismatches=0` and `missing files=0`.
# - [ ] `SYNTHETIC=False []` on real data. `True` means the synthetic test fixture is attached: every number will be demo data.
# - [ ] `import_check` says `pennylane importable` (or you accept the built-in simulator fallback).
#
# **If it fails:** Mismatches or missing files mean Notebook A's output is incomplete or corrupted: commit Notebook A again (1.12) and attach the new version. Skipped files are never used, so the run can continue, but those years become unavailable. `pennylane NOT importable` only affects the Q1 cross-check.
#
# **Time:** estimate: 1–3 min (hashing several GB)

# %%
# ===================== VERIFY BUNDLE CHECKSUMS + OFFLINE PIP =====================
def resolve_local(bundle: Path, lp, src):
    if not lp: return None
    p = Path(lp)
    tries = [p] if p.is_absolute() else []
    s = str(lp).replace("\\", "/")
    if "lumos_bundle/" in s: s = s.split("lumos_bundle/", 1)[1]
    tries += [bundle / s, bundle.parent / s]
    for t in tries:
        if t.exists(): return t
    hits = list(walk_limited(bundle / "raw", lambda d, fs: [d / Path(s).name] if Path(s).name in fs else [], max_depth=5, stop_after=1))
    return hits[0] if hits else None

def detect_synthetic(bundle: Path, sources):
    flags = []
    for f in (bundle / "manifests").glob("*.json"):
        try:
            d = json.load(open(f))
            if isinstance(d, dict) and d.get("synthetic") is True: flags.append(f.name)
        except Exception: pass
    if any(isinstance(s, dict) and s.get("synthetic") is True for s in sources): flags.append("sources[].synthetic")
    if list(bundle.glob("FIXTURE*")): flags.append("FIXTURE marker file")
    return len(flags) > 0, flags

with Timer("bundle_verify"):
    _raw_sources = json.load(open(BUNDLE / "manifests" / "sources.json"))
    SOURCES = _raw_sources if isinstance(_raw_sources, list) else _raw_sources.get("sources", [])
    SYNTHETIC, SYNTHETIC_FLAGS = detect_synthetic(BUNDLE, SOURCES)
    CONFIG_A = {}
    try: CONFIG_A = json.load(open(BUNDLE / "manifests" / "config_A.json"))
    except Exception: pass
    CHECKSUM_REPORT = {"ok": 0, "mismatch": [], "missing_file": [], "no_hash": []}
    for s in SOURCES:
        s["_path"] = None; s["_usable"] = False
        if s.get("status") != "ok": continue      # v1.1: status "error" is treated exactly like "missing"
        p = resolve_local(BUNDLE, s.get("local_path"), s)
        if p is None:
            CHECKSUM_REPORT["missing_file"].append(s.get("id")); s["_verify"] = "missing_file"; continue
        if s.get("sha256"):
            h = sha256_file(p)
            if h != s["sha256"]:
                CHECKSUM_REPORT["mismatch"].append({"id": s.get("id"), "expected": s["sha256"], "got": h}); s["_verify"] = "sha256_mismatch"; continue
            CHECKSUM_REPORT["ok"] += 1
        else:
            CHECKSUM_REPORT["no_hash"].append(s.get("id"))
        s["_path"] = str(p); s["_usable"] = True; s["_verify"] = "ok"
    log(f"sources: {len(SOURCES)} entries; checksum ok={CHECKSUM_REPORT['ok']}, mismatches={len(CHECKSUM_REPORT['mismatch'])}, "
        f"missing files={len(CHECKSUM_REPORT['missing_file'])}, unhashed={len(CHECKSUM_REPORT['no_hash'])}")
    for m in CHECKSUM_REPORT["mismatch"]: log(f"  SKIP (sha256 mismatch): {m['id']}")
    log(f"SYNTHETIC={SYNTHETIC} {SYNTHETIC_FLAGS}")
    jdump(CHECKSUM_REPORT, RUN_DIR / "checksum_report.json", indent=1)

# Optional offline install of PennyLane from Notebook A's wheelhouse. Never upgrades torch/numpy (constraints file);
# v1.1: if the resolver fails (typically a numpy pin conflict) retry with --no-deps, then verify the import.
def try_offline_install(pkgs=("pennylane", "pennylane-lightning")):
    res = {}
    wh = BUNDLE / "wheelhouse"
    for pkg in pkgs:
        modname = {"pennylane-lightning": "pennylane_lightning"}.get(pkg, pkg.replace("-", "_"))
        try:
            __import__(modname); res[pkg] = "already_installed"; continue
        except Exception: pass
        if not list(wh.glob("*.whl")):
            res[pkg] = "not_installed: wheelhouse empty"; continue
        cons = RUN_DIR / "pip_constraints.txt"
        pins = [f"{p}=={pkg_version(p)}" for p in ["torch", "numpy", "scipy", "pandas", "scikit-learn"] if pkg_version(p)]
        cons.write_text("\n".join(pins) + "\n")
        base = [sys.executable, "-m", "pip", "install", "--no-index", "--find-links", str(wh), "-c", str(cons)]
        try:
            out = subprocess.run(base + [pkg], capture_output=True, text=True, timeout=600)
            if out.returncode == 0:
                res[pkg] = "installed"
            else:
                err1 = out.stderr[-300:]
                out2 = subprocess.run(base + ["--no-deps", pkg], capture_output=True, text=True, timeout=600)
                res[pkg] = ("installed --no-deps (resolver failed: " + err1.strip()[-160:] + ")") if out2.returncode == 0 \
                    else f"failed (with and without --no-deps): {out2.stderr[-300:]}"
        except Exception as e:
            res[pkg] = f"failed: {e!r}"
    try:
        import importlib; importlib.invalidate_caches(); import pennylane  # noqa: F401
        res["import_check"] = "pennylane importable"
    except Exception as e:
        res["import_check"] = f"pennylane NOT importable ({e!r}); Q1 uses the built-in torch statevector simulator"
    return res

PIP_RESULT = {}
if RUN_QML:
    try:
        PIP_RESULT = try_offline_install()
    except Exception as e:
        PIP_RESULT = {"pennylane": f"failed: {e!r}"}
    log(f"offline pip: {PIP_RESULT}")
ENV["offline_pip"] = PIP_RESULT
jdump(ENV, RUN_DIR / "env_B.json", indent=1)

# %% [markdown]
# ## Phase 2 · Section 2.5 — Ingest the fire records
# **What this cell does:** Reads every usable FIRMS file, removes exact duplicate rows, quarantines rows with an invalid latitude, longitude or date, negative FRP or an unknown satellite (each with a reason), assigns every detection to a 5 km equal-area cell and UTC month, and aggregates counts per platform (type 0 vegetation fires as the main count, other types as static sources). Optional NRT files go to a separate recent layer that is never used for training. The result is checkpointed.
#
# **Steps**
#
# - [ ] 2.5.1 Run the cell.
# - [ ] 2.5.2 Watch one line per file: `ingest [  i/N] <id> rows=... quarantined=... last=YYYY-MM-DD ...s · RSS ... GB`.
# - [ ] 2.5.3 `skipped (...)` lines are files that were missing or failed 2.4; they stay unavailable, never zero.
# - [ ] 2.5.4 If NRT data was fetched, look for `ingest NRT ...: N detections (recent observed layer only; not used for training)`.
# - [ ] 2.5.5 Read the closing line `ingested X raw rows; duplicates removed Y; quarantined Z; aggregate rows W` and the quarantine reason counts printed below it.
#
# **Check before moving on**
#
# - [ ] Quarantined rows are under 1% of raw rows (the fixture had 123 of 141,557).
# - [ ] No `INGEST ERROR` lines.
# - [ ] RSS stays well below the RAM shown in 2.3.
#
# **If it fails:** A file with `INGEST ERROR` is marked unusable (treated as missing) and the run continues; the traceback is in `runs/<ts>/ingest/ingest_log.json`. If the kernel dies (out of memory), restart and Run All: the run resumes from the last verified checkpoint.
#
# **Time:** estimate: 5–15 min on real data (fixture: 3 s; real data untested)

# %%
# ===================== INGEST (contract §3) =====================
PLATFORMS = ["aqua", "terra", "snpp", "noaa20"]
PLAT_CODE = {p: i for i, p in enumerate(PLATFORMS)}
SENSOR_FAMILY = {"aqua": "modis", "terra": "modis", "snpp": "viirs-snpp", "noaa20": "viirs-noaa20"}
# first day of data per platform (FIRMS): partial first months are flagged `partial` and kept out of training/baselines/anomaly
PLATFORM_START = {"aqua": dt.date(2002, 7, 3), "terra": dt.date(2000, 11, 1), "snpp": dt.date(2012, 1, 20),
                  "noaa20": dt.date(2018, 1, 5)}     # Aqua 2002-07-03 (NASA); NOAA-20: FIRMS pages disagree (2018-04-01 / 2020-01-01), not used here
PLATFORM_LABEL = {"aqua": "Aqua MODIS", "terra": "Terra MODIS", "snpp": "S-NPP VIIRS", "noaa20": "NOAA-20 VIIRS"}
STR_COLS = ["acq_date", "acq_time", "satellite", "instrument", "confidence", "version", "daynight"]
FIRE_FAMILIES = ("modis", "viirs-snpp", "viirs-noaa20")

def map_platform(sat: pd.Series, family: str) -> np.ndarray:
    s = sat.astype(str).str.strip().str.lower()
    out = np.full(len(s), -1, dtype=np.int8)
    if family == "modis":
        out[s.isin(["aqua", "a"]).to_numpy()] = PLAT_CODE["aqua"]
        out[s.isin(["terra", "t"]).to_numpy()] = PLAT_CODE["terra"]
    else:
        out[s.isin(["n", "npp", "s-npp", "snpp", "suomi npp"]).to_numpy()] = PLAT_CODE["snpp"]
        out[s.isin(["1", "n20", "noaa-20", "noaa20", "j1", "noaa 20"]).to_numpy()] = PLAT_CODE["noaa20"]
    return out

def lonlat_to_cell(lon, lat):
    x = R_EARTH * np.radians(lon)
    y = R_EARTH * np.sin(np.radians(lat))
    ix = np.floor(x / CELL_M).astype(np.int64); iy = np.floor(y / CELL_M).astype(np.int64)
    return ix, iy, (ix + IX_OFF) * KEY_MUL + (iy + IY_OFF)

def key_to_ixiy(key):
    key = np.asarray(key, dtype=np.int64)
    return key // KEY_MUL - IX_OFF, key % KEY_MUL - IY_OFF

def cell_centre(ix, iy):
    lon = np.degrees((np.asarray(ix) + 0.5) * CELL_M / R_EARTH)
    lat = np.degrees(np.arcsin(np.clip((np.asarray(iy) + 0.5) * CELL_M / R_EARTH, -1, 1)))
    return lon, lat

def parse_times(df):
    tstr = df["acq_time"].astype(str).str.strip().str.replace(r"\.0+$", "", regex=True).str.zfill(4)
    return pd.to_datetime(df["acq_date"].astype(str).str.strip() + " " + tstr, format="%Y-%m-%d %H%M", errors="coerce", utc=True)

def ingest_file(src):
    """Read one FIRMS country CSV; returns (aggregate DataFrame, quarantine DataFrame, stats). Fully vectorised."""
    path, family = src["_path"], src["sensor"]
    df = pd.read_csv(path, dtype={c: str for c in STR_COLS}, low_memory=False)
    stats = {"id": src["id"], "rows_raw": int(len(df))}
    dup = df.duplicated(keep="first").to_numpy()
    stats["exact_duplicates_removed"] = int(dup.sum())
    df = df.loc[~dup].reset_index(drop=True)
    lat = pd.to_numeric(df.get("latitude"), errors="coerce").to_numpy(np.float64)
    lon = pd.to_numeric(df.get("longitude"), errors="coerce").to_numpy(np.float64)
    frp = pd.to_numeric(df.get("frp"), errors="coerce").to_numpy(np.float64)
    ts = parse_times(df)
    plat = map_platform(df["satellite"], family)
    conds = {"invalid_latitude": ~np.isfinite(lat) | (np.abs(lat) > 90),
             "invalid_longitude": ~np.isfinite(lon) | (np.abs(lon) > 180),
             "invalid_datetime": ts.isna().to_numpy(),
             "negative_frp": np.nan_to_num(frp, nan=0.0) < 0,
             "unknown_platform": plat < 0}
    bad = np.zeros(len(df), bool)
    for c in conds.values(): bad |= c
    q = None
    if bad.any():
        q = df.loc[bad].astype(str).copy()
        reasons = np.array([""] * int(bad.sum()), dtype=object)
        for name, c in conds.items():
            cb = c[bad]; reasons[cb] = np.where(reasons[cb] == "", name, reasons[cb] + ";" + name)
        q["quarantine_reason"] = reasons; q["source_id"] = src["id"]
    stats["quarantined"] = int(bad.sum())
    keep = ~bad
    df = df.loc[keep].reset_index(drop=True)
    lat, lon, frp, plat = lat[keep], lon[keep], frp[keep], plat[keep]
    ts = ts[keep]
    ym = (ts.dt.year.to_numpy() * 12 + ts.dt.month.to_numpy() - 1).astype(np.int32)
    ix, iy, key = lonlat_to_cell(lon, lat)
    assert grid_key_in_range(ix, iy).all(), f"{src['id']}: cell index outside the packable key range (IX_OFF/IY_OFF/KEY_MUL)"   # whole globe fits; guards the packing
    typ = pd.to_numeric(df["type"], errors="coerce").to_numpy(np.float64) if "type" in df.columns else np.full(len(df), np.nan)
    stats["type_missing"] = int(np.isnan(typ).sum())
    main = (typ == 0) | np.isnan(typ)    # NRT files may lack `type`: counted as main, logged
    nrt = df["version"].astype(str).str.upper().str.contains("NRT", na=False).to_numpy() if "version" in df.columns else np.zeros(len(df), bool)
    day = df["daynight"].astype(str).str.upper().str.startswith("D").to_numpy()
    conf = pd.to_numeric(df["confidence"], errors="coerce").to_numpy(np.float64) if family == "modis" else np.full(len(df), np.nan)
    scan = pd.to_numeric(df.get("scan"), errors="coerce").to_numpy(np.float64)
    stats["type_counts"] = {str(k): int(v) for k, v in pd.Series(typ).value_counts(dropna=False).items()}
    stats["nrt_rows"] = int(nrt.sum())
    stats["rows_valid"] = int(len(df))
    stats["max_ym"] = int(ym.max()) if len(ym) else None
    stats["last_date"] = ts.max().strftime("%Y-%m-%d") if len(ts) else None
    # rows per platform × month (all types): used to detect platform outages inside an `ok` file (missing ≠ zero)
    pm = pd.DataFrame({"p": plat, "ym": ym}).value_counts()
    stats["platform_month_rows"] = {PLATFORMS[int(p)]: {} for p in np.unique(plat)}
    for (p, m), n in pm.items(): stats["platform_month_rows"][PLATFORMS[int(p)]][str(int(m))] = int(n)
    fin = lambda a: np.isfinite(a) & main
    agg = pd.DataFrame({
        "platform": plat, "key": key, "ym": ym,
        "count": main.astype(np.int32), "static": (~main).astype(np.int32),
        "day": (main & day).astype(np.int32), "night": (main & ~day).astype(np.int32),
        "frp_sum": np.where(fin(frp), frp, 0.0), "frp_n": fin(frp).astype(np.int32),
        "conf_sum": np.where(fin(conf), conf, 0.0), "conf_n": fin(conf).astype(np.int32),
        "scan_sum": np.where(fin(scan), scan, 0.0), "scan_n": fin(scan).astype(np.int32),
        "nrt": (main & nrt).astype(np.int32)})
    agg = agg.groupby(["platform", "key", "ym"], sort=False).sum().reset_index()
    if WRITE_DETECTIONS_PARQUET:
        try:
            det = pd.DataFrame({"source_id": src["id"], "platform": pd.Categorical.from_codes(plat, PLATFORMS), "acq_utc": ts.reset_index(drop=True),
                                "latitude": lat.astype(np.float32), "longitude": lon.astype(np.float32), "frp": frp.astype(np.float32),
                                "confidence": df["confidence"].astype(str).to_numpy(), "scan": scan.astype(np.float32), "daynight": np.where(day, "D", "N"),
                                "type": typ.astype(np.float32), "nrt": nrt, "ix": ix.astype(np.int32), "iy": iy.astype(np.int32)})
            outp = RUN_DIR / "ingest" / "detections" / f"{src['id']}.parquet"; outp.parent.mkdir(parents=True, exist_ok=True)
            det.to_parquet(outp, index=False, compression="zstd")
        except Exception as e:
            stats["parquet_error"] = repr(e)
    return agg, q, stats

def ingest_nrt_file(src):
    """Optional Area-API NRT file (A's raw/firms_api/...): parsed into a SEPARATE recent-observed layer. Never used for
    training, baselines, anomalies or the harmonised series."""
    df = pd.read_csv(src["_path"], dtype={c: str for c in STR_COLS}, low_memory=False)
    fam = "viirs" if str(src.get("sensor", "")).upper().startswith("VIIRS") else "modis"
    lat = pd.to_numeric(df.get("latitude"), errors="coerce").to_numpy(np.float64)
    lon = pd.to_numeric(df.get("longitude"), errors="coerce").to_numpy(np.float64)
    ts = parse_times(df) if len(df) else pd.Series([], dtype="datetime64[ns, UTC]")
    sat = df["satellite"].astype(str).str.strip() if "satellite" in df.columns else pd.Series([""] * len(df))
    plat = map_platform(sat, "modis" if fam == "modis" else "viirs")
    ok = np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) <= 90) & (np.abs(lon) <= 180) & ts.notna().to_numpy() & (plat >= 0)
    if "type" in df.columns:
        ok &= (pd.to_numeric(df["type"], errors="coerce").fillna(0).to_numpy() == 0)
    m = re.search(r"_(\d{4}-\d{2}-\d{2})_(\d+)d$", str(src.get("id", "")))
    cover = None
    if m:
        d0 = dt.date.fromisoformat(m.group(1)); cover = [d0.isoformat(), (d0 + dt.timedelta(days=int(m.group(2)) - 1)).isoformat()]
    return pd.DataFrame({"source_id": src["id"], "country": src.get("country"), "platform": np.array(PLATFORMS + ["?"])[np.where(plat >= 0, plat, 4)][ok],
                         "date": ts[ok].dt.strftime("%Y-%m-%d").to_numpy(), "lat": lat[ok], "lon": lon[ok]}), cover

INGEST_DIR = RUN_DIR / "ingest"
_ing = stage_load("ingest")
if _ing is not None:
    with Timer("ingest(resumed)"):
        AGG = pd.read_parquet(INGEST_DIR / "cell_month_platform_agg.parquet")
        AGG["country"] = AGG["country"].astype("category")
        QUAR = pd.read_parquet(INGEST_DIR / "quarantine.parquet")
        INGEST_STATS = json.load(open(INGEST_DIR / "ingest_log.json"))
        _meta = json.load(open(INGEST_DIR / "source_meta.json"))
        for s in SOURCES:
            for k, v in (_meta.get(str(s.get("id"))) or {}).items(): s[k] = v
        NRT_DET = pd.read_parquet(INGEST_DIR / "nrt_layer.parquet") if (INGEST_DIR / "nrt_layer.parquet").exists() else None
        NRT_COVER = _ing.get("nrt_cover", {})
else:
    INGEST_STATS, _aggs, _quar, _nrt, NRT_COVER = [], [], [], [], {}
    with Timer("ingest"):
        _fire = [s for s in SOURCES if s.get("sensor") in FIRE_FAMILIES]
        for i, s in enumerate(_fire, 1):
            if not s.get("_usable"):
                INGEST_STATS.append({"id": s.get("id"), "skipped": s.get("_verify") or s.get("status")})
                log(f"ingest [{i:>3}/{len(_fire)}] {s.get('id'):<34} skipped ({s.get('_verify') or s.get('status')})"); continue
            t0 = time.time()
            try:
                a, q, st = ingest_file(s)
                a["country"] = s["country"]; _aggs.append(a); INGEST_STATS.append(st)
                if q is not None: _quar.append(q)
                s["_max_ym"], s["_last_date"], s["_rows"] = st["max_ym"], st["last_date"], st["rows_valid"]
                s["_platform_month_rows"] = st["platform_month_rows"]
                log(f"ingest [{i:>3}/{len(_fire)}] {s['id']:<34} rows={st['rows_raw']:>9,} quarantined={st['quarantined']:>5} "
                    f"last={st['last_date']} {time.time() - t0:5.1f}s · RSS {rss_gb():.2f} GB")
            except Exception as e:
                s["_usable"] = False; s["_verify"] = f"ingest_error: {e!r}"
                INGEST_STATS.append({"id": s.get("id"), "error": repr(e), "traceback": traceback.format_exc()[-1500:]})
                log(f"INGEST ERROR {s.get('id')}: {e!r}")
        # optional NRT Area-API files → separate recent-observed layer (never training)
        for s in [s for s in SOURCES if s.get("kind") == "firms_api"]:
            if not s.get("_usable"): continue
            try:
                d, cover = ingest_nrt_file(s); _nrt.append(d); NRT_COVER[s["id"]] = {"country": s.get("country"), "sensor": s.get("sensor"), "cover": cover}
                log(f"ingest NRT {s['id']}: {len(d)} detections (recent observed layer only; not used for training)")
            except Exception as e:
                log(f"NRT ingest failed {s.get('id')}: {e!r}")
        AGG = pd.concat(_aggs, ignore_index=True); del _aggs
        AGG["country"] = AGG["country"].astype("category")       # watchdog #14: categorical groupby key
        AGG = AGG.groupby(["country", "platform", "key", "ym"], sort=False, observed=True).sum().reset_index()
        QUAR = pd.concat(_quar, ignore_index=True) if _quar else pd.DataFrame({"quarantine_reason": pd.Series(dtype=str)})
        NRT_DET = pd.concat(_nrt, ignore_index=True) if _nrt else None
        INGEST_DIR.mkdir(exist_ok=True)
        QUAR.to_parquet(INGEST_DIR / "quarantine.parquet", index=False)
        AGG.to_parquet(INGEST_DIR / "cell_month_platform_agg.parquet", index=False)
        jdump(INGEST_STATS, INGEST_DIR / "ingest_log.json", indent=1)
        jdump({str(s.get("id")): {k: s.get(k) for k in ["_max_ym", "_last_date", "_rows", "_platform_month_rows", "_usable", "_verify"]}
               for s in SOURCES}, INGEST_DIR / "source_meta.json")
        _files = [INGEST_DIR / f for f in ["quarantine.parquet", "cell_month_platform_agg.parquet", "ingest_log.json", "source_meta.json"]]
        if NRT_DET is not None:
            NRT_DET.to_parquet(INGEST_DIR / "nrt_layer.parquet", index=False); _files.append(INGEST_DIR / "nrt_layer.parquet")
        stage_save("ingest", _files, {"nrt_cover": NRT_COVER})
log(f"ingested {sum(x.get('rows_raw', 0) for x in INGEST_STATS):,} raw rows; duplicates removed "
    f"{sum(x.get('exact_duplicates_removed', 0) for x in INGEST_STATS):,}; quarantined {len(QUAR):,}; aggregate rows {len(AGG):,}")
if len(QUAR): print(QUAR["quarantine_reason"].value_counts().head(10))
stop_hook("ingest")

# %% [markdown]
# ## Phase 2 · Section 2.6 — Grid, panel, features and areas
# **What this cell does:** Decides for every country, platform and month whether data is complete, partial or missing (header-only files, platform outages, months after the last date of a current-year file and months before a satellite's start are missing or partial, never zero), builds the cell × month arrays with the model features (3×3 neighbourhood, train-only climatology, month, latitude, country), checkpoints them, then assigns cells to the areas of interest: each country plus Bangladesh's divisions, New South Wales and California, using the Natural Earth polygons.
#
# **Steps**
#
# - [ ] 2.6.1 Run the cell.
# - [ ] 2.6.2 Read `panel <country>: N cells` for each country, then `panel: 3 countries, N cells × M months = ... cell-months (2001–2025)`.
# - [ ] 2.6.2a Before the panel is built, read `panel plan: ... panel arrays ≈ X GB, peak while building the largest country ≈ Y GB (free RAM Z GB)`. A `WARNING: estimated panel memory exceeds 60% of free RAM` line means the kernel may run out of memory; write down the numbers (they are also in `metrics.json` under `panel_memory`).
# - [ ] 2.6.3 Read the `availability <country> <platform>: complete=... partial=[...] missing=...` lines.
# - [ ] 2.6.4 A `NOTE: BD-H (Mymensingh) is absent from this Natural Earth file ...` line is expected: Natural Earth's Dhaka polygon still contains Mymensingh.
# - [ ] 2.6.5 Read `Bangladesh: k cells assigned to the nearest division (≤0.1°), u cells unassigned ...`.
# - [ ] 2.6.6 Read one `AOI <id> <kind> <name> cells=...` line per area.
#
# **Check before moving on**
#
# - [ ] Aqua availability lists `2002-07` as partial and S-NPP lists `2012-01` as partial (the satellites' first months).
# - [ ] The AOI lines include `BGD`, the Bangladesh divisions (`BGD-A` ...), `AUS`, `AUS-NSW`, `USA` and `USA-CA`, each with cells > 0.
# - [ ] Unassigned Bangladesh cells are a small share of the `BGD` cells (offshore detections).
#
# **If it fails:** If the kernel dies here (Australia and the United States are the largest arrays), restart and Run All: ingest is reused from its checkpoint. Note the RSS in the log for the report; real Australia and United States scale is untested. The United States file includes Alaska, Hawaii and territories, but only cells with at least one detection enter the panel, so memory grows with the number of such cells, not with the area. If AOIs are missing, the Natural Earth files from 1.8 are missing from the bundle.
#
# **Time:** estimate: 2–10 min (fixture: under 1 s)

# %%
# ===================== GRID, PANEL, FEATURES, AOIs (contract §3–4) =====================
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

COUNTRIES = sorted([str(c) for c in AGG["country"].unique()], key=lambda c: (c not in AOI_COUNTRIES, c))
ISO = {c: COUNTRY_ISO3.get(c, re.sub(r"[^A-Z]", "", c.upper())[:3]) for c in COUNTRIES}
fire_years = [int(s["year"]) for s in SOURCES if s.get("_usable") and s.get("sensor") in ("modis", "viirs-snpp")]
YEAR_MIN, YEAR_MAX = min(2001, min(fire_years)), max(fire_years)
YM0 = YEAR_MIN * 12
NM = (YEAR_MAX - YEAR_MIN + 1) * 12
ST_MISSING, ST_PARTIAL, ST_COMPLETE = 0, 1, 2
ST_NAME = {0: "missing", 1: "partial", 2: "complete"}

def month_status(country, pname):
    """Per panel month: 2 complete, 1 partial (observed but incomplete → kept for display, excluded from training/baselines/
    anomalies), 0 missing (NaN, never zero). Rules: source file ok+verified; header-only file → missing; current-year file
    (year ≥ retrieval year) → months after the last acq_date missing, the last month partial; MODIS platform absent from an ok
    file while the other platform is active → outage (missing); platform lifetime with partial first month."""
    fam = SENSOR_FAMILY[pname]
    st = np.zeros(NM, np.int8); notes = {}
    for s in SOURCES:
        if s.get("sensor") != fam or s.get("country") != country or not s.get("_usable"): continue
        y = int(s["year"])
        if y < YEAR_MIN or y > YEAR_MAX: continue
        lo = (y - YEAR_MIN) * 12
        if not s.get("_rows"):
            for k in range(12): notes[lo + k] = f"{s['id']} is header-only (0 rows): treated as unavailable, not zero"
            continue
        st[lo:lo + 12] = ST_COMPLETE
        ret_y = int(str(s.get("retrieved_utc") or "0")[:4] or 0)
        if y >= ret_y and s.get("_last_date"):
            ld = dt.date.fromisoformat(s["_last_date"]); lm = (ld.year - YEAR_MIN) * 12 + ld.month - 1
            month_end = (ld.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
            if lo <= lm < lo + 12:
                if ld < month_end:
                    st[lm] = min(st[lm], ST_PARTIAL); notes[lm] = f"current-year file {s['id']} ends {ld} (partial month)"
                for k in range(lm + 1, lo + 12):
                    st[k] = ST_MISSING; notes[k] = f"after the last acq_date {ld} of current-year file {s['id']} (not yet published)"
        if fam == "modis":
            other = "terra" if pname == "aqua" else "aqua"
            pr = s.get("_platform_month_rows") or {}
            mine, oth = pr.get(pname, {}) or {}, pr.get(other, {}) or {}
            whole = sum(mine.values()) == 0 and sum(oth.values()) >= PLATFORM_OUTAGE_MIN
            for k in range(12):
                ymk = str(y * 12 + k)
                if st[lo + k] > 0 and (whole or (mine.get(ymk, 0) == 0 and oth.get(ymk, 0) >= PLATFORM_OUTAGE_MIN)):
                    st[lo + k] = ST_MISSING
                    notes[lo + k] = (f"{PLATFORM_LABEL[pname]} absent from {s['id']}" +
                                     (" (no rows in the whole file)" if whole else f" this month while {PLATFORM_LABEL[other]} has {oth.get(ymk, 0)} rows") +
                                     ": platform outage, unavailable (not zero)")
    # years without a usable file: say why (manifest status), never zero-fill
    for y in range(YEAR_MIN, YEAR_MAX + 1):
        lo = (y - YEAR_MIN) * 12
        if (st[lo:lo + 12] == ST_MISSING).all() and lo not in notes:
            rec = [s for s in SOURCES if s.get("sensor") == fam and s.get("country") == country and str(s.get("year")) == str(y)]
            why = (f"{rec[0].get('id')}: manifest status '{rec[0].get('status')}'" + (f", verification {rec[0].get('_verify')}" if rec[0].get("_verify") not in (None, "ok") else "")
                   ) if rec else f"no {fam} file for {country} {y} in sources.json"
            for k in range(12): notes[lo + k] = why + " → unavailable (missing is not zero)"
    sd = PLATFORM_START[pname]; sm = (sd.year - YEAR_MIN) * 12 + sd.month - 1
    for k in range(0, min(max(sm, 0), NM)):
        st[k] = ST_MISSING; notes[k] = f"before the {PLATFORM_LABEL[pname]} record starts ({sd})"
    if 0 <= sm < NM and sd.day > 1 and st[sm] == ST_COMPLETE:
        st[sm] = ST_PARTIAL; notes[sm] = f"{PLATFORM_LABEL[pname]} record starts {sd} (partial month)"
    return st, notes

ym_all = np.arange(NM) + YM0
YEAR_OF_M = ym_all // 12
MONTH_OF_M = ym_all % 12 + 1
TRAIN_M = np.isin(YEAR_OF_M, TRAIN_YEARS)

FEATURES_BASE = ["aqua_count", "aqua_day", "aqua_night", "aqua_frp_sum", "aqua_frp_mean", "aqua_conf_mean", "aqua_scan_mean",
                 "terra_count", "aqua_count_3x3", "month_sin", "month_cos", "lat", "aqua_clim"]
FEATURES = FEATURES_BASE + [f"country_{ISO[c]}" for c in COUNTRIES]
FEATURES_B1 = FEATURES + ["aqua_count_raw"]        # v1.1: B1 also gets the raw (identity-transformed) aqua_count
LOG1P_FEATURES = {"aqua_count", "aqua_day", "aqua_night", "aqua_frp_sum", "aqua_frp_mean", "aqua_scan_mean", "terra_count",
                  "aqua_count_3x3", "aqua_clim"}
FEATURE_DEFS = {
    "aqua_count": "Aqua MODIS type-0 detections in the 5 km cell and UTC calendar month (transform log1p)",
    "aqua_count_raw": "same value as aqua_count, identity transform (B1 only; v1.1)",
    "aqua_day": "Aqua type-0 detections with daynight=D (log1p)", "aqua_night": "Aqua type-0 detections with daynight=N (log1p)",
    "aqua_frp_sum": "sum of FRP (MW) of Aqua type-0 detections with finite frp (log1p)",
    "aqua_frp_mean": "aqua_frp_sum / number of those detections; 0 if none (log1p)",
    "aqua_conf_mean": "mean MODIS confidence (0-100) of Aqua type-0 detections; 0 if none (identity)",
    "aqua_scan_mean": "mean scan (km) of Aqua type-0 detections; 0 if none (log1p)",
    "terra_count": "Terra MODIS type-0 detections in the cell-month (log1p); separate series, never pooled into the target",
    "aqua_count_3x3": "sum of aqua_count over the 3x3 block of cells (ix-1..ix+1, iy-1..iy+1) incl. itself; cells outside the universe add 0 (log1p)",
    "month_sin": "sin(2*pi*(month-1)/12), month 1..12 (identity)", "month_cos": "cos(2*pi*(month-1)/12) (identity)",
    "lat": "latitude (deg) of the cell centre = degrees(asin((iy+0.5)*5000/6371007.181)) (identity)",
    "aqua_clim": "mean aqua_count of this cell for this calendar month over the TRAIN years 2013-2020 (available months only) (log1p)"}
for c in COUNTRIES: FEATURE_DEFS[f"country_{ISO[c]}"] = f"1 if the cell belongs to {c} (FIRMS country file) else 0 (identity)"
PANEL_BASE_KEYS = ["aqua_count", "aqua_day", "aqua_night", "aqua_frp_sum", "aqua_frp_mean", "aqua_conf_mean", "aqua_scan_mean",
                   "terra_count", "aqua_count_3x3", "aqua_clim", "viirs_snpp_count", "static_aqua", "static_viirs"]
PARTIAL_FIELDS = {"aqua": ["count", "static"], "terra": ["count"], "snpp": ["count", "static"]}

def build_country_panel(country, cidx):
    sub = AGG[AGG["country"] == country]
    keys = np.unique(sub["key"].to_numpy())
    nc = len(keys)
    ci = np.searchsorted(keys, sub["key"].to_numpy()); mi = sub["ym"].to_numpy() - YM0
    inr = (mi >= 0) & (mi < NM)
    sub, ci, mi = sub[inr], ci[inr], mi[inr]
    plat_col = sub["platform"].to_numpy()
    def dense(platform_name, col):
        m = (plat_col == PLAT_CODE[platform_name])
        a = np.zeros((nc, NM), np.float32)
        a[ci[m], mi[m]] = sub[col].to_numpy()[m].astype(np.float32, copy=False)   # AGG is unique per (country, platform, key, ym)
        return a
    status, notes = {}, {}
    for p in ["aqua", "terra", "snpp"]: status[p], notes[p] = month_status(country, p)
    aqua = dense("aqua", "count"); aqua_day = dense("aqua", "day"); aqua_night = dense("aqua", "night")
    frp_sum = dense("aqua", "frp_sum"); frp_n = dense("aqua", "frp_n")
    conf_sum = dense("aqua", "conf_sum"); conf_n = dense("aqua", "conf_n")
    scan_sum = dense("aqua", "scan_sum"); scan_n = dense("aqua", "scan_n")
    terra = dense("terra", "count"); viirs = dense("snpp", "count"); static_aqua = dense("aqua", "static")
    static_viirs = dense("snpp", "static")
    # partial months: keep the observed raw counts (display only) before they are masked out of the modelling panel
    partial = {}
    for p, arrs in [("aqua", {"count": aqua, "static": static_aqua}), ("terra", {"count": terra}), ("snpp", {"count": viirs, "static": static_viirs})]:
        for m in np.where(status[p] == ST_PARTIAL)[0]:
            for f, arr in arrs.items(): partial[f"{country}|{p}|{f}|{int(m)}"] = arr[:, m].copy()
    # 3×3 neighbourhood aqua sum (cells outside the universe have no detections → contribute 0)
    ix, iy = key_to_ixiy(keys)
    a3 = np.zeros_like(aqua)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            nk = keys + dx * KEY_MUL + dy
            pos = np.searchsorted(keys, nk); pos_c = np.minimum(pos, nc - 1)
            ok = (pos < nc) & (keys[pos_c] == nk)
            a3[ok] += aqua[pos_c[ok]]
    with np.errstate(invalid="ignore", divide="ignore"):
        frp_mean = np.where(frp_n > 0, frp_sum / np.maximum(frp_n, 1), 0).astype(np.float32); del frp_n
        conf_mean = np.where(conf_n > 0, conf_sum / np.maximum(conf_n, 1), 0).astype(np.float32); del conf_n, conf_sum
        scan_mean = np.where(scan_n > 0, scan_sum / np.maximum(scan_n, 1), 0).astype(np.float32); del scan_n, scan_sum
    ok_a = status["aqua"] == ST_COMPLETE
    for arr in (aqua, aqua_day, aqua_night, frp_sum, frp_mean, conf_mean, scan_mean, a3, static_aqua):
        arr[:, ~ok_a] = np.nan
    terra[:, status["terra"] != ST_COMPLETE] = np.nan
    viirs[:, status["snpp"] != ST_COMPLETE] = np.nan; static_viirs[:, status["snpp"] != ST_COMPLETE] = np.nan
    # train-only climatology of aqua per cell × calendar month
    tm = np.where(TRAIN_M)[0]
    clim = np.full((nc, 12), np.nan, np.float32)
    if len(tm):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            for mo in range(12):
                cols = tm[MONTH_OF_M[tm] == mo + 1]
                if len(cols): clim[:, mo] = np.nanmean(aqua[:, cols], axis=1)
    clim_full = clim[:, MONTH_OF_M - 1]
    lon_c, lat_c = cell_centre(ix, iy)
    out = {"aqua_count": aqua, "aqua_day": aqua_day, "aqua_night": aqua_night, "aqua_frp_sum": frp_sum, "aqua_frp_mean": frp_mean,
           "aqua_conf_mean": conf_mean, "aqua_scan_mean": scan_mean, "terra_count": terra, "aqua_count_3x3": a3,
           "aqua_clim": clim_full, "viirs_snpp_count": viirs, "static_aqua": static_aqua, "static_viirs": static_viirs}
    cells = pd.DataFrame({"country": country, "iso3": ISO[country], "cidx": cidx, "key": keys, "ix": ix, "iy": iy,
                          "lon": lon_c, "lat": lat_c})
    return cells, {k: v.ravel() for k, v in out.items()}, status, notes, partial

PANEL_DIR = CACHE / "panel"
_pan = stage_load("panel")
with Timer("panel" + ("(resumed)" if _pan is not None else "")):
    if _pan is not None:
        CELLS = pd.read_parquet(PANEL_DIR / "cells.parquet")
        P = {k: np.load(PANEL_DIR / f"{k}.npy") for k in PANEL_BASE_KEYS}
        _sj = json.load(open(PANEL_DIR / "status.json"))
        STATUS = {c: {p: np.array(v, np.int8) for p, v in d.items()} for c, d in _sj["status"].items()}
        STATUS_NOTES = {c: {p: {int(k): v for k, v in d.items()} for p, d in dd.items()} for c, dd in _sj["notes"].items()}
        with np.load(PANEL_DIR / "partial.npz") as z: PARTIAL_RAW = {k: z[k] for k in z.files}
        PANEL_MEMORY = json.load(open(PANEL_DIR / "panel_memory.json")) if (PANEL_DIR / "panel_memory.json").exists() else {}
    else:
        _cells, _per, STATUS, STATUS_NOTES, PARTIAL_RAW = [], [], {}, {}, {}
        # sparse in space (cells with >=1 detection only), dense in time: estimate the panel before allocating (USA ≈ AUS in cell count)
        PANEL_MEMORY = panel_memory_plan(AGG.groupby("country", observed=True)["key"].nunique().to_dict(), NM, len(PANEL_BASE_KEYS), len(COUNTRIES))
        _free = free_ram_gb(); PANEL_MEMORY["free_ram_gb_at_start"] = None if not np.isfinite(_free) else round(_free, 1)
        log(f"panel plan: {PANEL_MEMORY['n_cells']:,} cells {PANEL_MEMORY['cells_per_country']} × {NM} months = {PANEL_MEMORY['cell_months']:,} cell-months; "
            f"panel arrays ≈ {PANEL_MEMORY['panel_gb']} GB, peak while building the largest country ≈ {PANEL_MEMORY['peak_country_build_gb']} GB "
            f"(free RAM {PANEL_MEMORY['free_ram_gb_at_start']} GB)")
        if np.isfinite(_free) and max(PANEL_MEMORY["panel_gb"], PANEL_MEMORY["peak_country_build_gb"]) > 0.6 * _free:
            PANEL_MEMORY["warning"] = "estimated panel memory exceeds 60% of free RAM"
            log("WARNING: " + PANEL_MEMORY["warning"] + ": the kernel may run out of memory in 2.6 / 2.8; restart and Run All resumes from the ingest checkpoint")
        for cidx, c in enumerate(COUNTRIES):
            cells_c, cols_c, st_c, nt_c, part_c = build_country_panel(c, cidx)
            _cells.append(cells_c); _per.append(cols_c); STATUS[c] = st_c; STATUS_NOTES[c] = nt_c; PARTIAL_RAW.update(part_c)
            log(f"panel {c}: {len(cells_c):,} cells ({len(cells_c) * NM:,} cell-months) · RSS {rss_gb():.2f} GB")
        CELLS = pd.concat(_cells, ignore_index=True); del _cells
        P = {}
        for k in PANEL_BASE_KEYS:     # watchdog #5: concatenate one key at a time and free the per-country parts (no astype copy)
            P[k] = np.concatenate([d.pop(k) for d in _per]) if len(_per) > 1 else _per[0].pop(k).copy()
        del _per
        PANEL_DIR.mkdir(parents=True, exist_ok=True)
        jdump(PANEL_MEMORY, PANEL_DIR / "panel_memory.json", indent=1)
        CELLS.to_parquet(PANEL_DIR / "cells.parquet", index=False)
        for k in PANEL_BASE_KEYS: np.save(PANEL_DIR / f"{k}.npy", P[k])
        jdump({"status": {c: {p: v.tolist() for p, v in d.items()} for c, d in STATUS.items()},
               "notes": {c: {p: {str(k): v for k, v in d.items()} for p, d in dd.items()} for c, dd in STATUS_NOTES.items()}},
              PANEL_DIR / "status.json")
        np.savez(PANEL_DIR / "partial.npz", **PARTIAL_RAW) if PARTIAL_RAW else np.savez(PANEL_DIR / "partial.npz", _empty=np.zeros(1))
        PARTIAL_RAW.pop("_empty", None)
        stage_save("panel", [PANEL_DIR / "cells.parquet", PANEL_DIR / "status.json", PANEL_DIR / "partial.npz", PANEL_DIR / "panel_memory.json"] +
                   [PANEL_DIR / f"{k}.npy" for k in PANEL_BASE_KEYS], {"n_cells": int(len(CELLS)), "NM": int(NM)})
    PARTIAL_RAW.pop("_empty", None)
    CELLS["gcell"] = np.arange(len(CELLS), dtype=np.int32)
    CELLS["cell_id"] = CELLS["ix"].astype(str) + "_" + CELLS["iy"].astype(str)
    NCELL = len(CELLS)
    CELL_OFFSET = {c: int(np.where(CELLS["country"].to_numpy() == c)[0][0]) for c in COUNTRIES}
    P["aqua_count_raw"] = P["aqua_count"]          # alias (no copy): B1-only identity-transformed feature
    P["gcell"] = np.repeat(CELLS["gcell"].to_numpy(np.int32), NM)
    P["m"] = np.tile(np.arange(NM, dtype=np.int32), NCELL)
    N = len(P["gcell"])
    P["cidx"] = CELLS["cidx"].to_numpy(np.int16)[P["gcell"]]
    P["year"] = YEAR_OF_M[P["m"]].astype(np.int16)
    P["month"] = MONTH_OF_M[P["m"]].astype(np.int8)
    P["month_sin"] = np.sin(2 * np.pi * (P["month"] - 1) / 12).astype(np.float32)
    P["month_cos"] = np.cos(2 * np.pi * (P["month"] - 1) / 12).astype(np.float32)
    P["lat"] = CELLS["lat"].to_numpy(np.float32)[P["gcell"]]
    for ci_, c in enumerate(COUNTRIES):
        P[f"country_{ISO[c]}"] = (P["cidx"] == ci_).astype(np.float32)
    log(f"panel: {len(COUNTRIES)} countries, {NCELL:,} cells × {NM} months = {N:,} cell-months ({YEAR_MIN}–{YEAR_MAX}) · RSS {rss_gb():.2f} GB")
    PANEL_MEMORY["rss_gb_after_panel"] = round(rss_gb(), 2)
    for c in COUNTRIES:
        for p in ["aqua", "terra", "snpp"]:
            st = STATUS[c][p]
            part = [f"{YEAR_OF_M[m]}-{MONTH_OF_M[m]:02d}" for m in np.where(st == ST_PARTIAL)[0]]
            out_ = sorted({STATUS_NOTES[c][p][m] for m in np.where(st == ST_MISSING)[0] if m in STATUS_NOTES[c][p]
                           and ("outage" in STATUS_NOTES[c][p][m] or "header-only" in STATUS_NOTES[c][p][m])})
            log(f"  availability {c:<11} {p:<5}: complete={int((st == 2).sum())} partial={part} missing={int((st == 0).sum())}"
                + (f" · {out_[:3]}" if out_ else ""))
stop_hook("panel")

# ---- AOIs: country + admin-1 keyed on Natural Earth iso_3166_2 (v1.1), cell centre point-in-polygon ----
def load_geojson(name):
    p = BUNDLE / "context" / name
    if not p.exists():
        hits = list(walk_limited(BUNDLE, lambda d, fs: [d / name] if name in fs else [], max_depth=4, stop_after=1)); p = hits[0] if hits else None
    return json.load(open(p)) if p else None

ISO2_RE = re.compile(r"^[A-Z]{2}-[A-Z0-9]{1,3}$")
_NAME_TO_ISO = {}
for _code, _nm in ADMIN1_DISPLAY.items():
    _NAME_TO_ISO[_nm.lower()] = _code
for _old, _new in NAME_ALIASES.items():
    if _new.lower() in _NAME_TO_ISO: _NAME_TO_ISO[_old.lower()] = _NAME_TO_ISO[_new.lower()]

def admin1_code(props, expected=None):
    """iso_3166_2 if valid (BD-A..BD-H, AU-NSW, …); NE placeholders such as 'AU-X02~' are rejected; if the country has an expected
    code list (Bangladesh divisions) and the code is not in it (e.g. an NE build at district level, BD-13), the division is looked up
    from `region`/`name` via the alias table instead."""
    code = str(props.get("iso_3166_2") or "").strip()
    if ISO2_RE.match(code) and (not expected or code in expected or not code.startswith(expected[0][:3])): return code
    for k in ("region", "name", "name_en", "gn_name"):
        v = str(props.get(k) or "").strip().lower()
        if v in _NAME_TO_ISO: return _NAME_TO_ISO[v]
    return None

def dissolve_features(fs):
    """One (Multi)Polygon for all Natural Earth features that share an iso_3166_2 code (NSW + Lord Howe Island; California's mainland
    and Channel Islands if NE ships them as separate features, otherwise the single MultiPolygon is used as is)."""
    geoms = [shape(f["geometry"]) for f in fs]
    return unary_union(geoms) if len(geoms) > 1 else geoms[0]

AOI_NOTES = []
with Timer("aoi_assign"):
    ADM0 = load_geojson("ne_110m_admin_0_countries.geojson")
    ADM1 = load_geojson("ne_10m_admin_1_states_provinces.geojson")
    AOIS = []          # list of dicts: aoi_id, name, country, kind, geometry (shapely), cellmask, iso_3166_2, ne_names
    for c in [c for c in AOI_COUNTRIES if c in COUNTRIES]:
        iso = ISO[c]; geom = None
        if ADM0:
            for f in ADM0["features"]:
                if ne_country_match(f.get("properties", {}), iso, c):
                    geom = shape(f["geometry"]); break
        cm = (CELLS["country"] == c).to_numpy()
        AOIS.append({"aoi_id": iso, "name": country_display(c), "country": c, "kind": "country", "geometry": geom, "cellmask": cm,
                     "iso_3166_2": None, "ne_names": ([NE_ADMIN0_NAMES.get(c, [country_display(c)])[0]] if geom is not None else []), "note": None})
        if not ADM1: continue
        feats = [f for f in ADM1["features"] if ne_country_match({k: v for k, v in f.get("properties", {}).items() if k in ("adm0_a3", "admin")}, iso, c)]
        groups, skipped = {}, []
        for f in feats:
            code = admin1_code(f["properties"], EXPECTED_ADMIN1.get(c) if c == "Bangladesh" else None)
            if code is None: skipped.append(f["properties"].get("name")); continue
            groups.setdefault(code, []).append(f)       # dissolve every feature sharing an ISO code (e.g. NSW + Lord Howe Island)
        if skipped: log(f"  {c}: NE admin-1 features without a usable iso_3166_2 skipped: {skipped}")
        wanted = AOI_ADMIN1.get(c)
        for code in EXPECTED_ADMIN1.get(c, []):
            if code not in groups and (wanted is None or code in wanted):
                msg = (f"{code} ({ADMIN1_DISPLAY.get(code, code)}) is absent from this Natural Earth file; its cells fall into whichever "
                       "NE polygon contains them" + (" (NE's pre-2015 Dhaka division contains Mymensingh)" if code == "BD-H" else ""))
                AOI_NOTES.append(msg); log("  NOTE: " + msg)
        lon = CELLS.loc[cm, "lon"].to_numpy(); lat = CELLS.loc[cm, "lat"].to_numpy(); gidx = np.where(cm)[0]
        assigned = np.full(len(gidx), -1)
        adm_list = []
        for code, fs in sorted(groups.items()):
            if wanted is not None and code not in wanted: continue
            g = dissolve_features(fs)
            shapely.prepare(g)
            inside = shapely.contains_xy(g, lon, lat)
            ne_names = [str(f["properties"].get("name")) for f in fs]
            main_name = str(max(fs, key=lambda f: shape(f["geometry"]).area)["properties"].get("name"))
            disp = ADMIN1_DISPLAY.get(code) or NAME_ALIASES.get(main_name, main_name)
            adm_list.append((code, disp, ne_names, g, inside))
        for k, (code, disp, ne_names, g, inside) in enumerate(adm_list):
            assigned[inside & (assigned < 0)] = k
        n_near = 0
        if wanted is None and adm_list:
            # cell centres just outside every polygon (coast, simplified edges) → nearest division within 0.1°
            rest = np.where(assigned < 0)[0]
            if len(rest):
                pts = shapely.points(lon[rest], lat[rest])
                d = np.stack([shapely.distance(g, pts) for *_, g, _ in adm_list], 1)
                near = d.argmin(1); okd = d.min(1) < 0.1
                assigned[rest[okd]] = near[okd]; n_near = int(okd.sum())
            n_un = int((assigned < 0).sum())
            msg = f"{c}: {n_near} cells assigned to the nearest division (≤0.1°), {n_un} cells unassigned to any admin-1 (offshore / outside NE)"
            AOI_NOTES.append(msg); log("  " + msg)
        for k, (code, disp, ne_names, g, inside) in enumerate(adm_list):
            m = np.zeros(NCELL, bool); m[gidx[assigned == k]] = True
            note = None
            if code == "BD-C" and "BD-H" not in groups:
                note = "Natural Earth's Dhaka polygon predates the 2015 split and includes the Mymensingh division (BD-H)"
            aid = f"{iso}-{code.split('-', 1)[1]}"
            AOIS.append({"aoi_id": aid, "name": disp, "country": c, "kind": "admin1", "geometry": g, "cellmask": m,
                         "iso_3166_2": code, "ne_names": ne_names, "note": note})
    AOI_BY_ID = {a["aoi_id"]: a for a in AOIS}
    for a in AOIS: log(f"AOI {a['aoi_id']:<8} {a['kind']:<8} {a['name']:<18} cells={int(a['cellmask'].sum()):>7,}  NE={a['ne_names']}")

# %% [markdown]
# ## Phase 2 · Section 2.7 — Freeze the splits
# **What this cell does:** Holds out 20% of 100 km blocks (chosen by a fixed hash), labels years as train 2013–2020, validation 2021–2022, test 2023–2024 and backcast 2003–2012, keeps only rows with all features and the target available, writes `split_manifest.json` with row counts and hashes, and seals the test rows in a vault that can be opened only once.
#
# **Steps**
#
# - [ ] 2.7.1 Run the cell.
# - [ ] 2.7.2 Read `split rows: {'train': ..., 'val': ..., 'test': ...}`.
#
# **Check before moving on**
#
# - [ ] All three counts are greater than 0.
# - [ ] Train is roughly 3 times validation (8 years minus the held-out blocks against 2 years), and validation and test are similar (fixture: 232,776 / 77,112 / 77,112).
# - [ ] `runs/<ts>/split_manifest.json` exists.
#
# **If it fails:** A count of 0 means VIIRS or Aqua data is missing for those years: check the availability lines in 2.6 and the summary table from 1.11.
#
# **Time:** estimate: under 1 min

# %%
# ===================== SPLITS (contract §3) =====================
def block_holdout(ix, iy):
    bx = np.floor_divide(ix, BLOCK_CELLS); by = np.floor_divide(iy, BLOCK_CELLS)
    ub, inv = np.unique(np.stack([bx, by], 1), axis=0, return_inverse=True)
    hold = np.array([(int(hashlib.sha256(f"lumos-block-v1:{a}_{b}".encode()).hexdigest()[:8], 16) % 10000) < HOLDOUT_FRACTION * 10000
                     for a, b in ub], dtype=bool)
    return hold[np.asarray(inv).ravel()], bx, by

with Timer("splits"):
    CELLS["holdout"], CELLS["bx"], CELLS["by"] = block_holdout(CELLS["ix"].to_numpy(), CELLS["iy"].to_numpy())
    P["holdout"] = CELLS["holdout"].to_numpy()[P["gcell"]]
    SPLIT_CODES = {"none": 0, "train": 1, "val": 2, "test": 3, "backcast": 4}
    split = np.zeros(N, np.int8)
    split[np.isin(P["year"], TRAIN_YEARS)] = 1; split[np.isin(P["year"], VAL_YEARS)] = 2
    split[np.isin(P["year"], TEST_YEARS)] = 3; split[np.isin(P["year"], BACKCAST_YEARS)] = 4   # 2003–2012 (contract §3)
    SPLIT = split
    FEAT_OK = np.ones(N, bool)
    for f in FEATURES: FEAT_OK &= np.isfinite(P[f])
    TARGET_OK = np.isfinite(P["viirs_snpp_count"])
    IDX = {"train": np.where((SPLIT == 1) & ~P["holdout"] & FEAT_OK & TARGET_OK)[0],
           "val": np.where((SPLIT == 2) & FEAT_OK & TARGET_OK)[0]}
    _TEST_IDX_SEALED = np.where((SPLIT == 3) & FEAT_OK & TARGET_OK)[0]
    def rows_hash(idx):
        arr = np.stack([P["cidx"][idx].astype(np.int64), CELLS["key"].to_numpy()[P["gcell"][idx]], (P["m"][idx] + YM0).astype(np.int64)], 1)
        return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()
    SPLIT_MANIFEST = {
        "contract_version": "1.0+v1.1", "backcast_years": BACKCAST_YEARS, "train_years": TRAIN_YEARS, "val_years": VAL_YEARS, "test_years": TEST_YEARS,
        "spatial_holdout": {"block_size_cells": BLOCK_CELLS, "block_size_km": BLOCK_CELLS * 5, "fraction": HOLDOUT_FRACTION,
                            "rule": "sha256('lumos-block-v1:{bx}_{by}')[:8] as int % 10000 < 2000; bx=floor(ix/20), by=floor(iy/20)",
                            "n_blocks": int(CELLS[["bx", "by"]].drop_duplicates().shape[0]),
                            "n_holdout_blocks": int(CELLS.loc[CELLS.holdout, ["bx", "by"]].drop_duplicates().shape[0]),
                            "n_holdout_cells": int(CELLS.holdout.sum()), "n_cells": int(NCELL)},
        "row_id_encoding": "int64 triples (country_index, cell_key=(ix+5000)*10000+(iy+2000), year*12+month-1), C-order, sha256 of bytes",
        "countries": COUNTRIES,
        "rows": {k: int(len(v)) for k, v in IDX.items()} | {"test": int(len(_TEST_IDX_SEALED))},
        "sha256": {k: rows_hash(v) for k, v in IDX.items()} | {"test": rows_hash(_TEST_IDX_SEALED)},
        "eligibility": "rows with all features finite and target finite (source months COMPLETE: partial months such as "
                       "S-NPP Jan 2012 or the last month of a current-year file are excluded); train excludes spatial-holdout blocks"}
    jdump(SPLIT_MANIFEST, RUN_DIR / "split_manifest.json", indent=1)
    log(f"split rows: {SPLIT_MANIFEST['rows']}")

class TestVault:
    """The test split (2023–2024) can be opened exactly once, only after the selection record is frozen to disk."""
    def __init__(self, idx): self._idx = idx; self.opened = False; self.opened_utc = None
    def open(self, frozen_selection_path):
        if self.opened: raise RuntimeError("Test split already opened once — refusing a second look.")
        if not Path(frozen_selection_path).exists(): raise RuntimeError("Freeze model selection before opening the test split.")
        self.opened = True; self.opened_utc = dt.datetime.now(dt.timezone.utc).isoformat()
        log(f"TEST SPLIT OPENED at {self.opened_utc} (selection frozen at {frozen_selection_path})")
        return self._idx
TEST_VAULT = TestVault(_TEST_IDX_SEALED)
del _TEST_IDX_SEALED

# %% [markdown]
# ## Phase 2 · Section 2.8 — Baselines B0 and B1
# **What this cell does:** Defines the metrics (MAE, RMSE, bias and Poisson deviance at cell-month and area-month level) and fits the simple baselines: B0_identity (estimate = Aqua count), B0_ratio (one global VIIRS/Aqua ratio), B0_month_ratio (one ratio per country and calendar month) and B1, a Poisson regression on the features (checkpointed).
#
# **Steps**
#
# - [ ] 2.8.1 Run the cell.
# - [ ] 2.8.2 Read `B0 global ratio r = ...`: how many S-NPP VIIRS detections there are per Aqua detection in the training years.
# - [ ] 2.8.3 Read `B1 fitted on N rows, n_iter=k, features=...`.
# - [ ] 2.8.4 A line `B1 solver newton-cholesky: ... trying next` means the fallback solver was used; that is fine if B1 then fits.
#
# **Check before moving on**
#
# - [ ] `r` is above 1 (VIIRS sees more, smaller fires than MODIS).
# - [ ] `n_iter` is greater than 1 and there is no `MODEL B1_poisson: failed` line.
#
# **If it fails:** If B1 fails, it is recorded as failed and dropped; the gate in 2.11 then uses B0_month_ratio as its baseline and the run continues. An out-of-memory crash here: restart and Run All (resumes).
#
# **Time:** estimate: 2–10 min

# %%
# ===================== MODEL UTILITIES, METRICS, B0, B1 =====================
from sklearn.linear_model import PoissonRegressor
from sklearn.decomposition import PCA

def Xmat(idx, feats=None):
    feats = feats or FEATURES
    return np.stack([P[f][idx] for f in feats], 1).astype(np.float32, copy=False)

class Preproc:
    """log1p on count-like features, then standardisation (fitted on train rows). float32 working copies (watchdog #5);
    mean/scale accumulated in float64."""
    def __init__(self, feats): self.feats = list(feats); self.logmask = np.array([f in LOG1P_FEATURES for f in feats])
    def _t(self, X):
        X = np.array(X, dtype=np.float32, copy=True)
        if self.logmask.any(): X[:, self.logmask] = np.log1p(np.clip(X[:, self.logmask], 0, None))
        return X
    def fit(self, X):
        Z = self._t(X); self.mean = Z.mean(0, dtype=np.float64); sd = Z.std(0, dtype=np.float64)
        self.scale = np.where(sd > 1e-12, sd, 1.0); return self
    def transform(self, X):
        Z = self._t(X); Z -= self.mean.astype(np.float32); Z /= self.scale.astype(np.float32); return Z
    def to_json(self): return {"feature_names": self.feats, "transform": ["log1p" if m else "identity" for m in self.logmask],
                               "mean": self.mean.tolist(), "scale": self.scale.tolist()}
    @classmethod
    def from_json(cls, d):
        o = cls(d["feature_names"]); o.mean = np.array(d["mean"], np.float64); o.scale = np.array(d["scale"], np.float64); return o

def point_metrics(y, p):
    y = np.asarray(y, np.float64); p = np.asarray(p, np.float64)
    m = np.isfinite(y) & np.isfinite(p); y, p = y[m], p[m]
    n = int(len(y))
    if n == 0: return {"n": 0, "mae": None, "rmse": None, "bias": None, "poisson_deviance": None}
    e = p - y; pc = np.maximum(p, 1e-9)
    with np.errstate(divide="ignore", invalid="ignore"):
        dev = 2 * np.mean(np.where(y > 0, y * np.log(y / pc), 0.0) - (y - pc))
    return {"n": n, "mae": float(np.mean(np.abs(e))), "rmse": float(np.sqrt(np.mean(e ** 2))), "bias": float(np.mean(e)),
            "poisson_deviance": float(dev), "sum_obs": float(y.sum()), "sum_pred": float(p.sum())}

SEASON = {12: "DJF", 1: "DJF", 2: "DJF", 3: "MAM", 4: "MAM", 5: "MAM", 6: "JJA", 7: "JJA", 8: "JJA", 9: "SON", 10: "SON", 11: "SON"}
SEASON_OF_MONTH = np.array([""] + [SEASON[m] for m in range(1, 13)], dtype=object)

def aoi_month_pairs(idx, pred):
    """Sum observed and predicted over each AOI × month using only rows where both are finite."""
    y = P["viirs_snpp_count"][idx]; p = pred[idx]; ok = np.isfinite(y) & np.isfinite(p)
    idx, y, p = idx[ok], y[ok], p[ok]
    g = P["gcell"][idx]; mm = P["m"][idx]
    out = []
    for a in AOIS:
        sel = a["cellmask"][g]
        if not sel.any(): continue
        n = np.bincount(mm[sel], minlength=NM); ys = np.bincount(mm[sel], weights=y[sel], minlength=NM)
        ps = np.bincount(mm[sel], weights=p[sel], minlength=NM)
        for mi in np.where(n > 0)[0]:
            out.append((a["aoi_id"], a["kind"], int(mi), float(ys[mi]), float(ps[mi])))
    return pd.DataFrame(out, columns=["aoi_id", "kind", "m", "y", "p"])

def evaluate(pred, idx, with_subgroups=True):
    """Metrics at cell-month and AOI-month level (+ subgroups) for one model on one split's row indices."""
    y = P["viirs_snpp_count"][idx]; p = pred[idx]
    res = {"cell_month": {"all": point_metrics(y, p)}}
    if with_subgroups:
        act = P["aqua_count"][idx] > 0
        sg = res["cell_month"]
        sg["active"] = point_metrics(y[act], p[act]); sg["inactive"] = point_metrics(y[~act], p[~act])
        for ci_, c in enumerate(COUNTRIES):
            m = P["cidx"][idx] == ci_; sg[f"country:{ISO[c]}"] = point_metrics(y[m], p[m])
        seas = SEASON_OF_MONTH[P["month"][idx]]
        for s_ in ["DJF", "MAM", "JJA", "SON"]:
            m = seas == s_; sg[f"season:{s_}"] = point_metrics(y[m], p[m])
        h = P["holdout"][idx]
        sg["spatial_holdout"] = point_metrics(y[h], p[h]); sg["spatial_in_sample"] = point_metrics(y[~h], p[~h])
    am = aoi_month_pairs(idx, pred)
    res["aoi_month"] = {"all": point_metrics(am["y"], am["p"]) if len(am) else point_metrics([], [])}
    if with_subgroups and len(am):
        for k in ["country", "admin1"]:
            d = am[am.kind == k]; res["aoi_month"][f"kind:{k}"] = point_metrics(d["y"], d["p"])
        for aid, d in am.groupby("aoi_id"): res["aoi_month"][f"aoi:{aid}"] = point_metrics(d["y"], d["p"])
    return res

MODELS = {}   # model_id -> dict(status, pred(full panel), info, val, test, ...)
def register_failure(mid, e, kind="failed"):
    MODELS[mid] = {"status": kind, "error": repr(e) if not isinstance(e, str) else e,
                   "traceback": traceback.format_exc()[-2000:] if not isinstance(e, str) else None, "pred": None}
    log(f"MODEL {mid}: {kind}: {MODELS[mid]['error']}")

# Prediction rows per model family. Evaluation always uses the common rows (all FEATURES finite, IDX), but the export
# predicts wherever the model's OWN inputs exist: the B0 ratio models need only aqua_count, so a Terra outage does not
# remove their estimate (the Terra field alone is nulled).
PRED_ROWS = np.where(FEAT_OK)[0]
PRED_ROWS_AQUA = np.where(np.isfinite(P["aqua_count"]))[0]

def full_pred(fn, rows=None, chunk=2_000_000):
    rows = PRED_ROWS if rows is None else rows
    out = np.full(N, np.nan, np.float32)
    for s in range(0, len(rows), chunk):
        r = rows[s:s + chunk]; out[r] = fn(r)
    return out

def subsample(idx, n, seed):
    return idx if len(idx) <= n else np.sort(np.random.default_rng(seed).choice(idx, n, replace=False))

tr, va = IDX["train"], IDX["val"]
y_tr = P["viirs_snpp_count"][tr].astype(np.float64)
MODEL_CACHE = CACHE / "models"; MODEL_CACHE.mkdir(parents=True, exist_ok=True)

# ---- B0 family (transparent ratio models; weights exported as JSON) ----
with Timer("B0"):
    try:
        aq = P["aqua_count"]
        MODELS["B0_identity"] = {"status": "ok", "pred": full_pred(lambda r: aq[r], PRED_ROWS_AQUA),
                                 "info": {"formula": "est = aqua_count"}, "weights": {"formula": "est = aqua_count", "link": "identity"}}
        r = float(y_tr.sum() / max(P["aqua_count"][tr].sum(), 1e-9))
        MODELS["B0_ratio"] = {"status": "ok", "pred": full_pred(lambda rr: r * aq[rr], PRED_ROWS_AQUA),
                              "info": {"formula": "est = r * aqua_count", "r": r},
                              "weights": {"formula": "est = r * aqua_count", "r": r, "train_years": TRAIN_YEARS}}
        ratios = {}
        rv = np.full((len(COUNTRIES), 13), r)
        for ci_, c in enumerate(COUNTRIES):
            for mo in range(1, 13):
                m = (P["cidx"][tr] == ci_) & (P["month"][tr] == mo)
                sa = P["aqua_count"][tr][m].sum()
                if sa > 0: rv[ci_, mo] = y_tr[m].sum() / sa
                ratios[f"{ISO[c]}-{mo:02d}"] = float(rv[ci_, mo])
        B0MR_TABLE = rv.astype(np.float32)
        MODELS["B0_month_ratio"] = {"status": "ok", "pred": full_pred(lambda rr: B0MR_TABLE[P["cidx"][rr], P["month"][rr]] * aq[rr], PRED_ROWS_AQUA),
                                    "info": {"formula": "est = r[country, month] * aqua_count (global r fallback)", "ratios": ratios},
                                    "weights": {"formula": "est = ratios[f'{iso3}-{month:02d}'] * aqua_count  (cell-month; sum over cells for an AOI)",
                                                "ratios": ratios, "fallback_global_r": r, "key_format": "ISO3-MM (MM = UTC calendar month 01..12)",
                                                "computed_on": f"train years {TRAIN_YEARS[0]}–{TRAIN_YEARS[-1]}, spatial-holdout blocks excluded, "
                                                               "ratio = Σ viirs_snpp_count / Σ aqua_count per country × calendar month",
                                                "countries": {ISO[c]: country_display(c) for c in COUNTRIES}, "link": "identity"}}
        log(f"B0 global ratio r = {r:.3f}")
    except Exception as e:
        register_failure("B0", e)

# PRE: preprocessing for D1/ONNX (FEATURES); PRE_B1: B1 (FEATURES_B1 incl. raw aqua_count). Fitted on train rows.
PRE = Preproc(FEATURES).fit(Xmat(tr))

# ---- B1 Poisson GLM (checkpointed: weights JSON) ----
def b1_predict_from(w):
    pre = Preproc.from_json(w); coef = np.array(w["coef"], np.float32); icpt = float(w["intercept"])
    return lambda r: np.exp(np.clip(pre.transform(Xmat(r, w["feature_names"])) @ coef + icpt, -30, 30)).astype(np.float32)

with Timer("B1_poisson"):
    try:
        _b1 = stage_load("B1_poisson")
        if _b1 is not None:
            W_B1 = json.load(open(MODEL_CACHE / "B1_poisson_weights.json")); B1_INFO = _b1["info"]
        else:
            PRE_B1 = Preproc(FEATURES_B1).fit(Xmat(tr, FEATURES_B1))
            tr_b1 = subsample(tr, B1_MAX_TRAIN, 0)
            # newton-cholesky: lbfgs aborts after 1 iteration once the raw (identity) aqua_count is added (standardised values
            # reach ~100 → exp overflow in the line search); newton-cholesky converges in a few iterations. lbfgs kept as fallback.
            _Z1, _y1 = PRE_B1.transform(Xmat(tr_b1, FEATURES_B1)), P["viirs_snpp_count"][tr_b1].astype(np.float64)
            b1, B1_SOLVER = None, None
            for _solver in ("newton-cholesky", "lbfgs"):
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", RuntimeWarning)
                        _m = PoissonRegressor(alpha=B1_ALPHA, max_iter=100 if QUICK_TEST else 1000, tol=1e-6, solver=_solver).fit(_Z1, _y1)
                    if np.all(np.isfinite(_m.coef_)) and _m.n_iter_ > 1: b1, B1_SOLVER = _m, _solver; break
                    log(f"B1 solver {_solver}: n_iter={_m.n_iter_} (not converged/finite) → trying next")
                except Exception as e:
                    log(f"B1 solver {_solver} failed: {e!r}")
            if b1 is None: raise RuntimeError("B1: no solver converged")
            del _Z1, _y1
            W_B1 = PRE_B1.to_json() | {"coef": b1.coef_.astype(np.float64).tolist(), "intercept": float(b1.intercept_), "link": "log",
                                       "formula": "rate = exp(intercept + sum_j coef_j * (transform_j(x_j) - mean_j) / scale_j); "
                                                  "transform log1p(max(x,0)) or identity; exp argument clipped to [-30, 30]"}
            B1_INFO = {"n_train": int(len(tr_b1)), "alpha": B1_ALPHA, "n_iter": int(b1.n_iter_), "solver": B1_SOLVER}
            jdump(W_B1, MODEL_CACHE / "B1_poisson_weights.json", indent=1)
            stage_save("B1_poisson", [MODEL_CACHE / "B1_poisson_weights.json"], {"info": B1_INFO})
        MODELS["B1_poisson"] = {"status": "ok", "pred": full_pred(b1_predict_from(W_B1)), "info": B1_INFO, "weights": W_B1}
        log(f"B1 fitted on {B1_INFO['n_train']:,} rows, n_iter={B1_INFO['n_iter']}, features={len(FEATURES_B1)} (incl. aqua_count_raw)")
    except Exception as e:
        register_failure("B1_poisson", e)
stop_hook("B1_poisson")

# %% [markdown]
# ## Phase 2 · Section 2.9 — XGBoost B2
# **What this cell does:** If `RUN_XGB` is on: trains a Poisson XGBoost model on the GPU for each of 3 seeds (up to 3,000 rounds, early stopping after 100) inside the `XGB_MAX_MINUTES` wall-clock budget, and keeps the seed with the lowest validation deviance (checkpointed). On CPU it uses a capped sample, one seed and at most 800 rounds.
#
# **Steps**
#
# - [ ] 2.9.1 Run the cell.
# - [ ] 2.9.2 Watch the progress lines `[N] val-poisson-nloglik:...` every 100 rounds.
# - [ ] 2.9.3 Read one `B2 seed s: best_it=... val MAE=... dev=... (...s)` line per seed.
#
# **Check before moving on**
#
# - [ ] No `xgboost cuda unavailable` line (that means it fell back to CPU).
# - [ ] Three seed lines, with similar validation deviance.
#
# **If it fails:** `B2: wall-clock budget reached` keeps the best model so far; that is fine. If B2 crashes, it is recorded as failed and the run continues. To skip it, set `RUN_XGB = False` in 2.2 before a fresh Run All (this starts a new run folder).
#
# **Time:** estimate: 5–30 min on the GPU, capped by XGB_MAX_MINUTES (120) (fixture, 3 seeds on CPU: 32 s)

# %%
# ===================== B2 XGBoost =====================
XGB_INFO = {}
if RUN_XGB:
    with Timer("B2_xgb"):
        try:
            import xgboost as xgb
            def xgb_device():
                if DEVICE != "cuda": return "cpu"
                try:
                    d = xgb.DMatrix(np.random.rand(64, 3), label=np.random.poisson(1, 64))
                    xgb.train({"objective": "count:poisson", "device": "cuda", "tree_method": "hist"}, d, 2); return "cuda"
                except Exception as e:
                    log(f"xgboost cuda unavailable ({e!r}); using cpu"); return "cpu"
            XDEV = xgb_device()

            class WallClock(xgb.callback.TrainingCallback):
                """Stop boosting when the wall-clock budget is spent (watchdog #3); the best iteration so far is kept."""
                def __init__(self, deadline): self.deadline = deadline; self.stopped_early = False
                def after_iteration(self, model, epoch, evals_log):
                    if time.time() > self.deadline:
                        self.stopped_early = True; log(f"B2: wall-clock budget reached at round {epoch}; stopping"); return True
                    return False

            def make_dm(X, y=None, ref=None, w=None):
                try: return xgb.QuantileDMatrix(X, label=y, weight=w, ref=ref, max_bin=256)
                except Exception: return xgb.DMatrix(X, label=y, weight=w)
            def fit_xgb(tr_idx, va_idx, seed, weights=None, rounds=XGB_ROUNDS, early=XGB_EARLY, Xtr=None, ytr=None, Xva=None, yva=None,
                        deadline=None, verbose=XGB_VERBOSE):
                Xtr = Xmat(tr_idx) if Xtr is None else Xtr; ytr = P["viirs_snpp_count"][tr_idx] if ytr is None else ytr
                Xva = Xmat(va_idx) if Xva is None else Xva; yva = P["viirs_snpp_count"][va_idx] if yva is None else yva
                dtr = make_dm(Xtr, ytr, w=weights)
                dva = make_dm(Xva, yva, ref=dtr)
                params = {"objective": "count:poisson", "eval_metric": "poisson-nloglik", "tree_method": "hist", "device": XDEV,
                          "max_depth": 8, "eta": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 5,
                          "max_delta_step": 0.7, "seed": seed, "nthread": os.cpu_count() or 2}
                cbs = [WallClock(deadline)] if deadline else []
                bst = xgb.train(params, dtr, num_boost_round=rounds, evals=[(dva, "val")], early_stopping_rounds=early,
                                verbose_eval=verbose, callbacks=cbs)
                if not hasattr(bst, "best_iteration") or bst.best_iteration is None:
                    bst.best_iteration = bst.num_boosted_rounds() - 1
                return bst
            def xgb_predict_fn(bst):
                it = (0, int(bst.best_iteration) + 1)
                return lambda r: bst.predict(xgb.DMatrix(Xmat(r)), iteration_range=it).astype(np.float32)

            _b2 = stage_load("B2_xgb")
            if _b2 is not None:
                best_bst = xgb.Booster(); best_bst.load_model(str(MODEL_CACHE / "B2_xgb.json"))
                best_bst.best_iteration = int(_b2["info"]["best_iteration"])
                B2_INFO, B2_SEEDRUNS = _b2["info"], _b2["seed_runs"]
            else:
                # CPU fallback (watchdog #3): capped sample, 1 seed, ≤ XGB_CPU_ROUNDS rounds, bounded eval set
                if XDEV == "cpu" and len(tr) > XGB_CPU_MAX_ROWS:
                    tr_x, va_x, seeds_x, rounds_x = subsample(tr, XGB_CPU_MAX_ROWS, 1), subsample(va, 1_000_000, 2), SEEDS[:1], min(XGB_ROUNDS, XGB_CPU_ROUNDS)
                    log(f"B2 on CPU: training sample capped at {len(tr_x):,} of {len(tr):,} rows, 1 seed, ≤{rounds_x} rounds")
                elif XDEV == "cpu":
                    tr_x, va_x, seeds_x, rounds_x = tr, subsample(va, 1_000_000, 2), SEEDS, min(XGB_ROUNDS, XGB_CPU_ROUNDS)
                else:
                    tr_x, va_x, seeds_x, rounds_x = tr, va, SEEDS, XGB_ROUNDS
                t_stage = time.time(); budget = XGB_MAX_MINUTES * 60
                Xtr_x, ytr_x, Xva_x, yva_x = Xmat(tr_x), P["viirs_snpp_count"][tr_x], Xmat(va_x), P["viirs_snpp_count"][va_x]
                seed_runs = []
                for k, s_ in enumerate(seeds_x):
                    left = budget - (time.time() - t_stage)
                    if left <= 0: log(f"B2: budget XGB_MAX_MINUTES={XGB_MAX_MINUTES} spent; skipping seeds {seeds_x[k:]}"); break
                    t0 = time.time()
                    bst = fit_xgb(None, None, s_, rounds=rounds_x, Xtr=Xtr_x, ytr=ytr_x, Xva=Xva_x, yva=yva_x,
                                  deadline=time.time() + left / (len(seeds_x) - k))
                    pv = xgb_predict_fn(bst)(va)
                    mv = point_metrics(P["viirs_snpp_count"][va], pv)
                    seed_runs.append({"seed": s_, "best_iteration": int(bst.best_iteration), "val": mv, "seconds": round(time.time() - t0, 1), "bst": bst})
                    log(f"B2 seed {s_}: best_it={bst.best_iteration} val MAE={mv['mae']:.4f} dev={mv['poisson_deviance']:.4f} ({time.time() - t0:.0f}s)")
                del Xtr_x, Xva_x
                if not seed_runs: raise RuntimeError("no B2 seed finished within XGB_MAX_MINUTES")
                best = min(seed_runs, key=lambda d: d["val"]["poisson_deviance"]); best_bst = best["bst"]
                B2_INFO = {"device": XDEV, "selected_seed": best["seed"], "best_iteration": best["best_iteration"],
                           "n_train": int(len(tr_x)), "n_train_eligible": int(len(tr)), "rounds_cap": rounds_x,
                           "wall_clock_budget_min": XGB_MAX_MINUTES, "params": "depth8 eta0.05 sub0.8 col0.8 mcw5 mds0.7"}
                B2_SEEDRUNS = [{k: v for k, v in d.items() if k != "bst"} for d in seed_runs]
                best_bst.save_model(str(MODEL_CACHE / "B2_xgb.json"))
                stage_save("B2_xgb", [MODEL_CACHE / "B2_xgb.json"], {"info": B2_INFO, "seed_runs": B2_SEEDRUNS})
            MODELS["B2_xgb"] = {"status": "ok", "pred": full_pred(xgb_predict_fn(best_bst)), "booster": best_bst,
                                "info": B2_INFO, "seed_runs": B2_SEEDRUNS}
        except Exception as e:
            register_failure("B2_xgb", e)
else:
    register_failure("B2_xgb", "RUN_XGB=False", kind="skipped")
stop_hook("B2_xgb")

# %% [markdown]
# ## Phase 2 · Section 2.10 — PyTorch MLP D1
# **What this cell does:** If `RUN_DL` is on: trains a Poisson neural network (layers 128-128-64, bf16 autocast only on GPUs with compute capability 8.0 or newer, otherwise fp32) for each of 3 seeds, up to 40 epochs with early stopping after 5, inside the `DL_MAX_MINUTES` budget, and keeps the best seed (checkpointed). The ONNX export happens in 2.14. On CPU it uses a capped sample and one seed.
#
# **Steps**
#
# - [ ] 2.10.1 Run the cell.
# - [ ] 2.10.2 Watch `D1 seed s epoch e/40: train_loss=... val_dev=...` every 5 epochs.
# - [ ] 2.10.3 Read one `D1 seed s: epochs=... val MAE=... dev=...` line per seed.
#
# **Check before moving on**
#
# - [ ] `val_dev` falls over the first epochs and there are no `nan` losses.
# - [ ] Three seed lines.
#
# **If it fails:** `wall-clock budget reached` keeps the best epoch; that is fine. If D1 crashes, it is recorded as failed and the run continues. To skip it, set `RUN_DL = False` in 2.2 before a fresh Run All.
#
# **Time:** estimate: 5–30 min on the GPU, capped by DL_MAX_MINUTES (120) (fixture, 3 seeds on CPU: 98 s)

# %%
# ===================== D1 PyTorch MLP → ONNX =====================
import torch.nn as nn

class PoissonMLP(nn.Module):
    def __init__(self, d, hidden=(128, 128, 64), dropout=0.05):
        super().__init__()
        layers, prev = [], d
        for h in hidden: layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)]; prev = h
        layers += [nn.Linear(prev, 1)]
        self.net = nn.Sequential(*layers)
    def forward(self, z): return self.net(z).squeeze(-1)    # log-rate

class MLPExport(nn.Module):
    """Raw features in (FEATURES order) → expected VIIRS count out. Preprocessing is embedded."""
    def __init__(self, mlp, pre: Preproc):
        super().__init__(); self.mlp = mlp
        self.register_buffer("mean", torch.tensor(pre.mean, dtype=torch.float32))
        self.register_buffer("scale", torch.tensor(pre.scale, dtype=torch.float32))
        self.register_buffer("logmask", torch.tensor(pre.logmask, dtype=torch.bool))
    def forward(self, x):
        z = torch.where(self.logmask, torch.log(torch.clamp(x, min=0.0) + 1.0), x)
        z = (z - self.mean) / self.scale
        return torch.exp(torch.clamp(self.mlp(z), max=30.0))

def poisson_nll(lograte, y, w=None):
    l = torch.exp(lograte) - y * lograte
    return (l * w).sum() / w.sum() if w is not None else l.mean()

def train_mlp(Ztr, ytr, Zva, yva, seed, wtr=None, epochs=DL_EPOCHS, patience=DL_PATIENCE, hidden=(128, 128, 64), lr=2e-3, bs=None,
              deadline=None, label="D1"):
    torch.manual_seed(seed); np.random.seed(seed)
    dev = TORCH_DEVICE
    bs = bs or (32768 if DEVICE == "cuda" else 4096)
    bs = min(bs, max(256, len(ytr) // 4))
    Zt = torch.tensor(Ztr, device=dev); yt = torch.tensor(ytr, dtype=torch.float32, device=dev)
    wt = torch.tensor(wtr, dtype=torch.float32, device=dev) if wtr is not None else None
    Zv = torch.tensor(Zva, device=dev); yv = torch.tensor(yva, dtype=torch.float32, device=dev)
    model = PoissonMLP(Ztr.shape[1], hidden).to(dev)
    with torch.no_grad():
        mu = float(np.average(ytr, weights=wtr)) if wtr is not None else float(ytr.mean())
        model.net[-1].bias.fill_(math.log(max(mu, 1e-3)))
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-5)
    use_amp = AMP_BF16
    best, best_state, bad, hist = float("inf"), None, 0, []
    for ep in range(epochs):
        model.train(); perm = torch.randperm(len(yt), device=dev); tot = 0.0
        for s in range(0, len(yt), bs):
            b = perm[s:s + bs]
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_amp):
                out = model(Zt[b])
            loss = poisson_nll(out.float(), yt[b], wt[b] if wt is not None else None)
            opt.zero_grad(set_to_none=True); loss.backward(); opt.step(); tot += float(loss.detach()) * len(b)
        model.eval()
        with torch.no_grad():
            pv = torch.cat([torch.exp(torch.clamp(model(Zv[s:s + 262144]).float(), max=30)) for s in range(0, len(yv), 262144)])
        dv = point_metrics(yva, pv.cpu().numpy())["poisson_deviance"]
        hist.append({"epoch": ep, "train_loss": tot / len(yt), "val_deviance": dv})
        if (ep + 1) % LOG_EVERY_EPOCHS == 0 or ep == 0:
            log(f"{label} seed {seed} epoch {ep + 1}/{epochs}: train_loss={tot / len(yt):.4f} val_dev={dv:.4f}")
        if dv < best - 1e-6: best, bad = dv, 0; best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= patience: break
        if deadline is not None and time.time() > deadline:
            log(f"{label} seed {seed}: wall-clock budget reached after epoch {ep + 1}; keeping best epoch"); break
    model.load_state_dict(best_state); model.eval()
    return model, hist

def mlp_predict_fn(model, pre):
    def f(r):
        with torch.no_grad():
            Z = torch.tensor(pre.transform(Xmat(r)), device=TORCH_DEVICE)
            return torch.exp(torch.clamp(model(Z).float(), max=30)).cpu().numpy().astype(np.float32)
    return f

def export_onnx(model, pre, path):
    """Export with preprocessing embedded; verify parity with onnxruntime when available."""
    wrapper = MLPExport(model.cpu().eval(), pre).eval()
    x = torch.tensor(Xmat(va[:2048] if len(va) else tr[:2048]))
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    info = {"path": str(path), "input": "x: float32[N, %d] raw features in FEATURES order" % len(pre.feats), "output": "rate: float32[N]",
            "input_name": "x", "output_name": "rate", "input_features": list(pre.feats), "opset": 17, "dynamic_axes": {"x": [0], "rate": [0]},
            "preprocessing": "embedded (log1p on LOG1P features, then (z-mean)/scale); feed RAW feature values"}
    try:
        torch.onnx.export(wrapper, x[:4], str(path), dynamo=False, input_names=["x"], output_names=["rate"],
                          dynamic_axes={"x": {0: "n"}, "rate": {0: "n"}}, opset_version=17)
    except TypeError:
        torch.onnx.export(wrapper, x[:4], str(path), input_names=["x"], output_names=["rate"],
                          dynamic_axes={"x": {0: "n"}, "rate": {0: "n"}}, opset_version=17)
    info["sha256"] = sha256_file(path)
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        yo = sess.run(None, {"x": x.numpy()})[0]
        with torch.no_grad(): yt_ = wrapper(x).numpy()
        rel = np.abs(yo - yt_) / np.maximum(np.abs(yt_), 1e-6)
        info["parity"] = {"n": int(len(x)), "max_abs_diff": float(np.abs(yo - yt_).max()), "max_rel_diff": float(rel.max()),
                          "passed": bool(np.allclose(yo, yt_, rtol=1e-4, atol=1e-5))}
    except ImportError:
        info["parity"] = {"passed": None, "note": "onnxruntime not installed; parity not checked"}
    model.to(TORCH_DEVICE)
    return info

if RUN_DL:
    with Timer("D1_mlp"):
        try:
            _d1 = stage_load("D1_mlp")
            if _d1 is not None:
                best_model = PoissonMLP(len(FEATURES), tuple(_d1["info"]["hidden"])).to(TORCH_DEVICE)
                best_model.load_state_dict(torch.load(MODEL_CACHE / "D1_mlp_state.pt", map_location=TORCH_DEVICE)); best_model.eval()
                D1_INFO, D1_SEEDRUNS = _d1["info"], _d1["seed_runs"]
            else:
                # torch on CPU (watchdog #13): capped training sample and a single seed
                if DEVICE != "cuda" and len(tr) > D1_CPU_MAX_ROWS:
                    tr_d, seeds_d = subsample(tr, D1_CPU_MAX_ROWS, 3), SEEDS[:1]
                    log(f"D1 on CPU: training sample capped at {len(tr_d):,} of {len(tr):,} rows, 1 seed")
                else:
                    tr_d, seeds_d = tr, SEEDS
                Ztr = PRE.transform(Xmat(tr_d)); Zva = PRE.transform(Xmat(va)); yva_ = P["viirs_snpp_count"][va]
                ytr_d = P["viirs_snpp_count"][tr_d].astype(np.float32)
                t_stage = time.time(); budget = DL_MAX_MINUTES * 60
                seed_runs = []
                for k, s_ in enumerate(seeds_d):
                    left = budget - (time.time() - t_stage)
                    if left <= 0: log(f"D1: budget DL_MAX_MINUTES={DL_MAX_MINUTES} spent; skipping seeds {seeds_d[k:]}"); break
                    t0 = time.time()
                    mdl, hist = train_mlp(Ztr, ytr_d, Zva, yva_, s_, deadline=time.time() + left / (len(seeds_d) - k))
                    mv = point_metrics(yva_, mlp_predict_fn(mdl, PRE)(va))
                    seed_runs.append({"seed": s_, "epochs": len(hist), "val": mv, "history": hist, "seconds": round(time.time() - t0, 1), "model": mdl})
                    log(f"D1 seed {s_}: epochs={len(hist)} val MAE={mv['mae']:.4f} dev={mv['poisson_deviance']:.4f}")
                del Ztr, Zva
                best = min(seed_runs, key=lambda d: d["val"]["poisson_deviance"]); best_model = best["model"]
                D1_INFO = {"selected_seed": best["seed"], "hidden": [128, 128, 64], "amp_bf16": AMP_BF16,
                           "n_train": int(len(tr_d)), "n_train_eligible": int(len(tr)), "device": DEVICE}
                D1_SEEDRUNS = [{k: v for k, v in d.items() if k != "model"} for d in seed_runs]
                torch.save(best_model.state_dict(), MODEL_CACHE / "D1_mlp_state.pt")
                stage_save("D1_mlp", [MODEL_CACHE / "D1_mlp_state.pt"], {"info": D1_INFO, "seed_runs": D1_SEEDRUNS})
            MODELS["D1_mlp"] = {"status": "ok", "pred": full_pred(mlp_predict_fn(best_model, PRE)), "torch_model": best_model,
                                "info": D1_INFO, "seed_runs": D1_SEEDRUNS}
        except Exception as e:
            register_failure("D1_mlp", e)
else:
    register_failure("D1_mlp", "RUN_DL=False", kind="skipped")
stop_hook("D1_mlp")

# %% [markdown]
# ## Phase 2 · Section 2.11 — Validation gate and selection
# **What this cell does:** Scores every full-panel model on the validation years. The baseline is the better of B1 and B0_month_ratio by validation area-month MAE. Another model replaces it only if it is at least 10% better and not more than 10% worse on active cells (Aqua count > 0); the best passing model wins. It also builds 80% intervals from validation residuals and writes `selection_frozen.json` before the test years are touched.
#
# **Steps**
#
# - [ ] 2.11.1 Run the cell.
# - [ ] 2.11.2 Read `SELECTED (validation only): <model>; gate baseline <model> val AOI-month MAE=...`.
# - [ ] 2.11.3 Read the table of `val_cell_MAE`, `val_active_MAE`, `val_AOI_MAE` and `val_dev` per model.
#
# **Check before moving on**
#
# - [ ] Every model you trained has a row in the table.
# - [ ] `runs/<ts>/selection_frozen.json` exists.
# - [ ] Write down the selected model; it is the app's estimator.
#
# **If it fails:** An error here usually means every model failed earlier. Scroll up for `MODEL ...: failed` lines and fix the first one.
#
# **Time:** estimate: under 3 min

# %%
# ===================== VALIDATION EVALUATION, GATE, SELECTION (frozen before test) =====================
FULL_MODELS = [m for m in ["B0_identity", "B0_ratio", "B0_month_ratio", "B1_poisson", "B2_xgb", "D1_mlp"] if MODELS.get(m, {}).get("status") == "ok"]
with Timer("val_eval"):
    for mid in FULL_MODELS:
        try: MODELS[mid]["val"] = evaluate(MODELS[mid]["pred"], va)
        except Exception as e: register_failure(mid, e)
    FULL_MODELS = [m for m in FULL_MODELS if MODELS[m].get("status") == "ok"]

def vm(mid, level="cell_month", sg="all", split="val", key="mae"):
    try: return MODELS[mid][split][level][sg][key]
    except Exception: return None

# Gate MAE is measured at AOI-month level (the level the app displays). Cell-month MAE on zero-inflated counts is minimised by
# predicting ~0 (the median), so it would reward the un-harmonised identity baseline; cell-month MAE is still reported.
GATE = {"rule": f"candidate replaces baseline only if val AOI-month MAE ≤ (1−{GATE_MAE_IMPROVEMENT})×baseline and active-subgroup "
                f"(aqua_count>0) cell-month MAE ≤ (1+{GATE_SUBGROUP_DEGRADATION})×baseline; among passing candidates the lowest val AOI-month MAE wins",
        "gate_level": "aoi_month", "candidates": {}}
# v1.1: the gate baseline is the BETTER of B1_poisson and B0_month_ratio on validation AOI-month MAE (review H1)
_bc = {m: vm(m, "aoi_month") for m in GATE_BASELINE_CANDIDATES if m in FULL_MODELS and vm(m, "aoi_month") is not None}
BASELINE = min(_bc, key=_bc.get) if _bc else FULL_MODELS[0]
GATE["baseline"] = BASELINE
GATE["baseline_rule"] = "better (lower val AOI-month MAE) of " + " and ".join(GATE_BASELINE_CANDIDATES) + " (contract v1.1)"
GATE["baseline_candidates_val_aoi_month_mae"] = _bc
b_mae, b_act = vm(BASELINE, "aoi_month"), vm(BASELINE, sg="active")
passing = []
for mid in FULL_MODELS:
    if mid == BASELINE: continue
    m_mae, m_act = vm(mid, "aoi_month"), vm(mid, sg="active")
    ok_mae = m_mae is not None and b_mae is not None and m_mae <= (1 - GATE_MAE_IMPROVEMENT) * b_mae
    ok_sub = (m_act is None or b_act is None) or (m_act <= (1 + GATE_SUBGROUP_DEGRADATION) * b_act)
    GATE["candidates"][mid] = {"val_aoi_month_mae": m_mae, "val_cell_month_mae": vm(mid), "val_active_mae": m_act, "passes_mae": bool(ok_mae), "passes_subgroup": bool(ok_sub), "passes": bool(ok_mae and ok_sub)}
    if ok_mae and ok_sub: passing.append((m_mae, mid))
SELECTED = min(passing)[1] if passing else BASELINE
GATE["baseline_val_aoi_month_mae"] = b_mae; GATE["baseline_val_active_mae"] = b_act; GATE["selected"] = SELECTED
GATE["mae_bar"] = None if b_mae is None else (1 - GATE_MAE_IMPROVEMENT) * b_mae
GATE["selection_reason"] = (f"{SELECTED} passed the gate (val AOI-month MAE {vm(SELECTED, 'aoi_month'):.3f} ≤ bar {GATE['mae_bar']:.3f}; "
                            f"lowest among {len(passing)} passing)") if passing else \
                           (f"no candidate beat the baseline {BASELINE} (val AOI-month MAE {b_mae:.3f}) by ≥{GATE_MAE_IMPROVEMENT:.0%} without "
                            f">{GATE_SUBGROUP_DEGRADATION:.0%} active-subgroup degradation → the baseline itself is the app estimate")

# 80% multiplicative AOI-month interval from validation residual quantiles of log((y+1)/(ŷ+1)) — for every full model
def interval_from_val(mid):
    am = aoi_month_pairs(va, MODELS[mid]["pred"])
    r = np.log((am["y"].to_numpy() + 1) / (am["p"].to_numpy() + 1))
    a = (1 - INTERVAL_LEVEL) / 2
    return {"q_low": float(np.quantile(r, a)), "q_high": float(np.quantile(r, 1 - a)), "n_val_aoi_months": int(len(r)),
            "formula": "low=(ŷ+1)·exp(q_low)−1, high=(ŷ+1)·exp(q_high)−1, clipped ≥0", "nominal": INTERVAL_LEVEL}
for mid in FULL_MODELS:
    try: MODELS[mid]["interval"] = interval_from_val(mid)
    except Exception as e: MODELS[mid]["interval"] = {"error": repr(e)}

SELECTION_RECORD = {"selected_model_id": SELECTED, "gate": GATE, "frozen_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "val_cell_month_mae": {m: vm(m) for m in FULL_MODELS}, "val_aoi_month_mae": {m: vm(m, "aoi_month") for m in FULL_MODELS},
                    "interval": MODELS[SELECTED].get("interval"), "split_manifest_sha256": SPLIT_MANIFEST["sha256"]}
SEL_PATH = RUN_DIR / "selection_frozen.json"
jdump(clean_json(SELECTION_RECORD), SEL_PATH, indent=1)
SELECTION_RECORD["sha256"] = sha256_file(SEL_PATH)
log(f"SELECTED (validation only): {SELECTED}; gate baseline {BASELINE} val AOI-month MAE={b_mae}")
print(pd.DataFrame({m: {"val_cell_MAE": vm(m), "val_active_MAE": vm(m, sg="active"), "val_AOI_MAE": vm(m, "aoi_month"),
                        "val_dev": vm(m, key="poisson_deviance")} for m in FULL_MODELS}).T.round(4))

# %% [markdown]
# ## Phase 2 · Section 2.12 — Open the test set once
# **What this cell does:** Opens the sealed test years (2023–2024) exactly once, scores every full-panel model, measures how often the true area-month value falls inside the 80% interval, and sets the release stage: synthetic data gives `ui_prototype`; beating both B0_identity and B0_month_ratio on test with coverage within ±10 points gives `validated_calibration`; otherwise `observed_comparison`.
#
# **Steps**
#
# - [ ] 2.12.1 Run the cell once. Do not run it a second time on its own.
# - [ ] 2.12.2 Read `TEST SPLIT OPENED at <time> (selection frozen at .../selection_frozen.json)`.
# - [ ] 2.12.3 Read `RELEASE STAGE: <stage> — <reason>`.
#
# **Check before moving on**
#
# - [ ] On real data the stage is `observed_comparison` or `validated_calibration`, never `ui_prototype`.
# - [ ] The reason lists the test area-month MAE of the selected model and both B0 baselines, and the interval coverage (aim: near 0.80).
#
# **If it fails:** `Test split already opened once — refusing a second look` means this cell was run again by itself. Restart the session and Run All: the run resumes from checkpoints and the test set is opened once in the new session.
#
# **Time:** estimate: under 2 min

# %%
# ===================== OPEN TEST ONCE: all full-panel models, intervals, release stage =====================
te = TEST_VAULT.open(SEL_PATH)
if RESUMED: log("note: this is a resumed run; the test split is evaluated once in this session with the identically re-derived, frozen selection")
with Timer("test_eval"):
    for mid in FULL_MODELS:
        try:
            MODELS[mid]["test"] = evaluate(MODELS[mid]["pred"], te)
            iv = MODELS[mid].get("interval", {})
            if "q_low" in iv:
                am = aoi_month_pairs(te, MODELS[mid]["pred"])
                lo = np.clip((am["p"] + 1) * np.exp(iv["q_low"]) - 1, 0, None); hi = (am["p"] + 1) * np.exp(iv["q_high"]) - 1
                inside = (am["y"] >= lo) & (am["y"] <= hi)
                iv["test_coverage"] = float(inside.mean()) if len(am) else None; iv["n_test_aoi_months"] = int(len(am))
        except Exception as e:
            MODELS[mid]["test_error"] = repr(e); log(f"test eval failed for {mid}: {e!r}")

sel_test = MODELS[SELECTED].get("test", {})
SEL_INTERVAL = MODELS[SELECTED].get("interval", {})
def tm_(mid): return vm(mid, "aoi_month", "all", "test")
_beat = {b: (tm_(SELECTED) is not None and tm_(b) is not None and b != SELECTED and tm_(SELECTED) < tm_(b)) for b in ["B0_identity", "B0_month_ratio"]}
beats = all(_beat.values())
cov = SEL_INTERVAL.get("test_coverage")
cov_ok = cov is not None and abs(cov - INTERVAL_LEVEL) <= 0.10
_why = [GATE.get("selection_reason", "")]
if SELECTED in ("B0_identity", "B0_month_ratio"):
    _why.append(f"the selected model is {SELECTED} itself, so the release rule 'beats B0_identity and B0_month_ratio on test AOI-month MAE' "
                "cannot hold by construction → at most observed_comparison")
_why.append(f"test AOI-month MAE: selected={tm_(SELECTED)}, B0_identity={tm_('B0_identity')}, B0_month_ratio={tm_('B0_month_ratio')}; "
            f"beats={_beat}; interval test coverage={cov} (nominal {INTERVAL_LEVEL}, ok={cov_ok})")
if SYNTHETIC:
    RELEASE_STAGE = "ui_prototype"
    RELEASE_REASON = "bundle is a SYNTHETIC fixture → forced ui_prototype, value_status demo. " + " | ".join(_why)
elif beats and cov_ok:
    RELEASE_STAGE = "validated_calibration"
    RELEASE_REASON = "selected beats B0_identity & B0_month_ratio on test AOI-month MAE and coverage within ±0.10 of nominal. " + " | ".join(_why)
else:
    RELEASE_STAGE = "observed_comparison"
    RELEASE_REASON = "release check not met. " + " | ".join(_why)
log(f"RELEASE STAGE: {RELEASE_STAGE} — {RELEASE_REASON}")

# %% [markdown]
# ## Phase 2 · Section 2.13 — Backcast and anomalies
# **What this cell does:** For every area it sums the monthly series (unavailable months stay empty, partial months are shown but not modelled), applies the selected model to produce the VIIRS-scale estimate from 2003 with its 80% interval, builds the harmonised series (observed VIIRS where available, otherwise the estimate) and flags each month as high, low, normal or insufficient against the same calendar month in other years.
#
# **Steps**
#
# - [ ] 2.13.1 Run the cell.
# - [ ] 2.13.2 Read `backcast summary: {...}`: per area, `est_total_2003_2012`, `aqua_total_2003_2012` and `months_estimated`.
#
# **Check before moving on**
#
# - [ ] `months_estimated` is about 109 per area (2003–2011 plus January 2012) when all Aqua years are available.
# - [ ] `est_total_2003_2012` is larger than `aqua_total_2003_2012` (the estimate is on the VIIRS scale).
#
# **If it fails:** If `months_estimated` is much lower, Aqua files were missing for some years: check the summary table from 1.11 and the availability lines in 2.6.
#
# **Time:** estimate: under 5 min

# %%
# ===================== BACKCAST 2003–2012, AOI-month series, anomalies =====================
SEL_PRED = MODELS[SELECTED]["pred"]
SNAPSHOT_ID = f"lumos-{RUN_TS}-{hashlib.sha256(json.dumps(sorted([s.get('sha256') or '' for s in SOURCES])).encode()).hexdigest()[:8]}"
PARTIAL_MAP = {("aqua", "count"): "aqua", ("aqua", "static"): "static_aqua", ("terra", "count"): "terra",
               ("snpp", "count"): "viirs", ("snpp", "static"): "static_viirs"}

def aoi_rows(a):
    """Panel row indices of an AOI (rows of a cell are contiguous: gcell*NM + m) — no N-sized temporaries."""
    g = np.where(a["cellmask"])[0].astype(np.int64)
    return (g[:, None] * NM + np.arange(NM)[None, :]).ravel(), g

def aoi_series(a):
    """Per-month sums for one AOI. NaN where the source is unavailable (missing ≠ zero). Partial months (e.g. S-NPP Jan 2012,
    last month of a current-year file) carry the OBSERVED raw count for display only; the modelling/anomaly series (`*_model`,
    `ref`) excludes them."""
    rows, g = aoi_rows(a)
    mm = np.tile(np.arange(NM), len(g))
    def s(v):
        v = v[rows]; fin = np.isfinite(v)
        tot = np.bincount(mm, weights=np.where(fin, v, 0), minlength=NM); nn = np.bincount(mm, weights=~fin, minlength=NM)
        return np.where(nn > 0, np.nan, tot)
    c = a["country"]
    out = {"aqua": s(P["aqua_count"]), "terra": s(P["terra_count"]), "viirs": s(P["viirs_snpp_count"]),
           "static_aqua": s(P["static_aqua"]), "static_viirs": s(P["static_viirs"]), "est": s(SEL_PRED),
           "st_aqua": STATUS[c]["aqua"], "st_terra": STATUS[c]["terra"], "st_snpp": STATUS[c]["snpp"]}
    out["viirs_model"] = out["viirs"].copy()
    local = g - CELL_OFFSET[c]
    for (p, f), key in PARTIAL_MAP.items():
        for m in np.where(STATUS[c][p] == ST_PARTIAL)[0]:
            vec = PARTIAL_RAW.get(f"{c}|{p}|{f}|{int(m)}")
            if vec is not None: out[key][m] = float(vec[local].sum())
    yrs = YEAR_OF_M
    out["est"] = np.where(yrs < 2003, np.nan, out["est"])
    lo = np.clip((out["est"] + 1) * np.exp(SEL_INTERVAL.get("q_low", np.nan)) - 1, 0, None)
    hi = (out["est"] + 1) * np.exp(SEL_INTERVAL.get("q_high", np.nan)) - 1
    out["lo"], out["hi"] = lo, hi
    out["ref"] = np.where(np.isfinite(out["viirs_model"]), out["viirs_model"], out["est"])     # harmonised reference-scale series
    return out

def anomalies(ref):
    res = [None] * NM
    yrs = YEAR_OF_M
    for mo in range(1, 13):
        ms = np.where((MONTH_OF_M == mo) & (yrs >= 2003))[0]
        for mi in np.where(MONTH_OF_M == mo)[0]:
            base = [ref[j] for j in ms if j != mi and np.isfinite(ref[j])]
            v = ref[mi]
            if not np.isfinite(v) or len(base) < ANOMALY_MIN_BASELINE:
                res[mi] = {"baseline_years": len(base), "rank": None, "zscore_log": None, "flag": "insufficient"}; continue
            lb = np.log1p(base); sd = lb.std(ddof=1)
            z = float((np.log1p(v) - lb.mean()) / sd) if sd > 1e-9 else 0.0
            rank = int(1 + sum(b > v for b in base))
            res[mi] = {"baseline_years": len(base), "rank": rank, "zscore_log": round(z, 3),
                       "flag": "high" if z >= ANOMALY_Z else ("low" if z <= -ANOMALY_Z else "normal")}
    return res

with Timer("backcast_series"):
    SERIES = {a["aoi_id"]: aoi_series(a) for a in AOIS}
    ANOM = {k: anomalies(v["ref"]) for k, v in SERIES.items()}
    BACKCAST_SUMMARY = {}
    for k, s in SERIES.items():
        bm = np.isin(YEAR_OF_M, BACKCAST_YEARS)
        BACKCAST_SUMMARY[k] = {"est_total_2003_2012": float(np.nansum(s["est"][bm & ~np.isfinite(s["viirs_model"])])),
                               "aqua_total_2003_2012": float(np.nansum(s["aqua"][bm])),
                               "months_estimated": int((bm & np.isfinite(s["est"]) & ~np.isfinite(s["viirs_model"])).sum())}
    log(f"backcast summary: {json.dumps(BACKCAST_SUMMARY)[:600]}")

# %% [markdown]
# ## Phase 2 · Section 2.14 — Export the app bundle
# **What this cell does:** Writes the app bundle before the research stages: monthly activity records per area and year (validated against `activity.schema.json`), cell grids (15 MB per file budget), B1 input features for BGD, AUS-NSW and USA-CA, the optional recent NRT layer, scrubbed sources, regions and boundaries, model weights (B1 JSON, B2 JSON, D1 ONNX with an onnxruntime parity check), model cards, metrics, `comparison.csv`, figures, manifest and checksums. It copies the bundle to `/kaggle/working/lumos_app_bundle/` and zips it to `/kaggle/working/lumos_app_bundle.zip`.
#
# **Steps**
#
# - [ ] 2.14.1 Run the cell.
# - [ ] 2.14.2 Read `activity records: N; schema errors: 0 (validator: ...)`.
# - [ ] 2.14.3 Read `ONNX parity: {...}`.
# - [ ] 2.14.4 Lines `cells <aoi> <year>: est cutoff raised to ...` mean a cell file was over budget and its cutoff was raised and recorded; that is expected for large areas.
# - [ ] 2.14.4a Cell grids (`cells/<aoi>/<year>.json`) are written for `BGD` and its divisions, `AUS-NSW` and `USA-CA` only; whole-country `AUS` and `USA` have none. B1 feature files (`features/<aoi>/<year>.json`) exist for `BGD`, `AUS-NSW` and `USA-CA`.
# - [ ] 2.14.5 Read `app bundle [core (before research stages Q1/Q2)]: ... zip ... MB`.
#
# **Check before moving on**
#
# - [ ] `schema errors: 0`.
# - [ ] ONNX parity shows `passed` true (unless D1 was skipped).
# - [ ] `/kaggle/working/lumos_app_bundle.zip` exists, and its size is well under 100 MB.
#
# **If it fails:** `activity records failed schema validation` stops the run: this is a bug, so save the log and report it. An ONNX or XGBoost export error is recorded in the model card and the export continues. Even if a later stage crashes, this zip is already safe.
#
# **Time:** estimate: 2–10 min (fixture: 4 s)

# %%
# ===================== EXPORT APP BUNDLE (contract §6) — written BEFORE the research-only Q1/Q2 stages =====================
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
COL = {"aqua": "#00B4D8", "viirs": "#8B5CF6", "est": "#14B8A6", "terra": "#F59E0B"}
MODEL_COLORS = ["#00B4D8", "#8B5CF6", "#14B8A6", "#F59E0B", "#EF4444", "#22C55E", "#3B82F6", "#EC4899", "#A855F7", "#F97316", "#0EA5E9", "#84CC16"]

# Field list of the monthly record, verbatim from CONTRACT.md §6 (order preserved). The schema below must cover exactly these.
CONTRACT_RECORD_FIELDS = ["schema_version", "snapshot_id", "aoi_id", "period_start_utc", "period_end_utc_exclusive",
    "source_platform", "reference_platform", "source_product", "reference_product",
    "raw_modis_detections", "raw_modis_terra_detections", "raw_viirs_reference_detections", "static_source_detections_modis",
    "static_source_detections_viirs", "estimated_viirs_reference_detections", "estimate_interval_low", "estimate_interval_high",
    "interval_nominal_level", "interval_empirical_holdout_coverage", "extract_status", "coverage_status", "coverage_fraction",
    "value_status", "split", "anomaly", "model_id", "provenance_ids", "reason"]
_cnt = {"type": ["integer", "null"], "minimum": 0}
_num = {"type": ["number", "null"], "minimum": 0}
ACTIVITY_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema", "title": "Lumos monthly activity record v1.0 (contract §6)", "type": "object",
    "required": list(CONTRACT_RECORD_FIELDS), "additionalProperties": False,
    "properties": {
        "schema_version": {"const": "1.0"}, "snapshot_id": {"type": "string"}, "aoi_id": {"type": "string"},
        "period_start_utc": {"type": "string", "pattern": r"^\d{4}-\d{2}-01T00:00:00Z$"},
        "period_end_utc_exclusive": {"type": "string", "pattern": r"^\d{4}-\d{2}-01T00:00:00Z$"},
        "source_platform": {"const": "Aqua"}, "reference_platform": {"const": "S-NPP"},
        "source_product": {"type": "string"}, "reference_product": {"type": "string"},
        "raw_modis_detections": _cnt, "raw_modis_terra_detections": _cnt, "raw_viirs_reference_detections": _cnt,
        "static_source_detections_modis": _cnt, "static_source_detections_viirs": _cnt,
        "estimated_viirs_reference_detections": _num, "estimate_interval_low": _num, "estimate_interval_high": _num,
        "interval_nominal_level": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
        "interval_empirical_holdout_coverage": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
        "extract_status": {"enum": ["complete", "partial", "missing"]}, "coverage_status": {"const": "unknown"},
        "coverage_fraction": {"type": "null"},
        "value_status": {"enum": ["observed", "estimated", "unsupported", "demo"]},
        "split": {"enum": ["train", "val", "test", "backcast", "none"]},
        "anomaly": {"type": "object", "required": ["baseline_years", "rank", "zscore_log", "flag"], "additionalProperties": False,
                    "properties": {"baseline_years": {"type": "integer", "minimum": 0}, "rank": {"type": ["integer", "null"], "minimum": 1},
                                   "zscore_log": {"type": ["number", "null"]}, "flag": {"enum": ["high", "normal", "low", "insufficient"]}}},
        "model_id": {"type": ["string", "null"]}, "provenance_ids": {"type": "array", "items": {"type": "string"}},
        "reason": {"type": "string"}}}
assert set(ACTIVITY_SCHEMA["properties"]) == set(CONTRACT_RECORD_FIELDS) == set(ACTIVITY_SCHEMA["required"]), "schema ≠ contract field list"

def tiny_validate(inst, schema, path="$"):
    """Minimal JSON-Schema subset validator: type, const, enum, required, properties, additionalProperties, items, minimum, maximum, pattern."""
    errs = []
    tmap = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}
    def is_type(v, t):
        if t == "integer": return isinstance(v, int) and not isinstance(v, bool)
        if t == "number": return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
        return isinstance(v, tmap[t])
    if "type" in schema:
        ts = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(is_type(inst, t) for t in ts): return [f"{path}: expected {ts}, got {type(inst).__name__}"]
    if "const" in schema and inst != schema["const"]: errs.append(f"{path}: expected const {schema['const']!r}")
    if "enum" in schema and inst not in schema["enum"]: errs.append(f"{path}: {inst!r} not in {schema['enum']}")
    if isinstance(inst, (int, float)) and not isinstance(inst, bool):
        if "minimum" in schema and inst < schema["minimum"]: errs.append(f"{path}: {inst} < {schema['minimum']}")
        if "maximum" in schema and inst > schema["maximum"]: errs.append(f"{path}: {inst} > {schema['maximum']}")
    if isinstance(inst, str) and "pattern" in schema and not re.search(schema["pattern"], inst): errs.append(f"{path}: pattern mismatch")
    if isinstance(inst, dict):
        for k in schema.get("required", []):
            if k not in inst: errs.append(f"{path}: missing {k}")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for k in inst:
                if k not in props: errs.append(f"{path}: unexpected {k}")
        for k, sub in props.items():
            if k in inst: errs += tiny_validate(inst[k], sub, f"{path}.{k}")
    if isinstance(inst, list) and "items" in schema:
        for i, v in enumerate(inst): errs += tiny_validate(v, schema["items"], f"{path}[{i}]")
    return errs

def iso_month(y, m): return f"{y:04d}-{m:02d}-01T00:00:00Z"
def jint(v): return int(round(float(v))) if v is not None and np.isfinite(v) else None
def jnum(v, nd=2): return round(float(v), nd) if v is not None and np.isfinite(v) else None

SRC_ID = {}
for s in SOURCES:
    if s.get("sensor") in ("modis", "viirs-snpp") and s.get("_usable"): SRC_ID[(s["sensor"], s["country"], int(s["year"]))] = s["id"]

def split_of_year(y):
    if y in TRAIN_YEARS: return "train"
    if y in VAL_YEARS: return "val"
    if y in TEST_YEARS: return "test"
    if y in BACKCAST_YEARS: return "backcast"      # 2003–2012 (contract §3); 2012 VIIRS is shown too where observed
    return "none"

def activity_records(a):
    s = SERIES[a["aoi_id"]]; an = ANOM[a["aoi_id"]]; recs = {}; c = a["country"]
    cov_val = SEL_INTERVAL.get("test_coverage")
    for mi in range(NM):
        y, mo = int(YEAR_OF_M[mi]), int(MONTH_OF_M[mi])
        ny, nmo = (y + 1, 1) if mo == 12 else (y, mo + 1)
        expected = [("aqua", int(s["st_aqua"][mi])), ("terra", int(s["st_terra"][mi]))] + ([("snpp", int(s["st_snpp"][mi]))] if y >= 2012 else [])
        sts = [v for _, v in expected]
        extract = "complete" if all(v == ST_COMPLETE for v in sts) else ("missing" if all(v == ST_MISSING for v in sts) else "partial")
        notes = []
        for p, v in expected:
            if v != ST_COMPLETE:
                nt = STATUS_NOTES[c][p].get(mi, f"{PLATFORM_LABEL[p]} {ST_NAME[v]}")
                notes.append(f"{PLATFORM_LABEL[p]} {ST_NAME[v]}: {nt}" + ("; observed count shown, excluded from training/baselines/anomaly" if v == ST_PARTIAL else
                                                                           "; field null" if p == "terra" else ""))
        est = s["est"][mi]; obs_model = s["viirs_model"][mi]; obs_disp = s["viirs"][mi]
        if y in UNSUPPORTED_YEARS:
            vs, reason, est = "unsupported", "2001–2002: no full-year Aqua MODIS protocol; harmonised estimate unsupported", np.nan
        elif np.isfinite(obs_model):
            vs, reason = "observed", "Observed S-NPP VIIRS reference; estimate from Aqua shown for comparison"
            if y == 2012: reason += " (2012 is in the backcast period: both observed and estimated values shown)"
        elif np.isfinite(est):
            vs = "estimated"
            if y < 2012: reason = "Retrospective estimate: Aqua MODIS mapped to VIIRS S-NPP scale (backcast)"
            elif y >= 2012 and int(s["st_snpp"][mi]) == ST_PARTIAL: reason = "Estimate from Aqua; S-NPP VIIRS month is only partially observed"
            else: reason = "Estimate from Aqua; S-NPP VIIRS reference unavailable for this month (missing is not zero)"
        else:
            vs, reason = "unsupported", "Source data missing or partial for this month (missing is not zero)"
        if SYNTHETIC:
            vs, reason = "demo", "SYNTHETIC FIXTURE — NOT REAL DATA. " + reason
        has_est = np.isfinite(est)
        if notes: reason += ". " + " | ".join(notes)
        reason += f". Anomaly is retrospective vs same-month {ANOMALY_MIN_BASELINE}+ baseline years (complete months only)."
        prov = [p for p in [SRC_ID.get(("modis", c, y)), SRC_ID.get(("viirs-snpp", c, y))] if p]
        recs.setdefault(y, []).append({
            "schema_version": "1.0", "snapshot_id": SNAPSHOT_ID, "aoi_id": a["aoi_id"],
            "period_start_utc": iso_month(y, mo), "period_end_utc_exclusive": iso_month(ny, nmo),
            "source_platform": "Aqua", "reference_platform": "S-NPP",
            "source_product": "MODIS C6.1 (FIRMS country CSV)", "reference_product": "VIIRS 375m S-NPP (FIRMS country CSV)",
            "raw_modis_detections": jint(s["aqua"][mi]), "raw_modis_terra_detections": jint(s["terra"][mi]),
            "raw_viirs_reference_detections": jint(obs_disp) if y >= 2012 else None,
            "static_source_detections_modis": jint(s["static_aqua"][mi]),
            "static_source_detections_viirs": jint(s["static_viirs"][mi]) if y >= 2012 else None,
            "estimated_viirs_reference_detections": jnum(est) if has_est else None,
            "estimate_interval_low": jnum(s["lo"][mi]) if has_est else None, "estimate_interval_high": jnum(s["hi"][mi]) if has_est else None,
            "interval_nominal_level": INTERVAL_LEVEL if has_est else None,
            "interval_empirical_holdout_coverage": jnum(cov_val, 4) if (has_est and cov_val is not None) else None,
            "extract_status": extract, "coverage_status": "unknown", "coverage_fraction": None,
            "value_status": vs, "split": split_of_year(y), "anomaly": an[mi], "model_id": SELECTED if has_est else None,
            "provenance_ids": prov, "reason": reason})
    return recs

MODEL_DESC = {"B0_identity": "Identity baseline: estimate = Aqua MODIS count.", "B0_ratio": "Global train ratio Σviirs/Σaqua × aqua count.",
              "B0_month_ratio": "Per country × calendar-month train ratio × aqua count (transparent; ratios in weights.json).",
              "B1_poisson": "Poisson GLM (log link) on log1p+standardised Aqua features plus raw aqua_count (v1.1).",
              "B2_xgb": "XGBoost count:poisson gradient-boosted trees on raw features.", "D1_mlp": "PyTorch MLP (128-128-64, Poisson NLL), exported to ONNX with preprocessing embedded.",
              "Q1_vqc": "Simulated variational quantum circuit (torch statevector), PCA→angle encoding, ⟨Z⟩→linear→softplus; bounded subset only (research).",
              "Q2_qllm": "LLM-proposed vs random search over Q1 architectures with equal trial budget (research)."}
MODEL_FEATURES = {"B0_identity": ["aqua_count"], "B0_ratio": ["aqua_count"], "B0_month_ratio": ["aqua_count", "country", "month"],
                  "B1_poisson": FEATURES_B1}

def model_card(mid):
    m = MODELS.get(mid, {})
    feats = MODEL_FEATURES.get(mid, FEATURES)
    card = {"model_id": mid, "description": MODEL_DESC.get(mid, mid), "status": m.get("status"), "error": m.get("error"),
            "target": "viirs_snpp_count (type 0, cell-month)", "prediction": "estimated_viirs_reference_detections",
            "unit": "expected S-NPP VIIRS type-0 detections per 5 km cell per UTC calendar month; AOI value = sum over the AOI's cells",
            "features": feats, "feature_order": feats,
            "feature_definitions": {f: FEATURE_DEFS.get(f, {"country": "FIRMS country of the cell (ISO3 in ratio key)",
                                                            "month": "UTC calendar month 1..12"}.get(f, f)) for f in feats},
            "train_years": TRAIN_YEARS, "val_years": VAL_YEARS, "test_years": TEST_YEARS, "spatial_holdout": "20% of 100 km blocks excluded from train",
            "info": m.get("info"), "val_summary": {"cell_month": (m.get("val", {}).get("cell_month", {}) or {}).get("all") or m.get("val"),
                                                  "aoi_month": (m.get("val", {}).get("aoi_month", {}) or {}).get("all")},
            "test_summary": {"cell_month": (m.get("test", {}).get("cell_month", {}) or {}).get("all") or m.get("test"),
                             "aoi_month": (m.get("test", {}).get("aoi_month", {}) or {}).get("all")},
            "interval": m.get("interval"), "selected": mid == SELECTED, "synthetic_training_data": SYNTHETIC,
            "intended_use": "Retrospective harmonised fire-activity calendar (VIIRS S-NPP scale) for 2003–2012; comparison for 2012+.",
            "limitations": "FIRMS detections are not burned area; no cloud-cover denominator (coverage_fraction null); relationship may drift with land use; Terra kept separate."}
    if mid.startswith("B0_"):
        card["app_recompute"] = {"weights": f"models/{mid}/weights.json", "how": (m.get("weights") or {}).get("formula")}
    if mid == "B1_poisson":
        card["app_recompute"] = {"weights": "models/B1_poisson/weights.json",
                                 "how": "x = features in feature_order; z_j = (transform_j(x_j) - mean_j)/scale_j with transform log1p(max(x,0)) or identity; "
                                        "rate = exp(clip(intercept + Σ coef_j z_j, -30, 30))",
                                 "per_cell_inputs": {aid: f"features/{aid}/<year>.json" for aid in FEATURE_EXPORT_AOIS}}
    if mid == "D1_mlp":
        card["onnx_io"] = {"file": "models/D1_mlp/model.onnx", "input": {"name": "x", "dtype": "float32", "shape": ["N", len(FEATURES)], "features": FEATURES,
                                                                         "values": "RAW feature values (preprocessing is embedded)"},
                           "output": {"name": "rate", "dtype": "float32", "shape": ["N"], "meaning": "expected VIIRS S-NPP detections per cell-month"},
                           "opset": 17}
        if m.get("onnx"): card["onnx"] = m["onnx"]
    if mid == "B2_xgb":
        card["app_recompute"] = {"model": "models/B2_xgb/model.json (XGBoost JSON)", "input": "float32 matrix of FEATURES in feature_order (raw values)",
                                 "iteration_range": [0, int((m.get("info") or {}).get("best_iteration", 0)) + 1]}
    return clean_json(card)

def write_figures(fig_dir):
    fig_dir.mkdir(parents=True, exist_ok=True); made = []
    t = pd.to_datetime([f"{y}-{m:02d}-01" for y, m in zip(YEAR_OF_M, MONTH_OF_M)])
    # v1.2: every country (BGD, AUS, USA) plus the detailed admin-1 regions with B1 features (AUS-NSW, USA-CA)
    for a in [a for a in AOIS if a["kind"] == "country"] + [a for a in AOIS if a["kind"] == "admin1" and a["aoi_id"] in FEATURE_EXPORT_AOIS]:
        s = SERIES[a["aoi_id"]]
        fig, ax = plt.subplots(figsize=(13, 4.2))
        ax.plot(t, s["aqua"], color=COL["aqua"], lw=1.4, label="MODIS Aqua (source, raw)")
        ax.plot(t, s["terra"], color=COL["terra"], lw=1.0, label="MODIS Terra (separate, raw)")
        ax.plot(t, s["viirs_model"], color=COL["viirs"], lw=1.6, label="VIIRS S-NPP (reference, observed, complete months)")
        ax.plot(t, s["est"], color=COL["est"], lw=1.6, ls="--", label=f"Estimated VIIRS-scale ({SELECTED})")
        ax.fill_between(t, s["lo"], s["hi"], color=COL["est"], alpha=0.18, lw=0, label="80% interval")
        for yb, txt in [(2013, "train"), (2021, "val"), (2023, "test")]: ax.axvline(pd.Timestamp(f"{yb}-01-01"), color="black", lw=0.6, ls=":")
        ax.set_yscale("symlog", linthresh=10); ax.set_ylim(bottom=0); ax.set_ylabel("detections / month (symlog)")
        ttl = f"{a['name']} ({a['aoi_id']}) — monthly fire detections" + ("  [SYNTHETIC DEMO DATA]" if SYNTHETIC else "")
        ax.set_title(ttl); ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), frameon=False)
        fig.tight_layout(); p = fig_dir / f"timeseries_{a['aoi_id']}.png"; fig.savefig(p, dpi=110, bbox_inches="tight"); plt.close(fig); made.append(p)
    # model comparison
    ms = FULL_MODELS
    fig, ax = plt.subplots(figsize=(10, 4))
    xx = np.arange(len(ms)); wdt = 0.38
    ax.bar(xx - wdt / 2, [vm(m, "aoi_month") or 0 for m in ms], wdt, color="#3B82F6", label="validation (AOI-month MAE)")
    ax.bar(xx + wdt / 2, [vm(m, "aoi_month", split="test") or 0 for m in ms], wdt, color="#EF4444", label="test (AOI-month MAE)")
    ax.set_xticks(xx); ax.set_xticklabels(ms, rotation=20); ax.set_ylabel("MAE (detections / AOI-month)")
    ax.set_title("Model comparison" + ("  [SYNTHETIC]" if SYNTHETIC else "")); ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), frameon=False)
    fig.tight_layout(); p = fig_dir / "model_comparison.png"; fig.savefig(p, dpi=110, bbox_inches="tight"); plt.close(fig); made.append(p)
    # test scatter for selected
    am = aoi_month_pairs(te, SEL_PRED)
    if len(am):
        fig, ax = plt.subplots(figsize=(7.5, 5))
        for k, (kind, d) in enumerate(am.groupby("kind")):
            ax.scatter(d["y"] + 1, d["p"] + 1, s=14, color=[COL["est"], COL["viirs"]][k % 2], label=f"{kind} AOI-months (test)")
        lim = [1, max(am["y"].max(), am["p"].max()) * 1.3 + 2]
        ax.plot(lim, lim, color="black", lw=0.8, label="1:1"); ax.set_xscale("log"); ax.set_yscale("log")
        ax.set_xlabel("observed VIIRS S-NPP + 1"); ax.set_ylabel(f"estimated ({SELECTED}) + 1")
        ax.set_title("Test 2023–2024, AOI-month"); ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), frameon=False)
        fig.tight_layout(); p = fig_dir / "test_scatter_aoi_month.png"; fig.savefig(p, dpi=110, bbox_inches="tight"); plt.close(fig); made.append(p)
    if QML.get("status") == "ok":
        ks = [k for k, v in QML["val_subset"].items() if isinstance(v, dict) and v.get("mae") is not None]
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.bar(range(len(ks)), [QML["val_subset"][k]["poisson_deviance"] for k in ks], color=[MODEL_COLORS[i % len(MODEL_COLORS)] for i in range(len(ks))])
        ax.set_xticks(range(len(ks))); ax.set_xticklabels(ks, rotation=30, ha="right"); ax.set_ylabel("val Poisson deviance (subset eval rows)")
        ax.set_title(f"Matched-budget comparison: {QML['n_train_subset']} train rows")
        fig.tight_layout(); p = fig_dir / "qml_subset_comparison.png"; fig.savefig(p, dpi=110, bbox_inches="tight"); plt.close(fig); made.append(p)
    if QLLM.get("status") in ("ok", "test_stub"):
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(QLLM["best_so_far"]["random"], color=COL["terra"], marker="o", label="random search")
        ax.plot(QLLM["best_so_far"]["llm_guided"], color=COL["viirs"], marker="s", label=f"LLM-guided ({QLLM['status']})")
        ax.set_xlabel("trial"); ax.set_ylabel("best val deviance so far"); ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), frameon=False)
        fig.tight_layout(); p = fig_dir / "qllm_search.png"; fig.savefig(p, dpi=110, bbox_inches="tight"); plt.close(fig); made.append(p)
    return made

def flat_metrics():
    rows = []
    for mid, m in MODELS.items():
        for sp in ["val", "test"]:
            d = m.get(sp)
            if not d:
                rows.append({"model_id": mid, "split": sp, "level": None, "subgroup": None, "status": m.get("status")}); continue
            for level, groups in d.items():
                for sg, met in groups.items():
                    if isinstance(met, dict) and "n" in met:
                        rows.append({"model_id": mid, "split": sp, "level": level, "subgroup": sg, "status": m.get("status"),
                                     **{k: met.get(k) for k in ["n", "mae", "rmse", "bias", "poisson_deviance"]}})
    for sp, key in [("val", "val_subset"), ("test", "test_subset")]:
        for mid, met in (QML.get(key) or {}).items():
            if isinstance(met, dict) and "n" in met:
                rows.append({"model_id": mid, "split": sp, "level": "cell_month_qml_subset", "subgroup": "all", "status": "ok",
                             **{k: met.get(k) for k in ["n", "mae", "rmse", "bias", "poisson_deviance"]}})
    return pd.DataFrame(rows)

def scrub_sources():
    out = []
    for s in SOURCES:
        d = {k: v for k, v in s.items() if not k.startswith("_")}
        if d.get("url"): d["url"] = re.sub(r"(/api/area/csv/)[^/]+/", r"\1***/", str(d["url"]))
        d["verification_B"] = s.get("_verify")
        out.append(clean_json(d))
    return out


def _json_size_mb(text): return len(text.encode("utf-8")) / 1e6

CELL_EXPORT_LOG, FEATURE_EXPORT_LOG = {}, {}
def write_cells(a, out_dir):
    """cells/<aoi>/<year>.json — rows with aqua>0 or viirs>0 or est≥cutoff (contract: cutoff 1). Each AOI-year must stay ≤ CELL_FILE_BUDGET_MB:
    if not, the est cutoff is raised along CELL_EST_LADDER and the cutoff used is recorded (file key `est_min` + metrics notes). Vectorised."""
    rows, g = aoi_rows(a)
    yrs = P["year"][rows]; mo = P["month"][rows]
    aq, vi = P["aqua_count"][rows], P["viirs_snpp_count"][rows]
    es = np.where(yrs >= 2003, SEL_PRED[rows], np.nan)
    gc = P["gcell"][rows]
    cid = CELLS["cell_id"].to_numpy()[gc]; clon = np.round(CELLS["lon"].to_numpy()[gc], 4); clat = np.round(CELLS["lat"].to_numpy()[gc], 4)
    log_a = {}
    for y in range(YEAR_MIN, YEAR_MAX + 1):
        sel = yrs == y
        base = sel & ((np.nan_to_num(aq) > 0) | (np.nan_to_num(vi) > 0))
        for cut in CELL_EST_LADDER:
            keep = np.where(base | (sel & (np.nan_to_num(es) >= cut)))[0]
            df = pd.DataFrame({"cell_id": cid[keep], "lon": clon[keep], "lat": clat[keep], "month": mo[keep].astype(int),
                               "aqua": pd.array(np.where(np.isfinite(aq[keep]), np.round(aq[keep]), np.nan), dtype="Int64"),
                               "viirs": pd.array(np.where(np.isfinite(vi[keep]), np.round(vi[keep]), np.nan), dtype="Int64"),
                               "est": np.round(es[keep].astype(np.float64), 2)})
            text = ('{"cell_size_m":5000,"proj":"lambert-cea","est_min":' + json.dumps(cut) +
                    ',"columns":["cell_id","lon","lat","month","aqua","viirs","est"],"rows":' + df.to_json(orient="values", double_precision=4) + "}")
            if _json_size_mb(text) <= CELL_FILE_BUDGET_MB or cut == CELL_EST_LADDER[-1]: break
        if cut != CELL_EST_MIN or _json_size_mb(text) > CELL_FILE_BUDGET_MB:
            log_a[str(y)] = {"est_min": cut, "mb": round(_json_size_mb(text), 2), "within_budget": _json_size_mb(text) <= CELL_FILE_BUDGET_MB}
            log(f"cells {a['aoi_id']} {y}: est cutoff raised to {cut} ({_json_size_mb(text):.2f} MB; budget {CELL_FILE_BUDGET_MB} MB)")
        p = out_dir / "cells" / a["aoi_id"] / f"{y}.json"; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)
    CELL_EXPORT_LOG[a["aoi_id"]] = log_a or "all years at est_min=1.0 within budget"

FEATURE_DYNAMIC = ["aqua_count", "aqua_day", "aqua_night", "aqua_frp_sum", "aqua_frp_mean", "aqua_conf_mean", "aqua_scan_mean",
                   "terra_count", "aqua_count_3x3"]
def write_features(a, out_dir):
    """features/<aoi>/<year>.json — compact per-cell B1 inputs so the app can recompute B1 in JS (v1.1: BGD and AUS-NSW; v1.2 adds USA-CA).
    Rows absent from `rows` have all dynamic features = 0; month_sin/cos derive from month; lat and aqua_clim come from `cells`;
    country one-hot is constant per AOI; aqua_count_raw = aqua_count. `check.b1_sum_by_month` is B's own B1 AOI sum."""
    if MODELS.get("B1_poisson", {}).get("status") != "ok": FEATURE_EXPORT_LOG[a["aoi_id"]] = "skipped: B1 not available"; return
    g = np.where(a["cellmask"])[0]
    clim2 = P["aqua_clim"].reshape(NCELL, NM)[g][:, :12]          # climatology is identical across years for a cell × calendar month
    clim_m = np.empty((len(g), 12), np.float32)
    for k in range(12): clim_m[:, (MONTH_OF_M[k] - 1)] = clim2[:, k]
    cells_tab = [[cid, round(float(la), 5), [None if not np.isfinite(v) else round(float(v), 4) for v in cl]]
                 for cid, la, cl in zip(CELLS["cell_id"].to_numpy()[g], CELLS["lat"].to_numpy()[g], clim_m)]
    b1 = MODELS["B1_poisson"]["pred"].reshape(NCELL, NM)[g]
    country_onehot = {f"country_{ISO[c]}": (1.0 if c == a["country"] else 0.0) for c in COUNTRIES}
    sizes = {}
    for y in range(YEAR_MIN, YEAR_MAX + 1):
        mcols = (y - YEAR_MIN) * 12 + np.arange(12)
        X = np.stack([P[f].reshape(NCELL, NM)[g][:, mcols] for f in FEATURE_DYNAMIC], -1)      # cells × 12 × F
        unavailable = [int(k + 1) for k in range(12) if not np.isfinite(X[:, k, :]).all() or not np.isfinite(clim_m[:, MONTH_OF_M[mcols[k]] - 1]).all()]
        Xz = np.nan_to_num(X, nan=0.0)
        nzc, nzm = np.where((Xz != 0).any(-1))
        vals = np.round(Xz[nzc, nzm].astype(np.float64), 4)
        rows = np.column_stack([nzc, nzm + 1, vals])
        bsum = [None if (k + 1) in unavailable else round(float(np.nansum(b1[:, mcols[k]])), 4) for k in range(12)]
        doc = {"schema": "lumos-b1-features-1", "aoi_id": a["aoi_id"], "year": y, "model_id": "B1_poisson", "weights": "models/B1_poisson/weights.json",
               "feature_order": FEATURES_B1, "cells_columns": ["cell_id", "lat", "aqua_clim_by_month_1_12"], "cells": cells_tab,
               "rows_columns": ["cell_index", "month"] + FEATURE_DYNAMIC, "rows_implicit": "absent (cell, month) pairs have all dynamic features = 0",
               "derived": {"month_sin": "sin(2*pi*(month-1)/12)", "month_cos": "cos(2*pi*(month-1)/12)", "lat": "cells[cell_index][1]",
                           "aqua_clim": "cells[cell_index][2][month-1]", "aqua_count_raw": "= aqua_count", "country_onehot": country_onehot},
               "unavailable_months": unavailable, "check": {"b1_sum_by_month": bsum}}
        text = json.dumps(doc, separators=(",", ":"), allow_nan=False)
        text = text.replace('"rows_columns"', '"rows":' + json.dumps([[int(r[0]), int(r[1])] + [float(v) for v in r[2:]] for r in rows], separators=(",", ":")) + ',"rows_columns"', 1)
        mb = _json_size_mb(text); sizes[str(y)] = round(mb, 3)
        if mb > FEATURE_FILE_BUDGET_MB:
            FEATURE_EXPORT_LOG[a["aoi_id"]] = f"skipped: {y} would be {mb:.2f} MB > {FEATURE_FILE_BUDGET_MB} MB budget; app shows precomputed est only"
            shutil.rmtree(out_dir / "features" / a["aoi_id"], ignore_errors=True); log(FEATURE_EXPORT_LOG[a["aoi_id"]]); return
        p = out_dir / "features" / a["aoi_id"] / f"{y}.json"; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)
    FEATURE_EXPORT_LOG[a["aoi_id"]] = {"max_mb": max(sizes.values()), "years": len(sizes)}

RECENT_LOG = {}
def write_recent(out_dir):
    """Optional recent observed layer from A's Area-API NRT files: recent/<aoi>.json. Clearly separate: never used for training,
    baselines, anomalies, activity records or the harmonised estimate."""
    if NRT_DET is None or not len(NRT_DET):
        RECENT_LOG["status"] = "no NRT Area-API files in the bundle (FETCH_API_NRT off or no MAP_KEY)"; return
    for a in AOIS:
        d = NRT_DET[NRT_DET["country"] == a["country"]]
        covers = [v["cover"] for v in NRT_COVER.values() if v.get("country") == a["country"] and v.get("cover")]
        if a["geometry"] is not None and len(d):
            gg = a["geometry"]; shapely.prepare(gg); d = d[shapely.contains_xy(gg, d["lon"].to_numpy(), d["lat"].to_numpy())]
        days = sorted({(dt.date.fromisoformat(c0) + dt.timedelta(days=k)).isoformat() for c0, c1 in covers
                       for k in range((dt.date.fromisoformat(c1) - dt.date.fromisoformat(c0)).days + 1)}) or sorted(d["date"].unique().tolist())
        cnt = d.groupby(["date", "platform"]).size().to_dict()
        plats = sorted(d["platform"].unique().tolist()) or ["snpp"]
        series = [{"date": dd, "platform": PLATFORM_LABEL.get(p, p), "detections": int(cnt.get((dd, p), 0))} for dd in days for p in plats]
        jdump({"layer": "recent_observed_nrt", "aoi_id": a["aoi_id"], "not_used_for_training": True,
               "value_status": "demo" if SYNTHETIC else "observed_nrt",
               "note": "FIRMS Area-API near-real-time detections (all types reported by the API; `type` column absent). Shown as a separate "
                       "recent layer only — not harmonised, not part of the activity records or models." + (" SYNTHETIC FIXTURE." if SYNTHETIC else ""),
               "source_ids": sorted(d["source_id"].unique().tolist()), "covered_days": [days[0], days[-1]] if days else None, "daily": series},
              out_dir / "recent" / f"{a['aoi_id']}.json", indent=None)
    RECENT_LOG["status"] = f"recent/<aoi>.json written for {len(AOIS)} AOIs from {NRT_DET['source_id'].nunique()} NRT files"

def export_core(out):
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    jdump(scrub_sources(), out / "sources.json", indent=1)
    regions = []
    for a in AOIS:
        g = a["geometry"]
        if g is not None:
            gs = g.simplify(0.01 if a["kind"] == "admin1" else 0.02, preserve_topology=True)
            jdump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"aoi_id": a["aoi_id"], "name": a["name"]},
                                                               "geometry": mapping(gs)}]}, out / "geo" / f"{a['aoi_id']}.geojson")
            bbox = [round(v, 4) for v in g.bounds]
        else:
            c = CELLS[a["cellmask"]]; bbox = [float(c.lon.min()), float(c.lat.min()), float(c.lon.max()), float(c.lat.max())]
        has_obs = bool(np.nansum(SERIES[a["aoi_id"]]["viirs_model"][np.isin(YEAR_OF_M, TRAIN_YEARS)]) > 0)
        regions.append({"aoi_id": a["aoi_id"], "name": a["name"], "country": country_display(a["country"]), "kind": a["kind"],
                         "parent": next((x["aoi_id"] for x in AOIS if x["kind"] == "country" and x["country"] == a["country"]), None) if a["kind"] == "admin1" else None,
                         "display_kind": "Country" if a["kind"] == "country" else ADMIN1_DISPLAY_KIND.get(a["country"], "State"),
                         "bbox": bbox,
                         "geometry_path": f"geo/{a['aoi_id']}.geojson" if g is not None else None,
                         "supported_calibration": bool(RELEASE_STAGE == "validated_calibration" and has_obs),
                         "iso_3166_2": a.get("iso_3166_2"), "natural_earth_names": a.get("ne_names"), "note": a.get("note"),
                         "cells_exported": a["aoi_id"] not in CELLS_EXPORT_SKIP_AOIS, "features_exported": a["aoi_id"] in FEATURE_EXPORT_AOIS})
    jdump(regions, out / "regions.json", indent=1)
    # activity + validation (built-in validator + jsonschema; the schema covers exactly the contract §6 field list)
    jdump(ACTIVITY_SCHEMA, out / "activity.schema.json", indent=1)
    try:
        import jsonschema; _jsv = jsonschema.Draft202012Validator(ACTIVITY_SCHEMA)
    except Exception: _jsv = None
    n_rec, schema_errors = 0, []
    for a in AOIS:
        for y, recs in activity_records(a).items():
            for r in recs:
                e = tiny_validate(r, ACTIVITY_SCHEMA)
                if list(r.keys()) != CONTRACT_RECORD_FIELDS: e.append("key order/set differs from contract field list")
                if _jsv is not None: e += [f"jsonschema: {x.message}" for x in _jsv.iter_errors(r)]
                if e: schema_errors.append({"aoi": a["aoi_id"], "period": r["period_start_utc"], "errors": e[:5]})
                n_rec += 1
            jdump(recs, out / "activity" / a["aoi_id"] / f"{y}.json")
    log(f"activity records: {n_rec}; schema errors: {len(schema_errors)} (validator: tiny{' + jsonschema' if _jsv else ''}; contract field list)")
    if schema_errors: print(schema_errors[:3]); raise RuntimeError("activity records failed schema validation")
    for a in AOIS:
        if a["aoi_id"] not in CELLS_EXPORT_SKIP_AOIS: write_cells(a, out)
    for aid in FEATURE_EXPORT_AOIS:
        if aid in AOI_BY_ID: write_features(AOI_BY_ID[aid], out)
    write_recent(out)
    for mid in ["B0_identity", "B0_ratio", "B0_month_ratio", "B1_poisson"]:
        if MODELS.get(mid, {}).get("status") == "ok": jdump(MODELS[mid]["weights"], out / "models" / mid / "weights.json", indent=1)
    if MODELS.get("B2_xgb", {}).get("status") == "ok":
        try: (out / "models" / "B2_xgb").mkdir(parents=True, exist_ok=True); MODELS["B2_xgb"]["booster"].save_model(str(out / "models" / "B2_xgb" / "model.json"))
        except Exception as e: MODELS["B2_xgb"]["export_error"] = repr(e); log(f"xgb export failed: {e!r}")
    if MODELS.get("D1_mlp", {}).get("status") == "ok":
        try:
            MODELS["D1_mlp"]["onnx"] = export_onnx(MODELS["D1_mlp"]["torch_model"], PRE, out / "models" / "D1_mlp" / "model.onnx")
            MODELS["D1_mlp"]["onnx"]["path"] = "models/D1_mlp/model.onnx"
            log(f"ONNX parity: {MODELS['D1_mlp']['onnx'].get('parity')}")
        except Exception as e:
            MODELS["D1_mlp"]["onnx"] = {"error": repr(e)}; log(f"ONNX export failed: {e!r}")
    return n_rec

def export_finalize(out, phase):
    """(Re)write model cards, metrics.json, comparison.csv, figures, manifest, checksums; publish + zip. Called once before the
    research stages and again after them (so their metrics are appended without risking the app bundle)."""
    global METRICS, MANIFEST, FIGS, COMPARISON
    for mid in list(MODELS.keys()):
        jdump(model_card(mid), out / "models" / mid / "model_card.json", indent=1)
    METRICS = clean_json({
        "schema_version": "1.0", "snapshot_id": SNAPSHOT_ID, "synthetic": SYNTHETIC, "synthetic_flags": SYNTHETIC_FLAGS, "export_phase": phase,
        "selected_model_id": SELECTED, "release_stage": RELEASE_STAGE, "release_reason": RELEASE_REASON, "gate": GATE,
        "selection_record_sha256": SELECTION_RECORD["sha256"], "test_opened_utc": TEST_VAULT.opened_utc, "resumed_run": RESUMED,
        "models": {mid: {k: v for k, v in m.items() if k in ("status", "error", "val", "test", "interval", "info", "seed_runs", "onnx", "subset_only", "export_error")}
                   for mid, m in MODELS.items()},
        "multi_seed": {mid: {"val_mae_mean": float(np.mean([r["val"]["mae"] for r in MODELS[mid]["seed_runs"]])),
                             "val_mae_sd": float(np.std([r["val"]["mae"] for r in MODELS[mid]["seed_runs"]], ddof=1)) if len(MODELS[mid]["seed_runs"]) > 1 else None,
                             "val_dev_mean": float(np.mean([r["val"]["poisson_deviance"] for r in MODELS[mid]["seed_runs"]])),
                             "val_dev_sd": float(np.std([r["val"]["poisson_deviance"] for r in MODELS[mid]["seed_runs"]], ddof=1)) if len(MODELS[mid]["seed_runs"]) > 1 else None,
                             "seeds": [r["seed"] for r in MODELS[mid]["seed_runs"]]}
                       for mid in MODELS if MODELS[mid].get("seed_runs")},
        "qml_subset_comparison": QML, "qllm": QLLM, "backcast_summary": BACKCAST_SUMMARY, "split_manifest": SPLIT_MANIFEST,
        "checksum_report": CHECKSUM_REPORT, "panel_memory": PANEL_MEMORY, "timings_s": TIMINGS, "device": DEVICE, "quick_test": QUICK_TEST,
        "availability": {c: {p: {"partial_months": [f"{YEAR_OF_M[m]}-{MONTH_OF_M[m]:02d}" for m in np.where(STATUS[c][p] == ST_PARTIAL)[0]],
                                 "missing_months": int((STATUS[c][p] == ST_MISSING).sum()),
                                 "notes_sample": sorted({v for v in STATUS_NOTES[c][p].values() if "before the" not in v})[:12]}
                             for p in ["aqua", "terra", "snpp"]} for c in COUNTRIES},
        "cells_export": CELL_EXPORT_LOG, "features_export": FEATURE_EXPORT_LOG, "recent_layer": RECENT_LOG, "aoi_notes": AOI_NOTES,
        "notes": ["Q1/Q2 are evaluated on bounded subsets (matched-budget comparison) and are not selection candidates for the app estimate (v1.1).",
                  f"cells/<aoi>/<year>.json rows kept if aqua>0 or viirs>0 or est≥est_min (default {CELL_EST_MIN}; raised per AOI-year if > "
                  f"{CELL_FILE_BUDGET_MB} MB, see cells_export); cell grids skipped for {CELLS_EXPORT_SKIP_AOIS}; cell rows use complete months only.",
                  "static_source_detections_modis = Aqua MODIS type≠0 detections; static_source_detections_viirs = S-NPP VIIRS type≠0 detections (null before 2012 / when missing).",
                  "Partial months (S-NPP from 2012-01-20, Aqua from 2002-07-04, last month of a current-year file) are extract_status=partial: "
                  "observed counts shown but excluded from training, baselines and anomalies.",
                  "Anomaly flags: |z(log1p)|≥1 vs same calendar month in other years (2003+), retrospective."]})
    jdump(METRICS, out / "metrics.json", indent=1)
    COMPARISON = flat_metrics(); COMPARISON.to_csv(out / "comparison.csv", index=False)
    if (out / "figures").exists(): shutil.rmtree(out / "figures")
    FIGS = write_figures(out / "figures")
    for p in [out / "manifest.json", out / "checksums.sha256"]:
        if p.exists(): p.unlink()
    files = sorted(p for p in out.rglob("*") if p.is_file())
    file_hashes = {str(p.relative_to(out)).replace("\\", "/"): sha256_file(p) for p in files}
    MANIFEST = {"schema_version": "1.0", "snapshot_id": SNAPSHOT_ID, "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                "release_stage": RELEASE_STAGE, "selected_model_id": SELECTED, "aois": [a["aoi_id"] for a in AOIS],
                "years": list(range(YEAR_MIN, YEAR_MAX + 1)), "files": file_hashes, "synthetic": SYNTHETIC,
                "value_status_default": "demo" if SYNTHETIC else None, "release_reason": RELEASE_REASON, "export_phase": phase,
                "layers": {"activity": "harmonised monthly records", "cells": "cell grids (AOIs except " + ",".join(CELLS_EXPORT_SKIP_AOIS) + ")",
                           "features": f"B1 per-cell inputs for {FEATURE_EXPORT_AOIS}", "recent": "optional NRT recent observed layer (not training)"}}
    jdump(MANIFEST, out / "manifest.json", indent=1)
    with open(out / "checksums.sha256", "w") as f:
        for p in sorted(q for q in out.rglob("*") if q.is_file() and q.name != "checksums.sha256"):
            f.write(f"{sha256_file(p)}  {str(p.relative_to(out)).replace(os.sep, '/')}\n")
    tmp_final = WORK / "lumos_app_bundle.tmp"
    if tmp_final.exists(): shutil.rmtree(tmp_final)
    shutil.copytree(out, tmp_final)
    if APP_FINAL.exists(): shutil.rmtree(APP_FINAL)
    os.replace(tmp_final, APP_FINAL)
    tmpzip = WORK / "lumos_app_bundle.zip.tmp"
    with zipfile.ZipFile(tmpzip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(q for q in APP_FINAL.rglob("*") if q.is_file()):
            z.write(p, arcname="lumos_app_bundle/" + str(p.relative_to(APP_FINAL)).replace(os.sep, "/"))
    os.replace(tmpzip, APP_ZIP)
    log(f"app bundle [{phase}]: {APP_FINAL} ({len(files) + 2} files); zip {APP_ZIP} {APP_ZIP.stat().st_size / 1e6:.2f} MB")
    jdump(clean_json({"log": LOG, "timings": TIMINGS, "blocked_connections": BLOCKED_CONNECTIONS, "stages": STAGE_STATE}), RUN_DIR / "run_log.json", indent=1)
    shutil.copy(out / "metrics.json", RUN_DIR / "metrics.json")

QML = {"status": "not_run_yet", "note": "research stage runs after the app export"}
QLLM = {"status": "not_run_yet", "note": "research stage runs after the app export"}
for _mid in ["Q1_vqc", "Q2_qllm"]:
    MODELS.setdefault(_mid, {"status": "pending", "pred": None, "subset_only": True})
with Timer("export"):
    N_RECORDS = export_core(APP_STAGE)
    export_finalize(APP_STAGE, "core (before research stages Q1/Q2)")
    stage_save("export_core", [APP_STAGE / "manifest.json"], {"records": N_RECORDS})
stop_hook("export_core")

# %% [markdown]
# ## Phase 2 · Section 2.15 — Research: simulated quantum Q1
# **What this cell does:** If `RUN_QML` is on: draws a bounded training subset (4,000 rows, stratified by Aqua count > 0, with inverse-probability weights) and up to 20,000 validation rows, trains an 8-qubit, 3-layer variational circuit on a built-in torch state-vector simulator for 3 seeds, cross-checks it against PennyLane, and retrains every classical model on the identical subset for a fair comparison. This is research only, simulated on classical hardware; it never becomes the app's estimator.
#
# **Steps**
#
# - [ ] 2.15.1 Run the cell.
# - [ ] 2.15.2 Watch `Q1 seed s epoch e/80: val_dev=...` progress lines.
# - [ ] 2.15.3 Read one `Q1 seed s: epochs=... val(subset) MAE=... dev=...` line per seed.
# - [ ] 2.15.4 Read `Q1 PennyLane cross-check: {...}`.
#
# **Check before moving on**
#
# - [ ] Three Q1 seed lines.
# - [ ] The cross-check shows a tiny maximum difference (the fixture gave 5.4e-7), or says PennyLane was not available.
# - [ ] No `subset <model> failed` lines (or note which ones).
#
# **If it fails:** A Q1 failure is recorded and does not touch the app bundle written in 2.14. To skip it, set `RUN_QML = False` in 2.2 before a fresh Run All.
#
# **Time:** estimate: 5–20 min on the GPU (fixture, full mode on CPU including the subset models: 476 s)

# %%
# ===================== RESEARCH STAGE Q1: simulated variational quantum regressor (bounded subset; runs AFTER the app export) =====================
class StatevectorVQC(nn.Module):
    """Self-contained batched statevector simulator (qubit 0 = most significant bit, PennyLane convention).
    Circuit per layer l: [encoding RY(x_q) on all qubits if l==0 or reupload] → RY(θ_lq) RZ(φ_lq) on all qubits → entangler.
    Readout ⟨Z_q⟩ → linear head → softplus → Poisson rate."""
    def __init__(self, n_qubits, n_layers, encoding="angle", entangler="ring", init_rate=1.0, seed=0):
        super().__init__()
        g = torch.Generator().manual_seed(seed)
        self.n, self.L, self.encoding, self.entangler = n_qubits, n_layers, encoding, entangler
        self.theta = nn.Parameter(0.3 * torch.randn(n_layers, n_qubits, 2, generator=g))
        self.head = nn.Linear(n_qubits, 1)
        with torch.no_grad():
            self.head.weight.normal_(0, 0.1, generator=g)
            self.head.bias.fill_(math.log(math.expm1(max(init_rate, 1e-3))))
        dim = 2 ** n_qubits
        idx = torch.arange(dim)
        bits = torch.stack([(idx >> (n_qubits - 1 - q)) & 1 for q in range(n_qubits)], 1)
        self.register_buffer("zsign", (1 - 2 * bits).float())
        pairs = []
        if entangler == "ring": pairs = [(q, (q + 1) % n_qubits) for q in range(n_qubits)] if n_qubits > 2 else [(0, 1)]
        elif entangler == "linear": pairs = [(q, q + 1) for q in range(n_qubits - 1)]
        self.pairs = pairs
        perms = []
        for c, t in pairs:
            cb = (idx >> (n_qubits - 1 - c)) & 1
            perms.append(torch.where(cb == 1, idx ^ (1 << (n_qubits - 1 - t)), idx))
        self.register_buffer("perms", torch.stack(perms) if perms else torch.zeros(0, dim, dtype=torch.long))

    def _apply_1q(self, state, q, U):
        B = state.shape[0]
        s = state.reshape(B, 2 ** q, 2, 2 ** (self.n - q - 1))
        s = torch.einsum("bij,bajc->baic", U, s) if U.dim() == 3 else torch.einsum("ij,bajc->baic", U, s)
        return s.reshape(B, -1)

    @staticmethod
    def _ry(a):
        c, s = torch.cos(a / 2), torch.sin(a / 2)
        U = torch.stack([torch.stack([c, -s], -1), torch.stack([s, c], -1)], -2)
        return U.to(torch.complex64)

    @staticmethod
    def _rz(a):
        e = torch.exp(-0.5j * a.to(torch.complex64)); z = torch.zeros_like(e)
        return torch.stack([torch.stack([e, z], -1), torch.stack([z, torch.conj(e)], -1)], -2)

    def expvals(self, x):
        B = x.shape[0]
        state = torch.zeros(B, 2 ** self.n, dtype=torch.complex64, device=x.device); state[:, 0] = 1
        for l in range(self.L):
            if l == 0 or self.encoding == "angle+reupload":
                for q in range(self.n): state = self._apply_1q(state, q, self._ry(x[:, q]))
            for q in range(self.n):
                state = self._apply_1q(state, q, self._ry(self.theta[l, q, 0]))
                state = self._apply_1q(state, q, self._rz(self.theta[l, q, 1]))
            for k in range(len(self.pairs)): state = state[:, self.perms[k]]
        probs = state.real ** 2 + state.imag ** 2
        return probs @ self.zsign

    def forward(self, x):
        return nn.functional.softplus(self.head(self.expvals(x)).squeeze(-1)) + 1e-6

def pennylane_crosscheck(model, x_angles, n_samples=4):
    """Optional: compare simulator ⟨Z⟩ with PennyLane on a few samples (lightning.gpu → lightning.qubit → default.qubit)."""
    try:
        import pennylane as qml
    except Exception as e:
        return {"status": "skipped", "reason": f"pennylane not importable: {e!r}"}
    dev, used = None, None
    for name in (["lightning.gpu"] if DEVICE == "cuda" else []) + ["lightning.qubit", "default.qubit"]:
        try: dev = qml.device(name, wires=model.n); used = name; break
        except Exception: continue
    if dev is None: return {"status": "skipped", "reason": "no pennylane device"}
    th = model.theta.detach().cpu().numpy().astype(np.float64)
    @qml.qnode(dev)
    def circ(x):
        for l in range(model.L):
            if l == 0 or model.encoding == "angle+reupload":
                for q in range(model.n): qml.RY(x[q], wires=q)
            for q in range(model.n):
                qml.RY(th[l, q, 0], wires=q); qml.RZ(th[l, q, 1], wires=q)
            for c, t in model.pairs: qml.CNOT(wires=[c, t])
        return [qml.expval(qml.PauliZ(q)) for q in range(model.n)]
    xs = x_angles[:n_samples]
    ref = np.array([np.array(circ(xs[i].astype(np.float64)), dtype=np.float64) for i in range(len(xs))])
    with torch.no_grad(): ours = model.expvals(torch.tensor(xs, device=next(model.parameters()).device)).cpu().numpy()
    diff = float(np.abs(ref - ours).max())
    return {"status": "ok", "device": used, "n_samples": int(len(xs)), "max_abs_diff_expZ": diff, "passed": diff < 1e-4}

class AngleEncoder:
    """Train-fitted PCA on standardised features → n components → standardise → angle = 2·arctan(z) ∈ (−π, π)."""
    def __init__(self, n): self.n = n
    def fit(self, Z, w=None):
        k = min(self.n, Z.shape[1]); self.pca = PCA(n_components=k, random_state=0).fit(Z)
        C = self.pca.transform(Z); self.mu = C.mean(0); sd = C.std(0); self.sd = np.where(sd > 1e-9, sd, 1.0); return self
    def transform(self, Z):
        C = (self.pca.transform(Z) - self.mu) / self.sd
        if C.shape[1] < self.n: C = np.concatenate([C, np.zeros((len(C), self.n - C.shape[1]))], 1)
        return (2 * np.arctan(C)).astype(np.float32)

def train_vqc(Atr, ytr, wtr, Ava, yva, cfg, seed, epochs, patience=QML_PATIENCE, bs=256, label="Q1", deadline=None):
    torch.manual_seed(seed)
    dev = TORCH_DEVICE
    mu = float(np.average(ytr, weights=wtr))
    model = StatevectorVQC(cfg["n_qubits"], cfg["layers"], cfg["encoding"], cfg["entangler"], init_rate=mu, seed=seed).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=cfg["lr"])
    At, yt, wt = (torch.tensor(a, device=dev) for a in (Atr, ytr.astype(np.float32), wtr.astype(np.float32)))
    Av = torch.tensor(Ava, device=dev)
    best, best_state, bad, hist = float("inf"), None, 0, []
    for ep in range(epochs):
        model.train(); perm = torch.randperm(len(yt), device=dev)
        for s in range(0, len(yt), bs):
            b = perm[s:s + bs]; rate = model(At[b])
            loss = ((rate - yt[b] * torch.log(rate)) * wt[b]).sum() / wt[b].sum()
            opt.zero_grad(set_to_none=True); loss.backward(); opt.step()
        model.eval()
        with torch.no_grad(): pv = torch.cat([model(Av[s:s + 8192]) for s in range(0, len(Av), 8192)]).cpu().numpy()
        dv = point_metrics(yva, pv)["poisson_deviance"]; hist.append({"epoch": ep, "val_deviance": dv})
        if (ep + 1) % LOG_EVERY_EPOCHS == 0 or ep == 0: log(f"{label} seed {seed} epoch {ep + 1}/{epochs}: val_dev={dv:.4f}")
        if dv < best - 1e-7: best, bad = dv, 0; best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= patience: break
        if deadline is not None and time.time() > deadline:
            log(f"{label}: time budget reached after epoch {ep + 1}; keeping best epoch"); break
    model.load_state_dict(best_state); model.eval()
    return model, hist, best

def vqc_predict(model, A):
    with torch.no_grad():
        At = torch.tensor(A, device=TORCH_DEVICE)
        return torch.cat([model(At[s:s + 8192]) for s in range(0, len(At), 8192)]).cpu().numpy().astype(np.float32)

QML = {"status": "not_run"}
if RUN_QML:
    with Timer("Q1_vqc_and_subset_classical"):
        try:
            rng = np.random.default_rng(12345)
            # bounded, stratified (by the FEATURE aqua_count>0, never by the target) training subset with inverse-probability weights
            act = P["aqua_count"][tr] > 0
            n_act = min(int(act.sum()), QML_MAX_TRAIN // 2); n_in = min(int((~act).sum()), QML_MAX_TRAIN - n_act)
            s_act = rng.choice(tr[act], n_act, replace=False) if n_act else np.array([], int)
            s_in = rng.choice(tr[~act], n_in, replace=False) if n_in else np.array([], int)
            SUB_TR = np.concatenate([s_act, s_in])
            W_SUB = np.concatenate([np.full(n_act, act.sum() / max(n_act, 1)), np.full(n_in, (~act).sum() / max(n_in, 1))])
            W_SUB = (W_SUB / W_SUB.mean()).astype(np.float64)
            SUB_VA = va if len(va) <= QML_MAX_EVAL else np.sort(rng.choice(va, QML_MAX_EVAL, replace=False))
            sub_pre = Preproc(FEATURES).fit(Xmat(SUB_TR))
            Ztr_s, Zva_s = sub_pre.transform(Xmat(SUB_TR)), sub_pre.transform(Xmat(SUB_VA))
            ytr_s, yva_s = P["viirs_snpp_count"][SUB_TR].astype(np.float64), P["viirs_snpp_count"][SUB_VA]
            enc = AngleEncoder(QML_QUBITS).fit(Ztr_s)
            Atr, Ava = enc.transform(Ztr_s), enc.transform(Zva_s)
            base_cfg = {"n_qubits": QML_QUBITS, "layers": QML_LAYERS, "encoding": "angle+reupload", "entangler": "ring", "lr": 0.03}
            q_runs = []
            for s_ in SEEDS:
                t0 = time.time()
                m_, hist, bdev = train_vqc(Atr, ytr_s, W_SUB, Ava, yva_s, base_cfg, s_, QML_EPOCHS)
                pv = vqc_predict(m_, Ava)
                q_runs.append({"seed": s_, "epochs": len(hist), "val": point_metrics(yva_s, pv), "history": hist,
                               "seconds": round(time.time() - t0, 1), "model": m_})
                log(f"Q1 seed {s_}: epochs={len(hist)} val(subset) MAE={q_runs[-1]['val']['mae']:.4f} dev={bdev:.4f}")
            qbest = min(q_runs, key=lambda d: d["val"]["poisson_deviance"])
            xcheck = pennylane_crosscheck(qbest["model"], Ava)
            log(f"Q1 PennyLane cross-check: {xcheck}")
            # classical models re-trained on the IDENTICAL bounded subset (same rows, same weights)
            SUBSET_MODELS = {}
            def sub_try(mid, fn):
                try: SUBSET_MODELS[mid] = {"status": "ok", "predict": fn()}
                except Exception as e: SUBSET_MODELS[mid] = {"status": "failed", "error": repr(e)}; log(f"subset {mid} failed: {e!r}")
            def _b0r():
                r = float(np.sum(W_SUB * ytr_s) / max(np.sum(W_SUB * P["aqua_count"][SUB_TR]), 1e-9))
                return lambda idx: (r * P["aqua_count"][idx]).astype(np.float32)
            sub_try("B0_identity@subset", lambda: (lambda idx: P["aqua_count"][idx].astype(np.float32)))
            sub_try("B0_ratio@subset", _b0r)
            def _b1s():
                m = PoissonRegressor(alpha=B1_ALPHA, max_iter=1000).fit(Ztr_s, ytr_s, sample_weight=W_SUB)
                return lambda idx: m.predict(sub_pre.transform(Xmat(idx))).astype(np.float32)
            sub_try("B1_poisson@subset", _b1s)
            if RUN_XGB and "xgb" in dir():
                def _b2s():
                    b = fit_xgb(None, None, 0, weights=W_SUB, Xtr=Xmat(SUB_TR), ytr=ytr_s, Xva=Xmat(SUB_VA), yva=yva_s,
                                rounds=min(XGB_ROUNDS, 1000), early=min(XGB_EARLY, 50))
                    return lambda idx: b.predict(xgb.DMatrix(Xmat(idx)), iteration_range=(0, b.best_iteration + 1)).astype(np.float32)
                sub_try("B2_xgb@subset", _b2s)
            if RUN_DL:
                def _d1s():
                    m, _ = train_mlp(Ztr_s, ytr_s.astype(np.float32), Zva_s, yva_s, 0, wtr=W_SUB, hidden=(64, 64),
                                     epochs=max(DL_EPOCHS * 5, 10), patience=max(DL_PATIENCE * 2, 3), bs=256)
                    return mlp_predict_fn(m, sub_pre)
                sub_try("D1_mlp@subset", _d1s)
            def q1_predict_idx(idx, model=qbest["model"]):
                return vqc_predict(model, enc.transform(sub_pre.transform(Xmat(idx))))
            SUBSET_MODELS["Q1_vqc"] = {"status": "ok", "predict": q1_predict_idx}
            QML = {"status": "ok", "config": base_cfg, "selected_seed": qbest["seed"], "n_train_subset": int(len(SUB_TR)),
                   "n_val_eval": int(len(SUB_VA)), "subset_rule": "stratified by aqua_count>0 (feature), inverse-probability weights",
                   "simulator": "built-in torch statevector (complex64)", "device": DEVICE, "pennylane_crosscheck": xcheck,
                   "pca_explained_variance": [float(v) for v in enc.pca.explained_variance_ratio_],
                   "seed_runs": [{k: v for k, v in d.items() if k != "model"} for d in q_runs]}
            QML["val_subset"] = {mid: (point_metrics(yva_s, d["predict"](SUB_VA)) if d["status"] == "ok" else {"status": d["status"], "error": d.get("error")})
                                 for mid, d in SUBSET_MODELS.items()}
            for mid in ["B0_identity", "B0_month_ratio", "B1_poisson", "B2_xgb", "D1_mlp"]:
                if MODELS.get(mid, {}).get("status") == "ok":
                    QML["val_subset"][f"{mid}@full_data"] = point_metrics(yva_s, MODELS[mid]["pred"][SUB_VA])
            MODELS["Q1_vqc"] = {"status": "ok", "pred": None, "subset_only": True,
                                "info": {k: QML[k] for k in ["config", "selected_seed", "n_train_subset", "n_val_eval", "simulator", "pennylane_crosscheck"]},
                                "seed_runs": QML["seed_runs"]}
        except Exception as e:
            register_failure("Q1_vqc", e); QML = {"status": "failed", "error": repr(e)}
else:
    register_failure("Q1_vqc", "RUN_QML=False", kind="skipped")

stage_save("Q1_vqc", [], {"status": QML.get("status")})
stop_hook("Q1_vqc")

# %% [markdown]
# ## Phase 2 · Section 2.16 — Research: QLLM Q2
# **What this cell does:** If `RUN_QLLM` is on and Q1 succeeded: looks for a local instruct LLM under `/kaggle/input` (prefers Qwen, then Gemma, within the size cap). Without one, Q2 is honestly marked skipped. With one, it runs an equal-budget search over Q1 circuit designs, alternating random proposals and LLM proposals trial by trial (12 trials each, 30 epochs per trial, capped by `QLLM_MAX_MINUTES`). The LLM sees only the search space and its own validation history; an unparseable or duplicate reply falls back to a random proposal and is logged.
#
# **Steps**
#
# - [ ] 2.16.1 Run the cell.
# - [ ] 2.16.2 Read `Q2 LLM search: {...}` (size cap, free RAM and VRAM, any model that was too large).
# - [ ] 2.16.3 With a model attached, watch `Q2[random] trial t: ... → val dev ...` and `Q2[llm] trial t: ...` lines.
# - [ ] 2.16.4 Read the closing line `Q2 status: ...`.
#
# **Check before moving on**
#
# - [ ] With a model attached: `Q2 status: ok`.
# - [ ] Without a model: `Q2 status: skipped skipped: no local LLM within the size cap ...`. That is the expected, honest result.
# - [ ] `too_large` in the search report is empty.
#
# **If it fails:** A model listed under `too_large` must be swapped for a smaller one (a 7B model in bf16 is about 15 GB). `transformers not importable` or any crash marks Q2 failed; the app bundle is unaffected. To skip it, set `RUN_QLLM = False` in 2.2 before a fresh Run All.
#
# **Time:** estimate: under 1 min when skipped; 20–90 min with a model, capped by QLLM_MAX_MINUTES (90)

# %%
# ===================== RESEARCH STAGE Q2 QLLM: LLM-assisted search over Q1 architectures vs random search =====================
QSPACE = {"n_qubits": {"type": "int", "min": 4, "max": 10}, "layers": {"type": "int", "min": 1, "max": 6},
          "encoding": {"type": "choice", "values": ["angle", "angle+reupload"]},
          "entangler": {"type": "choice", "values": ["ring", "linear", "none"]},
          "lr": {"type": "float_log", "min": 1e-3, "max": 1e-1}}

def clamp_config(c):
    """Coerce any dict into a valid point of QSPACE (invalid/missing fields → safe defaults)."""
    out = {}
    def num(v, d):
        try: return float(v)
        except Exception: return d
    out["n_qubits"] = int(min(max(round(num(c.get("n_qubits"), 6)), 4), 10))
    out["layers"] = int(min(max(round(num(c.get("layers"), 2)), 1), 6))
    e = str(c.get("encoding", "angle")).strip().lower().replace(" ", "")
    out["encoding"] = e if e in QSPACE["encoding"]["values"] else ("angle+reupload" if "reup" in e else "angle")
    en = str(c.get("entangler", "ring")).strip().lower()
    out["entangler"] = en if en in QSPACE["entangler"]["values"] else "ring"
    lr = num(c.get("lr"), 0.02)
    out["lr"] = float(min(max(lr if math.isfinite(lr) and lr > 0 else 0.02, 1e-3), 1e-1))
    return out

def parse_llm_json(text):
    """Extract the first JSON object from an LLM reply (handles <think> blocks and ``` fences). Returns dict or None."""
    if not text: return None
    t = re.sub(r"<think>.*?</think>", "", str(text), flags=re.S)
    t = re.sub(r"```(?:json)?", "", t)
    for m in re.finditer(r"\{[^{}]*\}", t, flags=re.S):
        frag = m.group(0)
        for cand in (frag, frag.replace("'", '"')):
            try:
                d = json.loads(cand)
                if isinstance(d, dict): return d
            except Exception: continue
    return None

def random_config(rng):
    return clamp_config({"n_qubits": int(rng.integers(4, 11)), "layers": int(rng.integers(1, 7)),
                         "encoding": str(rng.choice(QSPACE["encoding"]["values"])), "entangler": str(rng.choice(QSPACE["entangler"]["values"])),
                         "lr": float(10 ** rng.uniform(-3, -1))})

def build_llm_prompt(history):
    return ("You are tuning a simulated variational quantum circuit regressor. Choose the NEXT configuration to try.\n"
            "Search space (JSON): " + json.dumps(QSPACE) + "\n"
            "Validation history (lower val_poisson_deviance is better): " + json.dumps(history) + "\n"
            "Reply with exactly one JSON object with keys n_qubits, layers, encoding, entangler, lr and nothing else.")

def _weights_size(d):
    return sum(f.stat().st_size for f in list(d.glob("*.safetensors")) + list(d.glob("*.bin")))

def llm_size_cap():
    """Weights cap = min(30 GB, 0.5 × free RAM) (and ≤ 0.85 × free VRAM when loading to GPU) — watchdog #4."""
    cap = min(LLM_MAX_BYTES_CAP, 0.5 * free_ram_gb() * 1e9 if math.isfinite(free_ram_gb()) else LLM_MAX_BYTES_CAP)
    vram = None
    if DEVICE == "cuda":
        try: vram = torch.cuda.mem_get_info()[0]; cap = min(cap, 0.85 * vram)
        except Exception: pass
    return cap, vram

def find_local_llm(root=INPUT_ROOT):
    """Depth-limited search (≤ INPUT_WALK_MAX_DEPTH) of /kaggle/input for a causal LM dir (config.json + tokenizer + weights) within the
    size cap; prefer Qwen / Gemma instruct. Returns (dir or None, report)."""
    cap, vram = llm_size_cap()
    report = {"size_cap_gb": round(cap / 1e9, 2), "free_ram_gb": round(free_ram_gb(), 1), "free_vram_gb": None if vram is None else round(vram / 1e9, 1),
              "too_large": []}
    cands = []
    for cfgp in walk_limited(root, lambda d, fs: [d / "config.json"] if "config.json" in fs else [], max_depth=INPUT_WALK_MAX_DEPTH, stop_after=200):
        d = cfgp.parent
        try: cfg = json.load(open(cfgp))
        except Exception: continue
        arch = " ".join(cfg.get("architectures", []) or [])
        mt = str(cfg.get("model_type", "")).lower()
        if "CausalLM" not in arch and mt not in ("qwen2", "qwen3", "gemma", "gemma2", "gemma3", "gemma3_text", "llama", "mistral", "phi3"): continue
        if not (list(d.glob("tokenizer.json")) or list(d.glob("tokenizer.model")) or list(d.glob("tokenizer_config.json"))): continue
        size = _weights_size(d)
        if size == 0: continue
        if size > cap: report["too_large"].append({"dir": str(d), "gb": round(size / 1e9, 1)}); continue
        p = str(d).lower()
        score = (3 if "qwen" in p or "qwen" in mt else 2 if "gemma" in p or "gemma" in mt else 1) + \
                (2 if any(t in p for t in ["instruct", "-it", "_it", "chat"]) else 0)
        cands.append((score, -size, str(d)))
    cands.sort(reverse=True)
    return (cands[0][2] if cands else None), report

def make_llm_generate(model_dir):
    from transformers import AutoTokenizer, AutoModelForCausalLM
    tok = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    dtype = torch.bfloat16 if DEVICE == "cuda" else torch.float32
    kw = {"local_files_only": True, "torch_dtype": dtype, "low_cpu_mem_usage": True}
    if DEVICE == "cuda":
        try:
            import accelerate  # noqa: F401  (device_map needs accelerate)
            lm = AutoModelForCausalLM.from_pretrained(model_dir, device_map="cuda", **kw).eval()   # weights stream straight to the GPU
        except ImportError:
            lm = AutoModelForCausalLM.from_pretrained(model_dir, **kw).to(TORCH_DEVICE).eval()
    else:
        lm = AutoModelForCausalLM.from_pretrained(model_dir, **kw).eval()
    dev = next(lm.parameters()).device
    def gen(prompt):
        msgs = [{"role": "user", "content": prompt}]
        try:
            try: text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
            except TypeError: text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        except Exception: text = prompt
        ids = tok(text, return_tensors="pt").to(dev)
        with torch.no_grad():
            out = lm.generate(**ids, max_new_tokens=160, do_sample=True, temperature=0.7, top_p=0.9, pad_token_id=tok.eos_token_id)
        return tok.decode(out[0, ids["input_ids"].shape[1]:], skip_special_tokens=True)
    return gen

def stub_llm_generate(prompt):
    """TEST ONLY (LUMOS_QLLM_STUB=1): deterministic rule 'perturb the best config so far'. Never reported as an LLM result."""
    hist = json.loads(prompt.split("Validation history (lower val_poisson_deviance is better): ")[1].split("\n")[0])
    if not hist: return 'Sure! {"n_qubits": 6, "layers": 2, "encoding": "angle+reupload", "entangler": "ring", "lr": 0.03}'
    b = min(hist, key=lambda h: h["val_poisson_deviance"])["config"]
    return "```json\n" + json.dumps({**b, "layers": b["layers"] + 1, "lr": b["lr"] * 1.5}) + "\n```"

def run_search_pair(proposers, n_trials, epochs, budget_s):
    """Interleave the arms trial by trial (random, llm, random, llm, …) so a QLLM_MAX_MINUTES cut truncates BOTH arms equally."""
    hists = {k: [] for k in proposers}; models = {k: [] for k in proposers}
    t_start = time.time(); truncated = False
    for t in range(n_trials):
        if time.time() - t_start > budget_s:
            truncated = True; log(f"Q2: QLLM_MAX_MINUTES={QLLM_MAX_MINUTES} reached after {t} trials per arm; both arms truncated equally"); break
        for label, propose in proposers.items():
            cfg, meta = propose(hists[label])
            nq = cfg["n_qubits"]
            e_ = AngleEncoder(nq).fit(Ztr_s)
            a_tr, a_va = e_.transform(Ztr_s), e_.transform(Zva_s)
            t0 = time.time()
            m_, h_, bdev = train_vqc(a_tr, ytr_s, W_SUB, a_va, yva_s, cfg, 0, epochs, label=f"Q2[{label}] trial {t}")
            rec = {"trial": t, "config": cfg, "val_poisson_deviance": float(bdev), "seconds": round(time.time() - t0, 1)} | meta
            hists[label].append(rec); models[label].append((m_, e_)); log(f"Q2[{label}] trial {t}: {cfg} → val dev {bdev:.4f}")
    n = min(len(h) for h in hists.values())          # equal trial budget
    return {k: v[:n] for k, v in hists.items()}, {k: v[:n] for k, v in models.items()}, truncated

QLLM = {"status": "not_run"}
# self-test of the parse/clamp logic on canned replies (pure functions; no model involved)
_selftest = [parse_llm_json('<think>hmm</think>```json\n{"n_qubits": 12, "layers": 0, "encoding": "ANGLE", "entangler": "full", "lr": 5}\n```'),
             parse_llm_json("no json here"), parse_llm_json("{'n_qubits': 7, 'layers': 3}")]
assert _selftest[1] is None and clamp_config(_selftest[0]) == {"n_qubits": 10, "layers": 1, "encoding": "angle", "entangler": "ring", "lr": 0.1}
assert clamp_config(_selftest[2])["n_qubits"] == 7
if RUN_QLLM and QML.get("status") == "ok":
    with Timer("Q2_qllm"):
        try:
            llm_dir, LLM_SEARCH = (None, {"stub": True}) if LUMOS_QLLM_STUB else find_local_llm()
            log(f"Q2 LLM search: {LLM_SEARCH}")
            if llm_dir is None and not LUMOS_QLLM_STUB:
                QLLM = {"status": "skipped", "reason": "skipped: no local LLM within the size cap under " + str(INPUT_ROOT), "llm_search": LLM_SEARCH}
                register_failure("Q2_qllm", QLLM["reason"], kind="skipped")
            else:
                if LUMOS_QLLM_STUB: gen, llm_name = stub_llm_generate, "TEST_STUB (not an LLM)"
                else:
                    try: gen, llm_name = make_llm_generate(llm_dir), llm_dir
                    except ImportError as e: raise RuntimeError(f"transformers not importable: {e!r}")
                rng_r = np.random.default_rng(777); rng_f = np.random.default_rng(778)
                def prop_random(h): return random_config(rng_r), {"proposer": "random"}
                def prop_llm(h):
                    visible = [{"config": x["config"], "val_poisson_deviance": round(x["val_poisson_deviance"], 5)} for x in h]
                    reply = gen(build_llm_prompt(visible)); d = parse_llm_json(reply)
                    if d is None: return random_config(rng_f), {"proposer": "fallback_random_unparseable", "llm_reply": reply[:300]}
                    c = clamp_config(d)
                    if any(c == x["config"] for x in h): return random_config(rng_f), {"proposer": "fallback_random_duplicate", "llm_reply": reply[:300]}
                    return c, {"proposer": "llm", "llm_reply": reply[:300]}
                _h, _m, _trunc = run_search_pair({"random": prop_random, "llm": prop_llm}, QLLM_TRIALS, QLLM_EPOCHS, QLLM_MAX_MINUTES * 60)
                h_rand, h_llm, m_rand, m_llm = _h["random"], _h["llm"], _m["random"], _m["llm"]
                if not h_rand: raise RuntimeError("QLLM_MAX_MINUTES too small: no trial completed")
                best_so_far = lambda h: list(np.minimum.accumulate([x["val_poisson_deviance"] for x in h]))
                QLLM = {"status": "test_stub" if LUMOS_QLLM_STUB else "ok", "llm": llm_name, "trials_each": QLLM_TRIALS, "epochs_per_trial": QLLM_EPOCHS,
                        "search_space": QSPACE, "random": h_rand, "llm_guided": h_llm,
                        "best_so_far": {"random": best_so_far(h_rand), "llm_guided": best_so_far(h_llm)},
                        "best": {"random": min(h_rand, key=lambda x: x["val_poisson_deviance"]), "llm_guided": min(h_llm, key=lambda x: x["val_poisson_deviance"])},
                        "n_llm_parsed": int(sum(x["proposer"] == "llm" for x in h_llm)),
                        "information_policy": "LLM prompt contains only the search space and its own (config, validation deviance) history",
                        "budget_minutes": QLLM_MAX_MINUTES, "truncated_by_budget": _trunc, "trials_completed_each": len(h_rand),
                        "llm_search": LLM_SEARCH}
                ib_r = int(np.argmin([x["val_poisson_deviance"] for x in h_rand])); ib_l = int(np.argmin([x["val_poisson_deviance"] for x in h_llm]))
                QLLM_BEST_MODELS = {"random": m_rand[ib_r], "llm_guided": m_llm[ib_l]}
                MODELS["Q2_qllm"] = {"status": QLLM["status"], "pred": None, "subset_only": True,
                                     "info": {k: QLLM[k] for k in ["llm", "trials_each", "best", "n_llm_parsed"]}}
        except Exception as e:
            register_failure("Q2_qllm", e); QLLM = {"status": "failed", "error": repr(e)}
elif RUN_QLLM:
    QLLM = {"status": "skipped", "reason": "Q1 did not run successfully"}; register_failure("Q2_qllm", QLLM["reason"], kind="skipped")
else:
    QLLM = {"status": "skipped", "reason": "RUN_QLLM=False"}; register_failure("Q2_qllm", "RUN_QLLM=False", kind="skipped")
log(f"Q2 status: {QLLM.get('status')} {QLLM.get('reason', '')}")

stage_save("Q2_qllm", [], {"status": QLLM.get("status")})

# %% [markdown]
# ## Phase 2 · Section 2.17 — Research results and bundle refresh
# **What this cell does:** Scores Q1, the subset-trained classical models, the full-data models and the best Q2 designs on a bounded subset (up to 20,000 rows) of the test rows already opened in 2.12, then rewrites the app bundle's metrics, model cards, manifest, checksums and zip, and marks the run complete.
#
# **Steps**
#
# - [ ] 2.17.1 Run the cell.
# - [ ] 2.17.2 Read `app bundle [final (research stages appended)]: ... zip ... MB`.
#
# **Check before moving on**
#
# - [ ] That line appears and the zip size is close to the one from 2.14.
# - [ ] `runs/<ts>/stages.json` now has `"complete": true`.
#
# **If it fails:** `research test-subset evaluation failed (app bundle unaffected)` is not fatal: the core bundle from 2.14 stands, refreshed without research test numbers.
#
# **Time:** estimate: under 3 min

# %%
# ===================== RESEARCH RESULTS ON TEST (bounded subset) + REFRESH THE APP BUNDLE'S METRICS =====================
# The test split was opened once (above, after the frozen selection); Q1/Q2 are research comparisons on a bounded subset of those
# same test rows and are never selection candidates (v1.1).
with Timer("research_test_subset"):
    try:
        if QML.get("status") == "ok":
            rng_t = np.random.default_rng(54321)
            SUB_TE = te if len(te) <= QML_MAX_EVAL else np.sort(rng_t.choice(te, QML_MAX_EVAL, replace=False))
            yte_s = P["viirs_snpp_count"][SUB_TE]
            QML["n_test_eval"] = int(len(SUB_TE))
            QML["test_subset"] = {mid: (point_metrics(yte_s, d["predict"](SUB_TE)) if d["status"] == "ok" else {"status": d["status"]})
                                  for mid, d in SUBSET_MODELS.items()}
            for mid in FULL_MODELS:
                QML["test_subset"][f"{mid}@full_data"] = point_metrics(yte_s, MODELS[mid]["pred"][SUB_TE])
            MODELS["Q1_vqc"]["val"] = {"cell_month_subset": QML["val_subset"]["Q1_vqc"]}
            MODELS["Q1_vqc"]["test"] = {"cell_month_subset": QML["test_subset"]["Q1_vqc"]}
            if QLLM.get("status") in ("ok", "test_stub"):
                QLLM["test_subset_best"] = {}
                for k, (m_, e_) in QLLM_BEST_MODELS.items():
                    QLLM["test_subset_best"][k] = point_metrics(yte_s, vqc_predict(m_, e_.transform(sub_pre.transform(Xmat(SUB_TE)))))
    except Exception as e:
        log(f"research test-subset evaluation failed (app bundle unaffected): {e!r}")
with Timer("export_refresh"):
    export_finalize(APP_STAGE, "final (research stages appended)")
STAGE_STATE["complete"] = True
stage_save("final", [APP_STAGE / "manifest.json"], {"selected": SELECTED})

# %% [markdown]
# ## Phase 2 · Section 2.18 — Final summary and download
# **What this cell does:** Prints one row per model (status, scope, validation and test MAE, deviance, interval coverage), the matched-budget subset comparison, the selected model with the release stage and reason, the Q2 status, the run folder and bundle paths, the device and the number of blocked network attempts, then shows the figures. On synthetic data it prints a clear HONEST NOTE banner.
#
# **Steps**
#
# - [ ] 2.18.1 Run the cell and read the summary table.
# - [ ] 2.18.2 Read `Selected model (validation only): ... | release stage: ...`.
# - [ ] 2.18.3 Read `Device: cuda ... blocked network attempts: 0`.
# - [ ] 2.18.4 Look at the figures below (time series for BGD, AUS-NSW and USA-CA, plus AUS and USA, model comparison, test scatter, QML subset comparison).
# - [ ] 2.18.5 Download `/kaggle/working/lumos_app_bundle.zip`: right-hand **Output** panel (or the committed version's **Output** tab) → `lumos_app_bundle.zip` → **Download**. Files in an interactive session disappear when it stops, so download now or commit with **Save Version → Save & Run All**.
#
# **Check before moving on**
#
# - [ ] `blocked network attempts: 0`.
# - [ ] `Device: cuda`.
# - [ ] No HONEST NOTE banner on real data (the banner means the synthetic fixture was used).
# - [ ] `lumos_app_bundle.zip` is saved on your computer.
#
# **If it fails:** If the figures do not show, open them in the bundle's `figures/` folder. If the download stalls, download the `lumos_app_bundle/` folder from the Output panel instead.
#
# **Time:** estimate: under 1 min, plus download time

# %%
# ===================== FINAL SUMMARY =====================
def fmt(v, nd=3): return "—" if v is None else f"{v:.{nd}f}"
rows = []
for mid in MODELS:
    m = MODELS[mid]
    if mid == "Q2_qllm":
        b = (QLLM.get("best") or {}).get("llm_guided") or {}; tb = (QLLM.get("test_subset_best") or {}).get("llm_guided") or {}
        rows.append({"model": mid, "status": m["status"], "scope": "bounded subset (search)", "val_cell_MAE": "—", "val_AOI_MAE": "—",
                     "test_cell_MAE": fmt(tb.get("mae")), "test_AOI_MAE": "—", "test_dev": fmt(tb.get("poisson_deviance")), "test_cov80": "—"})
    elif m.get("subset_only") or mid == "Q1_vqc":
        vsub = (QML.get("val_subset") or {}).get(mid) or {}; tsub = (QML.get("test_subset") or {}).get(mid) or {}
        rows.append({"model": mid, "status": m["status"], "scope": "bounded subset", "val_cell_MAE": fmt(vsub.get("mae")), "val_AOI_MAE": "—",
                     "test_cell_MAE": fmt(tsub.get("mae")), "test_AOI_MAE": "—", "test_dev": fmt(tsub.get("poisson_deviance")), "test_cov80": "—"})
    else:
        rows.append({"model": mid, "status": m["status"], "scope": "full panel", "val_cell_MAE": fmt(vm(mid)), "val_AOI_MAE": fmt(vm(mid, "aoi_month")),
                     "test_cell_MAE": fmt(vm(mid, split="test")), "test_AOI_MAE": fmt(vm(mid, "aoi_month", split="test")),
                     "test_dev": fmt(vm(mid, split="test", key="poisson_deviance")),
                     "test_cov80": fmt((m.get("interval") or {}).get("test_coverage"), 2)})
SUMMARY = pd.DataFrame(rows).set_index("model")
print(SUMMARY.to_string())
if QML.get("status") == "ok":
    print("\nMatched-budget (bounded subset) comparison, test cell-month:")
    print(pd.DataFrame({k: v for k, v in QML["test_subset"].items() if isinstance(v, dict) and "mae" in v}).T[["n", "mae", "rmse", "poisson_deviance"]].round(4).to_string())
print(f"\nSelected model (validation only): {SELECTED}   |   release stage: {RELEASE_STAGE}  ({RELEASE_REASON})")
print(f"Q2 QLLM: {QLLM.get('status')}  {QLLM.get('reason', '')}")
print(f"Run folder: {RUN_DIR}\nApp bundle: {APP_FINAL}\nZip: {APP_ZIP}")
print(f"Device: {DEVICE}   quick_test={QUICK_TEST}   total timed stages: {sum(TIMINGS.values()):.1f} s   blocked network attempts: {len(BLOCKED_CONNECTIONS)}")
if SYNTHETIC:
    print("\n" + "!" * 100 + "\nHONEST NOTE: the input bundle is a SYNTHETIC FIXTURE (" + ", ".join(SYNTHETIC_FLAGS) + ").\n"
          "All numbers above are produced from simulated detections and say NOTHING about real fires or real model skill.\n"
          "release_stage is forced to 'ui_prototype' and every activity record has value_status='demo'.\n" + "!" * 100)
try:
    from IPython.display import Image, display
    if "ipykernel" in sys.modules:
        for f in FIGS: display(Image(filename=str(f)))
except Exception:
    pass

# %% [markdown]
# ## Next phase: Phase 3 — Check the results
#
# **Check before you continue**
#
# - [ ] Open `manifest.json` in the bundle: `release_stage` is `observed_comparison` or `validated_calibration`, `synthetic` is false, and `release_reason` makes sense.
# - [ ] Open `figures/timeseries_BGD.png`: the estimate continues smoothly into the VIIRS series with no jump at 2012, and Aqua sits below VIIRS.
# - [ ] Open `metrics.json` or `comparison.csv`: note the selected model and its test interval coverage (aim: near 0.80).
# - [ ] Open `runs/<ts>/run_log.json` (in `/kaggle/working`): note the timings and the RSS memory for Australia and the United States (ingest and panel lines).
# - [ ] Run `python notebooks/tests/check_bundle.py <unzipped lumos_app_bundle>` locally (without `--fixture`); it must pass on the real bundle (DATA-03).
# - [ ] Q2 shows `ok` if you attached a model, or `skipped` if you did not; never anything in between.
# - [ ] Give `lumos_app_bundle.zip` to Claude Code, which unzips it to `apps/web/public/data/<snapshot_id>/`.
