# Sheet 24: McPherson Lake and Hadley Beach refinement

**Draft — retain the earlier fourteen-control provisional baseline.** The sixteen-control experiment fails the fresh median limit. McPherson's inlet barely changes, while Byron Island's southern tip worsens. Neither fit has whole-sheet geographic acceptance.

## Unchanged repair and fresh evidence

All fourteen original control records remain identical. After personally reviewing original unrotated native close/wide crosshairs and modern geometry, V02 Hadley Beach southern spit [3748,7058] became C17 unchanged (prior 156.108687 m), and V04 McPherson Lake southeastern connection [5428,5507] became C18 unchanged (prior 180.967760 m). Hadley spit shape and McPherson's thick native stroke retain their original uncertainty; these are experimental anchors, not survey ground truth.

The sixteen-control fit was frozen before new selection. Two fresh proposals were personally reviewed close/wide and accepted unchanged before their first score: F01 McPherson eastern tributary J1188 [5421,5353], and F02 Byron Island southern coast [3556,6571], modern closed island OBJECTID 18114. Byron's historical outline differs from its modern outline, and its northern tip is an existing reused diagnostic. The southern tip is a separate point but spatially correlated; no island-wide independence is claimed. Hadley Cove's competing modern tributaries did not provide a unique native match, so no cove junction was selected.

| Fresh check | Fourteen-control baseline | Sixteen-control experiment |
| --- | ---: | ---: |
| F01 McPherson eastern inlet | 126.443325 m | 123.931118 m |
| F02 Byron Island southern coast | 51.883619 m | 118.664597 m |

Fresh median 121.297857 m / worst 123.931118 m fail the 100 m median limit; the 200 m worst limit passes. The old fit gives 89.163472 m / 126.443325 m on these same two locations, but its previous validation median still failed and is unchanged. Five reused diagnostics are 55.121673 m median / 148.096938 m worst; Byron's northern tip also worsens. No fresh point was promoted, moved or dropped after scoring.

## Entire mapped source

Source dimensions 10782 × 7655, SHA-256 `916cf84b046656412ddfcfc88c0d0fef6c4a3b1ea8bba69c9f5e24ebd085eee8`. Complete boundary SHA-256 `c3cca43241928adf83e93120b8dac5840e02829dfc57b43d6c7e619c4c66d4ce`. The unchanged southern notch retains Guysborough town/wharves, Eliza Point, Ingersol Creek, Maclean Point, Hadley Beach and labels. All islands and mapped sea remain in the same exact TPS; there is no independent extension transform.

All 29 packet figures were personally viewed: eight native frames, three boundary/extension views, eleven actual old/new warp comparisons, four adjacent-sheet views and three browser screenshots. Tracadie/Clam/Five Mile and Goose Harbour drainage and basin shapes remain displaced. The dedicated Sundown panel clips part of the lake; the wider Shepherd/Clam view includes it. Eddy/Knight and Strait anchors are largely unchanged. McPherson's outlet and Hadley tip fit their new anchors, but the northern lake inlet barely improves and the Guysborough extension bends, with worse Byron placement. Town shores, interior waters and surrounding coves still disagree. Northern Sheet22 joins retain gaps and discontinuities; the northern eastern Sheet23 join has displaced coast, and its southern view is mostly mapped sea. No seam or broad sea extrapolation is accepted.

External experiment: `/Users/dfakkeldy/Downloads/fletcher-sheet24/refinement-20260912/sheet-24-full-sheet.tif`, 8293 × 6458, exact GDAL TPS, EPSG:3857, 5 projected metre cells, cubic RGBA. Raster SHA-256 `3898e320d6882f9c4cc7174a7fc027471391aa05a59bacbd4be48d870dbdbe29`; fit SHA-256 `50d24f32cdf37a1d369fcdd4bc840b3e7e2355fe71e7b4c238d09f455e13db53`. Coverage verifies 46,977,927 interior cells with zero transparent holes; all 73,110 sampled Jacobians are negative. Coverage and sampled orientation do not establish geography.

Preferred earlier provisional raster: `/Users/dfakkeldy/Downloads/fletcher-sheet24/regional-fourteen/sheet-24-full-sheet.tif`, SHA-256 `977633cdaff7a3a71b11b796c9d014d1ed8876f4c780c6ef9155d104fb47926c`.

## Verification, preservation and replay

Editable CSVs contain sixteen controls, five reused diagnostics and two fresh checks. The real web parser roundtrips them and its TPS agrees with GDAL. Actual GeoTIFF import, desktop reload and mobile reload preserve stored raster bytes/hash, dimensions and enabled state; errors are empty. All three browser screenshots show the map and southern extension. This is local import evidence, not geographic or production acceptance.

`verify_packet.py` verifies source/reference hashes, parent nightly provenance, unchanged controls and promotions, freeze chronology, no prior coordinate reuse among fresh points, direct modern geometry, exact native centers/radii, score hashes, coverage, CSV behavior, raster persistence and every figure hash. Parent inputs are pinned to nightly commit `c32c85e917aa8746fa0b98f928f76a366127b7ee`. Original pilot source-drift failure, Bazzite manifest evidence, engraved-grid observations, all proposals/corrections/rejections and scores remain unchanged. Printed intersections provide search context only.

Replay uses `reports/fletcher/full-sheets/render.py` and `score.py`, this packet's review scripts, the Sheet14 coverage verifier, `verify_import.ts` bundled with web's rolldown, and `verify-browser.mjs` against local port 4199. Source/reference/raster and neighboring artifact hashes are in receipts. Rumsey/Stanford credit, CC BY-NC-SA 3.0 terms and null manifest licence are retained. No active layer, merge, deployment or publication pin changes.
