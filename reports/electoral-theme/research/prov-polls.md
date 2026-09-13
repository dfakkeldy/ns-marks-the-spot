# Elections Nova Scotia poll-by-poll data vs current polling-division polygons

Research date: 2026-09-12. Everything below was verified live with curl (browser user agent) and
Python 3.14 stdlib (openpyxl is not importable on this machine; the xlsx files were parsed with
zipfile + ElementTree, reader at `scratchpad/geo/xlsx_reader.py`). Items marked UNVERIFIED were
not checked.

## 1. Verdict in one paragraph

A 2024-poll-on-current-division map is defensible for the 54 districts whose polling divisions
still carry `RELEASE_DATE = September 1, 2020` in the provincial GIS layer, including ED 01
Annapolis: that release predates both the 2021 and 2024 elections, the polygon `electorcount`
matches the 2021 poll-by-poll elector counts to within about 10 electors per poll, and the 2024
poll numbers and polling-location communities are unchanged from 2021 (37 of 38 in Annapolis).
It is NOT defensible for ED 34 Inverness (or the new ED 56 Chéticamp-Margarees-Pleasant Bay):
those two districts were redrawn and renumbered on April 9, 2026, after the election. Every
Inverness poll number now points at a different place (2026 PD 001 is in Port Hawkesbury; the
2024 poll 001 was Pleasant Bay, which is now ED 56 PD 009). For Inverness the map must either use
the pre-2026 division geometry (Elections NS still serves the January 2021 shapefile, see section
7) or fall back to points at polling locations / district totals with an explicit
"divisions redrawn in 2026" state.

## 2. Files fetched and written

| Path (under scratchpad) | Bytes | What |
|---|---|---|
| `geo/42pge_pollbypoll.xlsx` | 220,609 | 2024 (42nd PGE) poll-by-poll workbook, HTTP 200, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `geo/41pge_pollbypoll.xlsx` | 847,839 | 2021 (41st PGE) poll-by-poll workbook, structure only |
| `geo/prov_pd_01.geojson` | 58,495 | 37 current PD polygons for ED 01 Annapolis (layer 3, outSR 4326, maxAllowableOffset 0.0008, precision 5) |
| `geo/prov_pd_34.geojson` | 65,426 | 26 current PD polygons for ED 34 Inverness |
| `geo/prov_pd_56.geojson` | 24,725 | 10 current PD polygons for ED 56 Chéticamp-Margarees-Pleasant Bay (added because it explains ED 34) |
| `geo/prov_polls_01.json` | ~43 KB | per-poll results + join status for Annapolis (schema in section 6) |
| `geo/prov_polls_34.json` | ~41 KB | per-poll results + join status for Inverness |
| `geo/xlsx_reader.py`, `geo/analyze_polls.py`, `geo/build_prov_polls.py` | small | reproducible parsing / analysis / build scripts |
| `geo/_*.json`, `geo/_ens_main.js` | scratch | raw service metadata, query responses, ENS JS bundle |

## 3. 2024 workbook: structure

Source: <https://electionsnovascotia.ca/files/GeneralElection_42nd/42PGE_PollbyPoll_AllEDs_TurnOut_FINAL.xlsx>.
The Elections NS site is a React single-page app on Azure blob storage (curl gets a 1,138-byte
shell for every route). The JS bundle (`/static/js/main.fd9baab1.js`) links this exact file from
the `/generalElection_42nd` route through the Office web viewer, so the file is the officially
published one.

- 55 sheets named `ED01` ... `ED55`, one per 2024 electoral district. No index or notes sheet.
- Row 1 (0-based row 0), column C: district title, e.g. `01 - Annapolis`. Spacing is inconsistent
  (`02-Antigonish`); parse with `^(\d\d)\s*-\s*(.+)$`. All 55 titles match `ED_NAME` in the GIS layer.
