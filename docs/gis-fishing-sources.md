# Fishing data: source and verification receipt

Checked 12 October 2026; open-data queries retrieved 13 October 2026 (UTC). The fishing files in [`web/public/fishing/`](../web/public/fishing/) screen places, fish biology and dated rules. They do **not** establish public access, title, permission, current seasons or fish abundance at a site. The app never computes whether a season is open now. Each file keeps its sources, dates and licence, and [`LICENCE.txt`](../web/public/fishing/LICENCE.txt) states the terms: CC BY 4.0 for the project's own wording, and OGL-NS or OGL-Canada for the data. The code's MIT licence covers none of these files.

| File | What it holds | Receipt |
| --- | --- | --- |
| `spots.geojson` | 27 curated southern Cape Breton, Strait and Antigonish–Guysborough spots with hand-written screening text | `source.json` → `spots` (per-pin dataset, feature and distances) |
| `rules.json` | 40 dated, paraphrased rule entries for the 2026 rules year (17 standing regulations) | `source.json` → `rules` |
| `calendar.json` | 19 species: good and peak months (biology only) and short notes | `source.json` → `rules` |
| `stocked-waters.geojson` | 1,079 province-wide stocked waters from hatchery records | `stocked-waters.source.json` |

`npm run check:fishing` (also in `prebuild`) runs offline: it checks structure, Nova Scotia bounds, unique ids, cross-references, the SHA-256 pins in both receipts, and forbidden public text. It never compares a date with today, so an expired rules window cannot break an unrelated build; the page hides expired entries at runtime.

## Sources

