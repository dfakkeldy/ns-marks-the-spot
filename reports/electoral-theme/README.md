# Electoral and census themes for the web map — design handoff (2026-09-12)

This folder preserves the research and design generators behind the
**Electoral Map Theme** design canvas
(https://claude.ai/code/artifact/170c26f3-67c3-47f7-8c31-068d6bc09d47, four
pages: Elections, Poll level, People & Housing, Representatives). Nothing here
is application code; it is the evidence trail an implementation should start
from. No geometry or results extracts are committed: every dataset is fetched
from its official source, and redistribution terms for the provincial services
are still unconfirmed (see Licensing below).

## What is here

- `research/census.md` — Statistics Canada 2021 geographies (ArcGIS REST and
  shapefiles) and the Census Profile SDMX web data service, with verified
  requests, characteristic ids, suppression rules and licence text.
- `research/prov-polls.md` — Elections Nova Scotia 2024 poll-by-poll workbook
  structure, the join to the GeoNOVA polling-division layer (54 of 56
  districts join; Inverness and ED 56 were renumbered April 9, 2026), and the
  caveat text a map must show.
- `research/fed-polls.md` — Elections Canada 2025 polling-division KMZ and
  Format 2 result CSVs; join key `PD_NUM-PD_NBR_SFX` matches 203/203 in
  Acadie—Annapolis; advance and special ballots have no division polygon.
- `research/history.md` — the seven general-election results layers
  (2003–2024) on GeoNOVA, party-name variants, boundary blocks, anomalies.
- `research/representatives.md` — sources for MP, MLA, council and CSAP
  contacts; why Open North's Represent API must not be called at runtime;
  recommended static, dated directory snapshot. Phone numbers and
  personal-domain e-mails are scrubbed from this copy; read them on the
  official pages.
- `research/round2-agent-reports.json` — the structured reports of the five
  research agents, the ranked census visualization concepts, and the
  completeness critic's list of contradictions, gaps and red flags.
- `design/` — the Python generators that produced the canvas artboards from
  live data (`gen.py`, `gen2.py`), the projection helpers, and `canvas.json`.
  They document the exact tokens, palette, rail anatomy and copy used.

## Sources at a glance

- Provincial districts, polling divisions, results 2003–2024, district
  profiles and current seats: GeoNOVA
  `https://nsgiwa.novascotia.ca/arcgis/rest/services/BND/` (services
  `BND_ElectoralBoundaries_UT83`, `BND_GeneralElectionResults_UT83`,
  `BND_Electoral_District_Profiles_UT83`, `BND_DistributionOfSeats_UT83`).
- Elections Nova Scotia downloads (2026 district and polling-division files,
  poll-by-poll workbooks): paths are listed in `research/prov-polls.md`.
- Federal ridings (2023 Representation Order), polling divisions and official
  results (45th general election): Elections Canada, Open Government
  Licence – Canada; see `research/fed-polls.md`.
- Municipal polling districts: Nova Scotia Open Data view `gcep-xeci`
  (OGL-NS); HRM council districts: HRM open data (OGL-Halifax).
- Census 2021: Statistics Canada (Open Government Licence – Canada for the
  REST service; Statistics Canada Open Licence for files and profile values).

## Rules the design commits to

- Results stay on the boundaries they were counted on; each election year is
  its own layer. Never re-project results across boundary sets.
- District, polling division and voting location are distinct; every results
  row shows its as-of date; "current seats" is a different claim from "who
  won".
- Party colour is conventional identity and never the only channel. Validated
  palette: light PC `#1e66cc`, Liberal `#be4d3c`, NDP `#d98f1a`; dark
  `#3f86e0`, `#d24b3a`, `#bb8a26`. Green appears in bars only, never as a
  fill.
- Poll-level maps always show the unmapped-ballot ledger (advance, returning
  office, write-in, special ballots are 33–53% of votes).
- Census values describe an area, never a parcel; suppressed, not-applicable
  and not-comparable are distinct hatch states; income is never a wash;
  mother tongue is symbols, never fills.
- Representatives: point-in-polygon on the device against static polygons;
  a dated directory snapshot built by a repository script from official
  pages; office channels only; party at election and current caucus both
  dated.
- Browser location and viewport never leave the browser (no third-party point
  or bbox lookups at runtime).

## Licensing

- GeoNOVA `BND` services and Elections Nova Scotia files carry no licence
  text (copyright "Elections Nova Scotia" at most). Keep them behind the
  existing Province licence gate with Elections Nova Scotia attribution until
  written redistribution terms are confirmed. Do not commit extracts.
- Elections Canada: OGL-Canada confirmed for the district boundary dataset;
  reuse terms for the KMZ/CSV packages were not fetched.
- Statistics Canada: attribution "Adapted from Statistics Canada, Census
  Profile, 2021 Census of Population (98-316-X2021001) and 2021 Census
  boundary files. This does not constitute an endorsement by Statistics
  Canada of this product."
