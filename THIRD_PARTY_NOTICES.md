# Third-party notices

Parallax Fire uses the data, libraries and assets below. Each keeps its own licence or terms. Our own code is MIT ([LICENSE](LICENSE)); our own docs and media are CC BY 4.0 ([LICENSE-CONTENT.md](LICENSE-CONTENT.md)).

## Data

| Source | Used for | Terms |
|---|---|---|
| **NASA FIRMS** active-fire detections: MODIS Collection 6.1 and VIIRS 375 m (S-NPP, NOAA-20, NOAA-21), archive and near-real-time | The 2001–2025 record behind the calendar, maps and model; the live 24-hour hot spots | NASA data, free and open. Required acknowledgement below. |
| **NASA GIBS** (Global Imagery Browse Services) | Satellite picture and night-lights layers on the map | NASA data, free and open. Acknowledgement below. |
| **NASA Visible Earth** Blue Marble and Black Marble imagery, as copied in the [three-globe](https://github.com/vasturiano/three-globe) examples (MIT) | Day, night, relief and water textures of the 3D Earth (`parallax_app/apps/web/public/textures/`, details in its `SOURCES.md`) | NASA imagery is not copyrighted; the three-globe project is MIT. |
| **CelesTrak** GP orbit elements | Real-time positions of Terra, Aqua, Suomi NPP, NOAA-20 and NOAA-21 (fetched at most every two hours) | Public orbital data, provided by CelesTrak (https://celestrak.org). |
| **geoBoundaries** gbOpen ADM2, Bangladesh (source: Bangladesh Bureau of Statistics / OCHA ROAP) | District outlines (`parallax_app/apps/web/public/geo-admin2/`, details in `SOURCES.json`) | CC BY 3.0 IGO |
| **Natural Earth** admin-0 and admin-1 boundaries | Country and state outlines, offline basemap | Public domain |
| **OpenFreeMap** vector tiles (© OpenMapTiles, data © OpenStreetMap contributors) | Basemap on the map pages | OpenStreetMap data: ODbL 1.0; OpenMapTiles schema: CC BY 4.0. Attribution is shown on the map. |

**NASA FIRMS acknowledgement.** We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://www.earthdata.nasa.gov/data/tools/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS).

**NASA GIBS acknowledgement.** We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).

## Software in the web app

| Package | Version | Licence |
|---|---|---|
| react, react-dom | 18.3.1 | MIT |
| three | 0.170.0 | MIT |
| maplibre-gl | 5.6.0 | BSD-3-Clause |
| satellite.js | 6.0.2 | MIT |
| gsap | 3.13.0 | GSAP Standard "no charge" licence (https://gsap.com/standard-license) |
| d3-scale, d3-shape | 4.0.2, 3.2.0 | ISC |
| lucide-react | 0.468.0 | ISC |
| @radix-ui/react-tooltip | 1.3.0 | MIT |
| react-joyride | 3.2.0 | MIT |
| nprogress | 0.2.0 | MIT |
| zod | 3.24.2 | MIT |

Development and test tools: Vite, vite-plugin-pwa, Vitest, jsdom, @testing-library/react, adm-zip (MIT); TypeScript and Playwright (Apache-2.0). Exact versions are in `parallax_app/package-lock.json`.

Data and model notebooks (run on Kaggle): pandas, NumPy, scikit-learn, Shapely (BSD); XGBoost, PyTorch, PennyLane, Transformers (Apache-2.0 / BSD); Qwen2.5-7B-Instruct (Apache-2.0), used only in an experiment that was not selected.

## Videos (not stored in this repository)

- **Music:** "Voltaic" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/
- **Narration:** AI-generated with Kokoro-82M text-to-speech (Apache-2.0), run locally.
- **Team photo backgrounds:** removed with MODNet (Apache-2.0), run locally.
- **Video tools:** FFmpeg (via ffmpeg-static; LGPL/GPL builds), Playwright.

## Trademarks

NASA, the NASA insignia and the NASA Space Apps Challenge name and logos belong to their owners. They are used only to name the event this project was made for. They are not covered by this project's licences, and no endorsement is implied. A hot spot is a satellite detection, not a confirmed wildfire.
