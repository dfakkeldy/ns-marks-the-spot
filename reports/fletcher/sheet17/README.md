# Fletcher Sheet 17 — provisional full-sheet georeferencing

**Geography is not accepted.** Four fresh checks on the frozen ten-control fit have median **120.270509 m** and worst **630.289956 m**. Both the 100 m median and 200 m maximum targets fail. Coverage, CSV and browser verification do not accept geographic placement. No production layer, label projection, licence gate or deployment changed.

## Artifacts and source

- `sheet-17-controls.csv`: ten fitting controls.
- `sheet-17-diagnostic-review.csv`: those controls plus two reused checks.
- `sheet-17-validation-review.csv`: those controls plus four fresh checks, all excluded from fitting.
- CSV header: `pixel_x,pixel_y,lon,lat,role,label`; pixel coordinates refer to the **10873 × 7642** native source. Stable IDs link to physical identity and modern node/vertex provenance in the JSON records.
- Native PNG: `/Users/dfakkeldy/Downloads/fletcher-sheet17/native/sheet17.png`.
- Complete GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet17/regional-ten/sheet-17-full-sheet.tif` — **8603 × 5907**, RGBA, EPSG:3857, 5 projected metre cells, exact TPS (`-et 0`). Large imagery stays outside Git.
- `full-boundary-review.jpg`, stage-specific native crosshairs, `warped-review/`, and `adjacent-sheet-review/` provide compact visual evidence. `HANDOFF.md` lists outstanding work.

Source: [David Rumsey Historical Map Collection, Sheet17](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2642~290010/manifest), Province of Nova Scotia (Island of Cape Breton). Source SHA-256: `a8a3f35cbf6addc45abc8cb2934ddea9a6eec4edc8346efc6de783d35355cd7e`. Native region acquisition and decoded-pixel mosaic parity were verified. Source, TIFF and manifest hashes are preserved in `source-receipt.json`; a source attribution is not production permission.

No earlier physical Sheet17 controls were found in the repository or targeted local asset search. Existing `tools/fletcher/observations/sheet-17.json` and the graticule GCP file remain unchanged. Their printed-coordinate intersections were used only as a rough search guide. Native printed labels and source corners were inspected; every new physical point was chosen from original-resolution imagery, and modern coordinates come from actual NSTDB nodes or vertices. A nearest-vertex search only locates a candidate and does not establish identity.

## Frozen fits and failures

The initial eight controls cover Benacadie and Dhu points, three northern Loch Lomond mouths, the southern lake's eastern brook mouth, Red Island's western tip and Johnson Island's northern tip. Candidate-stage files preserve all pre-fit pixel and reference corrections. C01 initially selected an adjacent shore segment; native review corrected it to the actual point. C06–C09 mouth placements and C10's western extremum were corrected before fitting. C09's modern line node and polygon shore notch differ by roughly60 m; the record retains this uncertainty.

Rejected controls are retained in `rejected-candidates.json`: C03's hook spit has changed shape; C04 selected the wrong Bruce Brook arm; C12's fork identity was unsupported; C13's proposed fork was not drawn. They were not scored or fitted.

`reviewed-fit.json` was frozen before diagnostic selection. Q01 and Q03 were moved to their native outlet junctions before scoring. Q05's initial modern proposal mistook an adjacent coastal bend; its corrected crosshair identifies the small projection southwest of Big Pond. Q02 remains rejected because its lake connection could not be separated confidently from road/mill geometry.

| Fit and checks | Median ground m | Worst ground m |
| --- | ---: | ---: |
| Initial8 affine / four diagnostics | 75.224138 | 699.546570 |
| Initial8 TPS / same four diagnostics | 224.694063 | 873.179373 |
| Initial8 TPS / retained Q03+Q04 only | 91.884690 | 140.646824 |
| Repaired10 TPS / same Q03+Q04 | 70.472932 | 124.761099 |
| Repaired10 TPS / four fresh checks | 120.270509 | 630.289956 |

TPS failures Q01 **308.741302 m** and Q05 **873.179373 m** were explicitly promoted without coordinate changes: **Q01→C14, Q05→C15**. All initial eight controls and their earlier errors remain intact. C15's small coast projection is provisional because historical shoreline shape differs.

The revised fit was frozen at `1c30eee3254577eb7fb47cbb971cdcd8691c63addcc315c259c95fe08ddbf03a` before selecting fresh validation. The fresh checks remain unpromoted:

| Fresh check | Ground error m |
| --- | ---: |
| V03 | 162.352702 |
| V05 | 630.289956 |
| V01 | 78.188315 |
| V06 | 17.950514 |

V01 is the northern tip of the lone northern-Loch-Lomond island; V03 is the eastern middle-lake brook mouth; V05 is the Bruce Brook coastal barrier gap; V06 is Johnson Island's broad western bend. V05 has explicit barrier/lagoon-change uncertainty. Original proposals and corrected native crosshairs remain available. Fresh V02 was rejected after both proposed modern nodes proved to be different features; V04 confused a bay neck with an outlet. Rejections preceded scoring. Four checks are geographically sparse and do not establish uniform accuracy.

## Complete mapped frame and actual raster review

The boundary retains the full mapped neatline: Bras d’Or Lake water, Red Island and smaller islands, the northern peninsula, southern mainland and lake portions. Full native scan, all four corners and the red boundary overlay were inspected. No mapped extension or crossing place label was visible outside the frame. The source explicitly labels central and southeast areas as unexplored; no absent historical drainage was invented.

The raster has **47,842,912** expected interior cells with **zero transparent interior cells**, using a one-cell boundary tolerance. All **71,795** sampled Jacobian determinants are negative, consistent with native y increasing downward. No sampled orientation reversal was found. Coverage and sampled topology are separate from accuracy.

Nine actual raster windows were personally inspected alone and overlaid with directly projected NSTDB vectors. Benacadie/Dhu and Red Island have recognizable anchored coasts, with neighboring pond/bank differences. Bruce Brook and Gaspereau drainage are substantially displaced. Lochmore's coast and spit have shape/position differences; the full spit is visible in the browser overview. Northern Loch Lomond fits its anchored mouths but nearby upper ponds differ. The middle basin, western arms and southern lake banks retain substantial shape differences. Southwest islands, coves and inland streams are unevenly aligned. Central and southeast modern geometry is not evidence of what the historical mapper observed.

Two actual windows compare the western edge with Sheet18's provisional raster. They show mostly open water and frame positions, with no shared physical landmarks sufficient for geographic seam acceptance. `join-provenance.json` pins both actual raster hashes. Northern/eastern/southern joins remain outstanding. Only the ten-control raster was rendered and reviewed; the eight-control affine/TPS fits are numerical baselines.

## Reference and verification

NSTDB reference bbox: `-60.87,45.73,-60.45,45.94`; **1549 roads, 11 rail, 2538 water lines and 1416 water polygons**. Source queries, counts, retrieval time, CRS/axis order and SHA-256 hashes are preserved in `reference-receipts.json`. Modern mapping is a reference, not survey truth.

The actual application CSV parser accepts ten controls, two diagnostic checks and four fresh checks. Semantic serialization round trips pass. Application TPS and GDAL agree at every delivered check to a maximum **7.27e-09 projected m**. This tests parser/solver consistency, not the browser image mesh.

The GeoTIFF was imported through My Maps → Add a map file in isolated Chromium. Desktop import, desktop reload and mobile390×844 screenshots were personally inspected. Stored bytes, georeferencing, pixel dimensions, preview alpha and enabled state survived reload; no console/page errors were captured. Screenshots and full receipts are linked in `browser-verification.json`. This is local evidence, not deployment.

Source/reference/raster hashes, initial control preservation, unchanged promotions, frozen-fit hashes, check separation and all point-frame coordinates were reverified. No app code changed and no local native build was run. Hosted CI is a separate PR result. Active tile revision remains `fletcher-full-sheets-20260909.3`.

## Reproduce

```bash
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet17/regional-fit.json --checks reports/fletcher/sheet17/validation.json --out /tmp/sheet17-validation-replay.json
PATH=/opt/local/bin:$PATH /Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/render.py --source /Users/dfakkeldy/Downloads/fletcher-sheet17/native/sheet17.png --fit reports/fletcher/sheet17/regional-fit.json --boundary reports/fletcher/sheet17/boundary.json --checks reports/fletcher/sheet17/regional-diagnostics.json --out /Users/dfakkeldy/Downloads/fletcher-sheet17/replay
web/node_modules/.bin/rolldown reports/fletcher/sheet17/verify_import.ts --platform node --format esm --file /tmp/verify-sheet17.mjs
node /tmp/verify-sheet17.mjs
```

Review helpers reproduce the corresponding figures with recorded local source/reference assets; `verify-browser.mjs` requires the local web server on port4198.
