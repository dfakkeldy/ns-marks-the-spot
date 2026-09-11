# Fletcher Sheet 24 — full-sheet provisional georeferencing

**Draft; geography not accepted.** The fourteen-control TPS keeps the entire mapped frame and the complete Guysborough extension. Four fresh checks give **111.588509306 m median / 180.967759774 m worst** against limits of 100 m / 200 m. The median fails. Sparse northern/interior support, changed water shapes and unaccepted adjacent seams also prevent whole-sheet acceptance.

## Source, prior work and references

The native 10782 × 7655 scan comes from [David Rumsey Historical Map Collection](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2649~290017/manifest). `source-receipt.json` records native region downloads, assembly parity and hashes. PNG SHA-256: `916cf84b046656412ddfcfc88c0d0fef6c4a3b1ea8bba69c9f5e24ebd085eee8`.

The July physical pilot stopped for source drift before collecting physical controls or checks. Its incomplete Bazzite manifest evidence and terminal state remain unchanged. This packet uses a new direct-Rumsey native-region acquisition; it does not retroactively verify that old cached TIFF. The original grid observations and CSV likewise remain unchanged. `prior-state.json` and `preservation-verification.json` pin all four prior files. Ten individual engraved intersections preserve the scan's slant as search guidance only. Their old grid roles do not become physical controls. Both 45°30′/45°25′ N labels and the outer 61°35′/61°15′ W labels were personally read from native crops.

Modern NSTDB reference queries cover `-61.62,45.36,-61.18,45.60`: 3,296 roads, 39 rail features, 3,799 water lines and 1,920 water polygons. `reference-receipts.json` retains source URLs, bounds, counts, CRS and hashes. These source geometries are not survey ground truth. Large reference files remain outside Git.

Source image credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. See the existing collection permission and [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) record in `reports/fletcher/INVENTORY.md`. This packet adds crops, crosshairs, annotations and georeferencing. The current IIIF manifest's `license: null` is preserved; it is separate from the recorded collection permission. Imagery is not relicensed under repository MIT terms. No hosting or production publication is established here.

## Fitting and check history

Original candidate stages and all corrections are preserved. Native pixels and modern identities were resolved before scoring. Several first proposals selected the wrong node or missed the physical point: Goose Harbour's western braid instead of the main branch junction, Knight's wrong regional node and then western tributary instead of southern outlet, Round's wrong regional node and then upstream junction, Rocky's western inlet instead of southern connection, and Fraser's wrong location. Their figures and coordinates remain reviewable; they were never fitted in those wrong forms.

C01 Shepherd's eastern connection is rejected unscored because competing nearby connections and changed orientation prevent secure matching. C02 Clam Harbour Lake is rejected unscored because the lake narrows gradually into the river and the modern vector termination is not a unique physical point. C14 Sundown's southern connection and C15 Shepherd's southern connection provide reviewed inland controls instead.

| Stage | Controls | Check set | Median / worst ground m |
| --- | ---: | --- | ---: |
| Initial affine | 13 | Four diagnostics | 198.657178 / 372.384263 |
| Initial TPS | 13 | Same four diagnostics | 73.582860 / 404.129721 |
| Repaired TPS | 14 | Three reused diagnostics | 62.658563 / 82.611997 |
| Repaired TPS | 14 | Four fresh checks | **111.588509 / 180.967760** |

`reviewed-fit.json` was frozen at `5a1f70fba35b34f645266790d0e32ed49e8572d923471034ab041b72d2047e42` before diagnostic selection. Q05 Grady Point failed at 404.129721 m, then was explicitly promoted to C16 with identical coordinates. All thirteen earlier control records remain unchanged. `repaired-fit.json` was frozen at `709a307b37d27bcfbabaa2c68e2d961d26f2b9bdcde35c305e4bb1d6ae5d3456` before fresh validation selection.

On the same three retained diagnostic locations, the initial TPS gave 66.696710 m median / 80.469009 m worst. The repair slightly improves the median and slightly worsens the maximum; reused diagnostics are not fresh validation. Q01's competing northern Shepherd tributaries remain rejected unscored.

The fresh checks never entered the fit:

| ID | Physical feature | Error, ground m |
| --- | --- | ---: |
| V02 | Hadley Beach southern spit, extension | 156.108687 |
| V03 | Fraser Lake northern stream/shore connection | 67.068332 |
| V04 | McPherson Lake southeastern stream/shore connection | 180.967760 |
| V06 | Flat Head southern outer coast | 36.901589 |

V01 is rejected unscored because Knight's historical northern stream corresponds to a changed extended basin rather than a secure fixed junction. V05 is rejected unscored because one historical western Sundown tributary competes with three nearby modern tributaries. Candidate and corrected validation stages preserve these decisions. Flat Head's initial modern selection clipped the tip at the search-window edge; its expanded-window correction preceded scoring. Coordinates were never moved to minimize a score.

