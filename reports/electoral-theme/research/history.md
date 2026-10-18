# NS provincial general election results, 2003-2024: verification notes

Fetched 2026-09-12 with curl (browser UA) from
`https://nsgiwa.novascotia.ca/arcgis/rest/services/BND/BND_GeneralElectionResults_UT83/MapServer`
(service copyrightText: "Elections Nova Scotia"; no licence text in the REST
metadata, licence NOT verified) and
`.../BND/BND_Electoral_District_Profiles_UT83/MapServer` (same copyright).
Query used for layers 1-6: `where=1=1&outFields=*&outSR=4326&maxAllowableOffset=0.006&geometryPrecision=4&f=geojson`.
Server maxRecordCount is 2000; no response set `exceededTransferLimit`.

## Files written (all under scratchpad/geo unless noted)

| file | layer | features | bytes | vertices |
|---|---|---|---|---|
| results_2003.geojson | 1 | 52 | 123808 | 5231 |
| results_2006.geojson | 2 | 52 | 122998 | 5231 (geometry byte-identical to 2003) |
| results_2009.geojson | 3 | 52 | 122837 | 5231 (geometry byte-identical to 2003) |
| results_2013.geojson | 4 | 51 | 160276 | 7193 |
| results_2017.geojson | 5 | 51 | 122510 | 5182 |
| results_2021.geojson | 6 | 55 | 554610 | 26963 |
| results2024.geojson (pre-existing, untouched) | 7 | 55 | 594881 | 29153 |
| research/results_2024_refetch.geojson (fresh layer-7 fetch, same query) | 7 | 55 | 553764 | 26963 |
| turnout_history.json | table 0 | 7 rows | 818 | - |
| history_summary.json | derived | 7 years | ~14 KB | - |
| swing_2021_2024.json | derived | 55 districts | ~27 KB | - |
| latest_election_info.json | Profiles table 1 | 56 rows | 32709 | - |
| ed_census_2021.json | Profiles table 0 | 56 rows | 76378 | - |
| research/results_service.json, results_layer_0..7.json, profiles_service.json, profiles_layer_0..1.json | metadata | - | - | - |

Expected counts: task said "52 for 2003-2009 and 51/52 for 2013". Actual: 52, 52, 52,
51, 51, 55, 55. 2013 is 51 (the 2012 commission cut the House from 52 to 51); 2021 and
2024 are 55 (2019 commission restored the four protected seats).

The pre-existing results2024.geojson has attributes identical to the fresh fetch
(all 55 property dicts equal) but a different vertex set (29153 vs 26963), so it was
produced with a different generalisation parameter. Both are fine for small multiples.

## Seats by winning PARTY (from the layers; PARTY == argmax of *_Votes in every row, every year)

| year | districts | PC | Liberal | NDP | Ind | prov. turnout % (table 0) | PC/Lib/NDP province vote share % (valid votes) |
|---|---|---|---|---|---|---|---|
| 2003 | 52 | 25 | 12 | 15 | 0 | 65.79 | 36.28 / 31.44 / 30.96 |
| 2006 | 52 | 23 | 9 | 20 | 0 | 59.6 | 39.57 / 23.44 / 34.63 |
| 2009 | 52 | 10 | 11 | 31 | 0 | 57.9 | 24.54 / 27.20 / 45.24 |
| 2013 | 51 | 11 | 33 | 7 | 0 | 58.2 | 26.31 / 45.71 / 26.84 |
| 2017 | 51 | 17 | 27 | 7 | 0 | 53.4 | 35.73 / 39.47 / 21.51 |
| 2021 | 55 | 31 | 17 | 6 | 1 | 55.1 | 38.59 / 36.82 / 21.02 |
| 2024 | 55 | 43 | 2 | 9 | 1 | 44.9 | 52.82 / 22.83 / 22.33 |

