# Kaggle hand-off: run both notebooks yourself

For: M. Al Shahriar Hameem · 10 Oct 2026. Nothing here has been run on real data on Kaggle yet, so every time below is an estimate or a cap. Longer version with every check: `RUNBOOK.md`, Phases 1 and 2.

**First, do this now:** revoke the GitHub token and the Kaggle token that were pasted in chat (GitHub → Settings → Developer settings → Personal access tokens; Kaggle → Settings → API → revoke the token). Create new ones only when you need them, and never paste them again.

What you do: run A (Internet ON, CPU), save it, run B (Internet OFF, GPU) on A's output, download `lumos_app_bundle.zip`, give it back to Claude.

Regions: Bangladesh (+ 7 divisions), Australia (+ New South Wales), United States (+ California). Notebook B covers all three but has not been reviewed on real data.

## Before you start
- Kaggle account with a verified phone (needed for Internet ON and GPU). Check Settings → Quotas (30 h GPU per week at the last check; refresh 17 Oct).
- Files: `kaggle_notebooks/lumos_A_fetch.ipynb` and `kaggle_notebooks/lumos_B_train.ipynb`.
- Do **not** add a `FIRMS_MAP_KEY` secret. It is optional (recent data only) and not needed.

## Part 1: Notebook A (fetch the data)
1. kaggle.com → **Create → New Notebook**.
2. **File → Import Notebook** → upload `lumos_A_fetch.ipynb`. Rename it exactly `lumos_A_fetch`.
3. Right-hand panel → **Settings**: **Internet: ON**, **Accelerator: None** (CPU), **Environment: leave the default (latest)**.
4. **Run → Run All**. Wait for the last cell. Estimate 8–40 min (not measured; the US and Australia files are large).
5. Expect these lines:
   - `FIRMS country archives: 117 files, 4 workers`
   - `FIRMS country archives: done in ...s (ok=111, missing=6, error=0)`
   - section 1.11 table: `missing` only in the 2025 row, no `error` cells
   - `Natural Earth boundaries ... ok=2, missing=0, error=0`
   - `key leak check: passed`
   - last line: `Done. Outputs are files under /kaggle/working/lumos_bundle ...`

   **The 6 missing files are normal.** FIRMS has no 2025 yearly country files (404 on 10 Oct 2026), so the calendar ends at 2024. Raw data is about 2.5 GB for 2001–2024 (measured by HEAD), far below the 19.5 GiB `/kaggle/working` limit (measured on Kaggle). More than 6 missing, or any `error`, is a problem: see "What to paste back".
6. **Save Version** (top right) → **Save & Run All (Commit)** → **Save**. This re-runs everything in a fresh session, so it downloads again. That is expected.
7. Wait until the version finishes (**Versions** list). Open it → **Output** tab → confirm `lumos_bundle/` is listed (with `manifests/sources.json`).

Do not start Part 2 until the committed version of A has finished successfully.

## Part 2: Notebook B (train and export)
1. **Create → New Notebook** → **File → Import Notebook** → upload `lumos_B_train.ipynb`.
2. **Add Input → Notebook Output** → search `lumos_A_fetch` → add the latest successful version. The Input panel must list it.
3. Choose ONE option and write it down:

   **(a) GPU T4 x2, no competition.** *Accelerator: GPU T4 x2.* 31 GiB RAM, 4 CPUs. Safe for the account. B uses one T4 (the second stays idle) and turns bf16 off there. Expect it to be slower, and the US panel may run out of RAM; if the kernel is killed, run all again (B resumes from checkpoints) or switch to (b).

   **(b) RTX PRO 6000.** Only in a **new notebook** with the competition `arc-prize-2026-arc-agi-3` attached (**Add Input → Competition**) and Internet OFF. 177 GiB RAM, 48 CPUs. **Warning:** a search summary of the competition page says that using the machine for anything other than the competition could lead to moderation action such as suspension. This is unconfirmed. It is your decision; (a) avoids the question. Do not open the competition's files or submit anything.
