# BLOCKED rows: decisions (R5, 10 Oct 2026)

Decision codes: RETRY = one more try in the follow-up round; REPLACE = use the named alternative; ACCEPT = accept as unreachable; OWNER = needs a normal browser or a paste into `docs/research/source/`.
No 429 occurred in this round. No row below was blocked by rate limiting.

| id | url | reason | decision and fallback |
|---|---|---|---|
| S014 | doi.org/10.1016/j.rse.2013.12.008 | doi to Elsevier, HTTP 403 | STILL BLOCKED after gap round. OpenAlex (fetched) gave title, authors, year 2014 only; abstract field null (notes/S014.md). ACCEPT for the full text; OWNER may paste the abstract if Schroeder 2014 numbers are wanted. SOURCE_CHECK #10 says it was read earlier from a GSFC pdf; that is not re-verified here. No numbers from this paper may be used. |
| S015 | doi.org/10.1016/j.rse.2018.08.005 | redirect to Elsevier not followed after S014's 403 | RESOLVED by gap round (row now fetched, notes/S015.md) via the Earthdata MCD64A1.061 page and the LP DAAC User Guide V6.1 (`documents/1006/MCD64_User_Guide_V61.pdf`; id 1005 was 404). The Giglio 2018 paper itself is still unread; use the guide for citations. |
| S016 | doi.org/10.1029/2017JD027823 | doi to Wiley, 403 | REPLACE (done by R5): abstract read through Crossref, see notes/R5_VERIFY.md item 6. Full coefficients stay UNVERIFIED. |
| S017 | doi.org/10.1038/s41597-019-0312-2 | nature.com cookie bounce, not followed | RESOLVED by gap round (row now fetched, notes/S017.md) via Europe PMC, PMC6884633. The 5-day, 16-day and 0.01-degree parameters were relayed by a summariser: spot-check against the XML before using them as hard parameters. |
| S067 | www.mdpi.com/2072-4292/12/18/2870 | HTTP 403 | REPLACE (done by R5): Crossref abstract read; Fu first author and 65%/83% confirmed. The 1.22-1.32 slopes need the full text: OWNER pastes the Results/Table text, no further automated try. |
| S020 | doi.org/10.5067/VIIRS/VNP64A1.002 | skipped, budget | RESOLVED by gap round (row now fetched, notes/S020.md). Page states S-NPP science data delivery ceases 2 Nov 2026 (day 306); whether VNP64A1 continues is NOT stated, so treat it as historical only. |
| S026 | firms.modaps.eosdis.nasa.gov/active_fire/ | JavaScript shell, no body | ACCEPT. The question it was meant to answer (are the 24h files keyless) was answered by R5's HEAD of `/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv`: 200, no login. |
| S057 | spaceappsbd.com | WebFetch failed twice, curl timed out | OWNER: open in a browser, copy deadline, timezone and status. No automated retry. |
| S068 | spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/ | TLS "unable to get local issuer certificate" on this machine | OWNER: read in a normal browser, paste into `docs/research/source/`. Do not bypass certificate checks. |
| S069, S070 | spaceappschallenge.org team pages | skipped, same host as S068 | ACCEPT (priority 3, awareness only). |
| S044 | github.com/links-ads/hotspot-disambiguation | HTTP 404 | ACCEPT as unreachable (pack link is stale). Alternative for the method: S001 arXiv 2308.02508 abstract (priority 3, one fetch, only if budget). |
| S058, S059, S060 | universe.roboflow.com | HTTP 403 host-wide, image datasets | ACCEPT. Out of scope for hotspot harmonization. |
| S064, S065, S066 | kaggle.com | client-rendered, only the title came back | ACCEPT. Do not use the third-party copy. Fallback for Notebook A: an owner-made private Kaggle dataset built from the official FIRMS files with provenance in the manifest. OWNER may paste the dataset card if wanted. |

## Rows still todo (not blocked)
After the gap round (ledger: 34 fetched, 21 todo, 9 blocked, 4 skipped, 2 unreachable). Group A (11): S003, S021, S030, S034, S036, S047, S048, S053 (p2), S054, S056, S061. Group B (10): S001, S002, S004, S008, S009, S010, S011, S013, S023, S049. No priority-1 row is todo; the only priority-2 row left is S053 (GIBS-related, group A). S022, S031 and S035 were fetched in the gap round.
Still-open items that need another host or the owner (not another fetch of the same pages): GIBS WMTS URL pattern, TIME dimension and keyless status (GIBS API docs, nasa-gibs.github.io, S053/S054 are the rows); country-endpoint status (needs a MAP_KEY, not allowed); S067 full-text slopes, Schroeder 2014 and Giglio 2018 full texts (owner paste); challenge deadline (S068/S057, owner browser). The Area API day range is settled at 1 to 5 by S027 (S031 states no maximum).

## Process flags
- R2 used about 25 requests against a budget of 22 when curl diagnostics are counted. R3 and R4 stayed within budget (22 and 16).
- Group B fetched 10 pages but saved no cache files. Group A and C cache files hold the fetcher's summary, not raw page text.
- All "quotes" come through WebFetch's summarising model. Re-check wording on the live page before it goes into public text.
- Gap round: `request_log.tsv` now exists but holds only the 3 R2 requests (S031, S035, S022). R3's 8 gap fetches (including one guessed URL that returned 404 and one redirect) are not in it, so their spacing cannot be audited. Next round: every fetcher appends one line per request.
- Gap round budgets: R3 used 8 of 8, R2 used 3. No 429, no retry loop, no key seen.
- Secret scan of `docs/research` after the gap round: no ghp_, github_pat_, hf_ token, AKIA, JWT, Bearer, sk- or 32+ hex string, and no key=/token= with a value. Matches for "key" and "token" are descriptive text only.
- FINDINGS.md could not be written by this pass because the harness refused writing a new findings file from a subagent; its content was returned in the final summary for the parent to save.
