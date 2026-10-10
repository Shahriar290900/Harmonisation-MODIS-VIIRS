# 03 — App walkthrough and screens (what to show on screen)

All screenshots are in `assets/`. They show the **demo build with synthetic data** and the old working name "Lumos Fire Calendar". They are real renderings of the real UI — use them as visual reference, screen recordings or background plates. Keep the red **DEMO DATA** tag visible whenever demo numbers are on screen.

## Two routes
1. **Landing page** (cinematic, scroll story) — for the "WHO / WHY" parts of the video.
2. **Workspace** (the working tool) — for the "WHAT" demo.

## Landing page (see `desktop-landing-hero.png`, `desktop-landing-how.png`, `desktop-landing-gallery.png`, and the mobile versions)
- **Hero:** a slowly turning 3D globe on a deep-navy night sky with glowing hotspot points and a ring around Bangladesh. Headline (current copy): **"Two satellites. One honest fire record."** with "fire" in amber. Sub-copy: MODIS has watched since 2002; the sharper VIIRS joined in 2012 and "the record jumped, not because more land burned, but because the new camera sees smaller fires." Buttons: **Open the fire calendar**, **How harmonization works**. A legend: Aqua MODIS (1 km, cyan), S-NPP VIIRS (375 m, violet), Harmonized (VIIRS-scale estimate, teal dashed). A small card: "LIVE FROM THE SNAPSHOT · DEMO DATA · SYNTHETIC FIXTURE".
- **"Two cameras" explainer:** a 3D scene contrasting the coarse 1 km camera frame with the sharp 375 m frame over the same ground (the frames are labelled "Illustrative fires – not real data").
- **"The fire record jumps" chart:** the 2012 discontinuity explained as an artefact of the instrument change (the factor drawn is illustrative).
- **"What this can — and cannot — claim"** card: the honesty section.
- **Region gallery:** cards for Bangladesh, divisions, New South Wales, California with silhouettes and sparklines; shader-style page transition into the workspace.
- **Index list** and **footer** ("Made by Team Lumos, Dhaka", data and credits, "This snapshot" card).
- Fallbacks: no-WebGL and reduced-motion versions exist.

## Workspace (see `desktop-workspace.png`, `mobile-workspace.png`)
Layout (desktop): top bar (area picker, year range, online/offline snapshot status, release-stage tag, "What is harmonization?", "Models") · **Map** (left top) · **Compare sensors** chart (left bottom) · **Burning calendar** (right) · **Evidence drawer** for the selected month (bottom).
- **Burning calendar:** years as rows, months as columns. Each cell shows a VIIRS-scale value on a log colour scale (yellow→red). Symbols: observed, estimated, partial month, missing (hatched), unsupported, unavailable. A **split** column labels years as backcast / train / val / test. A **Replay** button animates the calendar through time.
- **Map:** 5 km cells for the selected month with a colour scale ("VIIRS detections / 5 km cell"); tabs: Headline · VIIRS · Aqua · Estimate · Table. Attribution "Natural Earth · NASA FIRMS".
- **Compare sensors chart:** toggle series (VIIRS raw, Aqua raw, Estimate with 80% band, Terra, static sources), log/linear scale, shaded model splits (backcast / train / val / test), gaps where data is missing, hollow points for partial months.
- **Evidence drawer** (e.g. "March 2024 · Bangladesh"): tags such as OBSERVED (VIIRS), TEST SPLIT, UNUSUALLY LOW, DEMO; a plain-English sentence ("In Mar 2024 VIIRS recorded 252 detections, about 3.2× Aqua's 78; this is typical of the sensor gap, not necessarily more fire."), buttons **Export CSV** and **Print brief**, and an "All evidence" expander with sources and provenance.
- **Harmonize panel / Models:** recompute with a chosen model in the browser; shows which model and split, and a "Fallback in use" notice when a region has no own ratios.
- **Other:** keyboard navigation on the calendar, accessible table fallback, install as an app, offline cached areas, deep links like `#aoi=BGD&y=2016&m=3`.

## Suggested screen-recording shots (for the video)
1. Landing hero → slow scroll through "Two cameras" (the aha moment).
2. Click **Open the fire calendar** → workspace with Bangladesh.
3. Hover/click a calendar month → map, chart and evidence update together (the "linked" feel).
4. Toggle chart series: VIIRS only → add Aqua (the jump at 2012) → add the Estimate band (explain it is learned from overlap years and drawn separately).
5. Switch area: Bangladesh → California → New South Wales.
6. Show a **missing** (hatched) month and say "never zero".
7. **Export CSV** / **Print brief** (portable evidence).
8. Phone view + installed/offline (airplane-mode toggle) — only record this on a real device if the team verified it; otherwise use the emulated mobile screenshot and say so.

## Recording tips
- Record at 1920×1080 or higher, 60 fps if possible, browser zoom 100%, dark theme as is. Hide bookmarks and tabs.
- Keep the DEMO tag in frame until real data replaces the snapshot; after the real run, re-record with the real snapshot and remove "DEMO" only if the data is real (the app does this automatically).
