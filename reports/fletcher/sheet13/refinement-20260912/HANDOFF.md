# Sheet 13 continuation

Keep this PR draft. Final fresh F06 fails at 215.38 m; several whole-sheet regions and every reviewed seam remain unresolved. Do not merge/deploy. No further refit in this pass.

Start future work in a new dated directory from current target branch. Preserve all old fits, rejected candidates, original/corrected crosshairs, scores and external rasters. Establish Q04/Q07 physical identity before considering promotion. Investigate Mount Pleasant and broad Middle River/Lake Ainslie reach geometry with original native imagery and modern topology, not residual minimization. Freeze any later repair before collecting distributed fresh checks; reused and promoted checks are not fresh.

The final external GeoTIFF is in `~/Downloads/fletcher-sheet13/refinement-20260912/14-control/`; the earlier 13-control experiment remains in its parent. Native scan/reference data remain in `~/Downloads/fletcher-sheet13/native/` and `reference-full/`. README and receipts pin hashes. Editable final CSVs and both stages' JSONs are in this directory.

Reproduce scores with `reports/fletcher/full-sheets/score.py --fit <final-fit.json> --checks <final-validation.json> --out <new-output.json>`. Reproduce raster with `render.py --source <native PNG> --fit <final-fit.json> --boundary <../boundary.json> --checks <final-diagnostic.json> --out <new-external-directory>`, using `/opt/local/bin` GDAL on PATH. Do not overwrite recorded artifacts. Use `verify_packet.py` from this checkout to recheck the packet and external artifacts. `export_csv.py`, `verify_import.ts`, review scripts and browser scripts preserve the exact construction/verification logic. Browser verification needs the local Vite app and isolated Playwright; existing proof records include actual desktop/mobile reloads.

Queue continuation: Sheets 12/13 refinements are separately drafted. Continue Sheet 10 and the remaining inadequate sheets; do not accept a whole sheet from these local gains. No DeepSeek, subagents, automations, goals, Apple changes, merges or deployments.
