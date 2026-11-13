# Parallax Fire — improvement round (13 Nov 2026)

Goal: make the core idea obvious in one gesture and tell one real story, so the app reads as a product, not a dashboard. Binding: `CLAUDE.md`, `docs/REVAMP_SPEC.md` (plain language, real data only, honesty rules), `docs/UI_DESIGN_BRIEF.md`. Check: `node scripts/goals/goal_story.mjs <shots>` plus the existing `goal_revamp.mjs` (add `--routes=calendar,map,sensors,method,data,story`).

## 1. The switch: "Joined as recorded" / "On one scale"
- One clear two-state switch (`<button data-jump-toggle aria-pressed>` or a two-option segmented control whose root carries `data-jump-toggle`) on the **Two satellites** page and on the **Home** page's 2012 jump chart (`#jump`).
- "Joined as recorded" (`data-mode="raw"` on the chart root `[data-chart="compare"]` / the landing jump chart): the older satellite's counts before 2012 followed by the sharper satellite's counts from 2012 — the fake jump.
- "On one scale" (`data-mode="onescale"`): the estimate on the sharper satellite's scale before 2012 (with its likely range) joined to the sharper satellite's counts from 2012 — the jump mostly disappears.
- Animated transition between the two (respect reduced motion), one sentence under the chart that changes with the mode, e.g. "As recorded, burning seems to jump in 2012. On one scale, most of that jump disappears: the camera changed." Use the real series; never smooth or invent values; missing stays a gap.
- Default on Two satellites: keep the current detailed view available (the switch is an extra, prominent control); default on Home: "Joined as recorded", with an inviting "Put them on one scale" call to action.

## 2. Story walkthrough: `#/story` — "March 2024 in Bangladesh"
Route `story`, nav label "Story", placed right after Home in the rail; on phones under More. `<main data-page="story">`, one `<h1>`, steps `[data-story-step]` (≥ 4), Back / Next buttons (`[data-story-next]`, disabled on the last step), step dots, keyboard arrows, deep link `#/story?step=N`. Each step = one short heading + 1–3 plain sentences + one real visual (reuse the existing components: Calendar, CompareChart, MapPanel, or a small chart) — no stock images, no illustrations unless labelled.
Every number is read from the snapshot at runtime (`useWorkspace()` / data api): never type a number into the copy.
1. **March is Bangladesh's fire month.** Calendar for Bangladesh with March and April highlighted; share of the sharper satellite's detections in March + April across 2013–2024 (computed: currently ~83%).
2. **Two cameras, two counts.** March 2024: sharper satellite 621, older satellite 111 (computed). "Same month, same country, very different numbers. Neither is wrong: the sharper camera sees smaller fires."
3. **The check.** March 2024 was never used to build the estimate (it is in the "checked on" years). From the older satellite's count alone, the estimate said about 1,093, likely between 571 and 1,529. The sharper satellite actually saw 621: inside the likely range (state honestly whether it is inside or outside, computed). Show the compare chart zoomed or the month highlighted.
4. **A quiet March.** March 2024 was unusually low for a March (anomaly flag "low", rank vs the other Marches, computed). Map of March 2024 by district or 5 km squares.
5. **Your turn.** Buttons: open the Calendar for your place, see Today (Live), How it works. Keep this step real: no claims beyond the data.

## 3. Quick entry on Home
In the first screen of the landing (no scrolling at 1440×760 and 390×844): a compact block `[data-quick-entry]` with "Pick a place" (Bangladesh, California, New South Wales → open the Calendar for it) plus "Watch the story" (→ `#/story`) and "See today" (→ `#/live`). The 3D scroll story stays below for those who scroll.

## 4. Uncertainty in words
Where an estimate is shown for a month (Calendar's selected-month summary / evidence, Map legend line, Story): "Estimate: about 3,440 detections, likely between 2,103 and 5,623 (8 in 10 chance)". Numbers formatted with thousands separators (en-US), rounded to whole detections.

## 5. Display styles behind a small menu
Map and Live: the four looks move into a compact "Display style" menu button `[data-looks-menu]` (popover/disclosure; keyboard and touch accessible, Escape closes). The look buttons keep `data-look` and their behaviour, but are not visible until the menu is opened. The "display style only — the data is unchanged" caption stays while a look other than normal is active.

## 6. Small fixes
- Phone (390×844): on the Calendar the selected month must be scrolled into view above the fixed bottom bar on load.
- Home: replace remaining jargon in visible text (e.g. "Harmonized estimate · 80% band" legend if any remains, "Raw Aqua MODIS / Raw S-NPP VIIRS", "×5.3 VIIRS ÷ MODIS hotspots" → plain wording with the satellite names in brackets at most).
