# Elections Canada 2025 (45th GE) poll-level data for Nova Scotia FEDs 12001 and 12006

Research date: 2026-09-12. Everything below was verified live with curl/python3 on that date unless marked UNVERIFIED.

## Files written (all under scratchpad/geo unless noted)

| File | Size | What |
|---|---|---|
| `geo/pd_kmz.zip` | 37,892,967 B | EC PollingDivisionBoundaries_2025_KMZ.zip, raw download, sha256 `97b47ed516e271d9cce4ca96384f54c1c86a7eb2b2828e85d3335e8e9cda9ebf` |
| `geo/pd_data_dictionary.pdf` / `.txt` | 172 KB / 6 KB | "Electoral Geography Files for Canada, Technical Guide, May 2025" extracted from the zip (pdftotext) |
| `geo/fed_pd_12001.geojson` | 318,862 B | 203 polling-division polygons, Acadie--Annapolis |
| `geo/fed_pd_12006.geojson` | 119,146 B | 179 polling-division polygons, Halifax |
| `geo/fed_polls_12001.json` | 204,358 B | per-polygon results, candidates, riding totals, unmapped polls, join stats |
| `geo/fed_polls_12006.json` | 172,388 B | same for Halifax |
| `geo/build_fed_pd_geojson.py`, `geo/build_fed_polls.py` | | reproducible build scripts (stdlib only) |
| `research/ec45_table_tableau03/06/11/12.csv`, `ec45_byed.html`, `ec45_format_*.html` | | EC official summary tables and format pages used for cross-checks |

Inputs used: `ec/pollresults12.zip` (11 CSVs, 12001..12011, Format 2) and `ec/pollbypoll12.zip` (Format 1).

## 1. Polling-division boundary file (KMZ)

Source: https://www.elections.ca/res/cir/mapsCorner/vector/PollingDivisionBoundaries_2025_KMZ.zip (HTTP 200, `application/x-zip-compressed`, 37,892,967 bytes).

Structure (verified with zipfile):

- Outer zip holds 15 regional KMZs plus `KMZ/Data Dictionary.pdf`. There is no single national KMZ. Nova Scotia is in `KMZ/PD_PE-NS-NB_2025_EN.kmz` (3,636,762 B, dated 2025-05-16).
- That KMZ contains `doc.kml` (17,439,611 B) and an `.xsl`. The KML `<Document>` is named `PD_CA_2025_EN_SimplifyPolygo`, i.e. EC already ran a simplify step before export.
- 4,531 `<Placemark>` elements across PE, NS and NB. Nova Scotia placemark counts by FED_NUM: 12001: 203, 12002: 215, 12003: 212, 12004: 206, 12005: 208, 12006: 179, 12007: 191, 12008: 232, 12009: 202, 12010: 220, 12011: 201.
- Each Placemark: `<name>` holds PD_TYPE (N/S/M), `<description>` is a CDATA HTML table with `<td>FIELD</td><td>value</td>` rows; no `<ExtendedData>`. Fields present: `SHAPE`, `PD_NUM`, `PD_TYPE`, `FED_NUM`, `ADV_POLL_NUM`, `PD_NUM_SFX_CO`, `PD_NBR_SFX`, `SHAPE_Length`, `SHAPE_Area`. There is NO polling-division name field in the KML.
- Geometry: `<MultiGeometry><Polygon>` with `outerBoundaryIs` and optional `innerBoundaryIs` rings, coordinates as `lon,lat,0` triples. Every NS placemark inspected has exactly one Polygon (no true multipart features in 12001/12006). 10 polygons in each of 12001 and 12006 have holes (12 hole rings in 12006 after parsing).
- Data dictionary (May 2025): PD layer fields `PD_NBR_SFX` STRING(6) suffix, `PD_TYPE` STRING(1) "N" Normal, "S" Single Building, "M" Mobile Poll, `FED_NUM` LONG, `ADV_POLL_NUM` STRING(10), `PD_NUM` LONG, `PD_NUM_SFX_CO` = PD_NUM + "-" + PD_NBR_SFX. The shapefile CRS is stated as NAD83 CNT, Lambert Conformal (49/77, CM -91 52, origin 63 23 26.43, FE 6,200,000, FN 3,000,000); the KML is delivered in lon/lat. Note: the dictionary's description text for FED_NUM and ADV_POLL_NUM is mis-pasted (FED_NUM is described as "Advance Poll number", ADV_POLL_NUM repeats the PD_TYPE text); the field names themselves are correct and match the KML.
- S and M polygons are tiny placeholder squares (SHAPE_Area about 150 to 1,500 m2, 4 or 5 vertices) at the institution, not service areas.

