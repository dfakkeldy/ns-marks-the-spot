# Inverness south continuation — 15 September 2026

Retain the four-control physical affine and the separate accepted July baseline. Two new physical checks add the Ainslie Glen–Skye River junction and the mainland cape north of Port Hood. Together with the earlier Lake Ainslie outlet, their **first validation phase** gives **326.28 m horizontal ground RMS** on the physical affine, versus **330.42 m** on the accepted-baseline TPS at the exact same three coordinates. The 250 m working target is not met.

These three observations subsequently informed the explicit refinement trials below. They are **now diagnostics**, with **zero fresh checks after selection**. Their original first scores and the pretrial aggregate remain preserved; do not present the aggregate as untouched validation after these comparisons.

| First validation phase | Count | RMS m | Median m | Empirical P95 m | Maximum m | Mean east / north m |
|---|---:|---:|---:|---:|---:|---:|
| Earlier IS15 | 1 | 290.70 | 290.70 | 290.70 | 290.70 | −166.85 / +238.05 |
| New IS18 and IS19 | 2 | 342.69 | 326.96 | 419.34 | 429.61 | +247.44 / −211.86 |
| First cumulative phase, IS15/18/19 | 3 | 326.28 | 290.70 | 415.72 | 429.61 | +109.34 / −61.89 |

Cumulative scatter about the mean residual is 301.12 m. Distances use the preserved equirectangular ground calculation, radius 6,371,008.8 m and mean-latitude cosine; direction is warped minus reference. Empirical P95 uses NumPy's linear interpolation and is not a confidence guarantee. Stated observation uncertainty is not subtracted.

## Correspondences

**IS18 — Ainslie Glen Brook / Skye River.** Native source `(25528.333333333332, 16921.666666666668)` maps to original NSTDB node `(-61.15695012726067, 46.00547877443053)`: Ainslie Glen Brook 254259 v178, Skye River 277268 v161 and 278677 v0, all WARV50. The first affine error is **429.61 m**, east/south (+308.35 / −299.13 m); the accepted baseline gives **256.34 m**. This point is inside the source control hull, with 150 m uncertainty.

The broad scan traces Skye River from Skye Glen toward Whycocomagh Bay and the northeastern Ainslie Glen tributary. The labelled Mullach Brook reaches that tributary farther northeast. The original named reference network has the same junction order; `skye-network.jpg` marks those distinct nodes and MacDonalds Brook upstream. The source crosshair uses the thin-stream junction, with the thick road junction and later downstream road/river tangle kept separate. It is upstream of the [previous withheld IS17 Skye/Indian search](../distributed-review-20260913/inverness-south/README.md).

An initial unscored proposal used filename IS16, which collided with the earlier withheld Mabou search ID. It was renamed IS18 before scoring. Crosshair review against the independently framed older IS17 context moved it ten displayed pixels down to the thin-stream junction, before any residual was calculated. Exact original proposal bytes and crosshair are retained in `observations/unscored-proposals/`; the scored observation was not altered afterward. The original withheld IS16 and IS17 searches remain unchanged.

**IS19 — western coast turn at Black Point, engraved “Cape Linzee”.** Native source `(14242, 15411)` pairs with original WACO20 2332 v1, `(-61.55277588257435, 46.041197039390056)`. Its first affine error is **224.31 m**, east/south (+186.52 / −124.59 m), compared with **332.99 m** on the accepted baseline. It is outside the control hull; stated uncertainty is 150 m.

The long northeastern coast approach, projecting western corner, short eastward return and following south-trending shore match in the original and modern geometry. The broader sequence places Little Mabou to the north, Port Hood to the south and Port Hood Island offshore southwest. The gazetteer locates Black Point CAEBG here. The exact historical-name query returned no result, so this report makes no documentary claim about a renaming; the physical coast establishes the correspondence. The original coastline vertex is used, not the representative name point.

`observations/` includes native crosshairs, original reference plots, frame transformations and hashes. The source remains the 34,427 × 34,543 Inverness JP2, SHA-256 `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8`. Modern geometry is original NSTDB water-line data. The western extract provenance remains in [its original receipt](../physical-review-20260913/inverness-south/fresh-reference-receipt.json); every observation records its actual reference path/hash.

## Explicit refinement trials

