# Sheet 003 — provisional, not accepted

Current criteria are in `../acceptance-criteria.json`: the user raised the RMS
ceiling to 100 m during the batch. The original assessments below are preserved;
read `status.json` for the current acceptance state.

The official Yarmouth County sheet is a 5324 × 3606 embedded JPEG at **140 dpi**,
not one of the two resolutions assumed in July. It has no separate inset. Its
entire inner neatline, including offshore mapped content, is retained.

Five distributed coast/lake controls define a frozen affine fit in EPSG:32620.
Twelve separately selected physical checks measure **52.52 ground-metre RMS**,
median **47.93**, empirical linear P95 **81.09**, and maximum **86.11**. Mean
warped-minus-reference bias is −7.24 m east, +16.35 m north. The fixed RMS,
median and P95 gates fail; the maximum gate passes. Do not round this into an
acceptance. No control or model was changed after scoring.

Checks cover Allen, Darlings, Coggins, Wellington, Turley, Robbins, Chandler,
Harris and Telly lakes, a small interior lake, Chegoggin Point and eastern Cape
Forchu. These are identifiable GIS physical features, not surveyed checkpoints.
Three candidates remain rejected: Bunker Lake's outlet transition, Doctor Lake's
northern shore/arm, and Salmon Lake's southern inlet. Their feature definitions
were unresolved; they were excluded before scoring, not because of large errors.

Native crosshair audits corrected rough source placements and modern markers
before scoring, including a Brenton Lake proposal that initially landed on an
unrelated small feature. The Canadian Geographical Names locality corroborated
lake identity but was not used as a control coordinate. Source and modern
coordinates, OBJECTIDs, roles, uncertainty, initial proposals and corrections
are retained in the JSON records. Private paired images are `003-controls*`,
`003-checks*` and `003-final-crosshairs-*` under `.crown-grant-local/`.

The search guide initially extended sheet 002's seam at the appropriate native
scale ratio; it was used only to find correspondences. The fit uses this sheet's
physical controls. The original guide is hashed in the source receipt. Modern
water acquisition is complete: 4,329 features over three ordered pages, with the
last page not truncated. All reference coordinates use explicit longitude,
latitude; ground errors use WGS84 geodesics.

## Render and coverage

The actual alpha-masked raster is rendered to EPSG:3857 at 8 projected-metre
cells. Its affine determinant is negative in the x-right/y-down source frame;
no affine folds occur. The output cell size is not geographic accuracy.

Independent dense-polygon alpha verification found no missing interior cells.
The first native mask used Pillow's inclusive integer polygon fill and produced
two excess output cells beyond the one-cell edge tolerance. This is preserved
in `render-attempt01-receipt.json` and `coverage-attempt01.json`; its imagery is
private `sheet003/render-attempt01/`.

The corrected mask rasterizes pixel-edge polygons at native pixel centres with
GDAL. The final verification has zero missing interior cells and zero excess
cells beyond the unchanged one-output-cell edge tolerance. Geographic controls,
transform and scores did not change. A small regression fixture verifies nine
pixels for a 3×3 edge-defined rectangle and preserves the 16-pixel legacy mode
needed to reproduce sheet 002's already verified render.

Use `render_sheet.py` with the sheet's source, fit, component file and private
output directory; use `verify_coverage.py` on the same fit/components/output.
Editable controls and independent checks are separate JSON records, and the
matrix convention is explicit. No image or tile is in this PR or production.

The real browser loaded the final 5977 × 5188 raster and modern references.
The full overview and a 500 m scale view were inspected; sheet selection and
modern-only comparison worked. Animated background navigation initially left
the prior extent visible, so the local viewer now stops transitions and sets
bounds without animation. Console inspection reported no warnings or errors.
This is local rendering verification, not geographic acceptance or deployment.
