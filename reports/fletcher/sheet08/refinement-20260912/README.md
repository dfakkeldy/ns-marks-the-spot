# Sheet 08: Three Brooks repair, geographic acceptance still false

The new eleven-control experiment improves the Northeast Margaree near Three Brooks, but fails fresh validation and whole-sheet review. Keep this PR draft. It is not an accepted replacement. Original controls, failures, proposals and the complete mapped boundary are preserved.

The original ten controls remain verbatim. C13 adds the South Branch mouth at Three Brooks, after personally inspecting its unrotated native crosshair and modern river topology at close and wide scales. The original pick `[1640,3985]` was corrected to the actual mouth `[1644,3989]` before fitting. Northern bends, the eastern South Branch and the next eastern Coulmeach mouth support this identity. The upstream Carmruadh/South Branch fork remains a pre-freeze diagnostic.

The audit also identifies unresolved correspondence in old Coulmeach control C12 and the adjacent V03 check. Old Ingonish check V01 has a branch-order conflict: the native southern tributary is west of the northern check, while the proposed modern southern junction is east/downstream. None was silently moved or promoted. See `identity-audit.json` and the native review images.

## Fresh validation

The eleven-control fit was frozen before collecting F01/F02. Both original native close/wide crosshairs were inspected before scoring. F01 was moved from the western main-channel bank to the actual eastern tributary mouth before any score was calculated; its corrected close/wide images are retained. The same final checks were then scored against both frozen fits.

| Never-fitted check | Prior 10 controls | New 11 controls |
| --- | ---: | ---: |
| F01: Margaree eastern tributary below Marsh Pool | 1,116.77 m | 235.05 m |
| F02: northern tributary to western Little River arm | 608.01 m | 619.29 m |
| Median | 862.39 m | 427.17 m |
| Worst | 1,116.77 m | 619.29 m |

The required median ≤100 m and worst ≤200 m both fail. Two checks would also be insufficient for distributed whole-sheet acceptance. Five reused/pre-freeze diagnostics are separate from fresh validation; Coulmeach V03 worsens to 520.96 m and R02 is 762.90 m. Scores do not prove uncertain identities.

Eleven actual raster windows compare the preserved ten-control raster with the new raster over modern vectors. The local Margaree gain does not resolve the interior and peripheral channels. Eight actual neighbor windows cover Sheets 05, 07, 09 and 10; all joins remain unaccepted. The north/east joins were missing from the earlier review and are now explicit. Sheet 10 uses its preserved twelve-control baseline because its later thirteen-control experiment is not recommended as a replacement. Narrow reference coverage limits are recorded in `join-provenance.json`.

The next Sheet 08 repair should resolve the C12/Coulmeach and V01/Ingonish topology before compounding local TPS anchors. Preserve these fresh failures as independent evidence for this freeze. [Reservoir caution](../reservoir-caution.md) remains applicable: altered Gisborne/Wreck Cove and other flowage outlines are not stable historical shore controls.

## Artifact and verification

- External GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet08/refinement-20260912/sheet-08-full-sheet.tif`, 9495 × 5847, EPSG:3857, RGBA, 5 projected metres/cell, exact GDAL TPS (`-et 0`). SHA-256 `72e71a885c26a3b675de77d0d4c5dd9c8ad50637806621d4cc97c619128c59c4`.
- Fit SHA-256 `481c261616e91ec2c254b30c0b47273001e1367968a26443ab7e4680d6ed1114`.
- Original native source 10812 × 7622: `/Users/dfakkeldy/Downloads/fletcher-sheet08/native/sheet08.png`, SHA-256 `aa324565b0b25bdd1ae102f14e4bad8b542547d6e5bba76dd620a52dafa1d4aa`.
- Complete original boundary SHA-256 `1fabe8fc6eecd9a4ce4529280e7b51f0e6ccffa6da5f5ccd3999725575c31025`; no corridor or control-hull clipping. Coverage checks 46,737,533 interior cells with zero transparent holes. All 71,548 sampled Jacobians have expected negative native-y-down orientation.
- Editable controls CSV plus separate diagnostic/validation CSVs use the app's actual parser. Semantic roundtrip and web/GDAL TPS consistency pass, with 11 controls, 5 diagnostic checks and 2 fresh checks.
- Actual GeoTIFF imported into My Maps and reloaded at desktop and mobile viewport. Stored raster SHA, dimensions, georeference, enabled state and alpha preserved. Browser errors empty. Screenshots show a full desktop frame and the narrower mobile viewport.
- All 42 packet figures personally inspected; native coordinates and modern coordinates checked against their source records. Reference files, source, baseline ancestry, neighbor rasters and artifact hashes verified by `verify_packet.py`.

These mechanical checks do not establish geographic accuracy. See `acceptance.json`, `visual-review.json`, `packet-verification.json`, and `browser/`.

Run from repository root: `python3 reports/fletcher/sheet08/refinement-20260912/verify_packet.py`. Re-render with the shared `full-sheets/render.py`, this fit, original `sheet08/boundary.json`, and `reused-checks.json`, using a new external directory to preserve frozen artifacts. Point review and raster review scripts are included. Native/source/reference files stay external.

Source imagery credit and permission remain those of the original Rumsey/Stanford inventory (CC BY-NC-SA 3.0); derived imagery is not relicensed under the application's MIT license. This packet does not authorize merging, publishing, or deployment.
