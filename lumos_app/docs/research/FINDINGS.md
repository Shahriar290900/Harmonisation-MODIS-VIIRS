# FINDINGS — NASA research pack review (10 Oct 2026)

> Compiled by the coordinator from the research crew's outputs (R5 could not write files: the harness only lets subagents return text). Facts come from fetched pages in notes/S0xx.md and notes/R5_VERIFY.md; items marked UNVERIFIED were not confirmed. WebFetch-relayed quotes are summaries, not verbatim page text unless stated.

## Final pass (R5)

I updated BLOCKED.md. I could not write FINDINGS.md, so its content is below for you to save. FINDINGS.md did not exist before this pass, so "update" meant creating it. The harness refused my Write call with "Subagents should return findings as text, not write report files". I did not work around that. The secret scan of docs/research found nothing.

BLOCKED.md changes (/Users/aburoshderokonuddawla/Desktop/Lumos_Fire_Calendar_Complete/lumos_app/docs/research/BLOCKED.md):
- S015, S017 and S020 are marked RESOLVED by the gap round.
- S014 is marked STILL BLOCKED, because OpenAlex gave only title, authors and year.
- The todo list is refreshed to 11 group A rows and 10 group B rows. The only priority-2 row left is S053.
- The process flags now say that request_log.tsv holds only R2's 3 gap-round requests, so R3's 8 gap-round fetches cannot be audited for spacing.

Ledger counts (70 rows): 34 fetched (A 10, B 13, C 11), 21 todo, 9 blocked, 4 skipped, 2 unreachable. The 9 blocked rows are S014, S016, S026, S058, S059, S064, S066, S067 and S068. The 2 unreachable rows are S044 and S057. Every fetched row has a note file. No priority-1 row is todo. No 429 occurred anywhere in the project.

Secret scan: I searched for ghp_, github_pat_, hf_ tokens, AKIA, JWT, Bearer, sk-, 32+ character hex strings, and key= or token= with a value. Nothing was found. The words "key", "token" and "MAP_KEY" appear only as descriptions in S039, S041, S043, PACK_DIGEST and the pack text. The scratchpad research_cache matches only on the S039 wording.

FINDINGS.md content to save:

What the gap round added
- S020 is the first NASA page that confirms S-NPP cessation: "delivery of all Suomi NPP VIIRS science data products will cease on November 2, 2026 (2026/306)". The pack says 1 Nov. The page does not say VNP64A1 continues. VNP64A1 is built from 750 m VIIRS inputs and still depends on VIIRS fire detections.
- S015 was read directly from the LP DAAC User Guide V6.1 text. MCD64A1 uses 500 m MODIS imagery with 1 km MODIS active fire and uses active-fire maps to choose training samples and priors. It is therefore not independent of MODIS fire, and validating MODIS hotspots against it is circular.
  - Landsat 8 validation (558 image pairs): 40.2% commission, 72.6% omission, -54.1% area bias.
  - At 3 to 6 km cells, r2 > 0.70 and slope > 0.79.
  - Cropland burning is low confidence.
  - The Giglio 2018 paper itself was not read.
- S017 (GlobFire, first author Artes, PMC6884633): events are touching or intersecting burnt areas. They split if the gap exceeds 5 days. Clustering is DBSCAN at 0.01 degrees, and a fire goes inactive after 16 days. These parameters came through a summariser, so spot-check them against the XML before use. They apply to burned-area patches, not hotspots.
- S031: the 5000 transactions per 10 minutes limit is confirmed (data_availability cost 5, a one-day world VIIRS query cost 36). No maximum day range is stated, so the 1-5 vs 1-10 question is settled only by S027 (1 to 5). The tutorial still documents a country endpoint, which neither proves nor disproves R4's "retired" claim.
- S035: GIBS fire layers exist for MODIS Terra, Aqua and Combined and for VIIRS SNPP and NOAA20 (375 m). There is no NOAA-21 layer. The URL pattern, TIME dimension and key need are not on the page.
- S022: EONET v3 category `wildfires`, with a bbox in the order min lon, max lat, max lon, min lat. It is suitable only for cached spot-checks of large events.
- S014: no numbers can be attributed to Schroeder 2014.

