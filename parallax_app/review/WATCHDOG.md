# WATCHDOG review: hangs and runtime blow-ups (2026-10-09)

## 1. Live processes
Only sandbox infrastructure is running. There are no jupyter, nbconvert, http.server, pip or kernel processes left over. **Nothing was killed.**

## 2. Bounded already
Retries (3), Retry-After cap (300 s, A L314), timeouts on requests/pip/nvidia-smi, no deadlock-prone locks. Every training loop has a max epoch/round count. QLLM uses `max_new_tokens=160` and falls back to random instead of retrying (B L1353). The 3x3 neighbourhood uses `searchsorted`; point-in-polygon is prepared and vectorised.

## 3. Findings

| # | file:line | sev | Problem | Fix |
|---|---|---|---|---|
| 1 | B L1479-1859 vs L1146-1376 | **high** | Export runs after the research-only Q1/Q2 stage. A timeout or kernel death during Q2 means **no app bundle**. | Run export before Q1/Q2 (they are not selection candidates), then append their metrics. |
| 2 | B L105, L460-483 | **high** | No checkpoint or resume: a fresh `RUN_DIR` each run means a crash redoes ingest, panel and all models. | Cache AGG and the panel under `WORK/cache/<sources-hash>`. Save each model's pred.npy and weights; skip models already saved. |
| 3 | B L854-879 | **high** | If xgboost has no Blackwell (sm_120) CUDA support it silently uses CPU: about 20M rows, depth 8, ≤3000 rounds x 3 seeds, with a 7M-row eval each round. That is hours per seed and can exceed 12 h. | On CPU: subsample to 4M rows, 1 seed, ≤800 rounds, plus a wall-clock `TrainingCallback`. |
| 4 | B L1297, L99 | **high** | `from_pretrained().to(cuda)` stages the model in CPU RAM. `LLM_MAX_BYTES=40e9` plus a 10-15 GB panel can cause a RAM OOM, which kills the kernel and loses everything (see #1). | Use `device_map="cuda", low_cpu_mem_usage=True` and a cap of about 16 GB; check free RAM first. |
| 5 | B L527-604, L729 | **high** | The AUS panel (about 90M cell-months) has about 18 dense float32 arrays, and the concat plus `.astype` (L591) adds 2 extra copies. Add 6 full preds and float64 Preproc copies of the 20M train rows: peak about 16-20 GB. Adding India means OOM. | Use `copy=False`, free per-country data, drop 2001 rows, store preds only for `PRED_ROWS`, and log RSS. |
| 6 | A L299-326 | medium | Persistent 429 with Retry-After 300 means 900 s per file, and the shared host pause serialises the workers: about 4-5 h for 78 files. | Circuit breaker after N consecutive 429/5xx, plus a stage deadline. |
| 7 | A L302, L254 | medium | The read timeout applies to each read, not the whole file, so a trickling stream never ends. | Add a total deadline per file (e.g. 30 min) in `_stream_to_tmp`. |
| 8 | A L370, L493-495 | medium | An `OSError` such as disk full is not caught, propagates through `fut.result()` and aborts the stage. The manifest is written only per stage, so downloads already done get no record and are re-fetched. | Catch `Exception` in `download()` and write the manifest every N files. |
| 9 | B L265, L1274 | medium | `glob('**')` over `/kaggle/input` has no depth limit and runs twice. With large attached datasets it takes minutes. | Use a depth-limited `os.walk` (≤6) with an early exit; check known patterns first. |
| 10 | B L461-474, L448 | medium | Ingest prints no per-file progress. The detections parquet (on by default) adds minutes and about 1 GB of output. | Log id, rows and seconds per file; default the parquet off. |
| 11 | B L873, L940, L1124 | medium | XGB `verbose_eval=False`, and the D1/Q1 epochs are silent: hour-long gaps where a slow run looks the same as a hang. | Use `verbose_eval=100` and log each epoch. |
| 12 | B L1317-1358 | medium | Q2 runs 24 trials x 30 epochs with no time budget: 1-2 h on GPU and much more on CPU. | Add `QLLM_BUDGET_S` and truncate both arms equally. |
| 13 | B L237-247 | low | Torch falling back to CPU makes D1 take about 2 h (20M rows x 40 epochs x 3 seeds). | Shrink rows and seeds on CPU. |
| 14 | B L475, L1798, A L711 | low | groupby on the object `country` column; Python row loop in cell export; key-leak scan reads entire large CSVs. | Make `country` categorical; vectorise the export; scan only json/md. |

## 4. Progress and resume per stage

| Stage | Progress log | Resume |
|---|---|---|
| A downloads | per file | sha cache (but see #8) |
| B ingest | **none** | **none** |
| B panel / AOI | summary only | **none** |
| B B1 / B2 / D1 | per seed only | **none** |
| B Q1 / Q2 | per seed / trial | **none** |
| B export | yes | runs last (#1) |

**Top risk:** xgboost on CPU (#3) together with export after QLLM (#1) can mean a 12 h timeout with zero output. Fix #1, #2 and #3 first.
