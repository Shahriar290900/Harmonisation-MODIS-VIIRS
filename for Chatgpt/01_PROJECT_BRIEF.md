# 01 — Project brief: Parallax Fire

## One line
**Parallax Fire** turns NASA satellite fire hotspots into a burning-season calendar for any place — and shows honestly what is real change in fire and what is just a change of camera.

## Tagline options (pick one; all are honest)
- *Same fires. Two cameras. One honest record.* (closest to the app's current hero: "Two satellites. One honest fire record.")
- *See what changed — fire, or the camera?*
- *Parallax: the same fire, seen from two satellites.*

## Why the name "Parallax"
Parallax is the apparent shift of an object when you look at it from two different positions. Two satellites look at the same Earth from two different "positions" (different sensors, different pixel sizes, different overpass times), so the fire record appears to shift when the instrument changes. Our job is to separate the apparent shift from the real one.

## The problem (explain like to a 12-year-old)
- Two NASA instruments watch Earth for heat from fires: **MODIS** (on the Terra and Aqua satellites; each pixel is about **1 km** wide) and **VIIRS** (newer; each pixel is about **375 m** wide).
- The sharper camera (VIIRS) can see **smaller fires**. So when VIIRS started to be used (VIIRS on S-NPP began **20 January 2012**; MODIS has records since 2000, Aqua since mid-2002), the number of hotspots in the record **jumps** — not necessarily because more fire happened, but because the camera got better.
- If you just glue the two records together, you can easily draw the wrong conclusion ("fires tripled in 2012!"). Planners deciding when to increase monitoring, and researchers studying long-term change, need to know what is real.
- Also: a hotspot is **not** always a wildfire. It can be part of a bigger fire, the same fire seen twice, agricultural burning, or another heat source. Clouds and gaps hide fires. "Zero detections" does not mean "no fire".

## Who it is for
Local planners and environmental analysts (primary); researchers, teachers and judges (secondary). Questions it answers:
1. When is burning usually highest in this area?
2. Is this month unusual compared with the same month in other years?
3. How different are MODIS and VIIRS here, and what adjustment was applied?
4. Is there enough data and validation to trust this comparison?
5. Can I export the data and the method?

## What we built
- A web app (works on phone and desktop, installable, works offline for areas already opened) with a **burning calendar** (years × months), a **map of 5 km cells**, a **sensor comparison chart** (raw MODIS, raw VIIRS, estimate with an 80% uncertainty band), and an **evidence drawer** for any selected month showing sources and what is observed vs estimated.
- A calibration method that learns, **only from the years both satellites flew** (2013–2020 for training; 2021–2022 to choose the model; 2023–2024 held back as an unseen test), how many VIIRS detections correspond to a given MODIS (Aqua) pattern in each 5 km cell and month — then applies it to earlier years (2003–2012) to give a **VIIRS-scale estimate**, always drawn separately from observed data.
- Honesty built into the design: missing months are shown as missing (never zero), estimates are labelled, the estimate is switched off outside what the data supports, and demo data carries a permanent DEMO tag.

## Where it is demonstrated (three regions)
- **Bangladesh** (country and its divisions) — the home story, Dhaka-based team.
- **California, USA** — a large fire-prone place with a very different climate and fire regime.
- **New South Wales, Australia** — a contrasting southern-hemisphere fire season.
(Whole-country USA and Australia show monthly totals only; detailed 5 km maps are for Bangladesh, California and NSW.)

## What it is NOT (say this out loud — it builds trust)
Not a wildfire alarm or an evacuation tool; not a count of "real fires"; not a forecast. It describes **satellite-observed burning activity in the past** and how sure we can be about comparing two instruments.

## Team
Team **Lumos**, Dhaka. Team leader: **M Al Shahriar Hameem**. (Add the other members' names in the video only if the team wants them on screen.) Challenge category: *Harmonization of MODIS and VIIRS Hot Spots*. Team page: https://www.spaceappschallenge.org/2026/find-a-team/lumos2/

## Opportunity / future (for the "look to the future" beat)
- Extend the same method to more regions and to the newer NOAA-20/21 satellites (NASA has said S-NPP science data delivery ceases on 2 Nov 2026, so continuity across platforms matters more, not less).
- Add independent checks (burned-area products, land cover) and a Bangla interface.
- What we would need to take it further: access to validation data, partner planners to test with, and more compute for global coverage. (Frame as plans, not promises.)