- Row 2: header. Fixed columns A-D, then one column per candidate, then two ballot columns:
  - A `Poll`, B `Polling Location`, C `Electors on Final List`, D `Total Votes*`
  - candidate columns: header is two lines, `First LAST` newline party. Party strings seen across
    all 55 sheets: `Green Party`, `Independent`, `Liberal`, `NSNDP`, `PC Party`.
  - `Rejected Ballots**`, `Declined Ballots`.
- Rows 3..n: one row per poll. Then a blank row, `Total ` row (label in column B), `Turnout` row
  (fraction in column C, e.g. 0.46427), `% of Valid Votes Cast` row (fraction per candidate
  column), `Elected:` row (text in column C, e.g. `David Bowlby (PC Party)`), and two footnotes:
  `* Total Votes including rejected and declined ballots`, `** Rejected Ballots are only those
  cast but not counted`. One merged range per sheet (the turnout cell).
- Districts are identified only by the sheet name / title (`01`). Polls are identified by the
  column-A label, a text field. Label patterns found across all 55 sheets (digits replaced by #):
  `###`, `###A`, `###B`, `###/###`, `### Mobile#`, `###,### Mobile#`, `###,###,### Mobile#`,
  `ADV#`, `CPoll#`, `RO-CP`, `WI`, `WI Out-of-District`, `CP Out-of-District`,
  `CP/WI Out-of-district`.
- Advance (`ADV#`), returning-office continuous poll (`RO-CP`), write-in (`WI`) and
  out-of-district rows are separate rows with votes but NO elector count (their electors are
  counted in their home poll's `Electors on Final List`). Mobile (residential-care) polls are
  separate rows WITH an elector count and can cover several PD numbers (`038,039 Mobile2`).
  Combined ordinary polls appear as `016/017`.
- Arithmetic verified for ED 01 and ED 34: per-poll `Total Votes` = candidates + rejected +
  declined on every row; column sums equal the `Total` row; turnout = total votes / electors.
- Cross-check: the province's own `BND_GeneralElectionResults_UT83` layer 7
  (`2024_General_Election_Results`, district polygons only) carries identical district totals
  (ED 01: PC 3289, Liberal 3281, NDP 689, Green 138, rejected 42, declined 7, total 7446,
  turnout 46.4272; ED 34: PC 4058, Liberal 2099, NDP 884, rejected 70, declined 0, total 7111,
  turnout 48.9267).

### ED 01 Annapolis, all rows (2024)

Candidates: Sara ADAMS (Green), David BOWLBY (PC), Cheryl BURBIDGE (NSNDP), Carman KERR (Liberal).
Columns: poll | location | electors | total | Green | PC | NDP | Lib | rej | decl.

```
001  Lower Granville Hall, Port Royal                         494  212   2   69  26 114  1 0
002  Parker's Cove United Baptist Church, Parkers Cove        361  125   2   61   7  54  1 0
003  Granville Ferry Community Hall, Granville Ferry          433  169   1   50  16 102  0 0
004  Annapolis Royal Volunteer Fire Dept., Annapolis Royal    491  176   3   28  18 126  0 1
005  Granville Centre Community Hall, Granville Centre        404  125   3   49  16  57  0 0
006  Hampton Community Hall, Hampton                          543  118   1   45  14  58  0 0
007  Bridgetown Volunteer Fire Dept., Bridgetown              478   52   2   31   6  13  0 0
008  Bridgetown Volunteer Fire Dept., Bridgetown              367   27   1   11   4  11  0 0   (PC/Lib tie)
009  Royal Cdn Legion Br 33, Bridgetown                       389   39   3    6   5  25  0 0
010  Paradise Community Hall, Paradise                        500   79   0   35  11  32  1 0
011  Port Lorne Fire Hall, Port Lorne                         293   81   1   45  14  19  2 0
012  Brickton Community Hall, Brickton                        389  102   1   62   6  32  1 0
013  Port George Regional Recreation Centre, Port George      511  143   2   87  13  37  3 1
014  Wilmot Community Centre, Wilmot                          369   83   1   41  14  26  1 0
015  Margaretsville Fire Hall, Margaretsville                 440  154   1   95  23  35  0 0
016  Melvern Square Community Hall, Melvern Square            497  152   0   94  20  37  1 0
017  Three Rivers Community Assoc. , Torbrook Mines           411   81   1   43  11  26  0 0
018  Melvern Square Community Hall, Melvern Square            448  146   5   95  12  34  0 0
019  Three Rivers Community Assoc. , Torbrook Mines           459  102   1   73   5  22  1 0
020  Melvern Square Community Hall, Melvern Square            417   75   0   42   9  24  0 0
021  Wilmot Community Centre, Wilmot                          355   77   3   56   4  14  0 0
022  Nictaux Volunteer Fire Dept, Nictaux                     458  140   1   80   7  52  0 0
023  Middleton Volunteer Fire Dept., Middleton                382   79   2   39  13  25  0 0
024  Middleton Volunteer Fire Dept., Middleton                359   76   1   34  10  31  0 0
025  Middleton Baptist Church, Middleton                      400   63   1   24   4  33  1 0
026  Middleton Baptist Church, Middleton                      385   68   2   31   9  25  1 0
027  Nictaux Volunteer Fire Dept, Nictaux                     567  180   3   84  21  72  0 0
028  Nictaux Volunteer Fire Dept, Nictaux                     476  172   2   92  11  67  0 0
029  Lawrencetown & District Fire Dept, Lawrencetown          583  156   5   73  21  56  1 0
030  Lawrencetown & District Fire Dept, Lawrencetown          518  137   5   55  19  58  0 0
031  Royal Cdn Legion Br 33, Bridgetown                       506   40   4   16   4  16  0 0   (PC/Lib tie)
032  Round Hill Community Hall, Round Hill                    537  152   4   47  10  88  3 0
033  Annapolis Royal Volunteer Fire Dept., Annapolis Royal    438  164   1   52  18  93  0 0
034  West Dalhousie Community Hall, West Dalhousie            358   51   2   27   5  15  1 1
035  Three Rivers Community Assoc. , Torbrook Mines           495  165   2  107  14  41  1 0
036  Springfield & District Fire Department, Springfield      357  106   3   65   6  32  0 0
037 Mobile1      Mountain Lea Lodge, Bridgetown North         122   29   1    8   2  17  1 0
038,039 Mobile2  Annapolis Royal Nursing Home, Lequille /
                 Heart Of The Valley Care Home, Middleton      48   21   2   10   3   6  0 0
ADV1  Middleton Volunteer Fire Dept., Middleton                -  1174  15  583  80 491  5 0
RO-CP Adaptations, Bridgetown                                  -  1617  30  464 125 986 12 0
WI    21 Queen St, Bridgetown                                  -   116   4   39   8  60  1 4
WI Out-of-District  21 Queen St, Bridgetown                    -    32   1   19   3   9  0 0
CP Out-of-District  21 Queen St, Bridgetown                    -   390  13  222  42 110  3 0
Total                                                      16038  7446 138 3289 689 3281 42 7
Turnout 0.46427 | % valid: Green 1.85, PC 44.17, NDP 9.25, Lib 44.06 | Elected: David Bowlby (PC Party)
```

Note the district was decided by 8 votes overall. The 36 ordinary polls split 24 PC / 10 Liberal
/ 2 ties (008 and 031) and the two mobile polls went 1-1; across ordinary + mobile rows PC led
1,962 to 1,625 (+337). The unmapped rows ran the other way: Liberal 1,656 to PC 1,327 (-329),
with the returning-office poll (RO-CP) alone at Liberal 986 to PC 464 while ADV1 and the
out-of-district rows favoured PC 824 to 610. A shaded map of this district therefore overstates
the PC lead; 3,329 of 7,446 votes (45 %) have no poll location.

### ED 34 Inverness, all rows (2024)

Candidates: Jaime BEATON (Liberal), Joanna CLARK (NSNDP), Kyle MACQUARRIE (PC).
Columns: poll | location | electors | total | Lib | NDP | PC | rej | decl.

```
001  Whale Interpretive Centre, Pleasant Bay                  142   46  19   3  24 0 0
002  Canton Culturel, Chéticamp                               456  105  41  12  52 0 0
003  Canton Culturel, Chéticamp                               472   90  36   9  44 1 0
004  Canton Culturel, Chéticamp                               501   85  38  16  30 1 0
005  Canton Culturel, Chéticamp                               479  118  39  13  66 0 0
006  St. Joseph du Moine Volunteer Fire Hall                  408  154  51  20  82 1 0
007  North East Margaree Seniors Hall, Margaree Valley        516  227  66  21 137 3 0
008  Belle Côte and Area Community Ctr, Belle Côte            548  236  55  33 146 2 0
009  Margaree Forks Fire Hall, Margaree Forks                 422  191  57  38  94 2 0
010  Lake Ainslie Fire Hall, Scotsville                       318  154  57  18  79 0 0
011  Route 19 Brewing, Inverness                              510  124  42  11  69 2 0
012  Route 19 Brewing, Inverness                              376   91  14   6  71 0 0
013  Mill Road Social Enterprises, Inverness                  361  110  22  12  76 0 0
014  Inverness Fire Hall, Inverness                           479  157  27  13 116 1 0
015  Mabou Parish Hall, Mabou                                 598  272 119  26 121 6 0
016/017  West Mabou Hall, West Mabou                          386  169  84  15  70 0 0
018  Whycocomagh Cameron Hall, Whycocomagh                    587  299  75  43 180 1 0
019  Mawita'mk Society , Whycocomagh 2                        590   26  13   2  11 0 0
020  Smith Community Centre, Orangedale                       258   84  18  10  55 1 0
021  St. Marys of the Angels Hall, Glendale                   359  147  37  16  94 0 0
022  St. Peter's Parish Hall, Port Hood                       524  161  38  25  98 0 0
023  St. Peter's Parish Hall, Port Hood                       548  193  57  34 102 0 0
024  Judique Community Centre, Judique                        456  219  81  19 118 1 0
025  Creignish Recreation Centre, Creignish                   443  188  60  21 106 1 0
026  Port Hasting Fire Hall, Port Hastings                    423  163  26  30 106 1 0
027  West Bay Community Centre, West Bay                      429  163  25  18 119 1 0
028  Port Hasting Fire Hall, Port Hastings                    432  144  25  24  95 0 0
029  Royal Cdn Legion Br 43, Port Hawkesbury                  427  106  19  13  74 0 0
030  Port Hawkesbury Civic Centre, Port Hawkesbury            412  118  20  18  80 0 0
031  Port Hawkesbury Civic Centre, Port Hawkesbury            489   95  15  17  62 1 0
032  St. Mark's United Church Hall, Port Hawkesbury           385   96  24  10  62 0 0
033  Senior Citizens Evergreen Club, Port Hawkesbury          429  130  21  29  79 1 0
034  Royal Cdn Legion Br 43, Port Hawkesbury                  371  123  24  26  72 1 0
035 Mobile1      Foyer Pere Fiset, Chéticamp                    0    0   0   0   0 0 0
036,037 Mobile2  Port Hawkesbury Nursing Home / Inverary Manor   0    0   0   0   0 0 0
ADV1  Canton Culturel, Chéticamp                                -  526 195  59 260 12 0
ADV2  St. Peter's Parish Hall, Port Hood                        -  284 103  16 162  3 0
ADV3  Port Hawkesbury Civic Centre, Port Hawkesbury             -  588 112  66 401  9 0
RO-CP Inverness County Centre for the Arts, Inverness           -  683 255  83 337  8 0
WI    16080 Central Ave, Inverness                              -  158  68  19  61 10 0
CP/WI Out-of-district  16080 Central Ave, Inverness             -   88  21  20  47  0 0
Total                                                       14534 7111 2099 884 4058 70 0
Turnout 0.48927 | % valid: Lib 29.52, NDP 12.43, PC 57.07 | Elected: Kyle MacQuarrie (PC Party)
```

The two Inverness mobile polls are printed with 0 electors and 0 votes. That is what the file
says; do not interpret it (no explanation is given in the workbook).

## 4. Current polling-division polygons (provincial GIS)

Service: `https://nsgiwa.novascotia.ca/arcgis/rest/services/BND/BND_ElectoralBoundaries_UT83/MapServer`
(service description "Online map guide book"; no `copyrightText` on the service or layers, so the
licence is UNVERIFIED from the metadata alone). Layers: 0 `IP_ED2026` (65 institutional-poll
points), 1 `ED2026_Line`, 2 `PD_ED2026_Line`, 3 `PD_ED2026_Carto` (the polling-division polygons
used here), 4 `ED2026_Analysis` (56 district polygons with `electorcount` and `Release_Date`).

Layer 3 fields: `electorcount` (double), `OBJECTID`, `ED_NO` (string 3), `ED_NAME` (50),
`PD_NO` (string 10, zero-padded `001`), `IND_POLL` (`Y` or null), `RES_CARE` (`Y`/`N`),
`SERVICE_AREA` (`Main`), `RELEASE_DATE` (string 20), `Shape_Length`, `Shape_Area` (m², UTM).
`maxRecordCount` 1000, pagination supported. Whole layer: 1,817 polygons across 56 districts,
`electorcount` sum 769,131.

`RELEASE_DATE` by district (distinct-values query): 54 districts `September 1, 2020`; ED 34
Inverness and ED 56 Chéticamp-Margarees-Pleasant Bay `April 9, 2026`. Layer 4 shows the same
split with `October 30, 2019` for the 54 unchanged districts. So the layer name says 2026 but the
geometry for 54 of 56 districts is the 2020 release that was in force for the 2021 and 2024
elections. The task premise ("March 2026 divisions") matches the Elections NS download name
`ProvincialPollingDivisionPolygons_March_2026.zip`; the GIS layer stamps the two changed districts
April 9, 2026.

Why Inverness changed (Elections NS news item dated May 24, 2026, extracted from the site bundle):
legislation introduced in February 2026 created a new "exceptional" district,
Chéticamp-Margarees-Pleasant Bay, out of Inverness, implementing the 2025 Electoral Boundaries
Commission's final report of January 30, 2026 (commission site
<https://www.nselectoralboundariescommission2025.ca/>, not fetched). A by-election was held there
on June 23, 2026 (results page not fetched). The province now has 56 districts.

Per-district facts:

- ED 01: 37 polygons, PD 001-037, no gaps or duplicates; `electorcount` sum 14,889 (min 100,
  max 549). PD 037 is `IND_POLL=Y`, `RES_CARE=Y`, 2,496 m² (the Mountain Lea Lodge mobile poll).
  Centroids run from Port Royal in the west (001 at 44.71, -65.66) through Bridgetown (008/009 at
  -65.29) to Middleton/Nictaux (016-028 near -65.0) and back to the large rural polls 034-036.
- ED 34: 26 polygons, PD 001-026; `electorcount` sum 10,844. PD 001-006 are all within Port
  Hawkesbury (centroids 45.61-45.63 N, -61.34 to -61.36 W, 0.4-4.4 km²); numbering then runs
  north: 019 Mabou area, 023 Inverness town (46.23 N), 024 the northernmost (46.27 N). PD 025
  (71 electors, `IND_POLL=Y`, `RES_CARE=Y`) is in Inverness town and 026 (66 electors,
  `IND_POLL=Y`, `RES_CARE=N`) in Port Hawkesbury.
- ED 56: 10 polygons, PD 001-010; `electorcount` sum 3,921. 001 is the Margaree Forks area
  (46.29 N), 005-007 Chéticamp (46.59-46.63 N), 009 Pleasant Bay (46.78 N, 634 km², 132
  electors), 010 residential care (37 electors, 4,913 m²).
- Point-in-polygon checks (approximate community coordinates): Port Hawkesbury (-61.363, 45.617)
  -> ED 34 PD 002; Inverness town (-61.30, 46.23) -> ED 34 PD 023; Mabou (-61.39, 46.08) -> ED 34
  PD 019; Margaree Forks (-61.09, 46.34) -> ED 56 PD 001; Pleasant Bay (-60.79, 46.83) -> ED 56
  PD 009.

## 5. Join test: 2024 poll numbers vs current PD_NO

### ED 01 Annapolis: joinable

- 2024 geographic rows: 38 (36 ordinary + 2 mobile) covering numbers 001-039; polygons 001-037.
- Numbers in both: 37 (001-037). Only in xlsx: 038, 039 (the second mobile poll: Annapolis Royal
  Nursing Home / Heart of the Valley Care Home; no polygon). Only in polygons: none.
- Rows matched: 37 of 38 geographic rows; 5 non-geographic rows (ADV1, RO-CP, WI, WI
  Out-of-District, CP Out-of-District) cannot be mapped to a polygon by design.
- Numbering stability, per poll (n=37): polygon `electorcount` minus 2021 electors: mean +1.3,
  mean absolute 9.6, max 48 -> the polygon count is a register snapshot from about the 2020
  release, i.e. the same divisions the 2021 election used. 2024 electors minus polygon: mean
  +29.8, mean absolute 32.1, max 73 -> uniform growth, no sign of renumbering. 2024 vs 2021
  polling-location community identical for 37 of 38 rows (the exception is 002, which moved
  from Litchfield hall to Parker's Cove church; both are on the same Fundy shore).
- Sum check: 2024 ordinary + mobile electors 16,038 vs polygon 14,889 (+7.7 %, consistent with
  four years of list growth).

### ED 34 Inverness: NOT joinable by number

- 2024 geographic rows: 35 (33 ordinary rows covering 001-034 with 016/017 combined, plus two
  mobile rows 035 and 036,037); polygons 001-026.
- Numbers in both: 26 (001-026) but all 26 are false matches. Only in xlsx: 027-037 (11 numbers,
  10 rows). Rows genuinely matched: 0.
- Evidence of renumbering: 2026 PD 001 has 421 electors and sits in Port Hawkesbury; 2024 poll
  001 had 142 electors at Pleasant Bay, 130 km north and now in ED 56. By-number elector
  differences (n=25): mean absolute 107, max 372 (vs 32 in Annapolis). 2026 PD 025/026 are
  66-71-elector care-home polls; 2024 polls 025/026 were 443/423-elector ordinary polls.
- Split check that confirms the geography: 2024 polls 001-009 (Pleasant Bay through Margaree
  Forks) total 3,944 electors; the new ED 56 has 3,921 (layer 3) / 3,889 (layer 4). 2024 polls
  010-037 total 10,590; the new ED 34 has 10,844 (layer 3, including 137 in care homes) /
  10,609 (layer 4). So roughly polls 001-009 became ED 56 and 010-034 became the new ED 34, but
  with different boundaries and a fresh south-to-north numbering.
- 2021 vs 2024 within the old numbering: electors mean absolute difference 20 (n=31), 27 of 31
  communities identical, so the 2021 and 2024 elections shared one division set; only the
  2026 layer breaks the chain.

## 6. JSON deliverables

`geo/prov_polls_01.json` and `geo/prov_polls_34.json`, one object each:

- `ed_no`, `ed_name`, `election`, `election_date` (`2024-11-26`), `source` (xlsx URL, sheet,
  notes on derived fields), `polygon_source` (layer URL, `pd_count`, `release_date`,
  `release_predates_election`, `electorcount_sum`), `candidates[]`
  (`name_as_printed`, `display_name`, `party`, `party_as_printed`), `district_totals`,
  `join_summary` (number sets in xlsx / polygons / both / only-in-each, `rows_matched_polygon`,
  `rows_by_join_status`), `polls[]`.
- Each poll: `pd_no` (first three-digit number, null for non-geographic rows), `pd_nos` (all
  numbers in the label), `poll_label_as_printed`, `poll_type` (`ordinary`,
  `mobile-residential-care`, `advance`, `returning-office-continuous`, `write-in`,
  `out-of-district`), `poll_name` (polling location as printed), `votes` keyed by candidate name
  as printed, `by_party` (`PC`, `Liberal`, `NDP`, `Green`, `Independent`), `rejected`,
  `declined`, `total` (as printed, includes rejected + declined), `valid_votes`, `electors`,
  `turnout` (total / electors, null where no elector base), `winner` and `runner_up`
  (`candidate`, `display_name`, `party`, `votes`; null on ties or zero valid votes), `margin_votes`,
  `margin_pct` (margin / valid votes), `tie`, `matched_polygon` (true only when the number exists
  AND the polygon release predates the election), `join_status` (`matched`,
  `no-polygon-with-this-number`, `number-exists-but-divisions-renumbered-after-election`,
  `non-geographic`), `polygon_pd_nos_present`, `polygon_electorcount`, `polygon_release_date`.
- Counts: ED 01 -> 43 rows: 37 matched, 1 no-polygon (038,039 Mobile2), 5 non-geographic; ties at
  008 and 031. ED 34 -> 41 rows: 0 matched, 25 renumbered-after-election, 10 no-polygon, 6
  non-geographic; the two mobile rows have zero valid votes.
- Candidate display names: `Kyle MacQuarrie` is taken from the sheet's `Elected:` line; other
  display names are title-cased from the upper-case surname (Mac/Mc heuristic) and should be
  eyeballed before printing.

## 7. Recommended path and gaps

1. Annapolis and the other 53 unchanged districts: join xlsx poll number to `PD_NO` on the
   current layer (`ED_NO` + `PD_NO`), gated on `RELEASE_DATE = 'September 1, 2020'`. Mobile polls
   that share a number with a care-home polygon (Annapolis 037) will render as a tiny polygon;
   mobile rows with no polygon (038,039) and all advance / RO-CP / write-in / out-of-district rows
   need a non-map presentation (district-level panel), and the map must say that poll-level
   shading excludes them (Annapolis: 3,329 of 7,446 votes, 45 %, outside ordinary and
   mobile polls, and those rows net favoured the losing candidate; Inverness: 2,327 of 7,111,
   33 %).
2. Inverness (and Chéticamp-Margarees-Pleasant Bay): do not join 2024 numbers to the 2026
   polygons. Elections NS still serves the pre-2026 shapefile at
   <https://electionsnovascotia.ca/files/ElectoralDistrictMapInformation/ProvincialPollingDivisionPolygons_January_2021.zip>
   (HTTP 200, 12,533,444 bytes, `application/x-zip-compressed`; a byte-identical copy is in the
   Wayback Machine at `web.archive.org/web/20250801222415id_/...`). It is no longer linked from
   the site and was NOT downloaded here (over the 3 MB per-file limit for this task), so its
   field names and whether its Inverness PD numbering equals the 2024 workbook are UNVERIFIED;
   the January 2021 date and the 2021-to-2024 stability shown above make that likely. The 2019
   55-district boundary file is also still live
   (`NS_2019ED_Bnds.zip`, 1,261,759 bytes).
3. Until that file is checked, render Inverness 2024 results only as district totals or as
   point symbols at the polling-location text, with the state "polling divisions redrawn April
   2026; 2024 poll boundaries not shown".
4. Do not show a 2024 general-election result for ED 56: it did not exist in 2024. Its June 23,
   2026 by-election is a separate dataset (not fetched).
5. No open-data copy exists on data.novascotia.ca (catalogue search for "polling division"
   returned only federated New Brunswick / Edmonton / Colorado sets), and no 2019/2020-vintage PD
   service remains in the nsgiwa `BND` folder (services listed: DistributionOfSeats,
   Electoral_District_Profiles [no layers], ElectoralBoundaries, GeneralElectionResults
   [district-level 2003-2024], Housing_Authority, Municipal_Village, NS_Community_Bndys x2,
   OpportunitiesSocialDevelopment, SelfcontainedLabourAreas_2021).
6. Licence: neither the workbook nor the GIS service states terms in the fetched metadata.
   Elections NS results are public records; the nsgiwa service has empty `copyrightText`.
   Treat both as attribution-required and confirm before publication (UNVERIFIED).

## 8. Caveat text for the map

Short (layer badge): "2024 election results on 2020-release polling divisions. Advance, write-in
and returning-office votes are not mapped."

Full (panel): "Poll-by-poll results are from Elections Nova Scotia's final 42nd General Election
workbook (November 26, 2024). Shaded areas are the provincial polling divisions released
September 1, 2020, which were in force for that election; the current provincial layer is dated
2026 but is unchanged for 54 of 56 districts. Shading covers ordinary and mobile polls only.
Advance, returning-office, write-in and out-of-district ballots are counted in the district
total but have no map location; in some districts they are close to half of all votes and can
reverse the pattern the polls show. Inverness and Chéticamp-Margarees-Pleasant Bay were redrawn
and renumbered on April 9, 2026 and are not shaded from the 2024 poll numbers. Poll boundaries
are approximate (simplified geometry) and elector counts on polygons are a register snapshot, not
the 2024 final list."

Inverness-specific: "Polling divisions in this district were redrawn in April 2026 after the
2024 election. 2024 poll numbers do not correspond to the divisions shown. Results are given for
the district as a whole."

## 9. 2021 workbook: structure differences (not parsed fully)

Source: <https://electionsnovascotia.ca/files/GeneralElection_41st/41PGE_PollbyPoll_AllEDs_TurnOut_FINAL.xlsx>
(847,839 bytes, linked from the `/generalElection_41st` route). Same 55 `EDxx` sheets, but a
print-layout export:

- 40-48 columns per sheet with 220-455 merged ranges each (2024 has 9-11 columns and 1 merge).
- Title in row 3, column Y (`01-Annapolis`, no spaces). Header in row 8 with cells scattered:
  `Poll` col B, `Polling Location` col J, `Electors on Final List` col T, `Total Votes*` col U,
  then candidates at irregular columns (ED01: X, Z, AC, AE, AG; ED34: X, Z, AC), and
  `Rejected`/`Declined` at columns that differ per sheet (ED01: AJ/AL; ED34: AD/AF). A parser must
  locate headers per sheet rather than by fixed index.
- Candidate headers carry the name only (`Cheryl BURBIDGE`); NO party label anywhere on the
  sheet except the `Elected:` line (`Carman Kerr (Liberal)`). Party for non-winners would have
  to come from another source.
- Footer: `Total ` on row 52, `Turnout ` and `% of Valid Votes Cast` share row 53, `Elected: `
  row 54, footnotes rows 55/57. Footnote wording differs slightly (`includes` vs `including`).
- Poll rows: ED01 2021 has 001-036, `037 Mobile1`, `038,039 Mobile2`, `ADV1`, `RO-CP`, `WI`,
  `CP/WI Out-of-district` (one out-of-district row, not two). ED34 2021 has 001-034 with
  `016/018` combined (2024 combined `016/017`), no mobile rows, `ADV1`, `ADV2`, `CPoll1`
  (a continuous poll that does not appear in 2024), `RO-CP`, `WI`, `CP/WI Out-of-district`.
- Candidates 2021 ED01: Cheryl BURBIDGE, Jennifer EHRENFELD-POOLE, Krista GREAR, Carman KERR,
  Mark ROBERTSON; ED34: Joanna CLARK, Damian MACINNIS, Allan Gerard MACMASTER.
- The 2021 elector counts are the ones that match the current polygon `electorcount`
  (section 5), which is useful if a 2021 layer is ever wanted.
