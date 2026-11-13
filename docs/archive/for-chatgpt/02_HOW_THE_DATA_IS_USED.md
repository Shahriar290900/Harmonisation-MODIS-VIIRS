# 02 — How the NASA data is used (explain it visually)

## The NASA data
**NASA FIRMS** (Fire Information for Resource Management System) active-fire archives:
- **MODIS Collection 6.1** — Terra and Aqua satellites, ~1 km pixels. We use **Aqua** as the "source" series and keep **Terra separate**.
- **VIIRS 375 m** on **S-NPP** — the sharper "reference" series (from 20 Jan 2012). We never pool several VIIRS satellites into one target.
- Each record is one **hotspot**: latitude, longitude, date, time, satellite, a confidence value, fire radiative power (FRP, a measure of heat output in megawatts), day/night, and a `type` (0 = presumed vegetation fire; other types such as static/industrial sources are kept out of the main count).
- Boundaries (countries, states) come from **Natural Earth** (public domain; not a NASA dataset).
- Free downloads: yearly files per country from the FIRMS archive. Real file facts we checked on 10 Oct 2026: yearly files exist for **2001–2024** (MODIS) and **2012–2024** (VIIRS S-NPP) for Bangladesh, Australia and the United States; **2025 files do not exist yet** (so 2025 is shown as missing, not zero). Download sizes 2001–2024 (approx.): Bangladesh 15 MB, USA 767 MB, Australia 1.76 GB.

## The picture of the pipeline (turn into an animated diagram)
```
NASA FIRMS archives (MODIS Aqua/Terra + VIIRS S-NPP)      Natural Earth boundaries
            │                                                    │
            ▼                                                    ▼
 [1] Download  (Kaggle notebook A, internet on, polite & resumable)
            │
            ▼
 [2] Clean & check: drop bad rows into quarantine, keep a reason for every drop;
     remove exact duplicates; keep time in UTC; never delete genuine repeat overpasses
            │
            ▼
 [3] Put every hotspot into a 5 km × 5 km equal-area cell and a calendar month
     → counts per cell, per month, per satellite (missing stays missing, never zero)
            │
            ▼
 [4] Split the years BEFORE looking at results
     train 2013–2020 · choose model 2021–2022 · unseen test 2023–2024 · backcast 2003–2012
     (+ 20% of 100 km blocks held out in space)
            │
            ▼
 [5] Learn the relationship: "given the Aqua (MODIS) pattern here, how many VIIRS detections?"
     baselines first (B0: a simple ratio), then B1 (Poisson regression), then B2 (XGBoost),
     then D1 (a small neural net). Models must beat the baselines to be chosen.
            │
            ▼
 [6] Evaluate on the sealed test years (opened once); measure error (MAE) and whether the
     80% uncertainty band really covers about 80% of observations — region by region
            │
            ▼
 [7] Export a compact bundle → the web app (calendar, map, chart, evidence, CSV export)
```

## Key ideas, in kid-friendly language (use as narration)
- **Overlap years are the Rosetta Stone.** When both satellites watched the same place at the same time, we can learn how the sharper camera counts relative to the older one. We only learn from those years.
- **We test on years the model never saw** (2023–2024) so we are not grading our own homework.
- **Backcast = translate the past.** For 2003–2012 (before VIIRS) we translate the MODIS record into "what VIIRS would roughly have counted", with an uncertainty band. It is always drawn as a separate, dashed/teal "estimate" — never mixed with observed data.
- **The estimate can switch itself off.** If a place or situation is outside what the training data supports, the app shows raw data only and says why.
- **Real changes must stay visible.** We do not smooth the curve to look pretty.

## Why a 5 km cell?
It is a fixed equal-area grid, so counts are comparable across places and months, and it is small enough to map but large enough to avoid noise. (We plan to test other sizes if data allows.)

## What the app shows from this data (one screen = one idea)
| Idea | Where on screen |
|---|---|
| Raw MODIS (Aqua) vs raw VIIRS over time | Compare sensors chart (cyan = MODIS/Aqua, violet = VIIRS) |
| The VIIRS-scale estimate + 80% band | Teal dashed line with a band, labelled "Estimate" |
| Seasons and unusual months | Burning calendar (years as rows, months as columns); "unusually high / low" tags |
| Where in the area | Map of 5 km cells for the chosen month |
| What to trust | Evidence drawer: source, coverage, observed vs estimated, model and its split |
| Missing data | Hatched/empty calendar cell and a gap in the line — never a zero |

## What to say about real data right now
- Real numbers are **not measured yet**. The pipeline, the splits and the checks are built and tested on synthetic data. The real run happens on Kaggle (CPU for downloading, then a GPU for training).
- Real facts already checked, safe to show: yearly Bangladesh MODIS files contain about 3,251 rows (2012), 2,903 (2020) and 1,876 (2024) hotspot records (all types; most are type 0). They illustrate scale only, not a trend claim.
