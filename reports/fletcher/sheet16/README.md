# Sheet 16: Route 19 north of Judique

The saved hand controls support a useful cropped preview through Port Hood toward
Mabou. TPS passes eight frozen physical checks at **82 m median / 132 m worst**.
This completes the first northern validation pass for the requested Port
Hawkesbury–Judique–Port Hood–Mabou corridor. It does not establish whole-sheet
accuracy or finish the seamless corridor tileset.

## Preserved inputs and checks

The original annotation and 38-row repository export are retained unchanged in
`saved-annotation.json` and `saved-measured.csv`. The fit preserves all **32 gcp-*
controls**: 26 use the annotation's full precision and six later controls retain
the CSV's saved precision. Six older `cand-*` rows remain in `saved-points.json`
without entering the fit or being relabelled as verified hand controls.

The native Rumsey scan is 10822×7531 pixels. Exact-size IIIF regions were assembled
and checked, avoiding the degraded benchmark JPEG. Its SHA-256 is
`d9a4c9a7c6f4e7057e32b57dcb26f6425e9b52015d360498e98e8e2de9a27f94`.
The source is Rumsey item `RUMSEY~8~1~2641~290009`, catalogue 3997.018,
1884, scale 1:63,360. Pixel coordinates in the CSV apply to this original canvas,
not either warped TIFF.

The protocol was committed before measurements were scored. Native crosshairs
and modern stream/shore topology were inspected before freezing Q01–Q08 in
`observations.json` (commit `d254721a`). No controls were adjusted and no checks
were promoted to controls. Check identity and source object IDs are recorded in
that file; `check-evidence-1.jpg` and `check-evidence-2.jpg` show all eight pairs.

| Model | Median ground error | Worst ground error | Predeclared gate |
| --- | ---: | ---: | --- |
| Affine | 108.1 m | 229.5 m | Fail |
| TPS | 82.4 m | 132.2 m | Pass |

The gate is median ≤100 m and worst ≤200 m. All eight checks are inside the
control hull. Q01/Q08 share a catchment and Q03/Q07 share an estuary, limiting
spatial independence. Q02 includes modern indefinite stream segments. The checks
now inform model selection and cannot serve as fresh validation for a later
repair. Eastern mountainous terrain is not validated by this western sample.
A grid of 4,375 Jacobians had the expected orientation for both fits; sampling
cannot prove a curved warp is free of folds everywhere.

Modern NSTDB extracts and hashes are listed in `reference-receipts.json`.
Route 19 is in **Highways layer 7**, separately from Roads layer 8; both are now
included in the final evidence. The orange line in `route19-overview.jpg` is
modern Route 19, not a road fitted to the old scan.

## Crop and southern join

`boundary.json` follows the inner printed border with an inward inset. The
supported preview uses the intersection of this crop and the control hull,
covering 68.48% of the content area including sea. One preserved control lies
about four native pixels outside the inset: the crop is clipped without moving
that control. A control hull limits extrapolation but does not certify accuracy.

Route 19 has 2,043 sampled positions within the content extent and 1,995 inside
the supported mask. Samples are at most 25 projected metres apart on each source
segment; counts are **not** a length-weighted coverage percentage. Two short
stretches lie outside the supported mask:

- Southern join: latitude 45.92288–45.92670, approximately 430 m north–south.
- Near Port Hood: latitude 45.99614–45.99828, approximately 240 m north–south.

These are sampled bounds rather than exact missing road lengths. The full
neatline diagnostic includes them through extrapolation. See
`route19-coverage.json` for all excluded coordinates.

At the Route 19 crossing of the southern border, the full-content Sheet 16 and
Judique footprints overlap by **206 m**. Across the entire facing edge, the
range is a 485 m gap to a 414 m overlap. This measures footprint extent, not
agreement of roads or streams. `southern-join.jpg` shows both existing warps and
`southern-join.json` preserves the measurements. Neither neighbouring control
set was moved to force a join. A shared cutline still needs physical-feature
validation; the supported preview is not an unbroken final corridor layer.

## Outputs and verification

Large rasters remain in `/Users/dfakkeldy/Downloads/fletcher-sheet16/result/`:

| Raster | Dimensions | Use |
| --- | --- | --- |
| `sheet16-supported-preview.tif` | 6793×5434 | Cropped TPS preview inside the control hull |
| `sheet16-neatline-diagnostic.tif` | 8485×5541 | Full content, including extrapolated areas |

Both are RGBA GeoTIFFs on a 5 m **projected** EPSG:3857 grid. These grid dimensions
do not imply 5 m geographic accuracy. Hashes, geotransforms and source/build
receipts are in `artifact-receipt.json`. `sheet16-controls-checks.csv` carries
roles explicitly for review on the original native scan.

Verification completed locally:

- Full GDAL render and separate score-only replay agree exactly.
- Saved control strings, input hashes, mask containment, raster alpha and grid
  metadata were checked; GDAL's affine result agrees with NumPy within 0.0001
  projected metres.
- All 257 existing Fletcher Python tests pass; Ruff check and format check pass.
- Playwright imported the actual 77,456,391-byte supported TIFF into NSMtS,
  enabled it, checked visible painting, then reloaded and verified the same TIFF
  hash, 6793×5434 dimensions, geotransform and enabled state. Its display preview
  is 4096×3277 with transparent and opaque pixels. Desktop and mobile Chromium
  layouts were inspected; console/runtime errors were empty. This is local web
  verification, not native Safari/iOS testing or deployment.

To replay scores, with NumPy, SciPy, Pillow, Matplotlib and GDAL available:

```sh
python reports/fletcher/sheet16/build_draft.py --score-only --out /tmp/sheet16-score-replay
```

To reproduce the imagery, provide the native scan and the receipt-matching
reference extracts. Supplying the earlier Judique result also builds the join
comparison:

```sh
python reports/fletcher/sheet16/build_draft.py \
  --out /tmp/sheet16-render \
  --source /path/to/native/sheet16.png \
  --reference-dir /path/to/reference \
  --judique-dir /path/to/judique-boundary-checks/result
```

The next corridor work is to close the two supported-coverage gaps, validate the
shared Route 19 seam, and resolve the previously recorded southern Sheet 22
failures. Further eastern expansion remains lower priority. No live layer or
published tiles were replaced in this pass.

Source credit: David Rumsey Map Collection, David Rumsey Map Center, Stanford
University Libraries. CC BY-NC-SA 3.0 and the recorded project permission apply;
see [inventory](../INVENTORY.md). Cropping, annotations and warping are
modifications. Modern geographic references are from Nova Scotia's NSTDB.
