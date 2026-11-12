# Live sources and basemaps — verified 12 Nov 2026 (single-sample checks; re-check before relying on them)
Origin used for CORS checks: https://parallaxfire.netlify.app. "DIRECT" = fetch from the browser; "FUNCTION" = through our Netlify function with a CDN cache.

## Basemap (vector, keyless) — OpenFreeMap
- Styles (200, CORS *): `https://tiles.openfreemap.org/styles/dark` (use for dark theme), `/positron` (light theme); also `/liberty`, `/bright`, `/fiord`. Glyphs and sprites come from the same host.
- Terms (openfreemap.org): free public instance, no key, no request limits. Attribution: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap` (MapLibre attribution control).
- Fallback when tiles cannot load: the existing Natural Earth outline style, with an "offline basemap" note. CARTO styles exist but their terms were not read: do not use.

## Satellite imagery — NASA GIBS WMTS (EPSG:3857), DIRECT, CORS *
Tile template (row before column): `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/<Layer>/default/<Time>/<TileMatrixSet>/{z}/{y}/{x}.<ext>` ; MapLibre raster source `maxzoom` = the level number.
| Layer | ext | TileMatrixSet | Time |
|---|---|---|---|
| MODIS_Terra_CorrectedReflectance_TrueColor | jpg | GoogleMapsCompatible_Level9 | daily (YYYY-MM-DD) |
| MODIS_Aqua_CorrectedReflectance_TrueColor | jpg | Level9 | daily |
| VIIRS_NOAA20_CorrectedReflectance_TrueColor | jpg | Level9 | daily |
| VIIRS_NOAA21_CorrectedReflectance_TrueColor | jpg | Level9 | daily |
| VIIRS_SNPP_CorrectedReflectance_TrueColor | jpg | Level9 | daily — STALE (latest 2026-11-02): not a default |
| BlueMarble_ShadedRelief_Bathymetry | jpeg | Level8 | static (no time segment) |
| VIIRS_Black_Marble | png | Level8 | static, date 2016-01-01 |
| GOES-East_ABI_GeoColor, GOES-West_ABI_GeoColor | png | Level7 | every 10 min (ISO time e.g. 2026-11-11T23:40:00Z), 20–40 min behind real time |
| Himawari_AHI_Band3_Red_Visible_1km, Himawari_AHI_Band13_Clean_Infrared | png | Level7 / Level6 | every 10 min (no GeoColor for Himawari) |
- "Latest" time: read `<Dimension><Default>` for the layer from `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml` (5.8 MB: only ever fetch it inside a FUNCTION and cache the parsed defaults 10 min). For daily layers yesterday's UTC date is a safe default without any lookup.
- Credit: "Imagery: NASA EOSDIS GIBS / Worldview". (Exact NASA wording not fetched.)

## Hot spots, last 24 h — NASA FIRMS, FUNCTION (no CORS), cache 15–30 min
`https://firms.modaps.eosdis.nasa.gov/data/active_fire/<product>/csv/<file>`
| Product/file | Size today | State |
|---|---|---|
| modis-c6.1 / MODIS_C6_1_Global_24h.csv | 1.6 MB | data |
| noaa-20-viirs-c2 / J1_VIIRS_C2_Global_24h.csv | 9.3 MB | data |
| noaa-21-viirs-c2 / J2_VIIRS_C2_Global_24h.csv | 8.4 MB | data |
| suomi-npp-viirs-c2 / SUOMI_VIIRS_C2_Global_24h.csv | 112 B | EMPTY (header only) — show "no detections in the S-NPP feed", never zero fires |
7-day files exist but are 7–40 MB: do not use. Acknowledgement: "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS)."

## Where the satellites are — CelesTrak, FUNCTION, cache >= 2 h
`https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=TLE` (CORS *). Ids: 25994 Terra, 27424 Aqua, 37849 Suomi NPP, 43013 NOAA-20, 54234 NOAA-21 (names verified). Policy: data refreshes every 2 hours; never poll more often; repeated 403/404 get the IP blocked: no retries on error, keep last good copy. Propagate in the browser with satellite.js (SGP4).

## Optional feeds (verified working; licence pages not read)
- NASA EONET v3 open wildfire events: `https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=N` (CORS *, body is JSON although the content-type says rss+xml; mostly US incidents, several days old). Label: "reported wildfire events (IRWIN via NASA EONET)" with each event's date.
- US incidents (NIFC WFIGS, ArcGIS): `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=POOState%3D%27US-CA%27&outFields=IncidentName,IncidentSize,FireDiscoveryDateTime&f=geojson` (CORS *). Includes prescribed burns: label honestly.
- Weather at a point: Open-Meteo `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m` (CORS *, non-commercial use, credit "Weather data by Open-Meteo.com").

## Cameras — do not embed
ALERTCalifornia footage is CC BY-NC-ND 4.0 with no third-party embed; other wildfire camera networks' terms were not verified. gods-eye-view's cameras are road-traffic cameras, not fire cameras. Decision: no ground-camera embeds; satellite imagery is the "camera"; link out to https://alertcalifornia.org for California.

## gods-eye-view (MIT, © 2026 Bilawal Sidhu) — design notes to re-create (not copy)
- HUD: full-screen fixed overlay, pointer-events none, mono uppercase text with glow; four corner blocks with bracket glyphs; readouts 10–13 px, letter-spacing 1.5–2.5 px; glass panels `rgba(12,12,20,.72)` + blur, border `rgba(255,255,255,.08)`, accent `#00d4ff`, radius 16 px; panels fade/slide 300 ms `cubic-bezier(.4,0,.2,1)`; status badges: pill, 8–9 px mono uppercase. HUD colour follows the look: NVG `rgba(51,255,51,.8)`, FLIR `rgba(255,255,255,.7)`, CRT `rgba(255,170,0,.8)`, default `rgba(0,255,255,.6)`.
- Looks: NVG = luma × gain, phosphor `#29FF38`, bloom, grain, scanlines, circular tube vignette. FLIR ironbow stops: `#000000, #210050, #7D0073, #DB1A2E, #FF8C00, #FFE852, #FFFFFF`. CRT = scanlines, slight chromatic aberration, warm tint, vignette. Cross-fade 500 ms.
- Detection tags: screen-space corner brackets + short id text, capped by density; costly at high counts → show on hover/focus only.
- Satellites: CelesTrak TLE + satellite.js; positions every 1 s; orbit path 180 steps re-baked every 30 min.
- Camera moves: cubic-in-out easing, pitch about −35°, orbit 30°, 0.9 s single moves; keep "last good" data with a stale badge on feed failure.
