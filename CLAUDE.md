# Parallax Fire — working rules for agents

Product: **Parallax Fire** by Team Lumos (created by M Al Shahriar Hameem). React 18 + Vite 6 + TypeScript PWA in `parallax_app/apps/web`; NASA MODIS/VIIRS fire hotspots harmonized into a burning calendar. Live at https://parallaxfire.netlify.app. UI rules: `parallax_app/docs/UI_DESIGN_BRIEF.md`.

Node is not on PATH in tool shells: `export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.

## Method (distilled from obra/superpowers, multica-ai/andrej-karpathy-skills, mattpocock/skills, dietrichgebert/ponytail — all MIT)
1. **Think before coding.** State assumptions. If a simpler approach exists, take it.
2. **Simplicity first.** Minimum code that solves the task. No speculative options, abstractions or error handling for impossible cases.
3. **Surgical changes.** Touch only what the task needs; match the surrounding style; clean up only what your change orphaned.
4. **Goal-driven.** Turn the task into a check you can run; plan as `step → verify`; loop until the check passes.
5. **Evidence before claims.** Never say "done", "fixed" or "passes" without running the command in this turn and reading its output. Report exact counts and failures.
6. **Review in two passes:** does it meet the spec, then is the code sound.

## Honesty rules (product)
Missing data is never shown as zero. Estimates are always labelled and drawn separately from observations. A hotspot is not a confirmed wildfire. Illustrative visuals say "illustrative". No accuracy claims beyond what `metrics.json` holds, per region. Synthetic snapshots keep the DEMO tag.

## Safety
No secrets in the repo (tokens live outside it). Never stage `Screenshot*.png`. No `git add -A` without reading `git status`. Do not install plugins or global packages. External requests: one at a time, a few seconds apart, one retry at most.