Processing into GeoJSON: regex parse of Placemarks, rings decimated with Douglas-Peucker (tolerance stepped up from 1e-5 deg until each ring has at most 250 points; only 7 rings in 12001 needed it, max tolerance 5.8e-4 deg about 45 m; 12006 needed none, max ring 115 points), coordinates rounded to 6 dp, RFC 7946 ring orientation. Feature properties: `fed_num`, `pd_num`, `pd_suffix`, `key` (PD_NUM-PD_NBR_SFX), `pd_type`, `adv_poll`, `name` (joined from the results CSV, null if none), `csv_polls` (list of CSV poll ids mapped to the polygon), `shape_area_m2` (from KML). Feature `id` is `<fed>-<key>`. 12001 bbox [-66.447081, 43.251751, -64.675887, 45.164041]; 12006 bbox [-63.705392, 43.907467, -59.670455, 44.692632] (the eastern extent is PD 1-0, Sable Island, 621.8 km2, the void poll).

## 2. Results CSV structure (Format 2, `pollresults_resultatsbureau<FED>.csv`)

UTF-8 with BOM, comma separated, quoted strings, one header row, then one row per candidate per poll (5 rows per poll in both ridings). The Polling Division Number field has a leading space (`" 1"`, `" S/R 1"`); strip it. Exact 18 columns (index: name):

0. `Electoral District Number/Numéro de circonscription`
1. `Electoral District Name_English/Nom de circonscription_Anglais`
2. `Electoral District Name_French/Nom de circonscription_Français`
3. `Polling Division Number/Numéro de section de vote`
4. `Polling Division Name/Nom de section de vote`
5. `Void Poll Indicator/Indicateur de bureau supprimé`
6. `No Poll Held Indicator/Indicateur de bureau sans scrutin`
7. `Combined with No./Résultats combinés à ceux du n°`
8. `Rejected Ballots for poll/Bulletins rejetés du bureau`
9. `Electors for poll/Électeurs du bureau`
10. `Candidate’s Family Name/Nom de famille du candidat`
11. `Candidate’s Middle Name/Second prénom du candidat`
12. `Candidate’s First Name/Prénom du candidat`
13. `Political Affiliation Name_English/Appartenance politique_Anglais`
14. `Political Affiliation Name_French/Appartenance politique_Français`
15. `Incumbent Indicator/Indicateur_Candidat sortant`
16. `Elected Candidate Indicator/Indicateur du candidat élu`
17. `Candidate Vote Count/Votes du candidat`

Poll id forms seen: `N` (ordinary), `N-1` (suffix poll, e.g. `70-1`), `NA`/`NB` (letter sub-polls of one division, e.g. `121A`, `121B`), `600..6xx` (advance polls), `S/R 1` and `S/R 2` (Special Voting Rules groups). EC's format page confirms the id pattern "3, 45A, 48-3, 601" and defines: Void Poll = poll exists but has no electors; No Poll Held = returning officer intended to hold it but circumstances prevented it; Combined = electors from different polling divisions used the same ballot box (also used when two boxes were counted together, or when all electors in one poll voted for the same candidate and results were merged to protect secrecy). Rows with a Combined-with value carry their own `Electors` but 0 votes and 0 rejected; their ballots are inside the target poll's counts, and the target's `Electors` value does NOT include them (e.g. 12001 poll 507: 32 electors, 88 valid votes, receives 121B/508/509 with 172 electors).

