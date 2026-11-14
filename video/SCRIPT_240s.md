# Parallax Fire: pitch video scripts (240 seconds and 30 seconds)

Built by `parallax_app/scripts/video/make_video.mjs` from the live site https://parallaxfire.netlify.app (the real app, real data; nothing simulated). Voice: Kokoro-82M (`af_heart`, Apache-2.0), generated locally one subtitle line at a time, so the burned-in subtitles and the `.srt` files follow the voice exactly. NASA Space Apps Challenge logo in the top-right corner throughout; team photos have their backgrounds removed (MODNet, run locally).

Structure, following the Space Apps Bangladesh "240 Seconds of Glory" examples: hook → meet the team (names and faces) → the problem and why it matters → the idea → "First / Next / Finally" walk through the app → the NASA data used → honest limits → impact and what comes next → sign-off "This is Team Lumos".

## 240-second video (3:11; limit 4:00)
| Time | On screen | Narration |
|---|---|---|
| 0:00–0:15 | Live Earth, real satellites and sun: whole Earth, then Bangladesh | Right now, five NASA satellites are circling the Earth, watching for fire. In the last day alone, they reported tens of thousands of hot spots. Two of these satellites have watched for more than twenty years. But they do not see fire the same way. |
| 0:15–0:36 | Meet the team: Lumos and Parallax Fire logos, six team photos and names | We are Team Lumos, from Dhaka: M Al Shahriar Hameem, our team lead, with Tuasin Taj Fiha, Afifa Asif, Md Abu Ammar, Kausar Ahmed and Sabiha Akter. For the NASA Space Apps Challenge, we built Parallax Fire, to turn two satellite records that disagree into one honest story of when a place burns. |
| 0:36–0:53 | Home: "How it works", pixel sizes of the two satellites | The older satellite, MODIS, sees the ground in pixels one kilometre wide. The sharper one, VIIRS, arrived in 2012 and sees pixels of 375 metres, so it catches smaller fires. In Bangladesh it records about five times as many. |
| 0:53–1:06 | Home: the 2012 jump chart | So when you join the two records, burning seems to leap in 2012. Imagine planning your district’s fire season from this chart. You would ask for help against a change that never happened on the ground. |
| 1:06–1:19 | Two satellites: the "On one scale" switch | Parallax Fire puts both on one scale. It learns how the two satellites relate, only from years when both were flying. Press one switch, and most of that jump disappears. The camera changed, not the fire. |
| 1:19–1:48 | Story: March 2024 in Bangladesh, step by step | Here is a real test. In March 2024, the sharper satellite counted 621 detections over Bangladesh. The older one counted 111. That month was never used to build our estimate. From the older count alone, we estimated about 1,093, likely between 571 and 1,529. The real 621 fell inside that range. |
| 1:48–2:02 | Calendar: Bangladesh, then California | First, pick a place. The calendar shows each year as a row and each month as a column. In Bangladesh, March and April hold about four in five detections, year after year. In California, the season moves to late summer. |
| 2:02–2:08 | Map: Bangladesh districts on a real map | Next, the map shows where it burned, district by district, on a real map. |
| 2:08–2:27 | Results: the 2023–2024 check per place | We checked the method on the years 2023 and 2024, which it had never seen. In Bangladesh it missed by 98 detections a month, where the raw older count misses by 627. In New South Wales it was not good enough, so there the app shows the raw records only, and says so. |
| 2:27–2:44 | Live Earth: California, NOAA-20 card | Finally, for today, the live Earth shows each fire satellite where it really is, with every hot spot it reported in the last twenty-four hours. It is all NASA data: FIRMS fire detections from MODIS and VIIRS, and GIBS satellite imagery, with public orbit records. |
| 2:44–3:01 | Live Earth: whole Earth (impact and next steps) | A planner can see the real burning season before deciding when to watch closely. A researcher can compare two decades without mistaking a new camera for new fire. Looking ahead, we want more regions, the newer NOAA satellites, a Bangla interface, and partners to test it with. |
| 3:01–3:11 | End card: logos, link, team, data credits | Parallax Fire. Same fires, two cameras, one honest record. This is Team Lumos. Thank you. |

## 30-second video (0:28.9): the Project Demo for global judging
Follows the Space Apps "30 Seconds of Glory" guide: introduce yourself (0:00), lead us in (0:02), name your solution (0:05), describe your idea (0:10), look into the future (0:20). Captured frame by frame on a paused page clock (a smooth 30 fps), with crossfades, highlighted subtitles and music ducked under the voice. No photos of people.