Verdicts on the PACK_DIGEST conflicts
- Conflict 1, deadline (pack 07 Oct vs PRD 9 Oct / window from 14 Nov): UNRESOLVED. S068 and S057 are unreadable from this machine, and today is 10 Oct.
- Conflict 2, S-NPP cessation: pack right, and now sourced by S020 (2 Nov, not 1 Nov). Whether archive, standard processing or NRT stops is not stated.
- Conflict 3, NOAA-20/21 start dates and CSV codes: partly resolved. `satellite` strings are N, N20, N21 for VIIRS and A, T for MODIS. The NOAA-20 start still differs between two FIRMS pages (2018-04-01 vs 2020-01-01).
- Conflict 4, Aqua start: pack right (3 July 2002). PRD and SOURCE_CHECK say 07-04.
- Conflict 5, access route: both partly right. Keyless 2024 country CSVs return 200, but the route is undocumented and there are no 2025 country files (404). This is the highest build risk.
- Conflict 6, Area API day range: pack and SOURCE_CHECK right (1 to 5, S027).
- Conflict 7, calendar and split windows: our choices are defensible but must be explained. Do not claim "26-year" or "since 2000".
- Conflict 8, `type` field: the standard-only rule is verified, so NRT rows have no type value and CONTRACT needs a null rule. The pack's Type-field bug is UNVERIFIED. Observed `version` strings (6.2, 6.03, 61.03, 2) differ from the documented examples, so treat `version` as an opaque string.
- Conflict 9, author: our docs right (Fu, per Crossref).
- Conflict 10, no burned-area validation: pack right as a gap. All three burned-area references depend on active-fire detections, so they are secondary monthly checks at 3 to 6 km only.
- Conflicts 11 to 20: design choices or unchanged, not settled by fetching.

Safe honesty statements (each backed by a fetched source)
1. MODIS omission against ASTER is 86.2% overall, and regional detection probability ranges from 7% to 26%. A single global MODIS-to-VIIRS multiplier is therefore not defensible (S055).
2. In NE Asia, 65% and 83% of VIIRS fire pixels were missed by MODIS in forests and low-biomass lands (Fu 2020 abstract, via Crossref). The 1.22-1.32 FRP slopes are unverified.
3. MODIS confidence is a heuristic, not a probability. It must not be equated with VIIRS l/n/h.
4. MCD64A1, VNP64A1 and GlobFire are not independent of the fire detections they are compared with.
5. Burned-area products miss small fires, which matters for Bangladesh cropland burning. Do not filter small or low-confidence detections silently.
6. IGNIS says "No formal accuracy figures are given for the harmonization itself". Do not echo its scores or call our approach "validated" without our own holdout numbers.
7. Static, offline-built data sidesteps the FIRMS rate limit and the missing CORS headers.

UNVERIFIED list
- Overpass times: Terra about 10:30 and Aqua/S-NPP about 13:30 are from memory only. FIRMS says only "morning" and "afternoon".
- The Fu 1.22-1.32 FRP slopes, the Li 2018 coefficients, and the Schroeder 2014 and Giglio 2018 numbers.
- The Type-field bug and which versions it affects.
- Scope of the S-NPP cessation, and whether any VIIRS burned-area product continues after 2 Nov 2026.
- GIBS URL pattern, TIME dimension and key need.
- Country endpoint status, the Data Availability output columns, and the `mapkey_status` endpoint.
- Challenge deadline and timezone.
- Exact IGNIS, fireMap and FireSight wording.
- The GlobFire 5-day, 16-day and 0.01-degree parameters.

Process audit
- No 429, no key, no workaround and no tight-loop retry was reported by any agent.
- R2 overshot its round-1 budget by about 3 requests when curl diagnostics are counted. Group B saved no cache files in round 1.
- All quotes are WebFetch-relayed except S015 (guide text read locally), the R5_VERIFY curl checks and the Crossref checks.


## First-pass audit summary (R5)

AUDIT: ledger.json has 70 rows, all with a valid status. Counts: 28 fetched (A 7, B 10, C 11), 11 blocked, 2 unreachable (S057, S044), 5 skipped, 24 todo. Every fetched row has a note file. Group B saved no cache files, and the group A and C cache files are the fetchers' own summaries, not raw pages. All quotes passed through WebFetch's summariser. R2 used about 25 requests against a budget of 22 when curl diagnostics are counted. No 429 appeared anywhere. No priority-1 row is still todo.

PROCESS NOTE: FINDINGS.md was NOT written. The Write tool refused it because subagents must return findings as text, so the full FINDINGS content is below in this output. Before that refusal I did write two report-style files in docs/research (BLOCKED.md and notes/R5_VERIFY.md). They are complete, and the owner can keep or delete them. I also appended answers to messages/R1-R4.md and added an r5_audit field to 7 ledger rows.

