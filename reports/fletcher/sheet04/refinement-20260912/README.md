# Sheet 4: preserved Pine, Cameron and Mary Ann refinement experiments

**Draft — geographic acceptance fails. Neither experiment is recommended as a whole-sheet replacement.** The earlier eight-control raster remains the comparison baseline, also unaccepted. These experiments improve some local junctions but retain large Black Brook errors, western displacement, uncertain coastline detail and unaccepted seams. No merge, deployment or layer activation is included.

## What changed

The original eight fitting records remain exactly unchanged. After personal inspection of native unrotated close and wide crosshairs beside direct modern NSTDB geometry, old V01 (Pine northern tributary) and V03 (Cameron southern tributary) were promoted unchanged to C11 and C12. Their previous errors of 219.58 m and 125.76 m remain attached to the complete old records in `repaired-fit.json`. V02 on Ingonish Island's southern shore remains a reused diagnostic; its broad shoreline definition did not justify a control.

A new Middle Head R01 proposal resolved the earlier mainland-versus-island error by tracing connected WACO20 endpoints from the peninsula. It selected object 8513, part 0, vertex 4 at −60.34941307014683, 46.65359529636769. This does **not** settle which historical extremity is equivalent: the native northeastern finger, modern flat eastern edge and southern lobe differ. The native point (3864,5163) remains rejected, unscored and unfitted. `mainland-component-review.json`, `repair-proposals.json`, `rejected-repairs.json` and both crosshair views preserve that distinction.

The ten-control fit was frozen before collecting F05–F07. Every placement revision was made from physical review before the first score:

- F05 (J0217): the initial (2229,1373) selected a different western fork. It moved to (2342,1376), then to the exact northern-stem junction at (2335,1378). All versions remain visible.
- F06 (J0266): (3770,1642) was downstream on the bank; (3759,1645) is the Mary Ann/Black southern-bank join. Modern lower-channel loops and historical bank generalization limit precision.
- F07 (J0611): (1821,4264), Cameron's western southern tributary, was retained after reviewing its order relative to the northern branch and C12.

| First fresh check | Eight controls, m | Ten controls, m |
| --- | ---: | ---: |
| F05 Pine tributary | 549.27 | 123.41 |
| F06 Mary Ann/Black | 533.56 | 557.47 |
| F07 Cameron tributary | 227.35 | 80.65 |

The ten-control median is 123.41 m and worst is 557.47 m, failing the frozen 100 m median / 200 m worst criterion. Its western Black Brook alignment also regresses. Reused Q01/Q02/V02 results are separate from these fresh checks.

F06's supported physical identity justified a second experiment: it became C13 **without changing either coordinate**. Its full 557.47 m failed result remains embedded. The ten-control attempt was retained intact. `11-control/repair-freeze.json` predates collection of the next checks:

| Second fresh check | Eight controls, m | Ten controls, m | Eleven controls, m |
| --- | ---: | ---: | ---: |
| F08 Black Brook mouth south bank, J0226 | 629.78 | 717.48 | 480.99 |
| F09 southwestern tributary, J0245 | 1050.51 | 1130.69 | 226.94 |

F09's original J0244 was the separate southeastern tributary. Before any score, modern identity changed to J0245 and the native crosshair moved from (4240,1450) to (4250,1457), on the southwestern bank join. Original and corrected close/wide views are retained. F08 and corrected F09 were checked against historical controls, checks and rejected identities; neither was previously fitted or scored. Both are in the same local mouth system, so even a numerical pass would not establish distributed whole-sheet coverage. The actual median is 353.97 m and worst 480.99 m: a failure. F05 and F07 are explicitly reused diagnostics in this second attempt (155.23 m and 61.16 m), never relabelled fresh.

## Full-sheet and seam outcome

All 60 packet figures were personally inspected: 26 native point views, 16 geographic raster comparisons, 12 adjacent-sheet panels and six actual browser screenshots. Western Black Brook remains north of modern drainage and mismatched to Sheet 5, despite local Pine improvement. Eleven controls improve the fitted Mary Ann join and some downstream geometry but do not fix the mouth. Warren's fitted lake points, Ingonish Island's northern tip and Smoky Cape constrain local positions only. Warren's surrounding drainage, Clyburn meanders, Middle Head shape, Ingonish Harbour and southern tributaries remain unaccepted.