Independent winner both 2021 and 2024: ED 15 Cumberland North, Elizabeth Smith-McCrossin
(4235 of 7906 in 2021; 3567 of 6488 in 2024). No "Other" party ever won a seat.
2024 turnout cross-check: Profiles table sums to 793,913 electors and 356,371 votes cast
= 44.89%, matching table 0's 44.9; per-district PctVoterTurnout in layer 7 equals
Total_Votes_Cast/Final_List_of_Electors from the Profiles table to 4 decimals.
Official Elections NS pages could not be checked by curl (electionsnovascotia.ca is a
JavaScript SPA behind Cloudflare Turnstile), so the seat totals above are verified
against the service data only.

## PARTY value variants (winner field)

Exactly four strings occur across all seven layers, spelled identically every year:
- `Progressive Conservative Party of Nova Scotia` -> PC
- `Nova Scotia Liberal Party` -> Liberal
- `Nova Scotia New Democratic Party` -> NDP
- `Independent` -> Independent (2021, 2024 only)

Vote-column fields by year (all integer):
- 2003: PC_Votes, Liberal_Votes, NDP_Votes, Independent_Votes, NS_Party_Votes, MP_Votes (Marijuana Party)
- 2006, 2009, 2013, 2024: PC_Votes, Liberal_Votes, NDP_Votes, Green_Votes, Independent_Votes
- 2017, 2021: the same five plus Atlantica_Votes
Field order differs between years (PARTY before MLA in 2013 and 2021; MLA before PARTY otherwise).

