# Fletcher 24-sheet re-tile — 13 September 2026

Version: `fletcher-full-sheets-20260913.1`. This packages all 24 complete georeferenced sheets for the user-requested R2 upload. The original rasters and existing hosted revisions are preserved. Geographic acceptance remains provisional; no live web/native layer or label projection pin changes.

The four Route 19 sheets use the final 12 September three-round fits. Other sheets use the reviewed local improvement where retained as useful, or the earlier baseline where the refinement report rejects replacement. The complete mapped boundaries, islands and mainland extensions survive. Overlaps follow the order in `inputs.json`; gaps are not filled.

| Sheet | Controls | Selected fit |
| --- | ---: | --- |
| 01 | 10 | [reviewed-fit.json](../sheet01/refinement-20260912/reviewed-fit.json) |
| 02 | 9 | [final-fit.json](../sheet02/final-fit.json) |
| 03 | 7 | [final-fit.json](../sheet03/final-fit.json) |
| 04 | 8 | [final-fit.json](../sheet04/final-fit.json) |
| 05 | 12 | [repaired-fit.json](../sheet05/refinement-20260912/repaired-fit.json) |
| 06 | 10 | [repaired-fit.json](../sheet06/repaired-fit.json) |
| 07 | 11 | [repaired-fit.json](../sheet07/repaired-fit.json) |
| 08 | 10 | [repaired-fit.json](../sheet08/repaired-fit.json) |
| 09 | 25 | [repaired-fit.json](../sheet09/refinement-20260912/repaired-fit.json) |
| 10 | 12 | [repaired-fit.json](../sheet10/repaired-fit.json) |
| 11 | 30 | [repaired-fit.json](../sheet11/refinement-20260912/30-control/repaired-fit.json) |
| 12 | 17 | [final-fit.json](../sheet12/refinement-20260912/final-fit.json) |
| 13 | 14 | [final-fit.json](../sheet13/refinement-20260912/final-fit.json) |
| 14 | 27 | [round-3-fit.json](../route19-three-rounds-20260912/sheet-14/round-3-fit.json) |
| 15 | 12 | [reviewed-fit.json](../sheet15/refinement-20260912/reviewed-fit.json) |
| 16 | 37 | [round-3-fit.json](../route19-three-rounds-20260912/sheet-16/round-3-fit.json) |
| 17 | 10 | [regional-fit.json](../sheet17/regional-fit.json) |
| 18 | 14 | [regional-fit.json](../sheet18/regional-fit.json) |
| 19 | 44 | [round-3-fit.json](../route19-three-rounds-20260912/sheet-19/round-3-fit.json) |
| 20 | 14 | [reviewed-fit.json](../sheet20/refinement-20260912/reviewed-fit.json) |
| 21 | 15 | [repaired-fit.json](../sheet21/repaired-fit.json) |
| 22 | 28 | [round-3-fit.json](../route19-three-rounds-20260912/sheet-22/round-3-fit.json) |
| 23 | 12 | [repaired-fit.json](../sheet23/repaired-fit.json) |
| 24 | 14 | [repaired-fit.json](../sheet24/repaired-fit.json) |

## Reproduce

`inputs.json` pins source-branch commit, per-sheet raster/fit/receipt hashes and compositing order. Large rasters and output tiles live in `~/Downloads/fletcher-retile-20260913/`, outside Git.

Run with the existing Fletcher benchmark Python environment, Pillow and GDAL CLIs on PATH:

```sh
python3 reports/fletcher/retile-20260913/build.py --out "$HOME/Downloads/fletcher-retile-20260913"
```

The builder verifies all inputs before compositing, then calls the existing full-sheet tiler with the new manifest and revision. Existing output directories are never overwritten. XYZ PNG tiles cover zooms 8–15 at 256 pixels; bilinear native-zoom sampling and averaged overviews preserve original colours. Fully transparent objects inside the rectangular mosaic bounds prevent missing-object errors.

Credit: David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. CC BY-NC-SA 3.0; project georeferencing, cropping and tiling are identified derivatives. The separate scoped permission remains in [the inventory](../INVENTORY.md). Software MIT licensing does not apply to imagery.

## Verification

The Fletcher suite passed all 300 tests. `verify_mosaic.py` checks all 24 source alpha footprints against the composite. The existing `tools/fletcher/verify_full_sheet_tiles.py` checks every object hash, complete XYZ coverage, and every opaque native-zoom pixel against a continuous resample. These establish raster/tile mechanics, not geographic acceptance.


## R2 publication

Target: `ns-marks-fletcher-tiles/fletcher-full-sheets-20260913.1/`, served at
`https://tiles.kinnokilabs.com/fletcher-full-sheets-20260913.1/` once uploaded.
At preparation time nothing from this revision has been uploaded: the dashboard
rejected the complete batch because it supports only 100 files per upload. The
package has 44,342 objects (44,340 tiles plus two JSON manifests), 2,448,005,158
bytes.

`publish.py` uses caller-provided `R2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY`, plus an AWS CLI. It uploads PNGs first and manifests last,
uses immutable cache headers, never deletes objects, and compares the complete
R2 key list, byte sizes and single-part MD5 ETags with local files. No credentials
belong in this repository or the public tile package. Run:

```sh
python3 reports/fletcher/retile-20260913/publish.py \
  --tiles "$HOME/Downloads/fletcher-retile-20260913/fletcher-full-sheets-20260913.1" \
  --aws /tmp/nsmarks-atlas-upload-venv/bin/aws \
  --out reports/fletcher/retile-20260913/publication.json
```

Bulk upload is awaiting approval to create a temporary 24-hour Object Read & Write
token scoped only to this bucket, use it for this upload, then revoke it and remove
temporary local credentials. Existing account tokens and bucket settings are
unchanged. The new revision must not be described as hosted before the upload and
public-host checks succeed.


Final local verification passed: all 44,340 inventory hashes and all eight XYZ
zoom grids match. The continuous zoom-15 comparison covers 1,216,437,446 opaque
cells with zero lost source coverage, zero tile-edge RGB differences, and a
maximum interior rounding difference of one 8-bit level. The independent
composite check retains 1,122,602,317 source coverage cells across all 24 sheets
with zero loss. See `tile-verification.json` and `mosaic-verification.json`.

After R2 upload, `verify_public.py --tiles PACKAGE --out PUBLIC_RECEIPT` verifies
byte parity and response headers for both manifests, every zoom, transparent and
opaque samples, and centre tiles across all 24 sheets. It has not yet run because
this revision is not uploaded. Publication scripts are prepared; external upload
and verification remain pending the scoped token approval.