MY OWN RE-CHECKS (details in notes/R5_VERIFY.md; about 11 FIRMS requests and 4 api.crossref.org metadata requests, all sequential, at least 3 s apart, no key, no 429): (1) 2025 yearly country files return 404 (modis Bangladesh 2025), while modis Bangladesh 2024 returns 200, last-modified 24 Jun 2025, 149,070 bytes. (2) The keyless 24h file MODIS_C6_1_Global_24h.csv returns 200 with no login and no CORS header, which supports the FireSight claim. (3) Crossref shows the first author of Remote Sensing 12:2870 is Yuyun Fu, so the pack's 'Xu' is wrong and our docs are right. The abstract gives 65% of VIIRS fire pixels missed by MODIS in forests and 83% in low-biomass lands (S-NPP vs Aqua, NE Asia, 2012-2017). The 1.22-1.32 slopes are not in the abstract, so they stay unverified. (4) Li 2018 abstract: MODIS depends strongly on view zenith angle, VIIRS does not; FRP relation varies with scale and season; about 20% difference on 1 degree grids. (5) Real Bangladesh files: VIIRS satellite is 'N', VIIRS version is '2' in both 2020 and 2024, MODIS version is '6.2' (2012), '6.03' (2020), '61.03' (2024), and no NRT strings appear. MODIS 2012 type is 0 for all 3,251 rows. Terra is far below Aqua already in 2012, so it is not drift evidence. (6) /country/ is a JavaScript shell, unreadable by curl. (7) Download speed from this machine was about 7 KB/s, so two VIIRS files timed out at 40 s.

FINDINGS (a) FACTS TO RELY ON. Area API: day range 1 to 5; sources LANDSAT_NRT, MODIS_NRT, MODIS_SP, VIIRS_NOAA20_NRT, VIIRS_NOAA20_SP, VIIRS_NOAA21_NRT, VIIRS_SNPP_NRT, VIIRS_SNPP_SP (no NOAA21_SP); bbox west,south,east,north; 5000 transactions per 10 min; large requests may count as several (S027, S029). Data Availability API needs a key and lists no columns (S028). Archive starts: MODIS 2000-11-01, S-NPP 2012-01-20, NOAA-20 2018-04-01, NOAA-21 2024-01-17; NRT is replaced by standard data after about 5 months (S037). Aqua starts 3 Jul 2002 and Terra 1 Nov 2000 (S032). VIIRS satellite strings are N, N20, N21 and MODIS strings are A and T (S033, S032). Type exists only in standard data (VNP14IMGT, MCD14DL), so NRT rows have none (S032, S033). The NOAA-20 start date is 2018-04-01 on S037 but 2020-01-01 on S033, unexplained. MODIS confidence is a heuristic, not a probability (S055). Giglio 2016 is the C6 MODIS algorithm paper: omission 86.2% versus ASTER, regional detection probability 7% (Middle East) to 26% (Australia/NZ). MCD64A1 uses MODIS active fires (S007, S019), so it is not independent truth. VNP64A1 runs from 2012-01-19, S-NPP only, using 750 m VIIRS fire (S012). MCD12Q1 covers 2001-2024 only (S006). GlobFire ends 2021 (S005), Global Fire Atlas covers 2003-2016 (S018, S024), GFED5.1 stops at 2022 and is SFTP only (S063). geoBoundaries gbOpen is CC-BY compliant and gbAuthoritative is non-commercial (S062).

