# Sheet 6 — preserved Daphiné experiment

**Draft; geographically unaccepted; not recommended as the replacement.** Promoting the previously failed first southern Daphiné tributary aligns that fitted junction but worsens the next tributary check and nearby Chéticamp River reaches. Preserve the earlier ten-control baseline, itself unaccepted. Whole-raster and neighboring-sheet acceptance remain false.

The eleven-control fit preserves every baseline control record verbatim. V02 is promoted unchanged to C16, with its original point record and **289.053079953 m** failure embedded in the promotion. Exact close and wider unrotated native/modern views support the local branch sequence: the river outlet, first southern tributary, and next divided southeastern tributary. The historical first southern arm is much shorter, retained as a morphology limitation. V03 Jumping Brook remains diagnostic: its next historical northern tributary does not securely match the modern southeastern branch. Its failure is preserved, without presenting the entire discrepancy as confirmed transform error.

The repair was frozen before collecting the new checks. Both final identities were audited against earlier control, diagnostic, validation and rejected candidate identities, including modern node IDs. No coordinates changed after scoring and no new check was promoted.

| Fresh check | Baseline 10 controls, ground m | Experimental 11 controls, ground m |
|---|---:|---:|
| F04 Daphiné second southern tributary | 184.584 | 180.043 |
| F06 Southeastern twig on that tributary | 105.915 | 227.696 |

Fresh median **203.869 m**, worst **227.696 m**, fails the frozen 100 m median / 200 m worst criteria. The two distinct unfitted junctions are close together in the same tributary system and near the new control. They are local checks, not distributed geographic coverage. Their scores provide no northern, island, coast or full-sheet acceptance. Reused Q02 Faribault is 80.312 m and identity-uncertain V03 Jumping is 597.587 m.

F04 moved from [8310, 6230] on the southern arm to [8308, 6224] at the junction before its first score; both stages are preserved with close/wider views. F06 remained at [8323, 6243]. F05, proposed as a northern Chéticamp tributary, was rejected before scoring: the short native vertical mark beside the rough-gorge annotation does not securely establish the proposed long modern northern tributary, and its crosshair was above the bank. Original proposals, rejected evidence and all failed results remain intact.

Eight actual raster comparisons show the new local Daphiné anchor, surrounding tributary displacement and increased separation from Chéticamp River to the east. Jumping, upper Corney, Pigeon/George and the eastern interior remain largely unchanged and poorly aligned. Trout/Robert and Jerome coastal tributaries still diverge. The fitted island tip and eastern headland align locally, while surrounding shore and harbour geometry differ. Four actual neighbor windows cover eastern Sheet 5 and southern Sheet 9. Gaps, tilted boundaries and displaced island/drainage continuations remain; neither seam is accepted. Sheet 3 is northeast rather than directly north, as established in the earlier guide review. No direct northern or western neighbor has been established.

## Provenance and full boundary

The [source receipt](../source-receipt.json), [modern reference receipts](../reference-receipts.json) and [earlier report](../README.md) remain unchanged. Source: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**, Sheet 6, `RUMSEY~8~1~2631~280045`; [direct manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2631~280045/manifest). The collection's CC BY-NC-SA 3.0 terms and recorded scoped source permission remain applicable: attribution, noncommercial use, identified changes and ShareAlike. The manifest's null licence field is preserved separately from permission. These annotated/georeferenced derivatives are not relicensed under repository MIT; no hosting or deployment occurred.

Native source `/Users/dfakkeldy/Downloads/fletcher-sheet06/native/sheet06.png`: **10739 × 7552**, SHA `f0eba470a9ff0ae9e89a2c211c2d6eab6b7a647cd71c706c8913708a625091e3`. The complete boundary overview was personally inspected again. The unchanged mapped frame retains the broad western sea, legend, unsupported interior and northern Chéticamp Island. No control-hull clipping. Boundary SHA `93393f755fa44330e007192757a7564375b38db3c593ac1b19b7c607a59d749b`.

