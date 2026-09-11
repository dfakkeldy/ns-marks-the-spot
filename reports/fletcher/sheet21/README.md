# Sheet 21: complete-sheet provisional georeferencing

**Geography remains unaccepted.** The four fresh checks on the corrected 15-control TPS give a **111.814739 m median** and **120.299825 m worst** error. The median exceeds the predeclared 100 m limit; the worst is below 200 m. Coverage, orientation and browser checks passed, but neither the sheet nor its seams are accepted. No live layer or deployment changed.

## Source and full extent

The original Rumsey scan is **10811×7646**, item `RUMSEY~8~1~2646~290014`, [Sheet 21 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2646~290014/manifest). Native IIIF regions were assembled with per-region pixel parity verified. The PNG, TIFF and manifest hashes are in [source-receipt.json](source-receipt.json); the source PNG SHA-256 is `1f135b06b54b9fb4a3083d39b326b7d45ad76a096336c4806c7696a10a3b74be`. Large imagery stays in `/Users/dfakkeldy/Downloads/fletcher-sheet21/`.

The [boundary](boundary.json) retains the complete mapped neatline, including West Bay islands, the southern Lennox Passage islands and the mapped Isle Madame portion. The full native overview, four corners and original latitude labels were personally inspected. No mapped extension was found outside this neatline. All content uses one continuous warp; no control-hull or corridor clipping was applied. [Full boundary review](full-boundary-review.jpg) and [corner review](boundary-corners.jpg) preserve the inspection.

The existing printed-grid observations remain byte-for-byte unchanged. Their 45°40′/45°35′ labels were checked in the original scan. The flat guide is approximate because the engraved rules slope; it supplies search context only, never physical control coordinates. See [guide audit](search-guide-audit.json).

Modern NSTDB 1:10k extracts cover `-61.24,45.56,-60.81,45.76`: 3,397 road, 2 rail, 3,429 water-line and 2,465 water-polygon features. [Receipts](reference-receipts.json) retain service URLs, request bounds, counts, CRS, dates and hashes. Coordinates come from actual returned vertices or endpoint junctions; the reference is not survey ground truth.

## Preserved identities and correction

All proposed clicks, corrections and their native/modern crosshair figures remain in the packet. Initial corrections distinguished McDonald Lake from its downstream pond, the two False Bay basins, Burnt Point from Burnt Island, the outer Cape Round headland from an inner spit, and Tillard Point from the opposite coast. These were made before any fitting. The [initial fit](reviewed-fit.json) was frozen at 15 controls before selecting six diagnostic checks.

| Fit and check status | Median ground m | Worst ground m |
| --- | ---: | ---: |
| Initial 15 controls, affine, six diagnostics | 404.002664 | 494.762820 |
| Initial 15 controls, TPS, same six diagnostics | 204.372009 | 1520.587140 |
| Corrected 15 controls, TPS, six reused diagnostics | 93.946757 | 145.548441 |
| Corrected 15 controls, TPS, four fresh checks | **111.814739** | **120.299825** |

The large initial failure triggered a regional identity audit. C07 incorrectly used **J0499**, a similar junction much farther east: a node label had been misread. Its narrow local topology looked plausible, but the regional correspondence was wrong. C07 and the entire failed fit and scores remain preserved. The replacement **C16/J0495** uses the same native junction `[4950,3657]`, with its actual western Black River context reviewed. The modern north/east connections are closer together than on the historical sheet; this remains a provisional correspondence.

All other fourteen initial control records are unchanged. No diagnostic was promoted to control. The [corrected fit](repaired-fit.json) was frozen separately in [repair-fit-freeze.json](repair-fit-freeze.json), SHA-256 `82e1c9490d3b0ea8ca239a17a0b012d9a9036c9fe2cf7018c891433ea9631618`, before fresh checks were selected. The six reused diagnostics are separate from fresh validation; their improved score is not fresh acceptance evidence.

The four [fresh checks](validation.json), never fitted, are:

| ID | Physical feature | Error ground m |
| --- | --- | ---: |
| V01 | Cook Lakes southern basin southern outlet | 120.299825 |
| V03 | Bumbo Island northernmost coast | 81.835466 |
| V04 | Brick Point easternmost outer coast | 114.876338 |
| V05 | Small island at McIntosh Cove northernmost coast, distinct from reused south-tip check | 108.753139 |

Fresh proposals V02 and V06 were rejected before scoring. J0108 did not establish the claimed Pringle Lake outlet; J0697 is the western inlet of the small eastern False Bay basin, not its historical eastern outlet. [Rejected records](rejected-fresh.json) preserve those identities. Bumbo Island and Brick Point also have materially different shoreline proportions, noted in their retained checks. Errors do not identify whether disagreement comes from old survey geometry, changing shores or reference generalization.

