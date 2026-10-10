# Claude Code prompts (from the runbook)

Paste these into Claude Code with the `lumos_app` folder open, in order. Each is tagged with its runbook step. Start every new session with the master prompt (`CLAUDE_CODE_MASTER_PROMPT.md`). The project covers three regions (Bangladesh, Australia with NSW, United States with California); the data is synthetic until you import a real bundle.


## Phase 4 — Load real data into the app with Claude Code

**4.1.3**
```
Read CLAUDE_CODE_MASTER_PROMPT.md, PRD.md, CONTRACT.md (including sections 7 to 10) and STATUS.md. Summarise the current state in 10 lines and wait.
```

**4.2.1**
```
Run `node scripts/import_bundle.mjs lumos_app_bundle.zip`. Show me the output.
```

**4.2.3**
If it refuses because the snapshot exists, ask it to re-run with `--replace`.

**4.2.4**
```
Keep the synthetic snapshot available for tests but make the real snapshot the default.
```

**4.2.5**
```
Commit with message 'import real snapshot <id>'.
```

**4.4.1**
```
Run npm test, npm run build and npm run e2e. Fix only tests that assumed the synthetic fixture, keep a fixture project for them, and report anything else as a bug.
```

**4.4.3**
```
Measure first-load transfer for the landing and the workspace on the real snapshot, and the largest data file. Report against PRD §8 PERF-01.
```

**4.4.4**
If any cells file exceeds 15 MB, ask it to raise the cutoff in Notebook B 2.14 and note it.

**4.5.1**
```
Search the landing and explainer copy for wording that only made sense with synthetic data and update it from the real manifest and metrics. Never hard-code numbers.
```

**4.5.2**
If release stage is `observed_comparison`, ask it to make sure the hero and honesty section say so plainly.


## Phase 5 — Review loops and polish

**5.1.1**
```
Fix review_exp/RESOLUTION.md open item L3: the landing route should not download the workspace chunk until the user heads to the workspace (prefetch on CTA hover is fine).
```

**5.1.2**
```
Fix open item L4: re-read layout breakpoints on resize and orientation change.
```

**5.1.3**
```
Make notebooks/tests/test_notebook_A.py run from the repo layout and add the fixture generator path.
```

**5.2.1**
```
Spawn three subagents in parallel, read-only: a code reviewer (bugs, honesty, a11y), a watchdog (hung processes, render loops, hangs) and an e2e verifier (desktop, tablet, 360 px mobile). Each writes a report in review_real/.
```

**5.2.2**
```
Also start a monitor that checks every 2 minutes whether each subagent is still writing files, and flags any silent for 10 minutes.
```

**5.3.1**
```
Take screenshots at 1440, 820 and 390 px of hero, story, gallery, index, workspace and drawer, and critique them like an Awwwards juror. List the top 5 improvements.
```


## Phase 6 — Deploy free and install on every device

**6.1.2**
```
Check that no secrets, MAP_KEYs, registration screenshots or raw FIRMS archives are in the repo or dist. Report file sizes over 10 MB.
```

**6.1.3**
```
Add the GitHub remote <your repo URL> and push main.
```

**6.1.4**
```
Add a GitHub Actions workflow that builds with BASE_PATH=/lumos-fire-calendar/ and deploys dist to GitHub Pages.
```

**6.2.7**
```
Run the e2e suite against the live URL (read-only).
```


## Phase 7 — Space Apps submission and pitch

**7.4.1**
Paste the live URL, the GitHub link, the video link and the project text.
