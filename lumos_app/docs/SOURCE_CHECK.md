# Source check — 9 Oct 2026

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
| 2 | Country API `/api/country/csv/{KEY}/{src}/{ISO3}/{days}` | third-party doc title | unverified |
| 3 | Data availability: `/api/data_availability/csv/{KEY}/{SENSOR}` (needs a key) | https://firms.modaps.eosdis.nasa.gov/api/data_availability/ | direct (format) |
| 4 | MAP_KEY is free, emailed | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | direct |
| 5 | **Yearly country CSVs, no key:** `https://firms.modaps.eosdis.nasa.gov/data/country/modis/{Y}/modis_{Y}_{Country}.csv` and `/viirs-snpp/{Y}/viirs-snpp_{Y}_{Country}.csv`. Bangladesh 2020 MODIS, Bangladesh 2020 VIIRS and Bangladesh 2024 MODIS returned CSV | tested | direct |
| 5 | `viirs-noaa20` folder name; 2025 files not yet published | — | unverified |
| 6 | MODIS columns `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type`. VIIRS uses `bright_ti4/bright_ti5`, confidence l/n/h, satellite N | Bangladesh files | direct |
| 6 | `type`: 0 vegetation, 1 volcano, 2 static land source, 3 offshore | https://gee-community-catalog.org/projects/firms_vector/ | direct (community) |
| 7 | `kaggle_secrets.UserSecretsClient().get_secret()` | https://raw.githubusercontent.com/Kaggle/docker-python/main/patches/kaggle_secrets.py | direct |
| 7 | Notebook Output as input; offline Kaggle Models; RTX 6000 internet policy | Kaggle docs are JS-rendered | unverified (the user confirmed the Blackwell runs offline only) |
| 7 | /kaggle/working ≈ 20 GB | https://aimultiple.com/free-cloud-gpu | direct (third-party) |
| 8 | PennyLane is not in the Kaggle image requirements. lightning-gpu 0.45.0 needs custatevec-cu12. Blackwell support is not stated | https://pypi.org/project/pennylane-lightning-gpu/ | direct / Blackwell unverified |
| 8 | Offline install: `pip download` then `pip install --no-index --find-links` | https://pip.pypa.io/en/stable/user_guide/ | direct |
| 9 | XGBoost GPU: `tree_method="hist", device="cuda"` | https://xgboost.readthedocs.io/en/stable/gpu/index.html | direct |
| 10 | Fu et al. 2020, *Remote Sensing* 12:2870. MODIS missed 65–83% of VIIRS fire pixels; monthly FRP slope 1.22–1.32 | https://www.mdpi.com/2072-4292/12/18/2870 | direct |
| 10 | Zheng et al. 2026, *Remote Sensing* 18:1650. Aqua + S-NPP fusion with 3.82× pixels; viewing-angle FRP correction | MDPI pdf | direct |
| 10 | Giglio et al. 2025, *RSE* 331:115006. VIIRS vs MODIS burned area; 33% gap in SE Asia; warns against naive splicing | UMD pdf | direct |
| 10 | Schroeder et al. 2014, *RSE* 143:85–96. VIIRS 375 m product | GSFC pdf | direct |
| 11 | Challenge page (robots-blocked). A secondary repo lists: harmonize, burning calendar, unusual conditions, critical periods | github.com/samuelakosaonyejekwe/firecal | unverified (official) |
| 12 | Natural Earth GeoJSON raw URLs (admin-0 110m, admin-1 10m). Real admin-1 has 7 Bangladesh divisions with old spellings (Chittagong, Barisal), no Mymensingh | raw.githubusercontent.com/nvkelso/natural-earth-vector | direct (downloaded by the reviewer) |
| 12 | geoBoundaries API | robots-blocked | unverified; not used |

Supplied references: `Claude_Code_Master_Prompt.md`, `Lumos_Fire_Calendar_PRD.md` and the `.pdf`. The PDF text matches the Markdown; it only adds a wireframe caption. The PRD v1 source register (R1–R16) is preserved in `docs/PRD_v1_original.md`.