Party colours embedded in the field aliases (e.g. alias "Progressive Conservative Party
of Nova Scotia_Votes_#507DB8"): PC #507DB8, Liberal #FF0000, NDP #FAAD30,
Green #2B753B, Independent #9C9C9C, Atlantica #7D93BA, NS Party #800080,
Marijuana Party #D2B48C. These are Elections NS's own map colours.

The Profiles table MLA field uses a different party vocabulary as a suffix:
`(PC Party)` 43, `(NDP)` 9, `(Liberal)` 3, `(Independent)` 1 across 56 rows.

## Boundary blocks and geometry

- 2003, 2006, 2009: one boundary set (52 seats). Coordinates byte-identical across the
  three layers for all 52 ED_NO. ED_NO -> ED_NAME identical except ED 04 "Bedford"
  (2003, 2006) -> "Bedford - Birch Cove" (2009), same polygon.
- 2013, 2017: one boundary set (51 seats), same 51 names both years, but the two layers
  are separate digitisations: only 10/51 polygons byte-identical, 2013 has 7193
  vertices vs 5182, and server Shape_Area differs by >0.5% in 27/51 districts (max
  +9.0% Halifax Armdale, +8.1% Dartmouth East, +7.2% Dartmouth South, +6.5%
  Waverley-Fall River-Beaver Bank). Largest differences are harbour/lake-front
  districts, consistent with different water clipping (interpretation unverified).
  For small multiples, pick one layer's shapes for both years or accept the shift.
- 2021, 2024: one boundary set (55 seats), same 55 names and ED_NO, Shape_Area
  identical to 0.0% in all 55; vertex output differs slightly (53/55 hashes differ)
  but the shapes are the same source polygons.
- Generalisation is honoured server-side: layer 1 returns 157,053 vertices with no
  maxAllowableOffset, 5,231 at 0.006, 1,832 at 0.05. Layer 6 raw is 1.84 M vertices
  (34.6 MB GeoJSON), so the 0.006 files are the practical option; 2021/2024 still
  carry ~5x the vertices of the older layers because the 2019 source is more detailed.
- Bbox (all years): lon -66.395..-59.661, lat 43.388..47.228. Polygon/MultiPolygon mix
  (e.g. 2021: 38 MultiPolygon, 17 Polygon).

## District renames / reshuffles

- 2006 -> 2009: only "Bedford" -> "Bedford - Birch Cove" (ED 04).
- 2009 -> 2013 (52 -> 51 seats): 22 names dropped, 21 added. Dropped: Argyle,
  Bedford - Birch Cove, Cape Breton North, Cape Breton Nova, Cape Breton South,
  Cape Breton West, Clare, Cole Harbour, Cole Harbour - Eastern Passage, Dartmouth
  South-Portland Valley, Digby - Annapolis, Guysborough - Sheet Harbour, Halifax
  Citadel - Sable Island, Halifax Clayton Park, Halifax Fairview, Hammonds Plains-Upper
  Sackville, Preston, Queens, Richmond, Shelburne, Truro-Bible Hill, Victoria - The
  Lakes. Added: Argyle-Barrington, Bedford, Cape Breton-Richmond, Clare-Digby,
  Clayton Park West, Cole Harbour-Eastern Passage, Cole Harbour-Portland Valley,
  Dartmouth South, Fairview-Clayton Park, Guysborough-Eastern Shore-Tracadie, Halifax
  Armdale, Halifax Citadel-Sable Island, Hammonds Plains-Lucasville,
  Northside-Westmount, Preston-Dartmouth, Queens-Shelburne, Sackville-Beaver Bank,
  Sydney River-Mira-Louisbourg, Sydney-Whitney Pier, Truro-Bible Hill-Millbrook-Salmon
  River, Victoria-The Lakes. Several are pure punctuation changes ("Halifax Citadel -
  Sable Island" -> "Halifax Citadel-Sable Island", "Victoria - The Lakes" ->
  "Victoria-The Lakes"); 2003-2009 use spaced hyphens in 5-6 names, 2013+ never do.
- 2017 -> 2021 (51 -> 55 seats): 14 dropped (Argyle-Barrington, Bedford, Cape Breton
  Centre, Cape Breton-Richmond, Clare-Digby, Cole Harbour-Eastern Passage, Cole
  Harbour-Portland Valley, Glace Bay, Guysborough-Eastern Shore-Tracadie,
  Preston-Dartmouth, Queens-Shelburne, Sackville-Beaver Bank, Sydney River-Mira-
  Louisbourg, Sydney-Whitney Pier); 18 added (Argyle, Bedford Basin, Bedford South,
  Cape Breton Centre-Whitney Pier, Cape Breton East, Clare, Cole Harbour, Cole
  Harbour-Dartmouth, Digby-Annapolis, Eastern Passage, Glace Bay-Dominion,
  Guysborough-Tracadie, Preston, Queens, Richmond, Sackville-Uniacke, Shelburne,
  Sydney-Membertou).
- 2021 -> 2024: no changes; ED_NO and ED_NAME match 55/55.
- ED_NO is a zero-padded string ("01".."55") in every layer, and it is NOT stable
  across boundary blocks (a given number can be a different district after 2013 and
  after 2021). Join on ED_NAME within a block, never on ED_NO across blocks.

## Data anomalies (report, do not silently fix)

1. `Total` semantics change by year. 2006, 2009: Total == sum(*_Votes) (rejected
   excluded). 2013, 2021, 2024: Total == sum(*_Votes) + Rejected + Declined.
   2003 and 2017 are mostly sum(*_Votes) but with exceptions below. Use
   sum(*_Votes) as the valid-vote denominator; history_summary.json and
   swing_2021_2024.json do.
2. 2003 rows where sum(*_Votes) != Total (9 of 52): Cumberland North (sum 7103,
   Total 7440), Halifax Clayton Park (8675 vs 8827), Pictou West (7579 vs 7742),
   Victoria - The Lakes (6004 vs 6268) have Total above the column sum (votes for
   candidates not represented by a column?). Dartmouth East, Dartmouth North, Halifax
   Citadel - Sable Island and Hants West have Independent_Votes and MP_Votes holding
   the identical value (101/101, 75/75, 59/59, 148/148) and the sum exceeds Total by
   exactly that amount, i.e. one column is a duplicate. Waverley-Fall River-Beaver Bank
   sum exceeds Total by exactly Independent_Votes (1014). Treat 2003 minor-party
   columns as unreliable.
3. 2017 Hants West: sum 8363, Rejected 37, Total 8326 (Total = sum - Rejected).
4. 2006 Queens (ED 44): Liberal_Votes is null (the only null vote cell in any
   year); PC 2998, NDP 3053, Green 119, Total 6170 reconciles without a Liberal
   figure. Whether a Liberal candidate ran is unverified.
5. `Declined` is null in every row of 2003, 2006, 2009, 2013, 2017; populated from
   2021 on.
6. MLA formatting: 2017 has every surname upper-cased with a trailing space
   ("Stephen MCNEIL "); 2021 and 2024 have stray whitespace in 6 and 5 rows
   (" Tom Taggart ", "Melissa Sheehy-Richard ", "Trevor Boudreau ", "Iain Rankin ",
   "Dave Ritcey ", 2021 also "Keith L. Bain "). Strip before display.
7. `PctVoterTurnout`: double in most layers; 2021 mixes 8 ints and 47 floats. 2024
   values are unrounded doubles (e.g. 46.4272346), older years are 2-dp values
   stored as float32 (71.1399994).
8. Profiles table 1 (Latest_Election_Information) vs 2024 layer: 55 rows agree on
   Total_Votes_Cast == Total and on MLA, except ED 32 Hants East "John A. MacDonald"
   vs "John A MacDonald", ED 53 Victoria-The Lakes "Dianne Timmons" vs
   "Dianne L. Timmins" (spelling differs between the two Elections NS tables), and
   ED 39 Lunenburg West, listed as "Becky Druhan (Liberal)" in the Profiles table
   while the results layer records a PC win (PC 4239, Liberal 2302, NDP 846).
9. Both Profiles tables have 56 rows, not 55: an extra ED_NO "56"
   "Chéticamp-Margarees-Pleasant Bay" (OBJECTID 9, inserted between 08 and 09).
   Its Latest_Election row is a By-Election dated June 23, 2026 (MLA "Claude
   Bourgeois (PC Party)", 3976 electors, 2729 votes cast, 10 voting locations,
   Total_Early_Voting null). ED 56 does not exist in any results layer; the
   pre-existing scratch file ed2026.geojson has 56 features including it. The census
   table's 56 rows sum to Population_2021 = 969,399 (964,840 without ED 56), which
   suggests the other rows are already cut to the 56-district map rather than the
   2024 55-district map; that interpretation is unverified.
10. 2024 closest results: Annapolis PC by 8 votes (3289 vs 3281 Liberal), Yarmouth PC
    by 16, Sackville-Cobequid NDP by 63.

## Swing 2021 -> 2024 (swing_2021_2024.json)

Join on ED_NAME, 55/55 matched, ED_NO identical for every pair. PC share = PC_Votes /
sum(*_Votes) * 100. PC share rose in all 55 districts: mean +14.67 points, range
+0.45 (Sackville-Cobequid) to +37.84 (Halifax Atlantic). 16 districts changed hands:
13 Liberal -> PC, 2 Liberal -> NDP, 1 PC -> NDP. Lowest 2024 PC share: Halifax
Needham 16.97%. Each row also carries mla_2021/2024 (stripped), valid votes, 2024
margin in votes and %, and district turnout both years.

Live check of https://nslegislature.ca/members/profiles/becky-druhan (HTTP 200, 2026-09-12): the profile header reads "Druhan, Hon. Becky Liberal", the text says she "is currently the Liberal Caucus Chair", and the page's Constituency/Party/Start Date table lists Lunenburg West PC 2021-2025, Lunenburg West Independent 2025-2026, Lunenburg West Liberal 2026. So the Profiles table's "(Liberal)" is her current affiliation, while the 2024 results layer correctly records a PC win. Reason for the changes is not stated on the page. For a results small-multiple, colour Lunenburg West 2024 as PC.
