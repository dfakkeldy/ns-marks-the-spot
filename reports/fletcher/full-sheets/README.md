# Fletcher full-sheet review tiles

This revision renders the complete cropped map content of Cape Mabou / Broad Cove (14), Judique (19), Mabou
(16) and Hawkesbury (22), including the eastern interior and southern mainland.
It replaces the local Route 19 strip preview. It is an approximate, reversible
review mosaic, **not a geographically accepted seamless replacement layer**.
No production layer has been changed.

## Active inputs and editable controls

| Sheet | Active fit | Controls | Original hand controls preserved |
| --- | --- | ---: | ---: |
| Judique 19 | [revised-fit.json](../judique-full-sheet/revised-fit.json) | 44 | 15 |
| Mabou 16 | [revised-fit.json](../mabou-full-sheet/revised-fit.json) | 34 | 32 |
| Hawkesbury 22 | [boundary-fit.json](../hawkesbury-full-sheet/boundary-fit.json) | 28 | 17 |
| Cape Mabou 14 | [refined fit.json](../sheet14/southern-audit-20260909/hay-topology/fit.json) | 26 | 0 |

[Control preservation](control-preservation.json) records exact equality of all
64 hand controls and the prior accepted agent controls. The `sheet-*-controls.csv`
files contain fitting controls only, in original native scan coordinates. The
separate `sheet-*-checks.csv` files must never be fitted. CSV import replaces a
draft's control list: import into a separate native-scan draft and select TPS.
Do not attach native controls to the resampled GeoTIFF.

[inputs.json](inputs.json) identifies each source fit, rendered raster, dimensions,
bounds, orientation samples and composite hash. The original neatline masks are
retained: 8 px inset for Sheet 14, Judique and Mabou, approximately 12 px for Hawkesbury.
These remove the printed frames, not inland map coverage. Sources remain intact.
The coordinate system is EPSG:3857, with 5 projected-metre raster cells; this is
resolution, not positional accuracy.

## Geographic evidence and limitations

| Sheet | Retained diagnostic median / worst, ground m | Later checks |
| --- | --- | --- |
| Judique | 82 / 123 (17, duplicate B08 excluded) | Three fresh checks: 118 / 168 |
| Mabou | 106 / 133 (10) | Three fresh checks: 61 / 126 |
| Hawkesbury | 75 / 165 (17, final 28-control fit) | H06 and eastern boundary check were inspected before the final revision; now diagnostics |

The working 100 m median / 200 m worst targets are **not satisfied uniformly**:
Judique's fresh median and Mabou's retained diagnostic median exceed 100 m.
Nearby checks on the same catchment have weak independence. These are same-agent
physical-feature audits, not survey validation or a user audit of every point.

Sheet 14 now has 26 controls and 13 excluded diagnostics at 112/241 m. Southern
confluence C13 and Hay River controls C14/F05 had incorrect modern identities;
they are corrected, and mill confluence B01 is added. Schoolhouse Brook remains
excluded and scores 80 m. The selected raster has zero interior alpha holes across
47.3 million cells. The older trial that fitted the misidentified R04 remains
rejected. See the [current audit](../sheet14/southern-audit-20260909/README.md)
for dated reference evidence, post-score pixel correction and uneven accuracy.
This does not establish full-sheet geographic acceptance.

Earlier failed fits and checks remain in the per-sheet reports. Consumed checks
are identified as controls; they do not contribute to the reported accuracy.
Judique D02 remains unresolved and is excluded. B08 duplicates O08's modern
location and is excluded from independent checks. The Hawkesbury 24-control
revision's mainland drift is retained in its diagnostic report, followed by the
27-control repair and the 28-control boundary revision.

Native crosshairs and modern vector context for the full-sheet additions are in
[review/](review/), with exact crop frames in [frames.json](review/frames.json).
The figures use final recorded coordinates, including the corrected Black Brook
bank intersection. Broader topology evidence, source identities and uncertainty
remain in each point's JSON record. Carleton Head is a broad coastline control
with 20 px uncertainty, not a precise stream junction.

## Boundary matching and remaining gaps

Following the user's choice, the join was investigated through physical stream
matches rather than an edge-adjusted warp. The new eastern Hawkesbury check
J22-E01 is the downstream junction on NSTDB stream 195853, connected to Judique
D04. It scored 44 m against the frozen 27-control fit and 68 m after the central
boundary correction. These are different junctions, not a shared tie point.
Historical and modern road crossings differ here; the stream connectivity is
the identity evidence, not an assumption of unchanged road alignment.