## Actual raster and browser evidence

The delivered provisional GeoTIFF is:

`/Users/dfakkeldy/Downloads/fletcher-sheet21/repaired-fifteen/sheet-21-full-sheet.tif`

It is **8496×5580**, RGBA, EPSG:3857, cubic resampled at 5 projected metre cells with exact GDAL TPS (`-et 0`). SHA-256: `75e5ce00163ef7e7c698bcd305a506770d67a719d581f0e8deeaa6d7a05e04be`. Cell size is not a geographic accuracy claim. [Raster receipt](raster-receipt.json) and [render provenance](render-provenance.json) identify the frozen inputs. No initial wrong-identity raster was rendered.

[Coverage](coverage.json) found **46,439,512 expected interior cells and zero transparent holes**, allowing one output cell at the boundary. All **71,786** sampled Jacobians had the expected negative sign for downward native y. These checks establish coverage and sampled orientation, not geographic acceptance.

Ten [actual warped-image views](warped-review/frames.json) were personally inspected against directly projected modern geometry. West Bay coasts are broadly recognizable, with bay and brook offsets. McIntosh Cove and Dunphey Head still disagree locally. Sporting Mountain has substantial Paddy, Marsh and Rocky lake differences; McDonald and the southern Mountain Lake outlet are better constrained. Eastern lakes remain recognizable but Crawley, Brown and Long Lake outlines differ. Black River routing differs between anchors. Buchanan/False Bay outlets are constrained while surrounding shores differ. Southern islands and Isle Madame remain present; island shapes, Tickle Channel, Poulamon Creek and local coastlines disagree.

Eight [adjacent-sheet views](adjacent-sheet-review/frames.json) compare actual rasters with Sheet 18 north, Sheet 20 east and both the prior affine and later 28-control full-sheet TPS Sheet 22 west. The northwest northern gap, stream discontinuities and western/eastern shore disagreements remain visible. Some extents overlap; that is not a shared-feature match. Neighbor hashes are retained in [join provenance](join-provenance.json). No seam is accepted, and the later Sheet 22 result's reused diagnostic scores are not promoted to fresh acceptance by this comparison. Its full-sheet receipt is retained in the existing [full-sheets report](../full-sheets/README.md); this packet adds comparisons, not another Sheet 22 fit.

The actual GeoTIFF was imported through My Maps in isolated Chromium at port 4198, enabled, reloaded, and viewed at desktop and mobile sizes. All three screenshots were personally inspected. Original raster bytes/SHA, embedded positioning, dimensions, alpha preview and enabled state survived reload; zero console/page errors occurred. [Browser receipt](browser-verification.json) links the local screenshots and detailed proof. This does not test Safari/native iOS, a native PNG/CSV browser mesh, or production acceptance.

## Editable imports and reproduction

Use the original **10811×7646 PNG** with these native-pixel CSVs and TPS:

- [Controls only](sheet-21-controls.csv): 15 controls.
- [Diagnostic review](sheet-21-diagnostic-review.csv): 15 controls plus six reused checks.
- [Fresh validation review](sheet-21-validation-review.csv): 15 controls plus four never-fitted checks.

Import the GeoTIFF directly using its embedded positioning; do not attach native PNG coordinates to that resampled raster. Point identities and uncertainty are in the corresponding JSON records. The actual web parser round-trips all three CSVs and its TPS agrees with GDAL to **8.84e-09 projected m**. This is solver consistency, not an accuracy claim.

```sh
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/render.py \
  --source /Users/dfakkeldy/Downloads/fletcher-sheet21/native/sheet21.png \
  --fit reports/fletcher/sheet21/repaired-fit.json \
  --boundary reports/fletcher/sheet21/boundary.json \
  --checks reports/fletcher/sheet21/repair-diagnostic.json \
  --out /path/to/new-output
```

Use `full-sheets/score.py` with `validation.json` to replay fresh scores independently; `review_warp.py`, `review_join.py`, `verify_import.ts` and `verify-browser.mjs` retain the review methods. [Preservation verification](preservation-verification.json) checks the unchanged fourteen controls, retired identity, input hashes and disjoint check roles. [Frame verification](frame-verification.json) verifies every point figure against its exact preserved stage.

Imagery attribution: David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. CC BY-NC-SA 3.0 and the project's recorded permission are distinct from deployment clearance; see [the rights inventory](../INVENTORY.md). Cropping, annotations and warp are modifications. Modern vectors: Nova Scotia NSTDB 1:10k. Existing licence gates and production source boundaries remain in force.
