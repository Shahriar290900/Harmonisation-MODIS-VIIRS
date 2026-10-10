# 06 — Ready-to-paste prompts for ChatGPT

Attach or paste the other files first (01 → 05, then 07). Replace anything in `[BRACKETS]`. Each prompt repeats the guardrails because chat tools forget.

**Standing guardrails to include in every request** (already embedded below): *Project = Parallax Fire (Team Lumos, Dhaka, NASA Space Apps 2026, Harmonization of MODIS and VIIRS Hot Spots). The app currently runs on synthetic demo data. Do not invent numbers, accuracy percentages, quotes, or statistics. Anything not in the provided files must be marked [ADD] or [MEASURED]. Never imply NASA endorsement. Never call a hotspot a confirmed wildfire.*

---------------------------------------------------------------------------
## P1 — Storyboard for the 240-second pitch video
```
You are a documentary-style video director and science communicator. Using ONLY the facts in the attached files (01–05, 07), create a shot-by-shot storyboard for a 4-minute (240 s) pitch video for "Parallax Fire", following NASA Space Apps' "240 Seconds of Glory": four 1-minute blocks WHO (hook in 45 s), WHY (empathy), WHAT (demo), HOW (impact and needs). For each shot give: timecode, VISUAL (what is on screen, using assets from the assets/ folder where relevant), VOICE-OVER (≤140 words per minute), ON-SCREEN TEXT, SOUND, and "SOURCE OF TRUTH" (which attached file supports the claim). Mark every outcome as EXPECTED (hypothesis) unless file 07 lists it as verified; leave [MEASURED: ...] and [ADD: ...] slots exactly as in 04_VIDEO_SCRIPTS.md. Do not invent numbers. Output a table.
```

## P2 — Voice-over polish (keep it honest)
```
Rewrite the voice-over lines from 04_VIDEO_SCRIPTS.md section A to sound natural, warm and confident for a spoken delivery by a Bangladeshi university student team. Keep every factual statement identical in meaning. Keep EXPECTED wording as hypotheses ("we expect...", "we are testing whether..."). Keep [MEASURED] and [ADD] slots. Give me a version for 240 s (≈560 words total) and a version for 30 s (≈75 words). Provide pronunciation notes for: MODIS (MOH-dis), VIIRS (VEE-ers), FIRMS, S-NPP, Aqua, Terra, Lumos.
```

## P3 — 30-second global-nominee video (exact timing)
```
Make a precise 30-second script and shot list using this structure: 0:00 introduce yourself (name + team), 0:02 lead us in (topic/passion), 0:05 name your solution (title + tagline), 0:10 describe your idea (images/prototype, user experience, how data and technology make it possible), 0:20 look into the future (what it could change), 0:30 end. Project: Parallax Fire. Use only facts in the attached files. No unmeasured claims. Provide 3 alternative taglines and 3 alternative opening hooks, each ≤ 12 words, honest and non-sensational.
```

## P4 — Image prompts for generated illustrations (clearly illustrative)
```
Create 8 image-generation prompts (for an image model) for illustrations in a science explainer video about two satellites with different pixel sizes seeing the same fire. Style: dark navy background (#0B1220), warm amber glow for fire points, cyan for the older coarse sensor, violet for the sharper sensor, teal dashed line for an estimate; clean, minimal, scientific-instrument look; no flames or disaster imagery; no text inside the image; no logos. Scenes: (1) one bright pixel splitting into a grid of smaller pixels, (2) two lenses overlapping over a map of Bangladesh, (3) a calendar grid with seasonal glow, (4) a seesaw levelled between 'older camera' and 'sharper camera', (5) a hatched 'missing data' tile magnified, (6) globe with three highlighted regions (Bangladesh, California, New South Wales), (7) a planner's desk with a laptop showing a calendar (illustration, no real data), (8) a pulled-back Earth with a satellite swath. Output each prompt with aspect ratio 16:9 and a negative-prompt line (no flames, no explosions, no NASA logo, no text, no fake charts).
```

## P5 — AI video-generation prompts (Sora/Runway/Pika style) for B-roll
```
Write 6 short (4–8 s) text-to-video prompts for abstract B-roll supporting a science pitch: slow rotating night-side globe with soft glowing amber points; a satellite swath sweeping across a coastline with a coarse square grid then a fine grid; a calendar grid lighting month by month; a line chart drawing itself with a gap that stays empty; a pull-back to three glowing regions; a phone showing a map and calendar (generic UI, no readable numbers). Camera moves, lighting, colour palette (navy/amber/cyan/violet/teal), no text, no logos, no fire-disaster footage, no people's faces. Provide a 'do not generate' list.
```

## P6 — Screen-recording script (what to click, in order)
```
From 03_APP_WALKTHROUGH_AND_SCREENS.md, produce a numbered click-by-click recording script (about 60 seconds of screen time) for the Parallax Fire web app: landing hero, scroll to 'Two cameras', open the calendar, switch area (Bangladesh → California → New South Wales), click a month, toggle chart series (VIIRS, Aqua, Estimate), show a missing month, Export CSV / Print brief. For each step give: what to click, what the viewer should notice, how many seconds, and the matching voice-over line. Include a checklist for recording quality (1080p, 100% zoom, hide bookmarks, DEMO tag visible).
```

## P7 — Slides (optional, for the live 4-minute pitch)
```
Create a 6-slide outline for a live 4-minute pitch of Parallax Fire (title; the camera-change problem; the idea in one picture; demo; honesty and evidence; future and needs). Max 20 words per slide, one visual per slide taken from the assets folder or described as illustrative. Add speaker notes with timings summing to 240 s. No invented numbers.
```

## P8 — Captions, description and hashtags
```
Write an honest post caption (≤ 280 characters), a 100-word video description, and 8 hashtags for Parallax Fire (NASA Space Apps 2026, Harmonization of MODIS and VIIRS Hot Spots). Credit: 'Data: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m S-NPP); boundaries: Natural Earth.' State that the demo data is synthetic until real data is processed. Do not use words like 'revolutionary', 'AI-powered', 'quantum', 'validated' or 'accurate'.
```

## P9 — Fact-check pass (always run last)
```
Act as a strict fact-checker. Compare the final script/storyboard against 07_FACTS_AND_GUARDRAILS.md. List every sentence that (a) states a number, (b) states a result or accuracy, (c) names a satellite, date or data product, or (d) could mislead about demo vs real data. For each: PASS, FIX (with corrected wording), or REMOVE. Flag any claim that is not in the attached files.
```

## P10 — After the real results arrive (fill the slots)
```
Here are our measured results: [PASTE the real metrics: per-region test MAE for the estimate vs raw Aqua count and vs the simple ratio baseline; interval coverage per region; release stage]. Update 04_VIDEO_SCRIPTS.md: replace each [MEASURED] slot with the exact number and the region and period it applies to; remove any EXPECTED sentence that the results contradict and replace it with a truthful one (a null or negative result is acceptable and should be stated plainly); keep wording modest ("on unseen 2023–24 data in [region]...").
```