## Complete raster and visual review

Local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet24/regional-fourteen/sheet-24-full-sheet.tif`

SHA-256: `977633cdaff7a3a71b11b796c9d014d1ed8876f4c780c6ef9155d104fb47926c`

The raster is 8305 × 6358, RGBA, EPSG:3857, 5 projected metre cells, one exact GDAL TPS (`-et 0`) with cubic resampling. `boundary.json` uses the full mapped neatline with a continuous southern notch. It retains Guysborough town/wharves, Eliza Point, Ingersol Creek, Maclean Point, Hadley Beach and their labels, plus islands and mapped sea. `boundary-overview.jpg`, `boundary-corners.jpg`, `guysborough-extension.jpg` and `graticule-labels.jpg` record native review. The extension uses the same warp as the main sheet.

Coverage found **46,793,688 interior cells, zero transparent interior cells** with one output-cell edge tolerance. All **73,110** sampled Jacobians were negative, the expected image-y orientation. These checks establish coverage and sampled orientation only. Only the final fourteen-control raster was rendered; no initial thirteen-control raster comparison is claimed.

All eleven actual-raster frames in `warped-review/` were personally inspected:

- Northwest/Tracadie and Shepherd/Clam: river paths, Five Mile Lake and the northern Clam Harbour waters show large differences. Sparse upper-sheet support remains a limitation.
- Sundown/Clinton: southern lake connection is anchored; surrounding river bends differ. The dedicated Sundown frame clips part of that lake at the left edge; the wider Shepherd/Clam frame includes it fully.
- Goose Harbour Lakes: major historical/modern basin shapes differ. No unsupported lake-outline control was forced into the fit.
- Strait/Bear Head: recognizable coast and capes, with local shoreline and northern edge discrepancies. Eddy/Knight retains its broad coast, while Knight's northern water configuration and Carter Pond/Cape Argos differ.
- Guysborough Harbour: broad harbour placement is recognizable, but coves, inland lakes and tributaries disagree. The southern extension is visibly complete; local island outlines, town shore and Hadley spit differ.
- McPherson/Ragged and Goose/Grady: broad coast alignment is locally close, while lake shores, ponds and inland rivers differ. Grady's promoted point is no longer independent evidence.
- Southern full frame: the entire lower map and extension survive. The broad southern sea has no physical control evidence and remains extrapolation.

Four actual adjacent comparisons were personally inspected. The northwestern and northeastern Sheet 22 joins show frame gaps/overlap and physical discontinuities. The eastern Sheet 23 northern comparison shows coast discontinuity and an edge gap; its southern comparison contains mapped sea and supports frame placement only, not a physical seam. No join is accepted. `join-provenance.json` pins the latest 28-control Sheet 22 raster and the 12-control Sheet 23 raster. This completes the previously outstanding Sheet 23 western comparison in this packet.

## Editable files and browser proof

- `sheet-24-controls.csv`: fourteen controls only.
- `sheet-24-diagnostic-review.csv`: same controls plus three reused checks.
- `sheet-24-validation-review.csv`: same controls plus four fresh checks.

All use `pixel_x,pixel_y,lon,lat,role,label`, with stable IDs as labels and descriptions in JSON. Use these CSVs with the exact native PNG. The real web parser round-trips the files, and its TPS agrees with GDAL to **7.67988269332e-09 projected metres** at delivered checks. This proves parser/solver consistency, not geography.

The actual GeoTIFF was imported and enabled through My Maps in isolated Chromium. Desktop import, desktop reload and mobile reload screenshots were personally inspected. Stored raster SHA/bytes, georeference, dimensions, alpha preview and enabled state survived reload; console/page errors were empty. Desktop shows the complete map and extension; mobile displays the central portion with the extension, naturally clipping the wider sheet at this zoom. `browser-verification.json` records hashes and local evidence paths. This is GeoTIFF import proof, not PNG+CSV mesh acceptance.

Large native/reference/raster/browser files remain under `/Users/dfakkeldy/Downloads/fletcher-sheet24` outside Git. No product code or built-in layer changed. Local source/reference preservation, frozen checks, 54 exact point-frame records, raster coverage/orientation, CSV parity and browser persistence passed. Geographic acceptance failed. Hosted CI is separate and tracked on the draft PR.

## Reproduction

Use the existing benchmark Python environment with `/opt/local/bin` on PATH. Run `reports/fletcher/full-sheets/score.py` with a frozen fit and its corresponding check JSON. Run `reports/fletcher/full-sheets/render.py` with the native PNG, `repaired-fit.json`, `boundary.json` and `repair-diagnostic.json`. The source hash is enforced. `review_warp.py` and `review_join.py` use actual GDAL raster windows; `verify_import.ts` bundles the actual web parser. Run `verify-browser.mjs RASTER OUTPUT_DIRECTORY` with the local Vite server on port 4198.