| Time | Beat | On screen | Narration |
|---|---|---|---|
| 0:00 | Introduce | Team Lumos logo and all six names over the live Earth | We're Team Lumos, from Dhaka. |
| 0:02 | Lead in | "2012 ×5" title; camera flies to Bangladesh | In 2012, fire counts jumped five-fold. |
| 0:05 | Name | Parallax Fire logo and tagline on the music drop, then the 2012 jump chart | Meet Parallax Fire. That jump? Mostly a sharper camera, not more fire. |
| 0:10 | Describe | "On one scale" switch pressed | Flip one switch: 25 years, one fair scale. |
| 0:14 | Describe | Bangladesh districts, tilted push-in | Every district, every season, mapped. |
| 0:17 | Describe | Live Earth: pull back to today's NASA hot spots | Plus today's NASA hot spots, live. |
| 0:20 | Future | Globe sweeps from California to New South Wales, "What's next" | Next: every country, newer satellites, a Bangla app: real fire, not a new camera. |
| 0:25 | Close | End card: logo, link, team names, challenge, credits | Parallax Fire, by Team Lumos. |

- Voice: AI-generated (Kokoro-82M, voice `af_bella`). This is stated on the end card and in the file metadata, as the Space Apps rules require for AI audio.
- Music: "Voltaic" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/. The track starts 10.25 s in, so its drop lands on the 0:05 name reveal; the music is ducked under the voice. The file is kept locally in `video/assets/music/` (not committed).
- Space Apps logo: the original, unmodified artwork on a white badge (NASA branding may not be altered).
- "Five-fold": VIIRS ÷ Aqua MODIS detections in Bangladesh, complete months 2013–2024 = 4.98 (the app's 2012 chart shows the joined record leaping ×5.3).

Rebuild: `FFMPEG=<ffmpeg> node scripts/video/make_video.mjs <work> --short --audio=<narration dir> --music=video/assets/music/Voltaic.mp3 --music-start=10.25`

## Where every spoken fact comes from
| Statement | Source |
|---|---|
| March and April hold about four in five detections in Bangladesh | Snapshot `activity/BGD/2013–2024`: 83 % of the sharper satellite's detections fall in March (36 %) and April (47 %) |
| VIIRS records about five times as many detections as MODIS in Bangladesh | Same files, complete months 2013–2024: VIIRS ÷ Aqua MODIS = 4.98 |
| California's season is late summer | `activity/USA-CA`: August 37 %, September 31 % |
| Learns from 2013–2020, method chosen on 2021–2022, checked on 2023–2024 | `metrics.json` → `split_manifest` |
| Bangladesh: estimate missed by 98 a month on average; old satellite's count as it is misses by 627 | `metrics.json` → `release.regions.BGD.test_aoi_month_mae`: selected 97.5, B0_identity 626.9 (24 months; simple monthly ratio 108.6) |
| New South Wales: closer than the simple rules, but the likely range was too wide, so raw comparison only | `release.regions.AUS-NSW`: 375 vs 4,087 and 1,640; likely range covered 100 % of 24 months against an 80 % aim (must be within ±10 points) |
| MODIS pixels about 1 km, VIIRS 375 m; VIIRS from 2012; MODIS for more than twenty years | NASA FIRMS documentation; snapshot years 2001–2025 |
| A hot spot is not always a wildfire; cloud hides fires | NASA FIRMS FAQ (see `docs/SOURCE_CHECK.md`) |
| Live page: last 24 hours, per satellite, satellite pictures, satellite positions | `docs/LIVE_SOURCES.md` (NASA FIRMS, NASA GIBS, CelesTrak) |
| The Suomi NPP data stream ends | NASA Earthdata notice: S-NPP VIIRS science data delivery ceases 2 Nov 2026 (`docs/research/FINDINGS.md`) |

| March 2024, Bangladesh: sharper satellite 621, older 111, estimate about 1,093 (likely 571–1,529), real count inside the range | Snapshot `parallax-20261010T190934Z-ce88f489`, month 2024-03 for BGD (shown step by step on the Story page); 2024 is a test year, never used for training |
| "Tens of thousands of hot spots in the last day" | Live NASA FIRMS world feed at recording time (the count is on screen in the first shot) |

## Not claimed in the video
No forecast or prediction, no accuracy percentage, no claim of testing on real phones or with real planners. "Imagine planning…" is a stated hypothetical. The future items are plans.

## Team
M Al Shahriar Hameem (team lead) · Tuasin Taj Fiha · Afifa Asif · Md Abu Ammar · Kausar Ahmed · Sabiha Akter. The photos and the Space Apps logo are kept locally in `video/assets/` (not committed).

## Rebuilding
Narration: `node gen.mjs <make_video.mjs> <dir> long|short af_heart` (kokoro-js). Video: `FFMPEG=<ffmpeg> node scripts/video/make_video.mjs <work dir> [--short] --audio=<dir>`. To use a team member's own voice, record the lines in `video/VOICE_LINES.md` as `sNN.m4a` and pass that folder with `--audio`.