(b) CORRECTIONS (the owner decides; I edited none of these files).
1. 2025 yearly country files do not exist. Fix CONTRACT.md L17, PRD.md L6 and L12, lumos_A_fetch.py L120-121, and the checklist text at A L715 (it expects 'ok, 0 rows' but the reality is 404 'missing') and A L1004 ('MODIS ok for 2001-2025'). Last available year is 2024. Splits train 2013-2020, val 2021-22, test 2023-24 still work. The calendar must show 2025 as missing, never zero. 2025 would need the archive form (Earthdata or email login) or an Area API key.
2. The country-file route is undocumented (the Download page only links /country/, a JS page). CONTRACT L11-17 says 'verified'; change to 'tested, undocumented, may change'.
3. viirs-noaa20 and viirs-noaa21 folders return 404 at the same pattern (CONTRACT L15, SOURCE_CHECK L20). Keep TRY_NOAA20=False (A L122).
4. VIIRS satellite codes: CONTRACT L23 says 'N' and '1'; FIRMS says N, N20, N21 (S033). B L662 accepts '1' and 'n20' but not 'n21'. Add n21.
5. Type null rule: CONTRACT L24 and L44 are silent. B L720 already treats missing type as main (typ==0 or NaN); write that into CONTRACT. Store a per-file version and type table in sources.json, because MODIS 2012 type is all 0 (type may be uninformative in old vintages, unverified).
6. Version strings observed are 6.2, 6.03, 61.03 and 2, not the documented 6.1 and 2.0. Keep version as an opaque string per file. The pack's Type-field bug (versions 1/2, v3 in May 2025) is not on any FIRMS page we read, and our VIIRS files are version 2. Whether our type==0 counts are affected is UNVERIFIED, so report a sensitivity run with and without the type filter.
7. Aqua start 2002-07-04 should be 2002-07-03 (PRD.md L71, CONTRACT.md L49 wording, lumos_B_train.py L649). B L649 also has NOAA-20 at 2018-01-05, which matches neither FIRMS date. No result impact.
8. SOURCE_CHECK.md: L16 country API stays unverified (the Area API page lists no country endpoint, which fits the S043 retirement claim); L19-20 replace 'not yet published' with the tested 404s; L22 type now has an official source (S032, S033); L29 Fu confirmed, 65% forests and 83% low-biomass lands, slopes 1.22-1.32 not in abstract; L33 the challenge page now fails TLS here; L35 geoBoundaries is reachable (S062) but still unused.
9. PRD.md L12: say 'Aqua MODIS missed 65% of S-NPP VIIRS fire pixels in forests and 83% in low-biomass lands, NE Asia 2012-2017 (Fu et al. 2020)'. It is a regional result.
10. PRD.md L148: the pack says submission ended 07 Oct 2026 11:59 PM and today is 10 Oct 2026, while the PRD says the window opens 14 Nov. Neither is verified (S057, S068 unreachable). The owner must read the official page in a browser.
11. The S-NPP cessation on 1 Nov 2026 is a pack-only claim, not found on S025, S027, S028, S029, S033 or S037 (JS banners are not rendered). Do not state it as verified. Design impact is small because the reference sensor is used for 2013-2024 only. Run Notebook A soon and keep the raw bundle with its sha256 manifest.
12. Download speed risk: about 7 KB/s was measured from this machine, and the 78.6 MB Australia VIIRS file would exceed FILE_DEADLINE_S=1800 (A L133). Kaggle is probably faster (UNVERIFIED), but watch for 'stalled' rows in the first run.
13. Overpass times (Terra about 10:30, Aqua about 13:30, S-NPP about 13:30) are on no NASA page we read. S032 says only morning and afternoon, and the third-party S042 agrees. Keep them UNVERIFIED.

(c) METHOD IDEAS. ADOPT: region-aware and land-cover-aware calibration (S055 regional spread; Fu 65% vs 83%); a median-of-ratios baseline with epsilon as an extra B0 row; a confidence (l+n+h vs n+h) and type sensitivity column (pattern from S051); aqua_scan_mean as a view-geometry feature (Li 2018); 'test touched once' discipline; an optional persistent-source flag (S045, no parameters verified); a burned-area timing panel labelled 'consistency check, not independent'. REJECT: filters like 'high confidence and FRP >= 15 MW' (S041; they erase Bangladesh cropland burning); a single global MODIS-to-VIIRS multiplier; comparing MODIS 0-100 confidence with VIIRS l/n/h; treating MCD64A1, GlobFire or Global Fire Atlas as independent truth; echoing IGNIS numbers or the words 'validated' and 'honest holdout' (its AUC 0.740, silhouette 0.178 and IoU 0.58 come from weak self-made labels, and its harmonization has no accuracy figure); the LINKS dataset (Europe-only labels) and the Kaggle copy (unverifiable); any claim of Terra or Aqua drift (no FIRMS page supports it).

(d) USA/CALIFORNIA AND AUSTRALIA/NSW. S055 gives Australia/NZ the highest regional detection probability (26%), so per-country ratios (CONTRACT L61) are justified. The fire mix is domain knowledge, UNVERIFIED: wildfire plus prescribed and agricultural burning in California and NSW, with industrial heat flagged as type 2. Use the word 'hotspot', not 'wildfire'. Whether the United_States file contains Alaska and Hawaii was not checked (UNVERIFIED); B assigns cells to AOIs by cell-centre point-in-polygon (L1078-1140), so California is clipped correctly and the whole-country USA aggregate will include whatever the file holds. Say so in the UI footnote. The 2024 S-NPP Australia file is 78.6 MB versus 18.2 MB for MODIS, which is a memory-load warning, not a calibration result. Small agricultural and prescribed burns are where MODIS misses most (S055, S024), so say so beside the CA and NSW calendars. Keep USA and AUS aggregate-only, with cells for NSW and CA only (CONTRACT L115-116).

