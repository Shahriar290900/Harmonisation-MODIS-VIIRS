# HANDOFF FOR THE NEXT AGENT — Lumos Fire Calendar (written 10 Oct 2026, ~20:00 Dhaka)

You are taking over a half-finished job. Read this whole file before touching anything. It is written so an agent with **no memory of the previous session** can continue safely. Facts here were observed in the previous session; anything marked UNVERIFIED was not.

---------------------------------------------------------------------------
## 0. TL;DR (what state are we in)

- Project: **Lumos Fire Calendar** — NASA Space Apps 2026 challenge "Harmonization of MODIS and VIIRS Hot Spots". Owner: **M. Al Shahriar Hameem**, Team **Lumos**, Dhaka. Owner's email: shahriar.hameem@gmail.com. Kaggle username: `shahriarhameem`. GitHub repo (PRIVATE): `https://github.com/Shahriar290900/Harmonisation-MODIS-VIIRS`.
- The package (React/Vite PWA + two Kaggle notebooks + docs) pre-existed and passed tests on **synthetic data only**. Nothing has ever run on real FIRMS data, on the Blackwell GPU, or on real phones.
- This session **extended scope from {Bangladesh, Australia/NSW} to {Bangladesh, Australia/NSW, USA/California}**, probed Kaggle (T4x2 and RTX PRO 6000) through the API, reviewed the NASA research pack, ran a review loop, and then started a **second fix round** (see §6) that may be only partly finished when you read this.
- **The owner runs the Kaggle notebooks himself** (A = fetch, B = train). He said: "just give me the notebook, I will run it". Do **not** start long GPU runs for him. Your job is to make the notebooks + docs correct and tell him exactly which two files to upload (`KAGGLE_HANDOFF.md`).
- **Do not tell the owner the notebooks are ready until the checklist in §9 passes.**

---------------------------------------------------------------------------
## 1. Hard rules (from the owner and the master prompt)

1. **Never put secrets in the repo, files, logs, notes, kernel metadata or messages.** Two credentials were pasted into chat by the owner: a GitHub PAT (`ghp_…`) and a Kaggle API token (`KGAT_…`, also visible in a screenshot). Treat both as **exposed**. Tell the owner to **revoke both** when work is done. They are **not** stored in the repo. You will not have them; ask the owner for fresh ones if you need to push/run Kaggle jobs, and pass them only through environment variables for a single command.
2. **Owner's screenshots in the repo root** (`Screenshot *.png`) include one showing the Kaggle token. They are git-ignored (`.gitignore`). **Never commit them.** Do not `git add -A` blindly; check `git status` first.
3. **Deploy/publish only when the owner says go.** Do not enable GitHub Pages, do not submit anything to NASA/Space Apps. (Note: GitHub Pages from a private repo may need a paid plan — check then.)
4. **Honesty rules (PRD §4/§6/§11, CONTRACT):** missing ≠ zero; zero recorded detections ≠ "no fire"; observed vs estimated always separated; synthetic data always labelled DEMO/FIXTURE; no unsupported accuracy claims; no pooled single "accuracy %". Never weaken a test or an honesty label to get green.
5. **Max 3 repair attempts per external blocker**, then document and take the fallback. Never loop on a failing call. Respect `Retry-After`.
6. **File ownership:** one agent edits one file set at a time. Do not run two agents editing the same file.
7. **Rate limits (YOUR session):** the previous session hit the account **session limit** (resets at 2:30pm and 7:30pm Dhaka time) when many agents ran in parallel — 6 agent calls failed. Run **at most 3 agents in parallel**, prefer inline work, checkpoint (commit) often.
8. **The owner uses Brave.** If you launch a browser for him, use `open -a "Brave Browser" <url>`. (Headless Playwright/Chromium for tests is separate.)
9. Be terse and factual in reports to the owner. State what was run and the real outcome. Don't claim a test passed unless you ran it.

---------------------------------------------------------------------------
## 2. Machine and tooling (owner's Mac — low end)