All promotions use the unchanged scored coordinates, preserve first failures, and remove every promoted feature from later checks. The six historical diagnostics are the separately audited set from [the distributed review](../distributed-review-20260913/inverness-south/README.md): IS06 withheld only in that audit, Cow Island retraced only in the audit copy, and five remaining approximate historical hand pixels. The accepted eleven-check history is unchanged.

| Added physical support | Same remaining checks | Frozen affine4 RMS m | New affine RMS m | New TPS RMS m |
|---|---|---:|---:|---:|
| IS18 Skye, five controls total | Six historical + IS15 + IS19 | 178.32 | 243.25 | 344.42 |
| IS18 + IS19, six controls | Six historical + IS15 | 170.74 | 225.67 | 321.08 |
| IS18 + IS19 + IS15, seven controls | Six historical only | 141.16 | 178.44 | 134.98 |

Five-control TPS worsens the Ainslie outlet to 719.97 m; six-control TPS worsens it to 779.63 m. Seven-control TPS gives a slightly lower historical diagnostic RMS but increases the maximum from **223.71 to 257.41 m**. That small average improvement on clustered, approximate diagnostics does not establish improved geography across the expanded control regions. Retain the simpler affine under the established tail-error preference. The seven-control TPS remains an **unselected numerical candidate**, with no newly rendered artifact, distortion audit or post-fit fresh validation. Other trials also remain unselected. Full per-point results, role histories and editable inputs are in `skye-refinement/` and `role-history.json`.

`controls.csv` is the retained affine4. `new-checks.csv` and `cumulative-fresh.csv` preserve the **pretrial first-validation phase**; those filenames do not imply current independence after the explicit comparisons. Do not pool them with the historical diagnostics or count promoted features as fresh checks of a trial they fitted.

## Actual raster and terrain

The retained GeoTIFF is unchanged: `south-explicit-affine-20m.tif`, SHA-256 `f3036573572ccadc3a50b87a9e13e82036d7ff3698a6ea4602cbd4fd03d4f176`. It remains a provisional full-content review at 20 projected-metre cells, separate from the accepted July artifact. The prior zero-hole audit over 22,718,783 expected cells and explicit-affine representation apply to the same bytes; no new full raster was rendered.

Two new actual-raster/reference windows show the Skye junction southeast of its reference and the western cape east/south of its reference. The checked raster positions have nonzero alpha. This is direct raster evidence, not an inverse search-guide overlay.

The production importer accepted the 4,757 × 6,466 GeoTIFF, disclosed reduced display resolution, and retained it after navigation/reload as the only active My Maps raster at 70% opacity. Both areas were inspected in 2D and **10× terrain, north up, 50° tilt**. The Skye valley was additionally inspected at 0° tilt because the exaggerated foreground slopes obscure valley bottoms. The relief clarifies broad valley and headland context but does not supply measurement coordinates. No captured console errors occurred. `browser-review.json` contains screenshot and state receipts; large browser captures stay in the local Downloads cache. No raw-scan browser mesh acceptance is claimed.

`crop-execution.json` records an intentionally terminated, still-running direct JP2-to-JPEG crop. Its empty partial file was never used as evidence. The completed crops materialized the same original-source region in GDAL memory before JPEG encoding. This is a processing change, not a change to the scan or a diagnosis of the decoder's underlying performance.

## Remaining work and reproduction

These checks add inland and western-edge evidence, but the 20–30 distributed-check ambition remains unmet. Southwestern coastal reaches, mountainous interiors, northern edges and shared-feature seams remain insufficiently checked. The new inland discrepancy persists inside the hull. Continue south validation and evidence-backed refinement; no new whole-panel acceptance, tiles, activation or deployment follows from this report. The July controls, checks, acceptance gates and artifact remain preserved.

From the repository root:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/inverness-south-continuation-20260915/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

All 428 Church unit tests passed. The report verifier replayed 29 measurement sets and confirmed source/reference frames, promotion exclusions, original baseline hashes and unchanged raster bytes.

`verify_import.ts` checks six editable inventories through the production parser/serializer and compares affine/TPS calculations with GDAL at check points and content-boundary vertices. Solver agreement does not validate trial geography. `frozen-inputs.json` pins original inputs to nightly ancestry commit `bd4f54f2c71872534257e6b0e2b14c775d04dd0a`. Source-derived figures retain David Rumsey Map Collection / Stanford Libraries credit and the recorded CC BY-NC-SA 3.0 scan terms.
