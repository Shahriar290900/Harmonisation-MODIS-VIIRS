# Lumos Fire Calendar: complete package (10 Oct 2026)

Owner: M. Al Shahriar Hameem · Team Lumos, Dhaka · NASA Space Apps 2026, *Harmonization of MODIS and VIIRS Hot Spots*

## What's in this zip

| Folder / file | What it holds |
|---|---|
| `RUNBOOK.md` | The step-by-step guide: 9 phases, about 60 sections, 250+ checkbox steps. Start here. |
| `kaggle_notebooks/` | The two notebooks to upload to Kaggle. `lumos_A_fetch.ipynb` (internet ON) and `lumos_B_train.ipynb` (Blackwell, internet OFF). `STEP_INDEX.md` lists every guide-cell step. |
| `prompts/` | `CLAUDE_CODE_MASTER_PROMPT.md` (paste at the start of every Claude Code session) and `CLAUDE_CODE_PROMPTS.md` (every Claude Code prompt from the runbook, by step number). |
| `lumos_app/` | The full app repo: open this folder in Claude Code. It holds the PRD, data contract, notebooks with their source and tests, the React/Three.js PWA, scripts, unit and browser tests, review reports and a synthetic test data bundle. |
| `references/` | Your original PRD (md and pdf) and original master prompt, kept for reference. |

## Inside `lumos_app/`

| Path | What it holds |
|---|---|
| `PRD.md`, `CONTRACT.md`, `STATUS.md`, `README.md` | Product requirements v2, the frozen data contract, current status, setup and deploy steps |
| `CLAUDE_CODE_MASTER_PROMPT.md` | Same master prompt as in `prompts/` |
| `docs/` | Runbook copy, source check (what was verified, with links), original PRD v1 |
| `notebooks/` | Notebook `.ipynb` files, their `.py` sources, build scripts, test report and tests (about 20 files: notebooks, scripts, test harnesses) |
| `apps/web/` | The app: data workspace, 3D landing, icons, styles, plus the synthetic demo snapshot in `public/data/` (several hundred small JSON files) |
| `scripts/` | `import_bundle.mjs`: loads Notebook B's `lumos_app_bundle.zip` into the app |
| `tests/` | Unit tests and Playwright browser tests |
| `fixtures/` | Generator and ready-made synthetic Kaggle bundle (about 75 CSV files) for testing Notebook B locally. Clearly marked NOT REAL DATA |
| `review/`, `review_app/`, `review_exp/` | Reviewer, watchdog and resolution reports from each agent loop |
| `artifacts/` | Browser-test report, QA report and final screenshots |

## First 5 steps

1. Read `RUNBOOK.md` Phase 0.
2. `cd lumos_app && npm install && npm run dev`, then open http://localhost:5173 (demo data).
3. Upload `kaggle_notebooks/lumos_A_fetch.ipynb` to Kaggle and follow Phase 1.
4. Upload `kaggle_notebooks/lumos_B_train.ipynb` and follow Phase 2.
5. Open `lumos_app/` in Claude Code, paste the master prompt, then follow Phase 4.

Status: all tests pass on synthetic data. Nothing has yet run on real NASA data, the Blackwell GPU or real phones.
