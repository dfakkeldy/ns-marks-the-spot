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

Published and verified on 15 September 2026 in
`ns-marks-fletcher-tiles/fletcher-full-sheets-20260913.1/`.

- [Public source manifest](https://tiles.kinnokilabs.com/fletcher-full-sheets-20260913.1/source.json)
- [Public tile inventory](https://tiles.kinnokilabs.com/fletcher-full-sheets-20260913.1/tile-inventory.json)
- Tile template: `https://tiles.kinnokilabs.com/fletcher-full-sheets-20260913.1/{z}/{x}/{y}.png`
- 44,342 objects (44,340 PNG tiles plus two JSON manifests), 2,448,005,158 bytes.

`publication.json` records exact agreement of the complete R2 key list, every
object size and every single-part MD5 ETag. The fresh local SHA-256 inventory
check is in `local-inventory-verification.json`. `public-verification.json`
records 66 byte-identical responses through the public host, covering both
manifests, every zoom, transparent/opaque samples and all 24 sheet centres.
PNG cross-origin delivery and content types pass; immutable cache headers are
recorded. The verifier identifies itself as `NSMarksTileVerification/1.0` because
the host rejects Python's default user agent.

The temporary Object Read & Write token was scoped only to this bucket with a
24-hour expiry. It was revoked after verification and its local credentials were
removed; see `credential-cleanup.json`. No credentials are included here or in
the public package.

`publish.py` takes caller-provided `R2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`, plus an AWS CLI. It uploads PNGs first, manifests last,
never deletes objects, and verifies remote sizes/ETags. The dashboard's 100-file
batch limit makes the S3 bulk uploader necessary for this package. Example:

```sh
python3 reports/fletcher/retile-20260913/publish.py \
  --tiles "$HOME/Downloads/fletcher-retile-20260913/fletcher-full-sheets-20260913.1" \
  --aws /tmp/nsmarks-atlas-upload-venv/bin/aws \
  --out reports/fletcher/retile-20260913/publication.json
```

Use `verify_public.py --tiles PACKAGE --out PUBLIC_RECEIPT` to replay public
checks without credentials. Do not overwrite this immutable revision with
changed rasters or metadata; generate a new revision.

Final local tile verification covers all 44,340 inventory hashes and eight XYZ
grids. The continuous zoom-15 comparison covers 1,216,437,446 opaque cells, with
zero missing source coverage, zero tile-edge RGB differences and a maximum
interior rounding difference of one 8-bit level. The composite retains
1,122,602,317 source coverage cells across all 24 sheets with zero loss.

This uploads a provisional review mosaic. Existing web/native tile revisions,
label projection pins, geographic acceptance and bucket configuration are
unchanged. This mosaic uses one XYZ template; the existing per-sheet production
layer is a separate delivery format and has not been switched.
