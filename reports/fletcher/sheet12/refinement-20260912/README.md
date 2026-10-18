# Sheet 12 — northern physical refinement, 12 September 2026

**Draft; whole-sheet geography remains unaccepted.** The 17-control fit improves local Musk Rat and Sam Brook alignment. Its two fresh northern checks score 84.24 m and 66.87 m, but they are close to new controls and do not establish whole-sheet accuracy. Reused Fraser Point still scores 305.59 m; southern coast, interior reaches and adjacent-sheet seams remain unresolved. Some Christopher/Big Glen reaches worsen against the original fourteen-control raster. Nothing is merged, deployed or geographically accepted by this packet.

## Editable result and provenance

- [Final controls CSV](sheet-12-controls.csv), [reused diagnostic CSV](sheet-12-diagnostic-review.csv), [fresh validation CSV](sheet-12-validation-review.csv): respectively 17 controls, 17+7 rows and 17+2 rows. Native pixels use the original 10801 × 7713 image. Stable labels link to complete identity records in [final-fit.json](final-fit.json), [final-diagnostic.json](final-diagnostic.json) and [final-validation.json](final-validation.json).
- External GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet12/refinement-20260912/17-control/sheet-12-full-sheet.tif`, 8528 × 6547, EPSG:3857, RGBA, 5 projected metre cells. SHA-256 `48e70f98e72ad23fafb00c5437e476ad693727e09a46d1ae1a3145907550a40d`. [Raster receipt](final-raster-receipt.json).
- Native PNG: `/Users/dfakkeldy/Downloads/fletcher-sheet12/native/sheet12.png`, SHA-256 `72f758991fe7bce3eba450aecb030b5b681ad037f44168c34ad7c5e82e20034f`. Original [source receipt](../source-receipt.json) and [source/fit/raster baseline verification](baseline-verification.json) remain authoritative.
- Final fit SHA-256 `b84997485c0836ac598429f63167199ae1e600b1c623a87b5c2747b3a57a2cc2`. Complete [original boundary](../boundary.json) unchanged: `71bc58ceb5476a5ca9b98fd8be187d4ea88b4052cad67a37c1f534bfbdb6c720`. Main frame, all three southern extensions, islands and mapped labels remain; no control-hull or corridor crop.

## Preserved experiment sequence

The original fourteen controls and all earlier evidence remain untouched. R01 rechecks old failed V02 at the small Musk Rat tributary and promotes it unchanged to C16, preserving its 1111.67 m failure inside the promotion. R02 adds the northern Baddeck eastern tributary as C17 after correcting the native crosshair from [2892,1027] to [2932,1034]. R03 remains rejected unscored: native/modern branch topology did not establish identity. Original and corrected proposals and close/wide crosshairs remain visible.

The [16-control freeze](repair-freeze.json) preceded fresh F01/F02/F05 collection. Native inspection corrected F01 to [1644,2701], F02 to [3337,1403], and F05 to [8497,2467] before scoring. F03 at Point Clear was rejected unscored because the modern pick selected nearby straight coast rather than an established shared spur. F04 is only a recorded Stony Island search, without a modern coordinate or score; the missing reference counterpart does not imply the island disappeared.

| Check | Original 14 controls | Repair 16 controls | Final 17 controls |
| --- | ---: | ---: | ---: |
| F01, larger Musk Rat fork | 1041.01 m | 58.32 m | 62.68 m, reused |
| F02, upper Sam northern marsh branch | 404.82 m | **525.73 m** | promoted unchanged to C18 |
| F05, Otter Island north coast | 121.14 m | 122.25 m | 122.22 m, reused |
| F06, lower Sam marsh branch | 451.57 m | 576.74 m | **84.24 m, fresh** |
| F07, northern Baddeck west tributary | 71.78 m | 72.41 m | **66.87 m, fresh** |

The failed sixteen-control F02 identity was independently supported by the northern main stem, two consecutive eastern marsh branches and lower Sam confluence. It was promoted unchanged to C18, preserving both prior errors. The [17-control freeze](final-freeze.json) preceded F06/F07 collection and personal close/wide review. Promoted or reused checks are never counted as fresh. The original, sixteen-control and seventeen-control score files, candidate stages, CSVs and rasters remain available. No further coordinate tuning followed the final fresh scores.

## Whole raster, seams and browser evidence

[Visual review](visual-review.json) records personal inspection of all 63 hashed figures, including every original/corrected native crosshair and modern context, both actual warped raster experiments, southern coverage, adjacent Sheets 10/13, and browser screenshots. See the [full raster](final-warped-review/full-sheet.jpg), [regional frames](final-warped-review/frames.json), and [seams](final-adjacent-sheet-review/frames.json). These are real raster windows with directly projected modern vectors; inverse guide coordinates are not geographic evidence. The northern repairs are local; displaced reaches, altered coast shapes and gaps remain.

[Extended modern receipts](south-reference-receipts.json) add a southern NSTDB query down to 46.045° N. Original references are hash-verified and unchanged. Where road geometries differ on overlapping object IDs, the original geometry was retained and all differing IDs recorded. That difference is not evidence of historical change. Point review frames use the original reference envelope; final regional frames use the expanded references.

Exact GDAL TPS uses `-et 0` and the unchanged complete boundary. [Final coverage](final-coverage.json) checks 52,611,240 expected interior cells with zero transparent holes. All 79,024 sampled Jacobians have the expected negative sign for native y-down coordinates; sampled sign consistency is not a continuous no-fold proof.

[CSV import verification](import-verification.json) passes the application's real parser, semantic round-trip and TPS solver with 17/7/2 role counts and maximum web/GDAL disagreement 6.79e-9 projected m. [Final browser verification](final-browser-verification.json) records actual My Maps GeoTIFF import, persisted exact raster SHA, georeference, alpha, enabled state and zero page/console errors. Desktop 1440×1000 import/reload and mobile 390×844 reload screenshots were personally inspected. Large raster and browser files remain outside Git. This establishes TIFF import and persistence, not native PNG+CSV browser mesh acceptance.

[Packet verification](packet-verification.json) passes provenance, preserved controls, promotions, role separation, CSV rows, reference hashes, frame coordinates, both raster hashes, alpha coverage and browser checks. [Acceptance](acceptance.json) remains false. No application or Apple code changed; hosted CI is reported on the draft PR.

## Reproduction and rights

Use frozen JSON inputs with `reports/fletcher/full-sheets/score.py` and `render.py`; see [handoff](HANDOFF.md). `freeze.py` and `freeze_sam_repair.py` document construction and refuse to overwrite existing freezes. Do not rerun collection/freeze scripts into this evidence directory or replace the original references. Start a separately dated experiment for new evidence.

Historical imagery: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**, direct [Sheet 12 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2637~290005/manifest). Existing scoped permission remains in [INVENTORY.md](../../INVENTORY.md). Cropped, annotated and georeferenced derivatives retain the applicable CC BY-NC-SA 3.0 noncommercial, attribution and ShareAlike conditions; original authorship is not claimed. The manifest's null license field does not replace that permission. No imagery is relicensed under the software license, and this local research packet provides no deployment clearance.
