# Sheet 2 — ten-control trial, whole-sheet acceptance blocked

**Draft; no whole-sheet replacement recommended.** Retain the original nine-control raster as a provisional comparison. The new Rachel Brook control fits its local junction, but upper Rachel remains displaced and has no qualified independent check. Pond shorelines, islands, barrier channels, broader drainage and all reviewed neighboring seams remain unresolved.

R02/C10 is the last northern tributary on Rachel Brook before the downstream Neils confluence (NSTDB J0305; objects 179002, 285078, 285079; longitude −60.3665856, latitude 46.8231981). The native crosshair was corrected from [3510,5250] on the upstream main channel to [3527,5250] at the junction. Both original and corrected native close/wide views were personally inspected before fitting. Local junction order supports this trial; the much longer modern northern branch, extending toward a pond, limits confidence in the wider match. All nine prior control records remain unchanged. No old check was promoted.

R01's proposed Middle Pond island remains rejected and unscored. The apparent island locality is plausible, but historical southwest islands are absent in modern context, the outline differs, and surrounding banks changed. Its original off-shore pixel is preserved. F03's proposed Rachel southern tributary also remains rejected and unscored: two modern southwest forks compete with one short historical twig. Earlier rejected Q02 is preserved in the parent packet.

The ten-control fit was frozen at 2026-09-12T15:26:26.721185+00:00 before selecting additional checks. F04 uses the southernmost shoreline of White Point's largest offshore island. The native point was corrected from its interior [3775,3323] to the southern edge [3768,3358], then personally inspected close and wide before scoring. The complete modern connected shoreline uses objects 14622, 16918 and 22162. This is a **new coordinate on the same island as old V01**, a correlated extent check with generalized historical outline, not independent island or inland validation.

| Check | Prior nine-control ground m | Ten-control ground m | Status |
| --- | --- | --- | --- |
| F04 island southern extent | 44.31 | 46.90 | New correlated extent check; no inland coverage |
| V01 island northern extent | 105.24 | 115.79 | Reused diagnostic |
| V02 brook east of Black Head | 73.61 | 61.36 | Reused diagnostic |

F04 alone meets the numeric limits (median ≤100 m, worst ≤200 m), but cannot establish geographic acceptance. The trial does not improve that check and leaves unsupported regions. Frozen files and scores remain unchanged after evaluation; original candidates and rejected points remain separate. Pending-review phrases in immutable stage files describe their creation stage; final reviewed status is recorded in the fit/check files and visual report.

## Source, complete extent and outputs

Source is David Rumsey Sheet 2, `RUMSEY~8~1~2627~280041`, original unrotated native PNG 10829 × 7582, SHA-256 `b4094db3ab94e60e3f30727c7edb97d6ac66e19a7e640c3a5ce3b339b91e1922`. Parent receipts retain IIIF region parity and the null manifest licence field. Credit **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**; CC BY-NC-SA 3.0 attribution, noncommercial use and ShareAlike apply to the georeferenced/annotated derivative. Imagery is not relicensed under repository MIT. This packet grants no hosting clearance.

Baseline inputs are pinned to nightly-history commit `98a34ae2ab2bdec0846a475fc63985d45436a6bf`. The unchanged complete boundary SHA is `615e4edbf4593f906f996a9b7a5ebff3d8b78d5fcbd3055d00f11883e02268a1`. Its native red overview was personally inspected: broad eastern sea, legend, North/Middle/South Pond portions, White Point islands and offshore rocks remain included. No outside mapped extension was identified; no control-hull or corridor clipping was used.

The September 11 NSTDB reference snapshot retains 804 roads, 1750 water lines, 662 water polygons and rail returned-empty, in EPSG:4326 longitude/latitude. Hashes and direct source feature coordinates were verified. Eight slanted printed-graticule crossings narrow searches only; their earlier source encoding hash is preserved and is not the current native raster hash.

- Editable `sheet-02-controls.csv`: 10 controls.
- `sheet-02-diagnostic-review.csv`: 10 controls plus two reused checks.
- `sheet-02-validation-review.csv`: 10 controls plus the single correlated F04 extent check.
- Frozen fit: `reviewed-fit.json`, SHA `415f7fe86b9861b0648a79e01d9a9d839e0d696468b0b6cbd9c0517f06eec8c8`.
- External complete GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet02/refinement-20260912/sheet-02-full-sheet.tif`, 9083 × 6121 RGBA, SHA `532d42312d7e9fb6e41ae881d94919d8f06ff2b5978c7eb8b48e6d595c5eee0a`.
- Original comparison: `/Users/dfakkeldy/Downloads/fletcher-sheet02/regional-nine/sheet-02-full-sheet.tif`, 9094 × 6131, SHA `ec5096c078ea3628b00f39ef28a9475f641bbd0daa0db19a2c24f655143a1465`.

Exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells retain the full boundary. Large source/reference/raster files remain outside Git. `render-provenance.json` hashes source inputs, shared scripts, cutline, node index and all actual comparison rasters. Neighbor comparisons use Sheet 1's original eight controls, Sheet 3's ten-control trial and Sheet 4's eleven-control trial, all unaccepted.

## Verification and geographic review

All 28 figures were personally inspected: 12 native/modern crosshair frames, eight actual raster comparisons, five adjacent-sheet comparisons and three real browser captures. The previously missing Sheet 1 northwest comparison now shows a gap and incompatible coast/branch placement. Sheet 3 comparisons remain inconsistent across ponds and upstream drainage. Sheet 4's coastal join has differing boundary curvature and a gap; its sea-only comparison is unsupported physical evidence.

The full alpha audit found zero transparent interior cells among 51,766,016, allowing one output-cell boundary tolerance. All 71,200 sampled orientation determinants are negative; this does not prove the continuous surface has no folds. Actual web parser semantic round trips and TPS/GDAL agreement passed for 10/2/1 control/diagnostic/check rows, maximum difference 5.67e-9 projected metres. An initial audit-bundle relative import path was corrected and rerun; no geographic input changed.

The actual My Maps importer loaded the full GeoTIFF in isolated Chromium, rendered on desktop/mobile, and retained the original raster hash, dimensions, embedded georeference and enabled state after reload. Browser error logs are empty. The preview is reduced while the original bytes stay in IndexedDB. These local technical results do not establish alignment acceptance, CI, merge or deployment.

Run `python3 reports/fletcher/sheet02/refinement-20260912/verify_packet.py` from repository root for receipt/control/frame/coverage/browser verification. The packet includes point/search/raster/seam scripts, actual parser/TPS audit and browser harness (local port 4199). Proposal scripts deliberately reproduce initial proposal stages; run only into an isolated copy, never over frozen evidence.