- macOS 12.7.6, Intel i5-5350U, **8 GB RAM, ~10 GB free disk (volume 89% full)**, Python 3.12.2, Node 20.20.2, npm 10.8.2, git 2.37.1. No `gh`, no `pdftotext`. Brave installed.
- Everything heavy runs on **Kaggle**. Local runs are tests only; use generous timeouts (unit tests ~80 s; full e2e ~25+ min).
- Local helper venvs live in the previous session's scratchpad (`/private/tmp/claude-501/.../scratchpad/`): `kgenv` (kaggle CLI 2.2.4), `pdfenv` (pypdf). They may be gone. Re-create: `python3 -m venv kgenv && kgenv/bin/pip install kaggle` (do **not** write `~/.kaggle/*`).
- Repo root (git, branch `main`): `/Users/aburoshderokonuddawla/Desktop/Lumos_Fire_Calendar_Complete`. App: `lumos_app/`. `npm ci` was run in `lumos_app/` (node_modules git-ignored).

---------------------------------------------------------------------------
## 3. Repo layout (what is where)

```
Lumos_Fire_Calendar_Complete/            (git root; remote origin = private GitHub repo)
  README.md, START_HERE.md, RUNBOOK.md, KAGGLE_HANDOFF.md   owner-facing docs
  HANDOFF_FOR_NEXT_AGENT.md                                   <- this file
  NASA_MODIS_VIIRS_2026.pdf       research pack (owner's), 17 pp, 70 links
  modis satellite image.png       Aqua/Terra render the owner supplied (candidate for the 3D explainer; unused so far)
  Screenshot*.png                 IGNORED, contain a token — never commit
  kaggle_notebooks/               the two notebooks to upload + STEP_INDEX.md (copies of lumos_app/notebooks/*.ipynb; must be byte-identical)
  prompts/                        master prompt + per-step Claude Code prompts
  references/                     original PRD (md/pdf) + original master prompt
  lumos_app/
    PRD.md  CONTRACT.md  STATUS.md  README.md  docs/ (RUNBOOK, SOURCE_CHECK, PRD_v1_original, research/, kaggle/)
    notebooks/   lumos_A_fetch.py/.ipynb, lumos_B_train.py/.ipynb, build_ipynb_A.py, build_ipynb_B.py, STEP_INDEX.md, TEST_REPORT.md, tests/
    fixtures/    make_fixture_bundle.py, extract_ne_subset.py, ne_subset/, out/ (synthetic Kaggle-A-like bundle, now 3 countries), out_b/ (ignored; synthetic B output)
    apps/web/    React 18 + Vite 6 + TS 5.7 PWA (MapLibre, d3, three.js, GSAP, zod, vite-plugin-pwa); public/data/<snapshot>/ = static JSON served by the app
    scripts/     import_bundle.mjs, bundle_schema.mjs   (loads Notebook B's lumos_app_bundle.zip into apps/web/public/data/)
    tests/       unit (vitest) + e2e (Playwright)
    review/, review_app/, review_exp/    earlier review-loop reports
    review_loop/ (ignored) heartbeats of this session's agents + FINDINGS_ROUND1.json (31 review findings)
    docs/research/   NASA-pack digest, ledger.json (70 links), notes/S0xx.md (34 fetched), FINDINGS.md, BLOCKED.md
    docs/kaggle/     CLI_NOTES.md, ACCOUNT_PROBE.md, KAGGLE_DOCS_FINDINGS.md, KAGGLE_ENV.md (the big env report + launch runbook R0–R8), probes/
```

Data flow: **Notebook A** (Kaggle, Internet ON) downloads FIRMS yearly country CSVs + Natural Earth + wheelhouse → `/kaggle/working/lumos_bundle` (becomes the notebook output). **Notebook B** (Kaggle, Internet OFF, GPU) reads A's output → ingest → 5 km equal-area cell×month panel → B0/B1/B2(XGBoost)/D1(MLP) (+ research Q1/Q2) → `lumos_app_bundle.zip`. The app imports that zip with `npm run import-bundle -- <zip>`.

