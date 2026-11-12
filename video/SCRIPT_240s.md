# Parallax Fire — pitch video script (240 seconds)

Built by `parallax_app/scripts/video/make_video.mjs` from the live site https://parallaxfire.netlify.app (real app, real data; nothing simulated). Voice: macOS on-device narrator "Daniel". Captions are burned in; a separate `.srt` is alongside the video.

Total length: **3:38** (218 s; limit 240 s). Structure follows the Space Apps "240 Seconds of Glory" guide: WHO (attention), WHY (the problem), WHAT (the idea and demo), HOW (impact and what we need).

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:15 | Home: two cameras, one Earth | Every March, satellites light up with fire detections over Bangladesh. Two NASA satellites watch the same fires. The older one sees one hot pixel. The sharper one sees several. So which count do you trust? |
| 0:15–0:29 | Team Lumos · Dhaka, Bangladesh · NASA Space Apps Challenge 2026 | We are Team Lumos, from Dhaka. We built Parallax Fire for the NASA Space Apps Challenge 2026, to turn two satellite records that disagree into one honest story of when a place burns. |
| 0:29–0:56 | The problem · Bangladesh, real NASA FIRMS detections | Here is the problem. MODIS has recorded fires for more than twenty years, in pixels one kilometre wide. VIIRS arrived in 2012 with pixels of 375 metres, so it catches smaller fires. In Bangladesh it records about five times as many detections. Join the two records, and burning seems to jump in 2012. But mostly, the camera changed. |
| 0:56–1:21 | Why it matters | Imagine you plan for the burning season in your district. You compare 2005 with 2020, see five times the fire, and ask for five times the resources, for a change that never happened on the ground. And a hot spot is not always a wildfire. It can be crop burning, or one fire seen twice. Cloud hides fires too, so no detection never means no fire. |
| 1:21–1:42 | Step 1 · Calendar: pick a place | So here is how you use Parallax Fire. Open the calendar and pick your place. Each row is a year, each column a month, and the colour shows how much burning the satellites recorded. In Bangladesh, March and April hold about four in five detections, year after year. Choose California, and the season moves to late summer. |
| 1:42–1:54 | Step 2 · Map: see where | Pick a month, and the map shows where it burned, on a real map, by five kilometre square or by district. Heat view and night vision change only how the map looks, never the data. |
| 1:54–2:22 | Step 3 · Two satellites, one scale | Open Two satellites to see both records side by side, with our estimate of what the sharper satellite would have counted in the earlier years. The estimate learns only from years when both satellites flew, and we checked it on 2023 and 2024, years it had never seen. In Bangladesh it missed by 98 detections a month on average. Taking the old satellite’s count as it is misses by 627. |
| 2:22–2:40 | Honest limits | We also show where it falls short. In New South Wales the estimate was closer than the simple rules, but its likely range was too wide to pass our check, so there the app shows the raw comparison only. Missing months stay missing. Every estimate is labelled as an estimate. |
| 2:40–2:53 | Step 4 · Live: today, from NASA FIRMS | And for today, the Live page shows the last twenty-four hours of NASA fire detections on a real globe, counted per satellite, with fresh satellite pictures and the position of each fire satellite right now. |
| 2:53–3:12 | Impact | What does this change? A planner can see the real burning season before deciding when to watch more closely. A researcher can compare two decades without mistaking a new camera for a new fire. A teacher can show students why data needs care. And every number can be traced to its source and downloaded. |
| 3:12–3:28 | What comes next | Next, we want to add more regions, follow the newer NOAA satellites as the Suomi NPP data stream ends, add a Bangla interface, and test it with the people who plan for burning seasons. For that, we need partners and field feedback. |
| 3:28–3:38 | Title and credits card | Parallax Fire. Same fires, two cameras, one honest record. Thank you. |

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

## Not claimed in the video
No forecast or prediction, no accuracy percentage, no claim of testing on real phones or with real planners. "Imagine you plan…" is a stated hypothetical. The future items are plans.

## Re-recording the voice
The narration is an on-device synthetic voice. To use a team member's voice, record the Narration column in order (the timings above are the targets) and replace the audio track, or ask for a rebuild with a different voice (`--voice=Samantha`, `--rate=172`).
