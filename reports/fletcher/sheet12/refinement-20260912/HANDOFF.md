# Sheet 12 refinement handoff

The final experiment is `final-fit.json` (17 controls), not `repaired-fit.json` (preserved failed 16-control stage). Use final CSVs without the `sixteen-` prefix. Whole-sheet acceptance remains false; do not promote this to a production layer.

Run from repository root with the existing local native/reference/raster files:

```sh
python3 reports/fletcher/sheet12/refinement-20260912/verify_packet.py
/Users/dfakkeldy/Downloads/fletcher-matching-benchmark/venv/bin/python reports/fletcher/full-sheets/score.py --fit reports/fletcher/sheet12/refinement-20260912/final-fit.json --checks reports/fletcher/sheet12/refinement-20260912/final-validation.json --out /tmp/sheet12-final-validation-replay.json
```

To reproduce the raster, use `reports/fletcher/full-sheets/render.py` with the original `native/sheet12.png`, `final-fit.json`, original `reports/fletcher/sheet12/boundary.json`, `final-diagnostic.json`, and a new external output directory. It requires GDAL on PATH, NumPy and Pillow. Never overwrite the hashed evidence raster. Existing source, fit, boundary and raster hashes are in README and packet-verification.

`export_csv.py` and `verify_import.ts` document real parser/solver verification. The latter can be bundled with the existing web rolldown dependency and run under Node. `verify-browser.mjs` expects a local web server on 4199 and TIFF/output paths as positional arguments; it uses the existing Playwright dependency under worktree 0ca7. It creates an isolated context and captures desktop import/reload plus an actual mobile reload. Raw browser proofs are external in the final `17-control/browser` directory.

`review_points.py` takes point JSON, output directory, native radius, modern radius and IDs. All existing collection and correction stages must remain immutable. `review_final_warp.py` and `review_final_join.py` document actual raster windows. Original and extended modern receipts record retrieval URLs, EPSG:4326 longitude/latitude order, object IDs and file hashes. Point figures retain original references; final regional figures use the extended combination.

Remaining work requires distributed physical evidence, especially the Christopher/Big Glen interior, Port Bevis, Fraser/Coffin shape correspondence and boundaries with Sheets 13/10. Do not solve this by fitting ambiguous coastline features or reusing final checks as fresh evidence. Any justified promotion must preserve its old coordinates and score, freeze a new fit, then collect genuinely fresh distributed checks. Continue the queue with Sheet 13, then Sheet 10, retaining this draft as a documented local improvement.