One row per source. The **Per-use** column is reserved for the licensing lock (draft PR #582): when it merges, each row gains its query, cache, render, print and export entry there and in `web/src/licensing/layerUse.ts`. Every source used here is documented open data, so each use is expected to stay open; that is not recorded as a grant until #582 lands.

| Source | Dataset id | Licence | Rows updated | Used for | Rejected or withheld | Sensitivity filter | Per-use (#582) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [NS Road Network (NSRN)](https://data.novascotia.ca/d/484g-adjn) | `484g-adjn` | OGL-NS | 2026-10-05 | 17 road-edge pins (a point on the named segment, `roadsegid` in the receipt), the S14 lane end, road names, owners, surface classes, railway position at S16 | The provincial NSRN MapServer (a delivery service); the open download's Socrata copy replaced it | None needed | pending |
| [NSTDB Water Features (poly)](https://data.novascotia.ca/d/h8jb-hzrm) | `h8jb-hzrm` | OGL-NS | 2026-05-05 | Shore distances quoted in `access` (lake, coast and coast-river polygons), wharf and breakwater presence | NSHN (`dk27-q8k2`) is a download link only and was not used; NSTDB replaced the NSHN MapServer distances | None needed | pending |
| [NSTDB Water Features (line)](https://data.novascotia.ca/d/fpca-jrmt) | `fpca-jrmt` | OGL-NS | 2026-05-05 | Brook, outlet and stream-mouth distances; canal and lock-gate lines at S01 | — | None needed | pending |
| [NS GeoNAMES](https://data.novascotia.ca/d/xf3i-vxcb) | `xf3i-vxcb` | OGL-NS | 2026-08-05 | The S10 pin (`CBUJA`, Lennox Passage Provincial Park); lake, cove and place names | — | None needed | pending |
| [Provincial Day-use and Camping Park Entrances](https://data.novascotia.ca/d/c6mf-qy4u) | `c6mf-qy4u` | OGL-NS | 2026-05-05 | S05 and S24 pins (entrance points) and the S10 entrance distance | Entrance points are entries, not park gates (publisher note) | None needed | pending |
| [Crown Land](https://data.novascotia.ca/d/3nka-59nz) | `3nka-59nz` | OGL-NS | 2026-10-05 | Crown statements at S14 (97% of the straight line to the pond) and S23 (67%) | Shoreline Crown percentages computed from the PLAN MapServer (a delivery service) are not used | Worded as provincial mapping, "not proof of public access" | pending |
| [NS Protected Areas System](https://data.novascotia.ca/d/ticv-5du5) | `ticv-5du5` | OGL-NS | 2024-04-03 | Nature reserve and wilderness area distances quoted at S05, S11, S15, S22, S24 and S25 | — | Closures are a `rules.json` entry, not spot text | pending |
| [DFO Small Craft Harbours](https://open.canada.ca/data/en/dataset/262451e7-6416-47b5-8453-f31d212ea657) | `262451e7-6416-47b5-8453-f31d212ea657` | OGL-Canada | 2026-03-24 | Pins for S04, S11, S13, S17, S18, S19 (`Harbour_number` 1158, 1339, 1408, 1010, 1124, 1139), harbour type and manager; the two live harbour layers (below) | Queried from the `small_craft_harbours_en` MapServer, which the catalogue record lists as its own resource. Layer 2 (Recreational) has no Nova Scotia rows; two core rows with a blank province are left out | A harbour point is not permission to fish from the wharf | pending |
| [Aboriginal Lands of Canada Legislative Boundaries](https://open.canada.ca/data/en/dataset/522b07b9-78e2-4819-b736-ad9208eb1067) | `522b07b9-78e2-4819-b736-ad9208eb1067` | OGL-Canada | 2024-02-15 | Reserve screen: all 27 pins are outside reserve polygons (nearest 3.4 km); distances quoted at S06 and S09 | — | Text says fishing and parking on reserve land need the band's permission | pending |
| [NS Fish Hatchery Stocking Records](https://data.novascotia.ca/d/8e4a-m6fw) | `8e4a-m6fw` | OGL-NS | 2026-04-20 | `stocked-waters.geojson`; stocking figures quoted in spot text | 304 rows rejected (below); 2026 releases are not in the dataset | 96 salmon releases (Atlantic and landlocked) withheld by count only | pending |
| [Municipality Boundaries](https://data.novascotia.ca/d/7bqh-hssn) | `7bqh-hssn` | OGL-NS | 2025-12-05 | County polygons for the stocking zone and county check | NSTDB County Boundaries (`ur5f-wm24`) are lines without county names, so they cannot test containment | None needed | pending |
| [NS Freshwater Fish Species Distribution](https://data.novascotia.ca/d/jgyj-d4fh) | `jgyj-d4fh` | OGL-NS | 2019-07-05 | Cited presence facts in spot text only (for example the 1974 and 1984 lake surveys) | Not shipped as points | Atlantic whitefish and Atlantic salmon records would need withholding before any point layer | pending |
| [NS Sportfish Angler Records](https://data.novascotia.ca/d/7rxg-qfam) | `7rxg-qfam` | OGL-NS | — | Fact check only | A record-fish claim appears only where the dataset lists that record for the same water; no spot makes one | Contains angler names; never shipped | pending |
| Rule sources: [Anglers' Handbook 2026](https://www.novascotia.ca/sites/default/files/documents/1-2412/anglers-handbook-en.pdf), [MPFR](https://laws-lois.justice.gc.ca/eng/regulations/SOR-93-55/FullText.html), [Fisheries Act](https://laws-lois.justice.gc.ca/eng/acts/F-14/FullText.html), [NS General Fishing Regulations](https://novascotia.ca/just/regulations/regs/wifish.htm), DFO Maritimes and Gulf pages and variation orders | — | Crown copyright; federal enactments under SI/97-5 | checked 2026-10-12 | `rules.json`: paraphrased, dated facts with section and link | No page images, tables, photos, logos or reproduced text | Expired entries hidden at runtime | link only |
| Tourism, park, forum and guide pages | — | Third-party terms | checked 2026-10-12 | Reputation and evidence statements, cited in each spot's `sources` | Not reproduced | — | link only |

## Map layers

Four default-off Water & Terrain layers in [`fishingLayers.ts`](../web/src/layers/fishingLayers.ts) draw these sources on the full map and on `/fishing`. None states a season, a limit or a right of access.

| Layer id | Delivery | Shown from | Notes |
| --- | --- | --- | --- |
| `fishing-spots` | `spots.geojson`, drawn by `FishingSpotsLayer` | zoom 7 | Project-derived: its links read **Project source** and point to this receipt and `LICENCE.txt`. Pins must sit inside `source.json` → `spots.coverageBounds` (west −62.2, south 45.3, east −60.5, north 46.4) |
| `stocked-waters` | `stocked-waters.geojson`, static snapshot | zoom 9 | The layer caveat must equal the file's `label` |
| `dfo-small-craft-harbours-core` | Live feature query, MapServer layer 0, `Province = 'NS'` | zoom 8 | 149 Nova Scotia harbours when checked on 13 October 2026 |
| `dfo-small-craft-harbours-non-core` | Live feature query, MapServer layer 1, `Province = 'NS'` | zoom 8 | 23 Nova Scotia harbours when checked |

The harbour layers query DFO's service for the viewport on each visit; nothing from it is stored in the repository. The service's layer 2 (Recreational) had no Nova Scotia rows on 13 October 2026 and is not offered. Two core rows have a blank province (one is Murphys Pond near Port Hood, OBJECTID 550); the province filter leaves them out rather than assigning one. Browser print includes all four layers; generated PDF omits them, as feature queries, and names them as not included. The full map's spot popups show scalar fields only; months, species, rules and sources are on the `/fishing` cards.

## Curated spots

The 27 spots are curated by hand. Each keeps only the allowlisted fields (`id`, `name`, `area`, `water_type`, `kind`, `species`, `species_text`, `best_months`, `peak_months`, `access`, `tip`, `why`, `caution`, `evidence`, `sources`, `rules_ref`), and every free-text field is the project's own wording. `spots.geojson` and `source.json` are the source of truth and are refreshed by hand; `source.json` → `spots.editorialRules` lists the rules below.

- **Pins.** Every pin and location fact comes from the open datasets above, and a spot is listed only where an open dataset places it. No position, name, parking, boardwalk, trailhead, breakwater or park-outline fact comes from OpenStreetMap, and no `openstreetmap.org` URL is cited, so the files carry no ODbL obligation. Spot names and kinds use open-data names and features only.
- **Access wording.** `access` states observed open-data facts, for example a provincial road passing about 10 m from a shore, and that a road is not permission to fish from, cross or park on the land beside it. It never assumes a road-allowance width or grants an access right. The Angling Act's residents-only bank right is one `rules.json` entry.
- **Rules stay out of the text.** Seasons, limits, licences, statute sections, order numbers and closures live only in `rules.json`, never in `tip`, `why`, `caution` or `access`; spots reference them through `rules_ref`. Spot text never points anglers at water closed to salmon fishing. `check:fishing` fails on month-day dates, daily and size limits, statute names and sections, and licence wording in spot text.
- **No travel context.** Spot text gives no travel times or routing, and no cited source is a delivery-service URL (provincial MapServers and the tide service).
- **Pin bases.** `source.json` lists each pin's dataset, feature id, method, straight-line distance to water, nearest mapped stream, nearest reserve and nearby protected areas, with a note where a spot's description rests on the basis (S04, S10, S11, S15). Distances are straight lines to NSTDB features, rounded in the text; they are not surveys.

## Rules and calendar

`rules.json` covers the 2026 rules year. Its `validUntil` is **2027-03-31**, the end of the licence year (annual licences run April 1 to March 31 under the NS General Fishing Regulations s.4(1)), which is also the span the 2026 Anglers' Handbook covers. Entries with an earlier expiry carry it (for example the 2026 mackerel orders and the Gulf groundfish order end on 2026-12-31); the salmon order runs to 2027-05-31. **Standing** entries (MPFR s.15 bridges, s.12 night rules, s.10, s.11.1, Fisheries Act s.34.3(4)(e), mandatory retention of smallmouth bass and chain pickerel, and similar standing regulations) carry a review date, 2027-10-12, instead of the rules-year window. The page shows an entry only while `validFrom <= today <= validUntil` and, unless it is standing, while today is within the file's `validUntil`.

`calendar.json` months are biology and reported fishing quality, not open seasons. Atlantic salmon, landlocked salmon, American eel and chain pickerel are **rules-only**: no months, no promotion. Notes contain no rule text and name no sensitive place.

## Stocked waters

`node scripts/buildFishingStockedWaters.mjs` (npm `build:fishing-stocked-waters`) fetches `https://data.novascotia.ca/resource/8e4a-m6fw.json?$limit=50000&$order=:id` and the municipal boundaries (`7bqh-hssn`, `simplify_preserve_topology(the_geom, 0.0002)`, about 20 m), then writes the snapshot and its receipt. `--save-raw DIR` keeps the responses, and `--from-raw DIR` rebuilds the same bytes offline.

- **Coordinates.** The rows carry an easting and northing with no zone. The zones are now established for this dataset: each row is tried as NAD83 UTM zone 20, then 19, then 21, and kept in the first zone that lands inside its own county or within 1.5 km of it. Of 14,600 kept rows, 14,498 are zone 20, 22 zone 19 (south-west counties) and 80 zone 21 (Cape Breton and Guysborough). The zone is recorded on each point.
- **Rejected (304 rows, listed in the receipt).** 25 rows carry the publisher placeholder `432264/4942878`. 279 rows at 23 sites fit no zone in their county; the receipt gives each one's distance from its county and the county it lands in instead, so a reviewer can restore a mislabelled county by hand. The Antigonish/Kings shared coordinate resolves as Antigonish; the Kings rows are rejected.
- **Withheld (96 rows, counted only).** Every salmon release, Atlantic or landlocked, including enhancement and population-establishment releases. No location of a withheld row appears in either file. The dataset has no illegal-introduction rows.
- **Aggregation.** Rows with the same county, name (case-normalized) and type within 1 km form one water; its point is the most used coordinate. Each point carries species, years, last stocking date, release count, totals by project size class (large 35 cm and over, catchable 20–35, yearling 10–20, fry under 10, unknown) and the last three years' total. 25 points are shared by more than one published water name; each name is kept as published.
- **Currency.** The publisher states "Current as of April 14, 2026" and coverage 1976–2025. 2026 releases appear only on the HTML [Weekly Stocking Update](https://novascotia.ca/fish/sportfishing/hatchery-stocking/stocking-update/) page and are **not** included. A past stocking does not mean a water is stocked this year, and a stocked water is not proof of public access.

## Checked and not used

- **OpenStreetMap** (ODbL): no data used; see above.
- **OSRM** drive times: the public demo router's terms rule out production use; none are stored.
- **CHS tides** (`api-iwls`): not open-licensed; spot text carries no tide references.
- **ASF/NASCO Atlantic salmon rivers** (DFO-hosted service): licence unverified and its catalogue record returns 404; excluded.
- **CMAR/NSDFA Nova Scotia Boat Launches** and **NSDFA Barrier Free Fishing sites**: no stated licence; the second also carries staff contact details. Excluded; a licence request is the route.
- **Esri World Imagery** and **GeoNOVA orthophotos**: not redistributable; no imagery or derivative is used.
- **DFO Atlantic Salmon Index Rivers** and survey points for Atlantic salmon and Atlantic whitefish: withheld as sensitive.

## Refresh

The yearly checklist (rules, calendar, spots, stocking, harbours, the hash gate and the live check) is in [`web/README.md` → Yearly refresh (each April)](../web/README.md#yearly-refresh-each-april). Nothing automated warns before `rules.json` passes its date; after it, the page hides the dated entries and shows the official links until the file is replaced. Between refreshes:

- **When DFO issues or ends a variation order in season:** add or end its `rules.json` entry with its own dates, keep `scope.spots` in step with the spots' `rules_ref`, then run `node scripts/checkFishing.mjs --write-hashes` and review the diff before committing.
- **When an open dataset changes a pin's basis** (road realignment, harbour change): re-derive the pin from the same dataset and update `source.json`.