---------------------------------------------------------------------------
## 4. Decisions already made by the owner (do not re-ask)

- **Regions:** Bangladesh (`BGD` + divisions `BGD-A..G`), Australia (`AUS` + `AUS-NSW`), **USA (`USA` + `USA-CA` = California)**. Whole-country AUS/USA get monthly aggregates only; **cell grids + B1 features only for BGD, AUS-NSW, USA-CA**. Default selected region in the app stays **BGD**. `schema_version` stays `"1.0"`; AOI additions are "v1.2 addendum" (CONTRACT §8–9, Region registry is authoritative).
- FIRMS country file name for USA is **`United_States`** (verified by HTTP HEAD: `…/data/country/modis/2020/modis_2020_United_States.csv` 12.3 MB; `viirs-snpp/2020/…` 53.8 MB).
- **Kaggle:** owner runs A and B himself. B's GPU choice is the owner's (T4x2 safe vs RTX PRO 6000 via ARC competition — see §8). Notebook B must work on either.
- **GitHub:** pushing to the private repo is authorized (use a temporary env var + `GIT_ASKPASS`, never write the token into files or the remote URL; `http.postBuffer=524288000` and `http.version=HTTP/1.1` were needed for the first push which returned HTTP 400 otherwise).
- Deployment is not authorized yet.

---------------------------------------------------------------------------
## 5. Verified facts (with source) you can rely on

