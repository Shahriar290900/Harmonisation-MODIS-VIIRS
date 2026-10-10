# Kaggle hand-off: run both notebooks yourself

For: M. Al Shahriar Hameem · 10 Oct 2026. Nothing here has been run on real data yet, so every time below is an estimate. Longer version with every check: `RUNBOOK.md`, Phases 1 and 2.

What you do: run A (internet ON, CPU), save it, run B (RTX PRO 6000 Blackwell, internet OFF) on A's output, download `lumos_app_bundle.zip`, give it back to Claude.

Regions in the data: Bangladesh (+ 7 divisions), Australia (+ New South Wales), United States (+ California). Notebook A downloads **117** FIRMS files (3 countries × (25 MODIS + 14 VIIRS) years).

> **Readiness gate (10 Oct 2026): do Part 1 (Notebook A) any time, but do not start Part 2 (Notebook B) until Claude tells you Notebook B has been updated for the United States.** At the time of writing, `lumos_B_train.py` still defines only Bangladesh and Australia as areas of interest (`AOI_COUNTRIES`, `FEATURE_EXPORT_AOIS`, `CELLS_EXPORT_SKIP_AOIS`), and its guide text still says `panel: 2 countries`. The Part 2 checks below describe the updated notebook (the target), not the file as it stands today. Tracked in `lumos_app/STATUS.md` and `lumos_app/review_loop/W5-DOCS.md`.

## Before you start
- Kaggle account with a verified phone (needed for Internet ON and GPU).
- Enough GPU quota for one RTX PRO 6000 session (Settings → Quotas).
- Files: `kaggle_notebooks/lumos_A_fetch.ipynb` and `kaggle_notebooks/lumos_B_train.ipynb`.
- Do **not** add a `FIRMS_MAP_KEY` secret. It is optional (recent data only) and not needed for this run.

## Part 1: Notebook A (fetch the data)
1. kaggle.com → **Create → New Notebook**.
2. **File → Import Notebook** → upload `lumos_A_fetch.ipynb`. Rename it exactly `lumos_A_fetch`.
3. Right-hand panel → **Settings**:
   - **Internet: ON**
   - **Accelerator: None** (CPU). T4 also works but is not needed.
   - **Environment:** leave the default (latest).
4. Click **Run → Run All**. Wait for the last cell. (Estimate 8–40 min, mostly FIRMS download speed; the US files are large.)
5. Check these lines in the output:
   - `FIRMS country archives: 117 files, 4 workers`
   - `FIRMS country archives: done in ...s (ok=..., missing=..., error=0)`
   - the table in section 1.11 has no `error` cells (`missing` is fine for years FIRMS does not publish)
   - `key leak check: passed`
   - last line: `Done. Outputs are files under /kaggle/working/lumos_bundle ...`
6. Click **Save Version** (top right) → **Save & Run All (Commit)** → **Save**. This runs everything again from scratch in a fresh session, so it downloads again. That is expected.
7. Wait until the version shows as finished (**Versions** list). Open it → **Output** tab → confirm `lumos_bundle/` is listed (it contains `manifests/sources.json`).
8. Note the Python version printed in section 1.10 (also in `README_bundle.md`). B must use the same environment image.

If any step fails, see "What to paste back" below. Do not start Part 2 until the committed version of A finished successfully.

## Part 2: Notebook B (train and export)
1. **Create → New Notebook** → **File → Import Notebook** → upload `lumos_B_train.ipynb`.
2. Right-hand panel → **Add Input → Notebook Output** → search `lumos_A_fetch` → add the latest successful version. The Input panel must now list it.
3. *(Optional, skip on the first run)* **Add Input → Models** → an instruct model such as Qwen2.5-7B-Instruct, framework Transformers. This only enables the research step Q2; without it Q2 shows `skipped`.
4. **Settings**:
   - **Accelerator: RTX PRO 6000** (Blackwell)
   - **Internet: OFF** (the Blackwell GPU is only offered with Internet OFF; B makes no network calls anyway)
   - **Environment:** same image as A.
5. Click **Run → Run All**. (Estimate 30–90 min on real data. Not measured yet.) If a cell crashes, run **Run All** again in the same session: B resumes from its verified checkpoints.
6. Check these lines in the final cell (section 2.18):
   - `Device: cuda ...` and `blocked network attempts: 0`
   - `Selected model (validation only): ... | release stage: ...`
   - no "HONEST NOTE" banner (that banner means synthetic data was used)
   - earlier, in section 2.6 (once Notebook B is updated, see the readiness gate): `panel: 3 countries ...` and `AOI` lines for `BGD`, `AUS`, `AUS-NSW`, `USA`, `USA-CA`. If you see `panel: 2 countries` or no `USA` line, you are running the old Notebook B: stop and tell Claude
   - section 2.14: `schema errors: 0`
7. Download the result: right-hand **Output** panel → `lumos_app_bundle.zip` → **Download**. Files from an interactive session disappear when it stops, so download now, or also click **Save Version → Save & Run All** and download from that version's **Output** tab.

## Hand it back
1. Put `lumos_app_bundle.zip` in the repo root folder (`Lumos_Fire_Calendar_Complete/`). Zip files are git-ignored on purpose.
2. Tell Claude: "bundle is at `<path>`; B said release stage `<observed_comparison or validated_calibration>`". Also paste the `Selected model` line and the `release_reason` text from `manifest.json`.
3. Claude imports it (`node scripts/import_bundle.mjs`, from `lumos_app/`), which checks the checksums and schema. Either outcome is a valid result: `observed_comparison` is an honest finding, not a failure.

## What to paste back to Claude when something fails
Copy the text, not just a screenshot. Keep it to about 50 lines. Always say which section (for example 1.6 or 2.9) failed.

Notebook A:
- the line starting `FIRMS country archives: done in` (the `ok=`, `missing=`, `error=` counts)
- every `ERROR <id> - <note>` line under the 1.11 table, and the `All records by status:` line
- any line containing `HTTP 403`, `HTTP 429`, `circuit breaker` or `stall`
- the `key leak check:` line
- the Python version from `README_bundle.md`

Notebook B:
- the last 30 lines of the failing cell, including the first `Traceback` and its final error line
- the `Device:` line and the `blocked network attempts:` line
- the lines `panel: ... countries` and `AOI <id> ...`
- the `SELECTED (validation only)` line (2.11) and the `release stage` / `release_reason` text
- for export problems: `schema errors:`, `ONNX parity:` and any `cells <aoi> <year>: est cutoff raised` lines
- for crashes or out-of-memory: the text `out of memory` / `Killed`, plus `runs/<ts>/run_log.json` and `runs/<ts>/stages.json` from the Output panel (they hold timings and memory)
- the Kaggle version status text if Save Version itself failed

## What NOT to share (with Claude, in chat, in screenshots, or in git)
- A **FIRMS MAP_KEY** (not needed for this run; if you added one anyway, never paste it. If a pasted log shows a URL with a key, replace the key with `{MAP_KEY}`).
- Your **Kaggle API token** or `kaggle.json`, your Kaggle password, cookies or session links.
- Screenshots of Kaggle's **Secrets** or account/API settings.
- Raw FIRMS CSV files (large, and not needed; the bundle holds their checksums).

Notebook A scans its output for the key and deletes any file that contains it, and its logs show `{MAP_KEY}` instead of the key. That is a safety net, not a reason to paste secrets.
