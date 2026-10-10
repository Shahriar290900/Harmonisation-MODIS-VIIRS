# Source check — 9 Oct 2026, corrected 10 Oct 2026

The table below is the 9 Oct 2026 audit. Rows changed by the research review of 10 Oct 2026 are marked **corrected** and explained in the dated corrections section at the end (note ids refer to `docs/research/notes/`, `docs/research/FINDINGS.md`).

Status labels:
- **direct**: the page was fetched and read.
- **unverified**: blocked, empty, or only a search title was seen.

Re-check anything marked unverified before relying on it.

| # | Fact | Source | Status |
|---|---|---|---|
| 1 | Area API: `/api/area/csv/{KEY}/{SOURCE}/{W,S,E,N}/{1-5}/{DATE}` | https://firms.modaps.eosdis.nasa.gov/api/area/ | direct |
| 1 | Sources: MODIS_NRT/SP, VIIRS_SNPP_NRT/SP, VIIRS_NOAA20_NRT/SP, VIIRS_NOAA21_NRT, LANDSAT_NRT. **No NOAA21_SP** | same | direct |
| 1 | 5000 transactions / 10 min per key; large requests may cost more than 1 | same | direct |
| 1 | Archive start dates: MODIS 2000-11-01, S-NPP 2012-01-20, NOAA-20 2018-04-01, NOAA-21 2024-01-17. SP replaces NRT after ~5 months | https://firms.modaps.eosdis.nasa.gov/download/ | direct |
| 1 | `mapkey_status` endpoint format | — | unverified |
| 2 | Country API `/api/country/csv/{KEY}/{src}/{ISO3}/{days}` | third-party doc title; the Area API page lists no country endpoint (S043 says retired) | unverified, probably retired |
| 3 | Data availability: `/api/data_availability/csv/{KEY}/{SENSOR}` (needs a key) | https://firms.modaps.eosdis.nasa.gov/api/data_availability/ | direct (format) |
| 4 | MAP_KEY is free, emailed | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | direct |
| 5 | **Yearly country CSVs, no key** (tested, undocumented route; **corrected 10 Oct**: 2025 files return 404): `https://firms.modaps.eosdis.nasa.gov/data/country/modis/{Y}/modis_{Y}_{Country}.csv` and `/viirs-snpp/{Y}/viirs-snpp_{Y}_{Country}.csv`. Bangladesh 2020 MODIS, Bangladesh 2020 VIIRS and Bangladesh 2024 MODIS returned CSV | tested | direct |
| 5 | `viirs-noaa20` / `viirs-noaa21` folders: 404 at the same pattern (10 Oct). 2025 yearly files: 404 for Bangladesh, Australia, United_States (10 Oct); 2001-2024 return 200 | HEAD checks, R5_VERIFY item 1 | **corrected**, direct |
| 6 | MODIS columns `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type`. VIIRS uses `bright_ti4/bright_ti5`, confidence l/n/h, satellite N | Bangladesh files | direct |
| 6 | `type`: 0 vegetation, 1 volcano, 2 static land source, 3 offshore; exists only in standard data, so NRT rows have none | FIRMS attribute pages (S032, S033) and the community catalog | **corrected**, direct |
| 7 | `kaggle_secrets.UserSecretsClient().get_secret()` | https://raw.githubusercontent.com/Kaggle/docker-python/main/patches/kaggle_secrets.py | direct |
| 7 | Notebook Output as input; offline Kaggle Models; RTX 6000 internet policy | Kaggle docs are JS-rendered | unverified (the user confirmed the Blackwell runs offline only) |
| 7 | /kaggle/working ≈ 20 GB | https://aimultiple.com/free-cloud-gpu | direct (third-party) |
| 8 | PennyLane is not in the Kaggle image requirements. lightning-gpu 0.45.0 needs custatevec-cu12. Blackwell support is not stated | https://pypi.org/project/pennylane-lightning-gpu/ | direct / Blackwell unverified |
| 8 | Offline install: `pip download` then `pip install --no-index --find-links` | https://pip.pypa.io/en/stable/user_guide/ | direct |
| 9 | XGBoost GPU: `tree_method="hist", device="cuda"` | https://xgboost.readthedocs.io/en/stable/gpu/index.html | direct |
| 10 | Fu et al. 2020 (first author Yuyun Fu), *Remote Sensing* 12:2870. MODIS missed 65% (forests) and 83% (low-biomass lands) of VIIRS fire pixels, NE Asia 2012-2017. The monthly FRP slope 1.22-1.32 is NOT in the abstract | Crossref DOI metadata + abstract (R5_VERIFY item 5) | **corrected**: abstract direct, slopes unverified |
| 10 | Zheng et al. 2026, *Remote Sensing* 18:1650. Aqua + S-NPP fusion with 3.82× pixels; viewing-angle FRP correction | MDPI pdf | direct |
| 10 | Giglio et al. 2025, *RSE* 331:115006. VIIRS vs MODIS burned area; 33% gap in SE Asia; warns against naive splicing | UMD pdf | direct |
| 10 | Schroeder et al. 2014, *RSE* 143:85–96. VIIRS 375 m product | GSFC pdf | direct |
| 11 | Challenge page (robots-blocked; TLS error from the research machine on 10 Oct). A secondary repo lists: harmonize, burning calendar, unusual conditions, critical periods | github.com/samuelakosaonyejekwe/firecal | unverified (official) |
| 12 | Natural Earth GeoJSON raw URLs (admin-0 110m, admin-1 10m). Real admin-1 has 7 Bangladesh divisions with old spellings (Chittagong, Barisal), no Mymensingh | raw.githubusercontent.com/nvkelso/natural-earth-vector | direct (downloaded by the reviewer) |
| 12 | geoBoundaries API | robots-blocked | unverified; not used |