The central Lamey Brook junction J22-C01 exposed a 204 m northward error. It was
added as a control, with explicit bank-versus-centreline uncertainty, and all
other checks were replayed. No sampled folds were found. Correcting this genuine
positional error does not close the gap; it moves this part of Hawkesbury south.

[Revised join coverage](boundary-matching/revised-join-coverage.json) samples at
0.001° longitude. Between -61.46° and -61.23°, the largest Judique–Hawkesbury gap
is about **381 ground metres**. The Mabou–Judique join overlaps throughout that
same inland longitude interval. Far-west samples include sea; extreme eastern
spikes intersect staggered side edges and must not be reported as ordinary join
widths. Coverage separation is not a feature-error measurement.

The evidence does not support closing every gap by changing control points.
Historical drawing differences, crop insets and residual alignment errors can
all contribute; these results do not prove that the original surveys omitted
exactly the transparent strip. The preview retains these gaps. A seamless mosaic
still needs further justified correspondences, another source covering the gap,
or a separately identified cartographic adjustment. No such adjustment was made.

The Sheet 14–Mabou join remains open by approximately 113–1,013 m between
-61.46° and -61.24°. [Join evidence](../sheet14/southern-audit-20260909/hay-topology/mabou-join.json)
measures coverage separation, not feature accuracy. Correcting river identities
does not justify stretching the sheets together.

## Tiles and local verification

Artifact revision: `fletcher-full-sheets-20260909.2`, in
`~/Downloads/fletcher-full-sheet-tiles/`. The mosaic uses bottom-to-top ordering
22, 16, 19, 14, so Sheet 14 takes priority at its join and Judique retains
priority in the earlier overlaps. Tiles are RGBA PNG XYZ, zooms
8–15, with overzoom in the browser. The full pyramid contains 4,630 tile objects;
blank objects are intentionally retained to avoid missing-tile errors.

[Tile verification](tile-verification.json) checks every inventory hash and XYZ
object, and compares all opaque zoom-15 cells against a continuous GDAL resample.
There are zero lost source-coverage cells and zero tile-edge RGB differences.
This revision has zero interior RGB differences as well. Earlier revision receipts
are retained separately. This tests tile mechanics, not
geographic accuracy. Earlier revision receipts remain explicitly labelled.

The web preview is opt-in through `VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL`.
Local browser checks cover desktop/mobile rendering, interior and edge locations,
toggle, opacity and reload; see [browser receipt](browser-verification.json) for the current responses.
The preview is excluded from map exports. Its source link exposes the raster and
fit provenance; default production Fletcher layers remain unchanged.

## Reproduction

Use the existing benchmark Python environment with NumPy, Pillow and Matplotlib,
and GDAL CLIs on PATH. Large native scans and raster outputs stay outside Git.

1. `render.py --source NATIVE --fit FIT --boundary BOUNDARY --checks CHECKS --out DIR`
   verifies source hashes, scores the named frozen checks, samples the Jacobian,
   and renders the complete neatline. Use the active inputs above and their
   corresponding diagnostic/fresh check JSON; do not use checks as controls.
2. Check raster alpha against the complete neatline with Sheet 14's
   `refinement-20260909/verify_raster_coverage.py`. A negative sampled Jacobian
   alone did not detect the failed Hay River render. Composite the four outputs with `gdalwarp -srcalpha -dstalpha -r near -tr 5 5
   -tap -co COMPRESS=DEFLATE -co TILED=YES HAWKESBURY MABOU JUDIQUE SHEET14 OUTPUT`.
3. Record its hash in `inputs.json`, then run
   `tools/fletcher/tile_full_sheets.py --source OUTPUT --out NEW_REVISION_DIR
   --gdal /opt/homebrew/bin/gdal` (GDAL 3.11+). Update the immutable revision name
   when changing the input raster.
4. Run `tools/fletcher/verify_full_sheet_tiles.py --source OUTPUT --tiles DIR
   --out RECEIPT` using Python with GDAL and NumPy.
5. `measure_join.py --north CUTLINE --south CUTLINE --out RECEIPT` uses GDAL's
   Python bindings. `review_points.py` reproduces native/modern audit figures.

Historical attribution: David Rumsey Map Collection / David Rumsey Map Center,
Stanford University Libraries, CC BY-NC-SA 3.0, with existing project permission
receipts retained. Modern NSTDB extract receipts remain in the matching-benchmark,
sheet16 and sheet22 reports. This work does not add publication authorization.
