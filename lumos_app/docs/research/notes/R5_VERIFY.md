# R5_VERIFY | independent re-checks by the auditor (10 Oct 2026)

Purpose: test claims from the fetcher notes with direct requests that do not go through WebFetch's summariser. All requests sequential, at least 3 s apart, no key, no login, no workaround. Raw files are in the scratchpad (not committed): `.../scratchpad/r5/`.

Request count: FIRMS host 11 (2 HEAD country CSV, 1 HEAD 24h CSV, 1 GET /country/ HTML, 5 small CSV downloads of Bangladesh files), api.crossref.org 4 (metadata for 4 DOIs). No 429, no error other than two curl 40 s timeouts on the larger VIIRS files (throughput about 7 KB/s from this machine; partial files kept, not retried).

## Results
1. HEAD modis/2025/modis_2025_Bangladesh.csv: HTTP 404 (JSON). Confirms R2: no 2025 yearly country file at this URL pattern.
2. HEAD modis/2024/modis_2024_Bangladesh.csv: 200, 149,070 bytes, last-modified Tue 24 Jun 2025 16:49:12 GMT, no `access-control-allow-origin` header (request sent with an Origin header). Same last-modified date as R2's Australia/USA 2024 files.
3. GET /country/ : HTTP 200 but only a JavaScript shell (loads /dist/firms_content.*.js). Nothing about files or years is readable without a browser. R2's open question is answered: not analysable by curl.
4. HEAD https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv: 200, no login, 962,028 bytes, last-modified same morning, no `access-control-allow-origin` header. Supports FireSight's claim (S046) that NASA CSVs are keyless but not CORS-enabled. (HEAD only; a browser preflight was not tested.)
5. Crossref 10.3390/rs12182870: first author is **Yuyun Fu** (then Li, Wang, Bergeron, Valeria, Chavardes, Wang, Hu), Remote Sensing 12(18), 4 Sep 2020, CC BY 4.0. Pack's "Xu" is wrong; PRD/SOURCE_CHECK "Fu" is right. Abstract: MYD14 (Aqua, 1 km) vs VNP14IMG (S-NPP, 375 m), NE Asia, 2012-2017, almost simultaneous observations, duplicates removed. "65% and 83% [of VIIRS fire pixels] were missed by MODIS in forests and low-biomass lands, respectively; ... omission rates by VIIRS for MODIS fire pixels were 35% and 53%". Monthly total FRP from MODIS "considerably lower" than VIIRS; for concurrently detected fires total FRP was lower with VIIRS. The 1.22-1.32 slopes are NOT in the abstract (UNVERIFIED, full text needed).
6. Crossref 10.1029/2017JD027823 (Li et al. 2018, JGR Atmos): abstract read. "VIIRS fire characterization capability is similar across swath, whereas MODIS is strongly dependent on view zenith angle"; FRP relation varies with spatial scale; fire clusters comparable except large boreal fires where "VIIRS FRP is approximately 47% smaller"; continental scale VIIRS slightly larger, differences vary by season; global 1x1 deg grids about 20% difference in fire-prone regions. Coefficients not in abstract.
7. Crossref 10.1016/j.rse.2013.12.008 (Schroeder, Oliva, Giglio, Csiszar, RSE 2014) and 10.1016/j.rse.2018.08.005 (Giglio, Boschetti, Roy, Humber, RSE 2018, "The Collection 6 MODIS burned area mapping algorithm and product"): titles and authors confirmed; no abstract returned.
8. Small Bangladesh yearly CSVs (first rows only for VIIRS, because of the timeout):
   - MODIS 2012: 3,251 rows (complete year), Aqua 3,038 / Terra 213, `version` = `6.2`, `type` all 0.
   - MODIS 2020: 2,903 rows, Aqua 2,475 / Terra 428, `version` = `6.03`, type 0: 2,878, type 2: 25.
   - MODIS 2024: 1,876 rows, 2024-01-04 to 2024-12-29, Aqua 1,706 / Terra 170, `version` = `61.03`, type 0: 1,865, type 2: 10, type 3: 1. MODIS `confidence` is numeric 0-100 and includes 0 (46 rows).
   - VIIRS S-NPP 2024 (partial, to 2024-04-10, 3,642 rows) and 2020 (partial, to 2020-03-30, 4,017 rows): `satellite` = `N` for every row, `version` = `2`, `type` values 0/2/3 only, confidence l/n/h.
   Interpretation notes: (a) no `NRT` string in any of these versions, so the 2024 files look like standard data; (b) the documented examples (`6.1`, `2.0`) do not match the observed strings (`6.2`, `6.03`, `61.03`, `2`), so `version` must be kept as an opaque string; (c) VIIRS `version` is `2` in both 2020 and 2024 files although the files were last modified 24 Jun 2025, so if the pack's Type-field bug claim (versions 1/2, fixed in v3 May 2025) is right these files may still be in the affected versions: UNVERIFIED, cannot be decided from the data; (d) MODIS 2012 `type` is 0 for all 3,251 rows, including a coastal country, so `type` may carry no information for old vintages: UNVERIFIED; (e) Terra is far below Aqua in Bangladesh already in 2012, so the low Terra share is not evidence of orbit drift.

## Spot-check of fetcher notes
- Group A notes S025, S027, S028, S029, S032, S033, S037 versus their cache files: identical content line by line. Caveat: the cache files are the fetcher's own copy of the WebFetch summary, so this is a consistency check, not an independent check.
- Group C notes S039, S045, S052, S066 versus cache: identical to the notes (the cache holds the notes, not raw HTML).
- Group B: no cache files exist for the 10 fetched rows (rule violation, low impact; notes are the only record).
- Independent confirmations: items 1, 2, 4 and 5 above confirm S037 (2025 files absent, 2024 date), S046 (no CORS), the Fu authorship and the 65/83% figures. S033 `N` satellite string confirmed on real rows.
- No note was found whose claim contradicted the independent checks.