Seam panels compare actual geographic raster windows with provisional Sheet 2 (nine controls), Sheet 5 (new twelve controls) and Sheet 7 (earlier eleven controls). Northern drainage/coastline and western/southern stream continuities fail visual acceptance. Eastern sea-only panels preserve the full sheet but provide no physical alignment evidence. `visual-review.json` records findings by region; `join-provenance.json` pins every compared raster.

## Deliverables and verification

Both rasters use the **entire unchanged mapped boundary**, including eastern sea, legend, Ingonish Island and offshore rocks. The native image is 10629 × 7603, source SHA-256 `6f6a3436e048c23cc5c8d8aef1382be9803801bac401c2cdae285e0ed30399cf`. Source coordinates are native pixels with downward y; modern coordinates are longitude/latitude. No display rotation, guessed place label or fit-derived world coordinate supplies a control.

| External GeoTIFF | Size | SHA-256 |
| --- | --- | --- |
| `/Users/dfakkeldy/Downloads/fletcher-sheet04/refinement-20260912/sheet-04-full-sheet.tif` | 9167 × 5717 | `c0c423c20dcf6fe1ed912683cb95a0bb29a741ae9a39c6f4411a20e560600add` |
| `/Users/dfakkeldy/Downloads/fletcher-sheet04/refinement-20260912/11-control/sheet-04-full-sheet.tif` | 8865 × 5926 | `e739f6a1cd4ede3a9df9662f6758b87e5e1a2819e1bab08ea0574b47b06b77b7` |

Exact GDAL TPS (`-et 0`), EPSG:3857, cubic resampling, 5 projected metre cells and RGBA alpha are recorded in each render receipt. Ten/eleven-control alpha audits cover 50,602,427 / 45,879,073 expected interior cells with zero transparent holes. Both sampled orientation audits have 71,737 negative determinants and zero nonnegative determinants. Neither diagnostic establishes geographic correctness.

Each directory has editable `sheet-04-controls.csv`, `sheet-04-diagnostic-review.csv` and `sheet-04-validation-review.csv`. Check rows never fit the model. The actual app parser and solver pass semantic CSV round trips and agree with GDAL below 0.001 projected m. Both exact GeoTIFFs were imported through My Maps in isolated Chromium sessions; raster bytes, enabled state and visible imagery survived desktop and mobile reload. Console errors were empty. This is local browser evidence, not deployment or live-domain acceptance.

`verify_packet.py` verifies source/fit/raster/cutline/reference hashes, unchanged promotions, freeze chronology, independent point identities, CSV records, figure metadata, coverage and browser receipts. Run from this checkout with Python 3.11+ and the external files available. `verify_import.ts` bundles with the installed web Rolldown CLI; its optional argument chooses either packet directory, ending in `/`. The shared `reports/fletcher/full-sheets/render.py` and `score.py` provide replay commands through `--help`; pass the corresponding fit/check files, original source and unchanged `../boundary.json`. Render into a new external directory when preserving byte-identical receipts. `review_points.py`, `review_warp.py`, `review_join.py`, `export_csv.py` and `verify-browser.mjs` preserve review/import procedures.

Frozen fits retain an inherited `prior_control_count: 0` metadata error. Actual preserved counts are eight then ten, verified by complete point-record equality; their frozen bytes were not rewritten. Parser dimensions and a copied neighbour review path were corrected before final verification; `execution-notes.json` records those tooling corrections.

The earlier fit/boundary are pinned to `98a34ae2ab2bdec0846a475fc63985d45436a6bf` on nightly's own history, not a disposable PR head. NSTDB reference receipts and provenance remain in the parent Sheet 4 packet. David Rumsey Map Collection / Stanford, Fletcher Sheet 4 (`RUMSEY~8~1~2629~280043`), and its recorded CC BY-NC-SA 3.0 terms remain the source attribution. This packet does not relicense source imagery, authorize publication or establish legal, cadastral or site conditions.
