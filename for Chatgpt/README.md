# For ChatGPT — video-making pack for "Parallax Fire"

Team **Lumos** (Dhaka) · NASA Space Apps Challenge 2026 · Challenge: *Harmonization of MODIS and VIIRS Hot Spots*

**Purpose.** Give ChatGPT (or any video/creative tool) everything it needs to plan, script and visualise the project video(s): what the app is, how NASA data is used, what the screens look like, the creative direction, the pitch timing rules, and the guardrails that keep the video honest.

## What the video must be (from the Space Apps pitch guides)
- **240 seconds of Glory** (local judging, 4 minutes): four 1-minute blocks — **WHO** (attention and authenticity; first 45 s grab attention), **WHY** (empathy for the problem), **WHAT** (the big idea, demo/prototype), **HOW** (impact and your needs, look to the future).
- **30 seconds of Glory** (global nominee video): 0:00 introduce yourself · 0:02 lead us in · 0:05 name your solution (title + tagline) · 0:10 describe your idea (images/prototype, user experience, how data and technology make it possible) · 0:20 look into the future · 0:30 end.

## How to use this folder (give ChatGPT the files in this order)
1. `01_PROJECT_BRIEF.md` — the project in plain words.
2. `02_HOW_THE_DATA_IS_USED.md` — the NASA data and the method, explained visually.
3. `03_APP_WALKTHROUGH_AND_SCREENS.md` — what the app looks like and what to show on screen (see `assets/`).
4. `04_VIDEO_SCRIPTS.md` — ready scripts for 240 s, 60 s and 30 s with shot lists.
5. `05_CREATIVE_DIRECTION.md` — look, motion, sound, metaphors, what to avoid.
6. `06_CHATGPT_PROMPTS.md` — copy-paste prompts (storyboard, voice-over, image/video generation, captions, thumbnail).
7. `07_FACTS_AND_GUARDRAILS.md` — verified facts, "expected" wording, a table of numbers still to be measured, and things never to say.

## Important status note (read before making the video)
- The app currently shows **synthetic demo data** (it carries a persistent red **DEMO DATA** tag). The real NASA data runs have **not** been done yet. Real numbers will be filled in after the Kaggle runs.
- Until then, every outcome in the scripts is written as an **expectation / hypothesis** (marked `EXPECTED`) with `[MEASURED: …]` slots for real values. Do not turn expectations into measured claims. A video that is honest about this is stronger with judges, not weaker.
- The project name is **Parallax Fire**. The app screenshots in `assets/` still say "Lumos Fire Calendar" (the earlier working name); a rename in the app is pending. Do not redraw the UI with invented numbers.
- Do not include personal contact details (phones, emails) in the video or captions.

## assets/
`desktop-landing-hero.png`, `desktop-landing-how.png`, `desktop-landing-gallery.png`, `desktop-workspace.png`, `mobile-landing-*.png`, `mobile-workspace.png` — real screenshots of the demo app (synthetic data, labelled DEMO). `aqua_terra_satellite_render.png` — transparent satellite render supplied by the team (use for the "two cameras" motif; check its source/licence before final publication).
