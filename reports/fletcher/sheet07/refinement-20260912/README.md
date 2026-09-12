# Sheet 7 — preserved twelve-control experiment

**Draft; geographically unaccepted; not recommended as the replacement.** Adding the previously failed Morrison northern tributary improves registration at that fitted junction but worsens nearby Pathend and lower Morrison checks. Keep the earlier eleven-control packet as the working baseline, itself unaccepted. The full raster and five neighboring-sheet windows remain unaccepted.

The new fit preserves all eleven baseline records verbatim and promotes V04 unchanged to C14. Its earlier **476.977450962 m** failure, exact point record and promotion are preserved in `repaired-fit.json`. Close and wider unrotated native/modern views confirm the northern tributary upstream of the separate southwestern Morrison arm. V05 remains diagnostic: modern coastal channels differ from the historical direct mouth. The repair was frozen before new candidate collection; see `repair-freeze.json`.

| Check | Earlier 11 controls, m | Experimental 12 controls, m | Classification |
|---|---:|---:|---|
| F07 Pathend northern tributary | 119.800 | 259.054 | Repeats old V01; **not fresh** |
| F08 Breeding Cove northern pond inlet | 89.972 | 89.941 | One qualified fresh check near existing controls |

The history audit identified F07 as the same modern node/physical junction as previously scored V01, despite a 3-pixel native difference. Its fresh classification was withdrawn **after scoring**. `independence-correction.json` documents the mistake; all initial candidate files and both original score sets remain intact. No coordinates moved after scoring. The final fresh file contains only F08, whose single small error cannot establish distributed acceptance. Pond shape and level differences add uncertainty, and nearby fitted C10/C11 limit independent geographic coverage. This is not a successful whole-sheet validation.

F06 was rejected before scoring because a native northern spur does not match the proposed modern southwestern branch. F09 was rejected before scoring because the native point is a stream bend beside a printed meridian, with no tributary. F07 moved from a road crossing to its physical junction and F08 moved from the stream to its pond inlet before their first scores. Original proposals, corrections, rejected identities and all close/wider views remain available. The verifier now checks fresh coordinates against earlier scored checks as well as controls.

The five reused diagnostics score 145.153 m median / 252.224 m worst. Original V01 Pathend is 252.224 m and V02 lower Morrison is 240.012 m. Seven actual raster comparisons show local Morrison control alignment with surrounding displacement, continued northwestern/McLeod disagreement and little southern change. Two northern comparisons with Sheet 4 and three western comparisons with the current Sheet 8 experiment show gaps, tilted edges and displaced river continuations. No seam is accepted. Review windows sample actual GDAL raster coordinates with directly projected NSTDB vectors; they do not use the search guide.

## Provenance and complete boundary

The [original source receipt](../source-receipt.json), [modern reference receipts](../reference-receipts.json) and [earlier report](../README.md) remain unchanged. Source: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**, Sheet 7, `RUMSEY~8~1~2632~280046`; [direct manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2632~280046/manifest). The collection's CC BY-NC-SA 3.0 terms and recorded scoped source permission remain applicable: attribution, noncommercial use, identified changes and ShareAlike. These annotated/georeferenced review derivatives are not relicensed under repository MIT. No hosting or deployment is performed.

Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet07/native/sheet07.png`, **10821 × 7693**, SHA `a75274bc0f1849bc024c1013d84d0904845c3893b9599827ed1521948fec3b61`.

The complete source boundary overview was personally inspected again. The unchanged ring retains the entire mapped frame, offshore area and legend, with no clipping to the narrow supported western strip. Boundary SHA `ebf62db3000ce6fd6393ac213d6125fe87ac4d469128ea2fe8ca7b0f0b7c593d`. The approximate Cartesian graticule encoding is search-only, not a newly measured grid or fit constraint. NSTDB data retrieved September 11 remain hash-verified; empty rail data is still `returned-empty`, not absence.

Baseline fit SHA `b36039ccc4f179f600c3136a3126b93efc4abd9a8917e3c4c9fa0426fcdd153a` and target-history base commit are pinned in `baseline-verification.json`. Twelve-control fit SHA `bcc49f0869d2b40b817de4ea0902fa8f313fe7dfb60126df8251a4636cbed4cb`.

Full experimental GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet07/refinement-20260912/sheet-07-full-sheet.tif`, **7245 × 6404 RGBA**, SHA `94b6010b21c428841205bc6672bd6df5f10d9921154ddb0606b6aac2ecd43500`. It uses one exact GDAL TPS (`-et 0`), EPSG:3857, cubic resampling and 5 projected-metre cells. All **37,547,694** interior cells are covered with zero alpha holes; all 71,931 sampled Jacobians have the expected negative sign for downward native y. Rendering checks do not establish geographic accuracy.