Supplied references: `Claude_Code_Master_Prompt.md`, `Lumos_Fire_Calendar_PRD.md` and the `.pdf`. The PDF text matches the Markdown; it only adds a wireframe caption. The PRD v1 source register (R1–R16) is preserved in `docs/PRD_v1_original.md`.

## Dated corrections (10 Oct 2026)

Checked from the owner's machine on 10 Oct 2026 by the research crew (sequential requests at least 3 s apart, no key). Counts and quotes are from the notes named in each line.

| # | Correction | Evidence (note id) | Status |
|---|---|---|---|
| C1 | FIRMS **2025 yearly country files do not exist** (HTTP 404). 2001-2024 return 200. Notebook A expects **111 ok + 6 missing**, never zero missing. 2025 is missing (null), not zero | R5_VERIFY item 1; FINDINGS (b)1; S037 | direct |
| C2 | The yearly country route is **undocumented**: the FIRMS download page links only a JavaScript `/country/` shell. Treat as tested, not guaranteed | R5_VERIFY item 3; FINDINGS (b)2 | direct |
| C3 | Area API: day range **1 to 5**; limit **5000 transactions per 10 min**; sources list has **no `NOAA21_SP`**; bbox order west,south,east,north | S027, S029, S031 | direct |
| C4 | Satellite codes: MODIS `A`, `T`; VIIRS `N`, `N20`, `N21` | S032, S033; seen as `N` on real VIIRS rows (R5_VERIFY item 8) | direct |
| C5 | **Aqua starts 3 Jul 2002** (earlier docs said 2002-07-04); Terra 1 Nov 2000. NOAA-20 start differs between two FIRMS pages (2018-04-01 vs 2020-01-01) | S032, S037, S033 | direct; NOAA-20 date unresolved |
| C6 | **S-NPP science data delivery is scheduled to cease on 2 Nov 2026** (NASA page; the pack said 1 Nov). Historical 2013-2024 data used here are unaffected; future and NRT use of S-NPP is affected. Whether archive, standard processing or NRT stops is not stated | S020 | direct (scope unverified) |
| C7 | **NRT rows have no `type` value** (type exists only in standard data). Rule: missing type counts as main. The pack's Type-field bug claim (versions 1/2, v3 in May 2025) is UNVERIFIED; run a type-filter sensitivity check. Observed `version` strings are 6.2, 6.03, 61.03 and 2: treat as opaque | S032, S033; R5_VERIFY item 8 | direct / bug unverified |
| C8 | **Fu et al. 2020 is correct** (first author Yuyun Fu, via Crossref). The research pack's "Xu" is wrong. The 1.22-1.32 FRP slopes need the full text | R5_VERIFY item 5 | direct |
| C9 | **Burned-area products are not independent** of active-fire detections: MCD64A1 uses 1 km MODIS active fires and uses them to pick training samples; VNP64A1 uses 750 m VIIRS fire; GlobFire events come from burnt-area patches. Use them as secondary checks at 3 to 6 km only (MCD64A1 vs Landsat 8: 40.2% commission, 72.6% omission) | S015, S012, S017, S019 | direct (GlobFire parameters via a summariser) |
| C10 | **No single global MODIS-to-VIIRS multiplier is defensible.** MODIS omission vs ASTER is 86.2% overall; regional detection probability 7% (Middle East) to 26% (Australia/NZ) | S055 | direct |
| C11 | **Real submission dates are UNVERIFIED.** The pack says 7 Oct 2026 11:59 PM; the PRD said a project window from 14 Nov 2026. The official pages were unreachable from the research machine. The owner must read them in a browser | FINDINGS conflict 1; S057, S068 | unverified |
| C12 | **FIRMS 24h keyless CSV** (`MODIS_C6_1_Global_24h.csv`) returns 200 with no login but has no CORS header, so a browser cannot fetch FIRMS CSVs directly. Static, pre-fetched data is the right design | R5_VERIFY item 4; S046 | direct (HEAD only) |
| C13 | **USA download sizes** (HEAD `Content-Length`, 2001-2024, 24 MODIS + 13 VIIRS S-NPP files per country, 10 Oct 2026): United_States about **767 MB**, Australia about **1762 MB**, Bangladesh about **15 MB**. 2025 excluded (404). 2020 only: US MODIS 12,343,543 B and VIIRS 53,815,954 B | review_loop reviewer check (REVIEWER-HONESTY); sums not re-run by the docs role | direct (reviewer) |
| C14 | **US 2020 MODIS file content:** includes Alaska and Hawaii (latitude 18.97 to 69.51, longitude -164.9 to -67.6); 148,412 type 0, 5,205 type 2, 200 type 1, 31 type 3 rows. The fire mix (wildfire + prescribed + agricultural) is domain knowledge, not measured | review_loop reviewer measurement | direct (reviewer) / mix unverified |
| C15 | Kaggle environment facts (T4 x2: 4 CPUs, 31 GiB RAM, 14.56 GiB per GPU; RTX PRO 6000: 48 CPUs, 177 GiB RAM, 94.97 GiB; `/kaggle/working` 19.5 GiB; torch 2.11 with `sm_120` on the default image) were measured by two small probe runs | `docs/kaggle/KAGGLE_ENV.md` | measured (tiny workloads only) |

Still UNVERIFIED after the review: overpass times (Terra about 10:30, Aqua/S-NPP about 13:30, memory only), the Fu FRP slopes and the Li 2018, Schroeder 2014 and Giglio 2018 numbers, the GIBS URL pattern, the Area API country endpoint status, the challenge deadline and time zone, the Giglio 2025 and Zheng 2026 rows in the table above (not re-checked), and the Kaggle statement that non-competition use of the RTX machine risks suspension (a search summary only; the owner decides).