(e) UI AND ARCHITECTURE. The server-based repos (S041, S043, S039) keep MAP_KEY on a server and cache a snapshot, and our static bundle already follows 'one scheduled fetch, many readers'. Never ship a key in the PWA (S029). A browser cannot fetch FIRMS CSVs directly (no CORS header), and third-party CORS proxies should be avoided; a live NRT panel needs a pre-fetched recent/ snapshot from a private job. GIBS is the keyless tile route (S053 and S054 not read). Generic UI ideas only: a 'data through <date>' badge per source and a per-row scaled flag. Licences: IGNIS, Franklin, FireSight and fireMap are MIT; fires-api-nodejs is Apache-2.0; JasmineW6214 scripts are CC-BY-4.0; fire-map has no stated licence. Add the pack's p14 hygiene items to the acceptance list.

(f) UNRESOLVED. Deadline and timezone (S057, S068); S-NPP cessation wording and scope; how to get 2025 data without a key and why the 2025 files are absent; the Type-field bug versions and years; the NOAA-20 start date and its satellite string in a file; numeric MODIS confidence thresholds; overpass times from a NASA page; FRP slopes 1.22-1.32 and the sample designs of Fu, Li, Schroeder and Giglio 2018; the Data Availability API columns; whether the Area API country endpoint is retired; the Franklin 2025 clustering parameters; the Giglio 2025 and Zheng 2026 rows in SOURCE_CHECK L30-31, which were not re-checked.

MESSAGES RESOLVED: R4 asked about CORS and keyless 24h CSVs (answered, supported by HEAD). R4 asked about the retired country endpoint (stays unverified). R3 asked for overpass times (still unverified). R1's author question (answered: Fu). R2's /country/ question (answered: JS shell).


## Recommendations (R5, first pass)

- Owner, in a normal browser: read the official challenge page (S068) and spaceappsbd.com (S057), and copy the deadline, timezone and deliverables into docs/research/source/. The pack deadline of 07 Oct 2026 has already passed as of 10 Oct 2026, while the PRD says the window opens 14 Nov.
- Owner, in a browser: read the FIRMS Notifications / What's new page for the S-NPP cessation wording and scope. Until then call it 'pack claims, unverified'.
- Fix the 2025 assumption everywhere (CONTRACT L17, PRD L6 and L12, notebook A L120-121, L715 and L1004): 2025 yearly country files return 404, so the last available year is 2024, and 2025 must display as missing, never zero.
- Run Notebook A soon and keep the raw bundle plus its sha256 manifest. Watch for 'stalled' rows on the large VIIRS files (about 7 KB/s was measured from this machine; Kaggle speed is unknown).
- Add a null-type rule to CONTRACT (B L720 already counts a missing type as main). Store the version string and the type distribution per file in sources.json, and run a sensitivity check with and without the type filter because of the unverified Type-field bug.
- Fix the VIIRS satellite code mapping to N, N20, N21 (add n21 at B L662), and change the Aqua start to 2002-07-03.
- Reword PRD L12 to 'Fu et al. 2020: 65% (forests) and 83% (low-biomass lands) of VIIRS fire pixels missed by MODIS, NE Asia, 2012-2017'. Mark the 1.22-1.32 slopes as full-text only. Keep the 'Fu' author name; the pack's 'Xu' is wrong.
- Do not echo IGNIS numbers or the words 'validated' or 'honest holdout' without our own proof. Do not adopt a FRP>=15 MW or high-confidence-only filter.
- Next round: each fetcher appends one line per request to docs/research/request_log.tsv and saves raw cache files, so the 3 s spacing and the budget can be audited.


## Stuck or failed items

- S014 (Elsevier 403; Crossref gave title and authors only)
- S015 (Elsevier redirect not followed; use the LP DAAC MCD64 user guide)
- S016 (Wiley 403; abstract recovered via Crossref)
- S017 (nature.com cookie bounce; try Europe PMC then PMC)
- S067 (MDPI 403; abstract recovered via Crossref, slopes need full text)
- S026 (JS shell; question answered by HEAD)
- S057 (spaceappsbd.com unreachable; owner must check in a browser)
- S068 (TLS issuer certificate error on this machine; owner must check in a browser)
- S044 (GitHub 404, stale pack link)
- S058, S059 (Roboflow 403), S060 skipped
- S064, S066 (Kaggle client-rendered, title only), S065 skipped
- S020 skipped for budget
- S069 and S070 skipped (same host as S068)