FIRMS / data (checked 10 Oct 2026 from the owner's Mac, `docs/research/notes/R5_VERIFY.md`, HEAD/GET requests):
- Yearly country CSVs exist **2001–2024** for Bangladesh, Australia, United_States (MODIS) and **2012–2024** (VIIRS S-NPP). **2025 files return HTTP 404** for all three countries and both sensors → Notebook A records them `missing` (6 files); expected **111 ok + 6 missing** of 117 (never zero). The route `/data/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv` works keyless but is **not documented** on FIRMS's download page (risk).
- Summed Content-Length 2001–2024: United_States ≈ 767 MB, Australia ≈ 1762 MB, Bangladesh ≈ 15 MB. USA is smaller than Australia → no bbox streaming needed.
- Real CSV format (matches Notebook A/B expectations): MODIS columns `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type` with `satellite` = `Aqua`/`Terra`; VIIRS `…bright_ti4…bright_ti5…` with `satellite` = `N`. NRT rows have **no `type`** value (type exists only in standard data). The US file includes Alaska, Hawaii (lat 18.97…69.51), type 0 vs 2/1/3 rows (2020 MODIS: 148,412 / 5,205 / 200 / 31).
- Area API: window **1–5 days**, 5000 transactions / 10 min, no `NOAA21_SP` source. Satellite codes: A, T (MODIS), N, N20, N21 (VIIRS). Aqua starts **3 Jul 2002** (older docs said 07-04). MODIS from 1 Nov 2000, S-NPP from 20 Jan 2012. NOAA-20 start date inconsistent on two FIRMS pages (2018-04-01 vs 2020-01-01).
- **NASA says delivery of all S-NPP VIIRS science data products ceases 2 Nov 2026** (Earthdata VNP64A1 page). Affects future/NRT use, not the 2013–2024 history.
- Fu et al. 2020 (MDPI Remote Sensing 12:2870) first author is **Yuyun Fu** (the research pack's "Xu" is wrong). Burned-area products (MCD64A1, VNP64A1, GlobFire) are **not independent** of active-fire detections → secondary checks only. A single global MODIS→VIIRS multiplier is not defensible (MODIS omission 86.2% vs ASTER).
- UNVERIFIED: real submission deadline (pack says 7 Oct 2026; PRD says project window from 14 Nov), the FRP slopes 1.22–1.32, Li 2018 coefficients, Schroeder 2014 numbers, the pack's "Type field bug" claim, overpass times.

Kaggle (measured by probe kernels `shahriarhameem/lumos-probe-t4` and `lumos-probe-rtx`, `docs/kaggle/probes/*/output/`, report `docs/kaggle/KAGGLE_ENV.md`):
- Both: Python **3.13.15**, **torch 2.11.0+cu128 with sm_120 (Blackwell) kernels**, xgboost 3.4.1 GPU fit OK, transformers 5.16.1, numpy 2.1.3, pandas 2.3.3, sklearn 1.6.1, onnx 1.22.0 present; **`onnxruntime`, `onnxscript`, `pennylane`, `pennylane-lightning` NOT preinstalled.** `/kaggle/working` = **19.5 GiB** on both (UI's 57.6 GiB figure is not the output limit).
- T4 x2: 2× Tesla T4 (14.56 GiB each, cc 7.5), 4 CPU, **31 GiB RAM**, Internet ON worked (pip download pennylane OK, FIRMS HEAD 200). `machine_shape: NvidiaTeslaT4`. bf16 untested on T4.
- RTX PRO 6000 Blackwell: 94.97 GiB VRAM, cc 12.0, 48 CPU, **177 GiB RAM**, bf16 matmul OK (~346 TFLOPs), Internet OFF verified (pip/DNS fail). Obtained by pushing a **script kernel** with `machine_shape: NvidiaRtxPro6000`, `enable_gpu: true`, `enable_internet: false`, `competition_sources: ["arc-prize-2026-arc-agi-3"]`. `/kaggle/input` then contains only `competitions/`.
- Quota (via `kaggle quota`): GPU 30 h/week (≈0.08 h used by the probes), TPU 20 h; refresh 2026-10-17.
- **POLICY RISK (UNVERIFIED):** a search summary of the ARC competition page says using its RTX machines for non-competition work could lead to suspension/ban. The page itself could not be read. Owner knows and said he will choose.
- Kaggle CLI 2.2.4 specifics: auth via `KAGGLE_API_TOKEN` env var (token string or file path); metadata fields on push: `id, title, code_file, language, kernel_type(script|notebook), is_private, enable_gpu, enable_tpu, enable_internet(default TRUE!), machine_shape, dataset_sources, competition_sources, kernel_sources, model_sources, docker_image, docker_image_pinning_type(original|latest)`; `kaggle kernels push -p <dir> [-t SECONDS] [--accelerator NAME]` starts a run immediately; `kernels status`, `kernels output -p <dir> [--file-pattern]`, `kernels pull -m` (shows applied settings); no cancel command in CLI. Unrelated owner notebooks exist (final-qllm, qml-qllm, …): **never push over them**. The owner's draft "Internet OFF with RTX PRO 6000" UI notebook (contains imported Notebook B) is not visible via API (403): don't touch.
- Full command templates and a launch runbook (R0–R8) are in `lumos_app/docs/kaggle/KAGGLE_ENV.md` §7.

---------------------------------------------------------------------------
## 6. What was done (chronological) and the current in-flight state

DONE and committed-or-on-disk (verify with `git status` / `git log`):
1. `git init -b main`, baseline commit `a85bb0a`, pushed to GitHub `main`. Baseline unit tests: 363/367 pass (4 failures = 5 s timeouts on this slow machine + a test needing a missing `review_app/scratch/imp/slip.zip`; both are fixed in the work below).
2. **W0 contract:** CONTRACT.md §8 (v1.2 addendum) + §9 (Region registry, 12 AOIs), PRD.md updated for three regions.
3. **W2 Notebook A:** `COUNTRIES = ["Bangladesh","Australia","United_States"]`, USA bbox for NRT, 117-file guide text, fixtures regenerated with synthetic USA (`fixtures/out`, 17 MB), `test_notebook_A.py` passes (53 s).
4. **W3 Notebook B:** USA/US-CA AOIs, ISO map, exports; fixture end-to-end run produced a synthetic 3-region bundle (`fixtures/out_b`, ignored).
5. **W4A/W4B app:** `apps/web/src/data/regions.ts` (data-driven regions, display kinds, focus, no-cells hints), landing/gallery/globe/map made generic, B0/B1 "Fallback in use" notice, test timeout fixes; new synthetic snapshot `apps/web/public/data/lumos-20261010T094200Z-e3d5f980` imported (old `…20261009T182337Z-9e1ef412` deleted); **unit tests 446 pass** (378 + others per heartbeats), `npm run build` OK, first view ≈ 0.53 MB gz; **e2e 95 pass / 39 skip / 1 timing fail (L05) that passes alone with widened timeout (600 s)**.
6. **W5 docs:** README.md, KAGGLE_HANDOFF.md (first version), RUNBOOK edits.
7. **Research crew** (5 agents): `docs/research/` — ledger (34 fetched, 9 blocked, 21 todo, 4 skipped, 2 unreachable), notes, FINDINGS.md (compiled by the coordinator; subagents cannot write report files — the harness refuses; have them return text).
8. **Kaggle probe crew** (10 agents): both probes ran; `docs/kaggle/KAGGLE_ENV.md` (+ diffs P1–P9, runbook R0–R8) verified by a monitor (3 minor evidence nits).
9. **Review panel** (3 reviewers) produced **31 findings** → `lumos_app/review_loop/FINDINGS_ROUND1.json` (git-ignored; if missing, recreate by re-reviewing). The automatic resolve/verify rounds **failed** (account session limit), so fixes were launched manually as round 2.

STATUS UPDATE (~20:15 Dhaka): **NB-A (Notebook A) and DOCS finished** — verified on disk: A `.ipynb` copies byte-identical, A code cells compile, `test_notebook_A.py` reported `ALL TESTS PASSED` (agent-run; re-run it yourself, it rebuilds the ipynb with new random cell ids so **re-copy `lumos_app/notebooks/lumos_A_fetch.ipynb` to `kaggle_notebooks/` after every test run**), WHEELS = pennylane, pennylane-lightning, onnxruntime, onnxscript, guide says 117 requests = 111 ok + 6 missing (2025). Docs agent rewrote RUNBOOK (both copies identical), KAGGLE_HANDOFF.md, STATUS.md, CONTRACT §10, SOURCE_CHECK C1–C15, master prompts, scrubbed docs/kaggle. **Docs caveats:** KAGGLE_HANDOFF/RUNBOOK say "B turns bf16 off on T4" — that is only true once Notebook B's P5 lands; the Aqua date 2002-07-03 may still be 07-04 in notebook code; notebook guide cells/STEP_INDEX wording for 1.11 and the checks should be aligned to 111 ok / 6 missing (A agent says it did this — verify). **NB-B (Notebook B) was still running** when this was written — check `git status`, mtimes of `lumos_app/notebooks/lumos_B_train.py`, and whether `lumos_app/fixtures/out_b/` was regenerated after ~19:50.

Original description of the three round-2 agents (the NB-B part is still the open spec if it died):
- **Agent NB-A (Notebook A fixes):** wheel list → `pennylane, pennylane-lightning, onnxruntime, onnxscript` (P1); disk guard (P7); 2025-files truth (111 ok / 6 missing); Aleutians bbox comment; S-NPP-ceases note; rebuild `.ipynb`; update/run `test_notebook_A.py`.
- **Agent NB-B (Notebook B fixes):** **H1 per-region release stage** (see §7 item 1), M2 per-region interval coverage, scrub absolute local paths from exported strings, `features_exported` honesty, USA memory guard, P2/P3/P4/P5/P8 (+ safe P6), explicit NRT `type` rule, Aqua date, rebuild `.ipynb`, rerun B tests + full fixture run, regenerate `fixtures/out_b` bundle, `check_bundle.py --fixture`.
- **Agent DOCS:** remove stale "Notebook B not updated" statements, apply research corrections (2025 404, API 1–5 days, Aqua date, S-NPP cessation, Fu), USA caveats, rewrite pre-judging acceptance steps, status truth, master prompts, scrub scratchpad paths in docs/kaggle, **final `KAGGLE_HANDOFF.md`** (two B options), update root README.

If any of them died/hit a limit, re-issue its task from the lists above (they are complete task specs).

---------------------------------------------------------------------------
## 7. Remaining work (ordered). Finding IDs refer to `FINDINGS_ROUND1.json` (severity, file)

1. **[HIGH] Pooled release stage** (`lumos_B_train.py` ~1891–1906, ~2401; app `ui/TopBar.tsx`, `experience/landing/StageTag.tsx`). One pooled stage over 12 nested AOIs (BGD+7 divisions, AUS+NSW, USA+CA double-counted; absolute MAE dominated by whole-country AUS/USA). Required: evaluate per region on **non-overlapping units** (BGD country, AUS-NSW, USA-CA; whole-country AUS/USA reported separately, not gated); `validated_calibration` only if the selected model beats **both** B0_identity and B0_month_ratio on test in **every** gated region **and** each region's 80% interval coverage is within ±10 points; else `observed_comparison`; manifest stage = weakest; synthetic ⇒ `ui_prototype`. **App side:** show stage per region; adapt to new `metrics.json` shape.
2. **[MED] Interval coverage stamping:** `interval_empirical_holdout_coverage` currently one pooled test number on every AOI-month record (also train/backcast years) and shown in `ui/Evidence.tsx:65` and `data/explain.ts:94`. Make it region-level (null with reason where unmeasured); app text must say what it measures.
3. **[MED] USA caveats in the app UI/copy** (Evidence, Story, Explainer): Alaska/Hawaii included, non-wildfire/prescribed/agricultural burning, type 1/2/3 excluded, 5 km grid unmeasured for USA. (Docs agent covers docs.)
4. **[MED] Absolute local path leak** in the public snapshot (`metrics.json`, `models/Q2_qllm/model_card.json` Q2 "skipped: no local LLM … under /Users/…"). Fixed in Notebook B (round 2); **the snapshot must be re-imported** from the regenerated bundle, then grep `apps/web/public/data` for `/Users/`.
5. **[MED] Repo hygiene** (done by coordinator: `.gitignore` for `__pycache__`, `Screenshot*.png`, `fixtures/out_b/`, `review_loop/`, kaggle heartbeat/messages/probe outputs). Still decide: commit `NASA_MODIS_VIIRS_2026.pdf` (516 KB; reference it in README) and `modis satellite image.png` (move to `references/`); `artifacts/` new e2e screenshots (~40 MB dir; keep ≤ the 20 tracked ones or commit selectively); `lumos_app/fixtures/out/` USA CSVs (≈16 MB synthetic, intended).
6. **[LOW, app]** Explainer mini-chart fixed 3.2× factor needs a visible "illustrative, not data" label (`ui/Explainer.tsx` ~39–48, `landing/Story.tsx` 168–242); Story "We can claim" card (`Story.tsx` 376–400) states capabilities as if measured — add "on this demo snapshot" qualifiers; `data/explain.ts` wording: "error" not "accuracy", "presumed vegetation fire" (type 0); Gallery sparkline (`Gallery.tsx` ~177–198) must not draw partial/missing months as complete; USA gallery silhouette/MapPanel fit uses a bbox spanning Alaska+Hawaii (fit to CONUS or a state); CSV export of partial months with hard `0` lower bounds (mark as lower bound or null).
7. **[LOW, B]** `regions.json features_exported` must reflect files actually written; USA real-scale memory unmeasured (guard + log); Aleutians comment (A).
8. **Re-import the new B bundle** into the app (`npm run import-bundle -- lumos_app/fixtures/out_b/lumos_app_bundle.zip`), keep `index.json` valid and `synthetic:true`, run `npm run build && npm test`, targeted e2e (`app.spec.ts`, `landing.spec.ts`), and a quick manual load of `#aoi=USA-CA`, `#aoi=AUS-NSW`, `#aoi=BGD` (Brave if showing the owner).
9. **Re-review** (read-only reviewer + honesty reviewer + repo reviewer, max 3 in parallel) → resolve → verify; loop max 3 rounds; stop when no high/medium findings.
10. **Checkpoint:** commit on a branch (not `main` until reviewed), push with the owner's temporary token (§4). Create a tag only on the owner's request.
11. **Offline rehearsal (optional, needs the owner's go-ahead and fresh Kaggle token):** `docs/kaggle/probes/lumos-probe-offline/` rehearses Notebook B's offline install on a T4 with Internet OFF against A's real output — only possible **after the owner has run Notebook A**.
12. After the owner runs A and B on Kaggle and returns `lumos_app_bundle.zip`: **Phase 3/4 of RUNBOOK** — `python3 -I lumos_app/notebooks/tests/check_bundle.py <unzipped bundle>` (no `--fixture`), import into the app, update copy by release stage, real-data review loop, then (only with go-ahead) GitHub Pages workflow with `BASE_PATH=/Harmonisation-MODIS-VIIRS/`.

---------------------------------------------------------------------------
## 8. Owner-facing guidance for running Kaggle (summary; full text in KAGGLE_HANDOFF.md)

- **Notebook A** (`kaggle_notebooks/lumos_A_fetch.ipynb`): new Kaggle notebook named `lumos_A_fetch`, Internet **ON**, CPU, **Save Version → Save & Run All**. Expect `111 ok, 6 missing (2025), error=0`, `key leak check: passed`. ~8–40 min (unmeasured). Optional secret `FIRMS_MAP_KEY` only for the NRT layer.
- **Notebook B** (`kaggle_notebooks/lumos_B_train.ipynb`): new notebook, Internet **OFF**, add A's latest output (Add Input → Notebook Output), environment = default/latest (do **not** pick old pinned images; torch 2.11 sm_120 verified on the CLI-assigned image).
  - **Option (a) T4 x2, no competition** — safe for the account; 31 GiB RAM/4 CPUs (USA+Australia panels may be tight — UNMEASURED); B uses one T4; bf16 off on T4.
  - **Option (b) RTX PRO 6000** — only via a notebook with competition `arc-prize-2026-arc-agi-3` added as input and Internet OFF; 177 GiB RAM; policy risk above is the owner's call.
  - First-run time caps: XGB 45, DL 45, QLLM 45 minutes (QLLM only if a model is attached; otherwise skipped honestly). Uses part of the 30 h weekly GPU quota.
- What to bring back: `lumos_app_bundle.zip` (never any token / MAP_KEY / Kaggle credentials). On failure: the exact failing log lines and the cell number.

---------------------------------------------------------------------------
## 9. Definition of "ready to run" — all must be TRUE before telling the owner to start

Run from the repo root unless noted; use long timeouts.
1. `cmp lumos_app/notebooks/lumos_A_fetch.ipynb kaggle_notebooks/lumos_A_fetch.ipynb` and the same for B → identical; `kaggle_notebooks/STEP_INDEX.md` == `lumos_app/notebooks/STEP_INDEX.md`.
2. Code cells of both notebooks compile (`python3 -I -c "import json,sys;nb=json.load(open(sys.argv[1]));compile('\n'.join(''.join(c['source']) for c in nb['cells'] if c['cell_type']=='code'),'nb','exec')" <nb>` — beware cell magics `!`/`%`; if present, strip those lines in the check).
3. `cd /tmp && python3 -I <repo>/lumos_app/notebooks/tests/test_notebook_A.py` → `ALL TESTS PASSED`.
4. Notebook B tests/harnesses per `lumos_app/notebooks/TEST_REPORT.md` pass; fixture end-to-end run completes; `python3 -I lumos_app/notebooks/tests/check_bundle.py --fixture <bundle>` passes; bundle `regions.json` lists exactly BGD, BGD-A..G, AUS, AUS-NSW, USA, USA-CA with correct `cells_exported`/`features_exported`; manifest `synthetic:true`, stage `ui_prototype`.
5. `cd lumos_app && npm run build && npm test` pass; targeted e2e pass; no `/Users/` string inside `apps/web/public/data`.
6. `grep -rnE "KGAT_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{10,}" .` (excluding node_modules, .git) → no hits; `git status` shows no screenshots staged.
7. Docs no longer say Notebook B is un-updated; `KAGGLE_HANDOFF.md` matches the notebooks' actual step numbers and the 111/6 expectation.
8. No leftover processes: `ps aux | grep -E "playwright|vite|vitest|kaggle|python3 .*notebooks"`.

---------------------------------------------------------------------------
## 10. How to work (patterns that worked / failed)

- **Worked:** worker → independent monitor (re-runs checks, reads heartbeat files, checks `ps`) → resolver loop with ≤3 rounds; exclusive file ownership; heartbeat files under `lumos_app/review_loop/<ROLE>.md`; blackboard + message files for cooperating research agents (`docs/research/messages/`); polite fetching (1 request at a time, ≥3 s between requests per host, one retry on 429, no workarounds; this produced zero 429s).
- **Failed / gotchas:** (a) subagents are blocked from writing report files like FINDINGS.md → have them **return text** and write it yourself; (b) too many parallel agents → account session limit; (c) foreground `sleep` is blocked in the Bash tool — use `until <cond>; do sleep N; done` with a timeout, or run in background; (d) zsh globs with `--include=*.ts` fail in the Bash tool — quote them or use the Grep tool; (e) `kaggle kernels push` **starts a run immediately** and there is no cancel command in the CLI — double-check metadata (especially `enable_internet` default TRUE and `machine_shape`) before pushing; set `-t` time caps; (f) first `git push` needed `http.postBuffer` and HTTP/1.1.
- Workflow scripts from this session (resumable) are under `~/.claude/projects/-Users-aburoshderokonuddawla-Desktop-Lumos-Fire-Calendar-Complete/<session>/workflows/scripts/`: `lumos-three-regions-*.js` (build), `lumos-research-crew-*.js`, `lumos-kaggle-probe-crew-*.js`. Reuse prompts from them if useful; agent journals are in `…/subagents/workflows/wf_*/journal.jsonl`.

---------------------------------------------------------------------------
## 11. Known unverified items (do not state as fact)

Notebook A on real FIRMS data; Notebook B on any real data/Kaggle machine; USA real-scale memory/disk; A's wheelhouse build and B's offline install of pennylane's full dependency tree (only `pip download pennylane --no-deps` was run); `torch.onnx.export(..., dynamo=False)` on torch 2.11; PennyLane cross-check; CPU-only image; `/kaggle/temp`; mount path of a notebook output used as input (`/kaggle/input/...` layout is a guess; B walks to depth 8); whether a *notebook-type* push with `kernel_sources` + competition gets the RTX; RTX quota billing rate; frame rates on real GPUs/phones; real iOS/Android behaviour; the real submission deadline; the ARC-RTX policy enforcement.

---------------------------------------------------------------------------
## 12. First 10 minutes for you

1. `cd` to the repo root; `git status --short | head -50`; `git log --oneline | head`; `git branch -a`.
2. Read `lumos_app/review_loop/*.md` heartbeats (if present) to see what the three in-flight agents finished.
3. Run the §9 checks to learn the true state. Update `lumos_app/STATUS.md` if the docs agent did not.
4. Continue with §7 in order. Keep ≤3 agents in parallel. Commit a checkpoint after each stage.
5. When §9 is fully green: tell the owner which two files to upload (`kaggle_notebooks/lumos_A_fetch.ipynb`, `kaggle_notebooks/lumos_B_train.ipynb`) and point him to `KAGGLE_HANDOFF.md`; remind him to **revoke the exposed GitHub and Kaggle tokens**.
