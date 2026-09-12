# Sheet 5 — Sunday Lake refinement

**Draft; geographically unaccepted.** The twelve-control experiment improves Sunday Lake and nearby Big Southwest Brook, but the interior and all four neighboring-sheet joins still fail whole-sheet review. No merge, deployment or production acceptance follows from this packet.

All eleven baseline controls are preserved verbatim. New C12 is Sunday Lake's eastern outlet. The initial R01 proposal pointed downstream at J1027; close and wider unrotated native/modern review corrected it to the actual lake outlet J1033 at native [6410, 2697] before fitting or scoring. Original and corrected proposals and images remain intact. R02, an alternative upper Clyburn identification, was rejected without fitting or scoring because the native crosshair was off-stream and the proposed branch hierarchy was uncertain. The nearby printed county boundary was not accepted as a river.

`repair-freeze.json` pins the complete twelve-control fit before new validation collection. Both final fresh identities were checked against all prior control, diagnostic, validation and rejected records, including modern node IDs. No coordinates changed after scoring and neither final check was promoted.

| Fresh check | Baseline 11 controls, ground m | New 12 controls, ground m |
|---|---:|---:|
| F05 Sunday Lake northwestern inlet | 515.112 | 77.885 |
| F07 Big Southwest Brook eastern headwater junction | 713.812 | 368.218 |

Fresh median **223.051 m**, worst **368.218 m**: failure against the frozen 100 m median / 200 m worst limits. F05 is also close to the new fitted outlet and subject to marsh/shoreline uncertainty. These two checks do not establish distributed coverage. Six earlier checks are explicitly reused diagnostics, scoring 65.730 m median / 115.630 m worst; they are not fresh acceptance evidence.

F05 moved from the marsh above the inlet to the actual inlet before its first score. F07 moved from a county-boundary crossing to the physical stream junction west of it before its first score. F06, a proposed MacKenzies tributary, was rejected before scoring because the branch hierarchy did not match securely. All initial/corrected coordinates, rejected identities and close/wider native and modern views are preserved. The nested `reviewed_repair_record` is an immutable prescore record; its historical pending-review status does not override C12's final review status. The frozen fit's inherited `prior_control_count: 0` is legacy metadata: the actual baseline has eleven controls, as the full records and verifier demonstrate.

Nine actual raster comparisons show Sunday Lake's northward correction and partial Big Southwest improvement. Fishing Cove and MacKenzies remain broadly unchanged with substantial unsupported western terrain; Lake of Islands, upper Clyburn and the central drainage remain displaced. Chéticamp has local correspondence near controls. Modern Chéticamp Flowage differs from the historical river landscape; reservoir shoreline changes are not registration evidence or fit controls (see the earlier `reservoir-caution.md`). Eight neighboring-sheet windows cover Sheets 3, 4, 6 and 8. Local Black/Clyburn and Deep Brook/Chéticamp connections do not resolve tilted boundaries, gaps and displaced stream continuations. None of these seams is accepted.

## Source, boundary and artifacts

The [source receipt](../source-receipt.json), [reference receipts](../reference-receipts.json) and [earlier report](../README.md) remain unchanged. Source: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**, Sheet 5, `RUMSEY~8~1~2630~280044`; [direct manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2630~280044/manifest). The collection's CC BY-NC-SA 3.0 terms and recorded scoped source permission remain applicable: attribution, noncommercial use, identified changes and ShareAlike. These annotated/georeferenced derivatives are not relicensed under repository MIT.

Native source `/Users/dfakkeldy/Downloads/fletcher-sheet05/native/sheet05.png`: **10729 × 7623**, SHA `10ce67bd1d08c5838cdb5891d17775c230bac69527619419d9520640034c2ac0`. The complete boundary overview was personally inspected again. The unchanged ring retains the full mapped frame, including unsupported terrain. The exterior legend remains in the full native source outside that frame. Boundary SHA `62c74443d23941582bab32111700eee4f9f45a1229430d6f1f8fced04767e766`.

Baseline fit SHA `f04cbd3f80ff7361bf6d719f0989834dfa4cc9833242f0c18f6ffed1f2e80db9` and target-history commit are pinned in `baseline-verification.json`. New fit SHA `89bdc06179cd60084608457911fe4e8db9a673b9e78071084b6ddde6af5838b8`. September 11 NSTDB references were hash-verified, preserving source geometry and the rail `returned-empty` state. The approximate printed-graticule guide locates search regions only; it is not a fit constraint. Native crosshairs use the unrotated source; raster review projects modern vectors directly into actual GDAL windows.

Full GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet05/refinement-20260912/sheet-05-full-sheet.tif`, **8559 × 5687 RGBA**, SHA `3affbba1a4d33c7b4e3a5ddc241fa20850473f170539426ee105dfd2c2d593c9`. One exact GDAL TPS (`-et 0`), EPSG:3857, cubic resampling and 5 projected-metre cells. All **45,338,392** interior cells are covered with zero alpha holes. All 71,533 sampled Jacobians have the expected negative sign for downward native y. Coverage and fold checks do not establish geographic accuracy.

The previous GeoTIFF remains at `/Users/dfakkeldy/Downloads/fletcher-sheet05/regional-eleven/sheet-05-full-sheet.tif`, SHA `edda68be62add08f293ec6fba64bad9dc40678e12f97114aaa92271e9598269b`. Large native sources, references and rasters stay outside Git. Renderer, cutline, search nodes, guide and compared neighboring rasters are pinned in the three provenance JSON files.

## Editable files and verification

- `sheet-05-controls.csv`: 12 controls.
- `sheet-05-diagnostic-review.csv`: 12 controls plus 6 reused checks.
- `sheet-05-validation-review.csv`: 12 controls plus 2 fresh checks.

The actual web parser semantically round-trips all three CSVs; maximum web/GDAL difference is below 0.001 projected metres. The full GeoTIFF imported through My Maps and survived desktop and mobile reload, with the stored raster hash, dimensions, transparency and enabled state preserved. Console/page errors were empty. All **36** recorded figures were personally viewed: 16 native/modern point figures, 9 raster comparisons, 8 neighboring-sheet comparisons and 3 browser screenshots. The packet verifier passes provenance, frozen-point, score-hash, CSV, source-boundary coverage and browser checks. Geographic acceptance remains false. Hosted CI is reported separately on the draft PR.

Replay with GDAL CLI on PATH and the benchmark Python environment:

```bash
python reports/fletcher/full-sheets/render.py --source /Users/dfakkeldy/Downloads/fletcher-sheet05/native/sheet05.png --fit reports/fletcher/sheet05/refinement-20260912/repaired-fit.json --boundary reports/fletcher/sheet05/boundary.json --checks reports/fletcher/sheet05/refinement-20260912/reused-checks.json --out /Users/dfakkeldy/Downloads/fletcher-sheet05/refinement-20260912
python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet05/refinement-20260912/repaired-fit.json --checks reports/fletcher/sheet05/refinement-20260912/validation.json --out reports/fletcher/sheet05/refinement-20260912/validation-scores.json
python reports/fletcher/sheet05/refinement-20260912/review_warp.py
python reports/fletcher/sheet05/refinement-20260912/review_join.py
python reports/fletcher/sheet05/refinement-20260912/export_csv.py
python reports/fletcher/sheet05/refinement-20260912/verify_packet.py
```

`verify_import.ts` documents its bundle command. `verify-browser.mjs` takes raster and output-directory arguments and expects the local app on port 4199. Preserve this failed whole-sheet validation before later repair, freeze a new fit, and collect different checks. Continue the authorized queue with Sheet 6.