Format 1 (`pollbypoll_bureauparbureau<FED>.csv`) columns: `Electoral District Number`, `Electoral District Name`, `Polling Division Number`, `Polling Division Name`, one column per candidate in ballot order (e.g. `Chris d'Entremont`, `Ingrid Deon`, `Ronnie LeBlanc`, `Matthew Piggott`, `James Strange`), `Rejected Ballots/Bulletins rejetés`, `Total Votes/Total des votes` (valid + rejected), `Electors/Électeurs`. Combined rows put the text `Combined with No./Résultats combinés à ceux du n°<N>` in the first candidate column; void rows put `Void/Supprimé`; SVR rows have a blank PD number and names `Group 1/Groupe 1`, `Group 2/Groupe 2`.

## 3. Join method (CSV poll to KML polygon)

- Polygon key = `PD_NUM-PD_NBR_SFX` (equals the KML `PD_NUM_SFX_CO`).
- CSV `N` maps to `N-0`; `N-S` maps to `N-S`; `NA`/`NB` letter sub-polls both map to `N-0` (one polygon, several ballot boxes); ids >= 600 are advance polls (no PD polygon; they are areas made of PDs sharing `ADV_POLL_NUM`); `S/R n` never maps.
- Per polygon record: `electors` = sum of electors of all CSV polls in the polygon; `electors_counted` = electors of the polygon's non-combined polls + electors of polls combined INTO it (`receives_from`); `turnout_pct` = total_ballots / electors_counted; `counted_in` lists the polygon keys where a combined poll's ballots went. Status values: `reported`, `combined_elsewhere` (no own votes), `partial_combined` (one letter sub-poll reported, the other combined away), `void`, `no_poll`.
- Winner = plurality of valid votes at that polygon; `margin_pct` = (first - second) / valid votes at the polygon; `tie` flagged when the top two are equal.

## 4. Join statistics

| | 12001 Acadie--Annapolis | 12006 Halifax |
|---|---|---|
| KML polygons | 203 (186 N, 17 M) | 179 (156 N, 12 S, 11 M) |
| polygons matched to >= 1 CSV poll | 203 / 203 | 179 / 179 |
| CSV poll ids total | 233 | 199 |
| CSV ordinary ids (numeric < 600 incl. suffix/letter) | 205, all with a polygon | 182, all with a polygon |
| polygons with 2 CSV polls (letter sub-polls) | 121-0 (121A,121B), 147-0 (147A,147B) | 72-0, 74-0, 104-0 |
| suffix polygons | 70-1, 78-1, 145-1 | none |
| status counts | reported 186, combined_elsewhere 15, partial_combined 2 | reported 157, combined_elsewhere 20, partial_combined 1, void 1 |
| void polls | none | `1` (Sable Island polygon, 0 electors) |
| no-poll-held | none | none |
| combined pairs (source -> target) | 20 (17 ordinary incl. 121B->507, 147B->513; 3 advance: 608->609, 611->609, 621->619) | 23 (all ordinary; 72A->54 and 72B->53 split one polygon two ways) |
| advance polls, no polygon | 26 (600..625) | 15 (600..614) |
| SVR groups, no polygon | S/R 1, S/R 2 | S/R 1, S/R 2 |
| Format 1 cross-check (votes, rejected, electors per poll) | 233 / 233 match | 199 / 199 match |
| electors in mapped polygons / riding | 67,281 / 67,446 (99.8 %) | 71,693 / 72,377 (99.1 %) |
| valid votes in mapped polygons / riding | 25,614 / 48,298 (53.0 %) | 24,407 / 52,160 (46.8 %) |
| advance-poll valid votes (not on PD map) | 18,865 | 19,549 |
| SVR valid votes (not on PD map) | 3,819 (S/R 1: 896, S/R 2: 2,923) | 8,204 (S/R 1: 1,924, S/R 2: 6,280) |
| polygon winners | Conservative 135, Liberal 51, ties 80-0 and 84-0 | Liberal 147, Conservative 9, NDP 1, tie 146-0 |
| polygon election-day turnout range | 17.4 % to 67.8 % | 20.5 % to 106.0 % (507-0, a mobile poll: 124 ballots, 117 electors) |

