# Fletcher Sheet 14 — Cape Mabou / Broad Cove

Sheet 14, immediately north of Mabou (16), now has a complete cropped review
raster and is included in the four-sheet local tile preview. This covers the
whole printed map, including the Cape Mabou highlands and eastern interior.
It is provisional georeferencing, not a seamless or geographically accepted
production replacement. The Sheet 14 southern margin prints 16, and Sheet 16's
northern margin prints 14; both were inspected in the native scans.

## Editable result

- [final-fit.json](final-fit.json): 22 physical-feature controls, GDAL TPS in
  EPSG:3857. This sheet had no supplied hand corrections to preserve.
- [sheet-14-controls.csv](sheet-14-controls.csv): fitting controls only.
- [sheet-14-checks.csv](sheet-14-checks.csv): five diagnostic checks, never fitted.
- [sheet-14-review.csv](sheet-14-review.csv): the combined NSMtS import file.
  The app refuses a checks-only file; import the combined file into a separate
  native-scan draft and select **Curved warp (TPS)**. Import replaces that draft's
  controls. Keep check rows as checks; do not attach native pixels to the resampled
  GeoTIFF. The controls-only file is suitable for the digitization transform.
- [boundary.json](boundary.json): complete inner neatline, approximately 8 native
  pixels inset to remove the printed frame. No corridor or control-hull clipping.
- [review/](review/): native crosshairs paired with modern NSTDB vectors;
  [frames.json](review/frames.json) records native crop coordinates. The rejected
  Q05 figure remains explicitly identified as rejected.

Native scan: `~/Downloads/fletcher-sheet14/native/sheet14.png`, **10852 × 7622**,
SHA256 `907ebc260018055cfc9da780a88f127db13834c0f7e831be7bf395c600a6854c`.
Rumsey IIIF record: `RUMSEY~8~1~2639~290007`, catalogue 3997.016. All 24 native
IIIF regions were verified pixel-identical to their assembled PNG positions.
The older July source hash identifies a different encoding/assembly and is not
asserted for this PNG. See [protocol.json](protocol.json).

Modern references are the provincial NSTDB water lines, water polygons and roads,
with complete query receipts in [reference-receipts.json](reference-receipts.json).
The rail query returned empty; it was not silently substituted. Printed graticule
and inverse TPS predictions were search guides only. Point identity, branch order,
native ink and source uncertainty are recorded in the point files.

## Accuracy and revisions

The five final unfitted diagnostic checks have **82 m median / 169 m worst**
approximate ground error. The same five points give the following retrospective
comparison; they were not fresh validation of the final fit:

| Fit | Median / worst ground m |
| --- | ---: |
| Initial 13 controls, affine | 152 / 240 |
| Initial 13 controls, TPS | 99 / 345 |
| Final 22 controls, TPS | 82 / 169 |

See [final-scores.json](final-scores.json), [baseline-affine-scores.json](baseline-affine-scores.json)
and [baseline-tps-scores.json](baseline-tps-scores.json). The final diagnostics meet
the working 100/200 m targets, but **there is no fresh validation of the final
revision**. Five checks, some close to controls in the same catchment, cannot
establish uniform full-sheet accuracy. These are agent audits, not a point-by-point
user audit or survey validation. The offshore area is largely extrapolation.

Earlier fits and failures remain intact. After the 18-control fit was frozen,
five fresh checks found 516/545 m median/worst error, including large errors near
Strathlorne, the southwestern interior and Hay River. Those three verified
junctions were consumed as controls in the 21-point revision. Two later fresh
checks gave 202/235 m; the Loch Ban peninsula became the 22nd control. Those
consumed checks are excluded from reported final accuracy.

The last side-by-side audit rejected Q05: its historical northern tributary had
been assigned to modern southeastern tributary J0584. Its apparently acceptable
124 m score did not validate that identity. It was never fitted. Files ending
`before-check-audit.json` preserve that result. Removing the invalid check did
not alter the fit or raster hash. [rejected.json](rejected.json) also preserves
unresolved preliminary candidates. Historical scores that include Q05 must not
be treated as fully valid check sets.

The renderer sampled 70,997 locations at 25-native-pixel spacing and found no
reversed or degenerate orientation samples. This is a sampled diagnostic, not
a proof about the continuous warp. [render-receipt.json](render-receipt.json)
records the source, fit, mask, checks and output identities.

## Full crop, join and delivery

GeoTIFF: `~/Downloads/fletcher-sheet14/result/sheet-14-full-sheet.tif`, RGBA,
9155 × 5618, EPSG:3857, 5 projected-metre cells. Cell size is not accuracy.
SHA256 `fcd823bc891904d737346105ef9de9818f582ead53093f6b2fe11802d5c334e0`.

The join to Mabou remains open. Across longitude -61.46° to -61.24°, sampled
vertical separation is approximately **335–775 ground metres**. The 1,282 m
maximum in the wider receipt approaches the staggered eastern side edge and
must not be described as the ordinary land join width. See [mabou-join.json](mabou-join.json).
This measures coverage separation, not feature error or proof of an original
survey omission. Adjacent native strips were inspected; no justified shared
boundary constraint was found to close the gap. No cosmetic edge displacement
was applied. Further physical boundary matches and fresh checks remain useful.

The immutable tile revision is `fletcher-full-sheets-20260908.4`, under
`~/Downloads/fletcher-full-sheet-tiles/`, with an accompanying ZIP. It includes
Sheet 14 plus the unchanged prior Judique, Mabou and Hawkesbury rasters. The
[archive receipt](tile-archive-receipt.json) includes SHA256 and successful CRC
verification. The four-sheet mosaic has 4,792 PNG XYZ tiles, zooms 8–15.

[Tile verification](../full-sheets/tile-verification.json) checks every inventory
hash and XYZ object and compares 202,633,412 opaque zoom-15 cells against a
continuous resample: no lost coverage cells or RGB differences. Browser checks
covered desktop/mobile, toggle, opacity, reload, seven regional views and
156 successful tile responses without console errors. This used regular
Playwright because the Browser plugin was unavailable. Screenshots are in
`~/Downloads/fletcher-sheet14/browser/`.

[Importer verification](import-verification.json) confirms 22 controls, five
checks, semantic CSV round trips, and agreement between the actual web TPS solver
and GDAL within 0.001 projected metre. This does not test the browser's native
scan mesh; the delivered preview uses the baked GeoTIFF tiles. The two affected
web test files (four tests), targeted ESLint and production build passed locally.
Hosted CI status is reported in the PR.

Reproduce with `../full-sheets/render.py`, `review_points.py`,
`verify_import.ts`, and the full-sheet tile/verification tools documented in the
[mosaic report](../full-sheets/README.md). Large imagery stays outside Git.

Attribution: David Rumsey Map Collection / David Rumsey Map Center, Stanford
University Libraries, CC BY-NC-SA 3.0, with existing project permission receipts
retained. Modern sources: Nova Scotia NSTDB. No production deployment is included.
