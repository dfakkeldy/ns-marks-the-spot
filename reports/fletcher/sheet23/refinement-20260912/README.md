# Sheet 23: Grand Lake and Shaw Lake refinement

**Draft — keep the earlier twelve-control provisional baseline.** Fourteen controls improve one Grand Lake check but sharply worsen the Shaw Lake inlet. The experiment fails both fresh-check limits and is not geographically accepted.

## Repair, rejection and frozen checks

All twelve existing controls remain identical. Exact native close/wide views and modern context were personally inspected before unchanged promotion of V01 Grand Lake western lobe northern stream junction [5129,1729] to C14 (prior 506.971356 m), and V02 Shaw Lake southern stream junction [6324,2088] to C15 (prior 334.610911 m). Thorn Island V03 retains its original 229.369327 m failure: historical broad bulb and modern narrow lobe differ, so it was neither moved nor promoted. Parent proposals, corrections, rejected identities and earlier fit failures remain unchanged.

The fourteen-control fit was frozen before fresh selection. F01 Grand Lake northeastern inlet J0281 was corrected from [5320,1652] to [5340,1657], from neighboring land to the stream/shore junction. F03 Shaw Lake northern inlet J0337 was corrected from [6160,1940] to [6121,1985], where the tributary crosses the road into the lake. Both corrected points were personally viewed close/wide before their first score. F02 [5895,1476] was rejected unscored: J0261 is a stream junction beside the road west of Lac Sec, not the lake outlet. All original proposals and figures remain.

| Fresh check | Twelve-control baseline | Fourteen-control experiment |
| --- | ---: | ---: |
| F01 Grand Lake northeast inlet | 509.516558 m | 210.163760 m |
| F03 Shaw Lake northern inlet | 65.210915 m | 646.408607 m |

Fresh median 428.286183 m / worst 646.408607 m fail 100 / 200 m. These checks are in the same two repaired lakes, so their spatial correlation also limits broader inference. Six reused diagnostics have median 34.263391 m / worst 455.072640 m; the latter is Rocky Islets Q04, a preserved regression. No score drove a further coordinate change or promotion.

## Full sheet and visual outcome

Source 10741 × 7635, SHA-256 `2ed268fb21d3ff991d2d79a4b0c7792ae4284a68b525993798534c321db865ba`. Complete boundary SHA-256 `a7f8505cceecfa794c95e5e7daf2ee06f0bd29b32468fd0ce080ed8d55c40907`. The full engraved frame retains Janvrin, Isle Madame, Petit-de-Grat, Green Island, all rock symbols, labels and the large southern sea area in one TPS. Empty sea has no physical validation; it remains extrapolation.

All 36 packet figures were personally viewed: sixteen native frames, two boundary views, ten old/new actual warp comparisons, five neighboring-sheet comparisons and three browser screenshots. Grand Lake's northern lobe improves locally but retains shape differences; Shaw Lake moves south and shears; Rocky Islets move away from their modern position. Thorn/Glasgow and Janvrin coves remain displaced. Cape Hogan and Jerseyman are largely unchanged, while Petit-de-Grat's internal waters and coastline proportions disagree. Northern joins with Sheet 21 show gaps and displaced drainage. Western Sheet 24 views show mismatched Rabbit Island coast and mostly empty sea farther south; no seam is accepted. All neighboring rasters remain provisional and are hash-pinned.

External fourteen-control raster: `/Users/dfakkeldy/Downloads/fletcher-sheet23/refinement-20260912/sheet-23-full-sheet.tif`, 8300 × 5709, exact GDAL TPS, EPSG:3857, 5 projected metre cells, cubic RGBA. SHA-256 `039f2ccc7e7f552e5f28a68f51d3b14d9455b9b39afcc8d9901cbe819e1c7d19`; fit SHA-256 `d806dd99be1fc103230145282ed707d808a77918802bb6fcd3676ee53776648d`. All 45,962,448 interior cells are covered with zero transparent holes; all 71,701 sampled Jacobians are negative. These checks establish coverage and sampled orientation only.

Preferred earlier provisional raster: `/Users/dfakkeldy/Downloads/fletcher-sheet23/regional-twelve/sheet-23-full-sheet.tif`, SHA-256 `6355a23f84dd1a7017a6065f7b48e9552ce4cbd3dd1074cd441a936906293581`.

## Technical evidence and replay

Editable CSVs contain fourteen controls, six reused diagnostics and two fresh checks. The actual web parser roundtrips all files; its TPS agrees with GDAL. Actual GeoTIFF import and desktop/mobile reload preserve stored bytes, hash, dimensions and enabled state; the browser error log is empty. Local technical success does not override geographic failure.

`verify_packet.py` verifies source and reference hashes, unchanged controls, exact promotions, freeze chronology, fresh-point independence from prior records, exact native centers/radii, direct modern geometry, score hashes, coverage, CSV behavior, raster persistence and all figure hashes. Frozen parent inputs belong to nightly commit `c32c85e917aa8746fa0b98f928f76a366127b7ee`. Original engraved-grid observations and their different source encoding hash remain intact and serve only as approximate search guidance.

Replay uses `reports/fletcher/full-sheets/render.py` and `score.py`, the preserved review scripts, Sheet 14's coverage verifier, `verify_import.ts` bundled with web's rolldown, and `verify-browser.mjs` against local port 4199. Native, reference and raster paths are recorded in provenance. Returned-empty railway remains distinct from absence. Rumsey/Stanford credit, CC BY-NC-SA 3.0 terms and null manifest licence remain unchanged. No merge, deployment, active layer or publication pin change.
