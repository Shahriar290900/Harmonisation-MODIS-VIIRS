# 04 — Video scripts (240 s · 60 s · 30 s)

**How to read the tags.** `EXPECTED` = what we expect / are testing; say it as a hypothesis. `[MEASURED: …]` = a slot to fill with a real number after the Kaggle runs; **delete the sentence if the number is not available or does not support it.** `[ADD: …]` = a personal/local detail only the team can supply (true story, real name, real place). `VISUAL` = what is on screen. `VO` = voice-over.

Pace: ~140 words per minute for voice-over. Speak calmly; pauses are good.

---------------------------------------------------------------------------
## A. 240 SECONDS OF GLORY (4 minutes, 4 blocks × 60 s)

### 0:00–1:00 — WHO (attention & authenticity). First 45 s must grab attention; first 15 s circular/curious.
- **0:00–0:15 hook** — VISUAL: black screen; a single bright pixel appears over Bangladesh on a dark globe; it splits into a coarse square (1 km) and then many small squares (375 m). VO: *"Two satellites looked at the same fire. One saw one dot. The other saw nine. Which one is right?"* (Do NOT claim "nine" as data — it is a metaphor; keep the on-screen text "illustrative".)
- **0:15–0:45 story** — VO: *"We are Team Lumos from Dhaka. [ADD: one true sentence about why fire/smoke matters to your team or place.] When we looked at NASA's fire record, we noticed something strange: around 2012 the number of fires suddenly jumped. Not because the world caught fire — because NASA's camera got sharper."*
- **0:45–1:00 who we are** — VISUAL: team name card, then the project title: **Parallax Fire** + tagline *"Same fires. Two cameras. One honest record."* VO: *"We built Parallax Fire to tell the difference between fire changing and the camera changing."*

### 1:00–2:00 — WHY (empathy for the problem). Short story or killer data point; if it takes more than 60 s you are too long.
- VISUAL: split screen — left: a planner's desk in a district office (illustration); right: the raw MODIS+VIIRS chart with the 2012 step (use the app's explainer chart, labelled illustrative).
- VO: *"Imagine you plan fire-season monitoring for a district. You open the last twenty years of satellite records and see fires triple after 2012. Do you ask for triple the budget? [ADD: who is affected in Bangladesh — e.g., local planners, farmers, health officers — only what the team can support.] The honest answer is: you cannot tell, unless someone puts both satellites on the same scale."*
- VO: *"MODIS pixels are about one kilometre wide. VIIRS pixels are 375 metres. The sharper camera sees smaller fires, so raw counts are not comparable across the switch. And a hotspot is not always a wildfire — it may be agricultural burning, or the same fire seen twice. Clouds hide fires. Zero detections is not 'no fire'."*
- CLOSE: *"People make decisions on this record. They deserve to know how much to trust it."*

### 2:00–3:00 — WHAT (the big idea + demo). Show how it works; evidence; prototype.
- VISUAL: screen recording of the app (see file 03). Beats:
  1. *"This is Parallax Fire."* Landing globe → **Open the fire calendar**.
  2. *"Pick a place — Bangladesh, California, New South Wales."* Switch the area picker.
  3. *"The calendar shows each year as a row and each month as a column. Click a month and the map, chart and evidence update together."*
  4. *"Here is raw MODIS and raw VIIRS. See the step in 2012."* Toggle series.
  5. *"We learn, from the years both satellites flew, how VIIRS counts relate to MODIS — and translate the older years to a VIIRS scale. It's drawn separately, with an 80% uncertainty band. We never hide that it is an estimate."* Show the teal band.
  6. *"If data is missing, we show it as missing — never as zero."* Hatched cell.
  7. *"Every number can be exported with its sources."* Export CSV / brief.
- On-screen label while demo data is shown: **"Demo data — real NASA data run in progress"** (edit to match the true status when recorded).
- VO about method (15 s): *"We use NASA FIRMS: MODIS from Aqua and Terra, and VIIRS from S-NPP. We train on 2013 to 2020, choose the model on 2021–22, and keep 2023–24 sealed until the end, so we're not grading our own homework."*

### 3:00–4:00 — HOW (impact & our needs; look to the future)
- **3:00–3:25 expected outcome (hypothesis wording)** — VO: *"What do we expect? That the 2012 jump shrinks once both cameras are on one scale, that the calendar reveals the burning seasons clearly, and that the method works better in some places than others — which we report region by region, whichever way it comes out. [MEASURED: one sentence with the real held-out result, e.g. 'On unseen 2023–24 data, the estimate's error was X compared with Y for the raw MODIS count in Bangladesh.' — delete if not measured.] [MEASURED: 'The 80% band covered Z% of months.' — delete if not measured.]"*
- **3:25–3:45 impact** — VO: *"This helps planners decide when to watch more closely, researchers see long-term change without a camera artefact, and students understand why satellite records need care. It runs on a phone, works offline for areas you've opened, and exports its evidence."*
- **3:45–4:00 needs + vision** — VO: *"To go further we need partners to test with real planners, independent validation data, and compute to extend to more regions and NOAA-20/21 as S-NPP's delivery ends. Parallax Fire: same fires, two cameras, one honest record. Thank you."* VISUAL: globe pulls back with three highlighted regions; end card with project name, team name, NASA Space Apps Bangladesh/Dhaka.

---------------------------------------------------------------------------
## B. 60-SECOND VERSION (social / backup)
0:00 hook (the 1-dot-vs-many-dots animation) · 0:10 problem (2012 jump) · 0:22 solution (app demo montage: calendar → chart → estimate band) · 0:42 honesty line (*"missing is never zero; estimates are always labelled"*) · 0:50 future + title card.

---------------------------------------------------------------------------
## C. 30 SECONDS OF GLORY (global nominee video; exact structure from the guide)
| Time | Beat (guide) | VO (≈ 75 words total) | VISUAL |
|---|---|---|---|
| 0:00–0:02 | Introduce yourself | *"We're Team Lumos from Dhaka."* | Team card over the dark globe |
| 0:02–0:05 | Lead us in | *"Satellites say fires jumped in 2012. Did they?"* | The 2012 step in the chart |
| 0:05–0:10 | Name your solution (title + tagline) | *"Parallax Fire: same fires, two cameras, one honest record."* | Title animation with the tagline |
| 0:10–0:20 | Describe your idea | *"We put NASA's MODIS and VIIRS on one fair scale — a calendar of burning seasons for Bangladesh, California and Australia, with clear labels for what's observed and what's estimated."* | Fast screen recording: calendar → click month → chart toggle → estimate band → CSV |
| 0:20–0:30 | Look into the future | *"Next: more regions, independent checks, and a Bangla interface — so anyone can tell fire change from camera change."* | Globe pulls back, three regions glow, end card |

Rules: nothing in the 30 s version may state a measured result unless it is measured; if you have one verified number after the real run, add it to 0:10–0:20 in place of a feature (e.g., *"…the estimate's error on unseen 2023–24 data was [MEASURED]…"*).

---------------------------------------------------------------------------
## D. Caption / description text for posting (honest)
*"Parallax Fire — a NASA Space Apps 2026 project by Team Lumos (Dhaka) for 'Harmonization of MODIS and VIIRS Hot Spots'. It places NASA's MODIS and VIIRS fire detections on one clearly labelled scale and shows burning seasons for Bangladesh, California and New South Wales. Data: NASA FIRMS (MODIS Collection 6.1; VIIRS 375 m S-NPP); boundaries: Natural Earth. Demo data is labelled."*