4. **Settings → Internet: OFF**. **Environment: leave the default (latest).** Do not pick an old pinned image: a small probe showed torch 2.11 with `sm_120` works on the default image.
5. *(Optional, skip on the first run)* **Add Input → Models** → e.g. Qwen2.5-7B-Instruct (Transformers) to enable Q2. A 7B model only fits option (b); otherwise Q2 shows `skipped`, which is fine.
6. First-run time caps: in cell 2.2 change the defaults of `XGB_MAX_MINUTES`, `DL_MAX_MINUTES` and `QLLM_MAX_MINUTES` to 45 each. Do this before the first run; changing them later starts a fresh run folder.
7. **Run → Run All.** Time on real data is unknown. If a cell crashes, run all again in the same session: B resumes from verified checkpoints.
8. Expect these lines:
   - 2.3: `network guard installed ...`, `"device_selected": "cuda"`, a `GPU:` line naming the T4 or the RTX PRO 6000
   - 2.4: `mismatches=0`, `SYNTHETIC=False []`
   - 2.6: `panel: 3 countries ...` and `AOI` lines for `BGD`, `AUS`, `AUS-NSW`, `USA`, `USA-CA` (if you see `panel: 2 countries` or no `USA` line, stop and tell Claude)
   - 2.11: `SELECTED (validation only): ...`
   - 2.12: `TEST SPLIT OPENED ...` and `RELEASE STAGE: ...` (`observed_comparison` is an honest result, not a failure)
   - 2.14: `schema errors: 0`, `ONNX parity: ...`
   - 2.18: `Device: cuda ...` and `blocked network attempts: 0`; no "HONEST NOTE" banner
9. Download: right-hand **Output** panel → `lumos_app_bundle.zip` → **Download**. Files from an interactive session disappear when it stops, so download now, or also **Save Version → Save & Run All** (this runs everything again and uses GPU quota twice).

## Hand it back
1. Put `lumos_app_bundle.zip` in the repo root folder (`Lumos_Fire_Calendar_Complete/`). Zip files are git-ignored on purpose.
2. Tell Claude which option you used (a or b), the `Selected model` line, the `RELEASE STAGE` line, and the `release_reason` text from `manifest.json`.
3. Claude imports it (`node scripts/import_bundle.mjs`, from `lumos_app/`), which checks checksums and schema. The release stage is currently pooled over all regions (a per-region stage is being designed), so it is not evidence for California or New South Wales alone.

## What to paste back when something fails
Copy the text, not just a screenshot, about 50 lines. Say which section (for example 1.6 or 2.9) failed.

Notebook A:
- the line starting `FIRMS country archives: done in` (the `ok=`, `missing=`, `error=` counts)
- every `ERROR <id> - <note>` line under the 1.11 table and the `All records by status:` line
- any line with `HTTP 403`, `HTTP 429`, `circuit breaker` or `stall`
- the `key leak check:` line

Notebook B:
- the last 30 lines of the failing cell, from the first `Traceback` to its final error line
- the `GPU:` line, the `Device:` line and the `blocked network attempts:` line
- the `panel: ... countries` and `AOI <id> ...` lines
- the `SELECTED (validation only)` line and the `RELEASE STAGE` / `release_reason` text
- for crashes or out-of-memory: the text `out of memory` or `Killed`, plus `runs/<ts>/run_log.json` and `runs/<ts>/stages.json` from the Output panel
- the Kaggle version status text if Save Version itself failed

## What NOT to share (with Claude, in chat, in screenshots, or in git)
- Any **token or key**: GitHub token, Kaggle API token or `kaggle.json`, Kaggle password, cookies, session links, a FIRMS **MAP_KEY** (if a log shows a URL with a key, replace the key with `{MAP_KEY}`).
- Screenshots of Kaggle's **Secrets** or account/API settings.
- Raw FIRMS CSV files (large, and not needed; the bundle holds their checksums).