Earlier eleven-control GeoTIFF remains at `/Users/dfakkeldy/Downloads/fletcher-sheet07/regional-eleven/sheet-07-full-sheet.tif`, SHA `49263f0abb5bfb5bd5a12edecd908fbcf12f24ee88c3e1c18a5d470eda71c5dd`. Large source, reference and raster files stay outside Git. `render-provenance.json`, `search-provenance.json` and `join-provenance.json` pin the exact renderer, cutline, guide, modern nodes and compared rasters.

## Editable deliverables and local verification

- `sheet-07-controls.csv`: 12 controls.
- `sheet-07-diagnostic-review.csv`: 12 controls plus 5 reused checks.
- `sheet-07-validation-review.csv`: 12 controls plus the single qualified F08 check.

The actual web parser semantically round-trips all three CSVs; maximum web/GDAL difference is below 0.001 projected metres. The full GeoTIFF was imported through My Maps, reloaded on desktop and reloaded on mobile. Stored bytes/hash, raster dimensions, enabled state and transparency survived; the completed run had no console/page errors. All **32** recorded figures were personally viewed: 16 native/modern point figures, 7 raster comparisons, 5 neighbor comparisons and 4 browser screenshots, including the earlier partial attempt.

The first browser attempt imported but timed out during reload. The next launch found the local Vite server stopped (`ERR_CONNECTION_REFUSED`). Restarting the same local server resolved it; successful evidence is in `browser-retry/`, while `browser/` and `browser-attempts.json` preserve the partial run. No application code was changed. Computational, provenance, coverage and browser checks pass; distributed geographic acceptance does not. Hosted CI is separate on the draft PR.

Replay from the repository root with GDAL CLI on PATH and the benchmark Python environment:

```bash
python reports/fletcher/full-sheets/render.py --source /Users/dfakkeldy/Downloads/fletcher-sheet07/native/sheet07.png --fit reports/fletcher/sheet07/refinement-20260912/repaired-fit.json --boundary reports/fletcher/sheet07/boundary.json --checks reports/fletcher/sheet07/refinement-20260912/reused-checks.json --out /Users/dfakkeldy/Downloads/fletcher-sheet07/refinement-20260912
python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet07/refinement-20260912/repaired-fit.json --checks reports/fletcher/sheet07/refinement-20260912/validation.json --out reports/fletcher/sheet07/refinement-20260912/validation-scores.json
python reports/fletcher/sheet07/refinement-20260912/review_warp.py
python reports/fletcher/sheet07/refinement-20260912/review_join.py
python reports/fletcher/sheet07/refinement-20260912/export_csv.py
python reports/fletcher/sheet07/refinement-20260912/verify_packet.py
```

`verify_import.ts` documents its bundle command; `verify-browser.mjs` takes raster and output-directory arguments and expects the local web app on port 4199. Freeze a later repair before collecting different checks, audit their identities against all earlier roles before scoring, and preserve this experiment. Continue the authorized queue with Sheet 5. No merge, deployment or Apple change.