Riding totals computed from the CSV equal EC Table 11 exactly (both ridings): see next section.

## 5. Candidates and riding totals

12001 Acadie--Annapolis (ballot order from Format 1 header; totals from Format 2, equal to EC Table 12):

| # | Candidate | Party | Votes | % | Elected |
|---|---|---|---|---|---|
| 1 | Chris d'Entremont | Conservative / Conservateur | 23,024 | 47.7 | Y (incumbent flag N in file; Table 12 marks ** ) |
| 2 | Ingrid Deon | NDP-New Democratic Party | 1,768 | 3.7 | |
| 3 | Ronnie LeBlanc | Liberal / Libéral | 22,491 | 46.6 | |
| 4 | Matthew Piggott | Green Party / Parti Vert | 583 | 1.2 | |
| 5 | James Strange | People's Party - PPC | 432 | 0.9 | |

Riding: electors 67,446; valid 48,298; rejected 311; total ballots 48,609; turnout 72.07 % (Table 11 prints 72.1); majority 533 votes (1.1 %); population 76,252; 211 voting desks. By kind: ordinary polls 25,614 valid / 140 rejected; advance 18,865 / 108; SVR 3,819 / 63.

12006 Halifax: Maricar Aliasut (PPC) 271; Mark Boudreau (Conservative) 9,939; Amethyste Hamel-Gregory (Green) 422; Shannon Miedema (Liberal, elected) 32,886 (63.0 %); Lisa Roberts (NDP) 8,642. Electors 72,377; valid 52,160; rejected 365; ballots 52,525; turnout 72.57 % (Table 11: 72.6); majority 22,947 (44.0 %).

Note: the Format 2 `Incumbent Indicator` is N for every candidate in 12001 and 12006, although Table 12 marks Chris d'Entremont with `**` (the 2023 representation order redrew the ridings). Do not print "incumbent" from this field.

## 6. Caveat text a map should show

- "Polling-division colours show election-day ballots only. Advance-poll ballots (39 % of valid votes in Acadie--Annapolis, 37 % in Halifax) and special-ballot votes (8 % / 16 %) are reported by advance polling district or riding-wide, not by polling division, and are not on this map."
- "Turnout shown per division is election-day ballots divided by listed electors; riding turnout was 72 %. Division values are not comparable with the riding figure."
- "Hatched divisions had their ballots counted with a neighbouring division (Elections Canada 'Combined with'); the winner shown there is the combined result at the receiving division, and the division's own electors are included in that count."
- "Small squares are mobile polls (hospitals, care homes) and single-building polls; they mark an institution, not a neighbourhood, and their turnout can exceed 100 % because electors register on site."
- "Halifax division 1 (Sable Island) is a void poll with no electors."
- "Boundaries: Elections Canada polling divisions at the issue of the writ, 45th general election, simplified for display (about 45 m tolerance at most). Results: Elections Canada Official Voting Results, Format 2, as published 2025-11-05 (page date). Ties and plurality winners at a division are for screening only."
- "Source attribution: Elections Canada. Reproduced for information; not an official record."

## 7. Unverified or open items

- UNVERIFIED: the meaning of `S/R 1` / `S/R 2` (Group 1 / Group 2). EC pages fetched (Format 1/2 pages, Table 6, summary index) list the groups but do not define them; the two glossary URLs tried return 500. General knowledge (not verified here): Group 1 = electors voting by special ballot inside their own riding, Group 2 = electors outside their riding (national SVR, Canadian Forces, incarcerated, abroad). The file shows electors only on S/R 1 (165 and 684), consistent with that reading but not proof.
- UNVERIFIED: licence terms for reuse of the KMZ and CSVs. Not fetched in this pass; check https://www.elections.ca terms before publishing.
- The KML is EC's own simplified export; no unsimplified NS geometry was compared, so small-polygon (S/M) footprints and coastline detail are as EC delivered them.
- Electors for advance polls are 0 in Format 2 (advance polls have no elector list of their own), so advance turnout cannot be computed from these files.