Baseline fit SHA `007808040feca6310cf934bafcf3467f594bed43ba056c32faea45dc1758c54e` and the target-history base commit are pinned in `baseline-verification.json`. Eleven-control fit SHA `d2b8b479d734472aec08440df074f0e0184938a46a7871f0dd9545e98daafbe4`. The September 11 NSTDB responses remain hash-verified, including rail `returned-empty`. The recorded slanted graticule is approximate search guidance only, not a new crossing measurement or fit constraint. Raster review uses actual GDAL windows and directly projected modern vectors.

Experimental full GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet06/refinement-20260912/sheet-06-full-sheet.tif`, **8269 × 5789 RGBA**, SHA `f9e7a051e88b43e5a7fa65751fb2c8657b869d90ad527c2f393ef24a35ec648c`. One exact GDAL TPS (`-et 0`), EPSG:3857, cubic resampling and 5 projected-metre cells. All **43,985,495** interior cells are covered with zero alpha holes; all 71,502 sampled Jacobians have the expected negative sign for downward native y. These rendering checks do not establish geographic accuracy.

The earlier ten-control GeoTIFF remains at `/Users/dfakkeldy/Downloads/fletcher-sheet06/regional-ten/sheet-06-full-sheet.tif`, SHA `9f3cbc615328c16e806daf15954b0cf58595105e41205fc0f922521de44d3544`. Large imagery, modern reference and raster bytes stay outside Git. Renderer, cutline, search nodes, guide and compared neighboring rasters have separate hash receipts.

## Editable files and local verification

- `sheet-06-controls.csv`: 11 controls.
- `sheet-06-diagnostic-review.csv`: 11 controls plus 2 reused checks.
- `sheet-06-validation-review.csv`: 11 controls plus 2 fresh local checks.

The actual web parser semantically round-trips all three CSVs; maximum web/GDAL difference is 5.0153e-9 projected metres. Full GeoTIFF import through My Maps and desktop/mobile reload pass: stored hash, dimensions, transparency and enabled state survived, and console/page errors were empty. The first run inherited a center east of the sheet: it passed storage checks but did not show the raster on mobile. That evidence is preserved in `browser-initial-position/`. The completed run in `browser/` centers the actual sheet at longitude −60.98 and shows it on desktop and mobile. `browser-attempts.json` records the correction. No app code changed.

All **30** recorded figures were personally viewed: 12 native/modern point figures, 8 actual raster comparisons, 4 neighbor comparisons and 6 browser screenshots including the initial center error. `verify_packet.py` passes source/fit/reference and target-history provenance, immutable controls/promotions/checks, score hashes, CSV equality, boundary coverage and browser checks. Geographic acceptance remains false. Hosted CI is separate on the draft PR.

Replay with GDAL CLI on PATH and the benchmark Python environment:

```bash
python reports/fletcher/full-sheets/render.py --source /Users/dfakkeldy/Downloads/fletcher-sheet06/native/sheet06.png --fit reports/fletcher/sheet06/refinement-20260912/repaired-fit.json --boundary reports/fletcher/sheet06/boundary.json --checks reports/fletcher/sheet06/refinement-20260912/reused-checks.json --out /Users/dfakkeldy/Downloads/fletcher-sheet06/refinement-20260912
python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet06/refinement-20260912/repaired-fit.json --checks reports/fletcher/sheet06/refinement-20260912/validation.json --out reports/fletcher/sheet06/refinement-20260912/validation-scores.json
python reports/fletcher/sheet06/refinement-20260912/review_warp.py
python reports/fletcher/sheet06/refinement-20260912/review_join.py
python reports/fletcher/sheet06/refinement-20260912/export_csv.py
python reports/fletcher/sheet06/refinement-20260912/verify_packet.py
```

Bundle `verify_import.ts` using web's rolldown, then run with Node. `verify-browser.mjs` takes raster/output-directory arguments and uses the local web app on port 4199. Preserve this experiment before any later repair, freeze the next fit before collecting different checks, and keep whole-sheet acceptance separate from local fit behavior. Continue the authorized queue with Sheet 4. No merge, deployment or Apple change.
