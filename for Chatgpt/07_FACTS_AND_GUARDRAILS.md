# 07 — Facts and guardrails (the source of truth for the video)

Status date: 10 Oct 2026. Source notes live in the repo under `lumos_app/docs/research/` and `lumos_app/docs/kaggle/`.

## A. Verified facts you may state
| Fact | Source / how verified |
|---|---|
| MODIS active-fire pixels are nominally ~1 km; VIIRS I-band fire pixels ~375 m; VIIRS can detect more small fires | NASA FIRMS documentation; project PRD (R2/R3) |
| MODIS fire data from 2000/2002 (Aqua since 3 July 2002; MODIS records from 1 Nov 2000); VIIRS S-NPP from 20 Jan 2012 | FIRMS archive page, MODIS field page (research notes) |
| A hotspot is not necessarily one wildfire (can be part of a larger fire, repeat observation, agricultural burning, other heat sources); clouds hide fires; zero detections ≠ no fire | NASA forum/FAQ summaries (PRD R3) |
| FIRMS yearly country files exist for 2001–2024 (MODIS) and 2012–2024 (VIIRS S-NPP) for Bangladesh, Australia, USA; 2025 files do not exist yet (HTTP 404) | HEAD requests on 10 Oct 2026 (R5_VERIFY) |
| Download size 2001–2024 ≈ Bangladesh 15 MB, USA 767 MB, Australia 1.76 GB | Content-Length sums (reviewer re-check) |
| Real Bangladesh MODIS yearly files: ≈3,251 rows (2012), 2,903 (2020), 1,876 (2024); the 2024 file is ≈1,706 Aqua + 170 Terra rows; (all FIRMS types, most type 0) | direct downloads (R5_VERIFY) — scale only, not a trend |
| MODIS omits most small fires vs a higher-resolution sensor (e.g. ASTER); a single global MODIS→VIIRS multiplier is not defensible | research note S055 |
| A published NE-Asia comparison (Fu et al. 2020, Remote Sensing 12:2870): in forests and low-biomass lands MODIS missed 65% and 83% of VIIRS fire pixels respectively | Crossref abstract (R5_VERIFY) |
| Burned-area products (MCD64A1, VNP64A1, GlobFire) depend on active-fire detections, so they are secondary checks, not independent truth | research notes S015/S017/S020 |
| NASA states S-NPP VIIRS science data delivery ceases 2 Nov 2026 | NASA Earthdata page (note S020) |
| Our design: 5 km equal-area cells × calendar month; train 2013–2020, choose model 2021–22, sealed test 2023–24, backcast 2003–2012; models B0 (ratio), B1 (Poisson regression), B2 (XGBoost), D1 (small neural net); 80% intervals; test opened once | project PRD/CONTRACT |
| The app: calendar, map, comparison chart, evidence drawer, CSV export, offline snapshot, three detailed regions (Bangladesh, California, New South Wales), persistent DEMO tag on synthetic data | the app itself (demo build) |
| App first view is about 0.5 MB compressed on the demo build; unit tests (446) and browser tests passed on synthetic data in a headless sandbox | project test logs (not real devices) |

## B. EXPECTED (hypotheses — say "we expect / we are testing")
- The apparent 2012 jump in raw counts largely reflects the change of instrument, and a calibration learned in the overlap years shrinks it.
- Calibration quality differs by region and season; we will report it per region, even if it is poor somewhere.
- The estimate may be switched off in places or periods outside the training support.
- If the calibration does not beat the simple baselines on the sealed test years, the app will release as an **observed comparison** (raw sensors side by side), not a validated calibration — and we will say so.

## C. Numbers still to be MEASURED (leave as slots until the real run)
| Slot | Where it will come from |
|---|---|
| Ratio of VIIRS to Aqua detections in the overlap years (global and per region) | Notebook B (B0 baseline) |
| Test-year error (MAE) of the estimate vs raw Aqua vs simple ratio, **per region** | Notebook B final test, per-region metrics |
| Interval coverage of the 80% band, **per region** | Notebook B final test |
| Release stage (observed comparison / validated calibration), **per region** | Notebook B manifest |
| How big the 2012 jump is in the raw record and after harmonization | app chart on real snapshot |
| Real-device performance (iOS/Android), frame rates, offline behaviour | owner's device tests |

## D. Never say / never show
- "Fires tripled/doubled since 2012" or any trend as fact.
- Any accuracy percentage, R², "AI-powered", "quantum-powered", "validated", "NASA-approved/endorsed".
- "Confirmed wildfires", "evacuation", "early warning", "predicts fires". (It describes past satellite-observed burning activity.)
- Real-looking disaster footage presented as our data; invented charts or counts; synthetic numbers without the DEMO/illustrative label.
- Zero as a stand-in for missing data.
- Team members' phone numbers/emails.

## E. Safe attribution lines
- "Data: NASA FIRMS — MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (S-NPP) active-fire detections."
- "Boundaries: Natural Earth (public domain)."
- "Built by Team Lumos, Dhaka, for NASA Space Apps Challenge 2026."

## F. Open items the team must confirm before publishing
- The real Space Apps submission deadline, video length limit and whether prebuilt work is allowed (our research pack says 7 Oct 2026; our PRD says the window starts 14 Nov 2026 — unresolved).
- The licence/source of the satellite render in `assets/aqua_terra_satellite_render.png`.
- Music/stock footage licences.
- Consent of anyone appearing on camera.
