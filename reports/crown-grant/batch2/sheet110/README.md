# Sheet 110 — Port Hawkesbury north to River Denys

First sheet in batch 2. **Independent RMS 53.84 m passes the 100 m ceiling.**
Seven physical controls define a frozen affine in EPSG:32620. Eight excluded
checks give median 52.58 m, empirical P95 75.30 m, maximum 77.46 m and bias
+8.78 m east / +36.52 m north. The retained median bound of 40 m is not met;
check count/distribution remains insufficient for whole-sheet certification.
The fit was not changed after scoring. No check was promoted to a control.

Original source: `https://novascotia.ca/natr/land/indexmaps/110.pdf`, embedded
5683 × 3880 JPEG, 150 ppi, printed March 2009 update. This single frame includes
Port Hawkesbury, the Strait of Canso, River Inhabitants, West Bay and River Denys
Station. No separate inset or mapped extension was identified. A small margin
outside the neatline retains the complete mapped content; the entire original
scan remains separately accessible with its marginal source warning/attribution.

NSTDB water layer 4 supplied 10,687 features in six ordered pages. Pagination was
exhausted and OBJECTIDs checked for duplicates. Geonames only seeded discovery;
none of their locality centroids was adopted as a physical control/check.
Original-frame pixel coordinates, feature IDs, uncertainty estimates, all
proposal/correction packets and rejected candidates are retained. Native paired
crosshair images and reference extracts remain private.

Controls span Dunmore and Long Pond, a Sugar Camp pond, a River Inhabitants loop,
a northeastern lake, Ballam Head and a Rhodena pond. Independent checks cover
North Harbour, Long Pond's opposite end, Lexington Harbour, the River Inhabitants
and three West Bay shoreline features. Different points on the same ponds are
spatially correlated and do not substitute for independent regional coverage.
Northernmost and much interior terrain remain less well checked.

Causeway-era shoreline change around the narrows is excluded from controls.
The Low Point smooth shoulder and West Bay bank/road/mouth proposal were rejected
before fitting. Two check candidates were rejected before scoring because a
historic isolated pond and Beaver Lakes shore do not have precise shared modern
boundaries. A low residual did not determine adoption of any candidate.

The 6164 × 5194 private raster uses the shared exact GDAL render path. Output
alpha has no missing or excess cells outside the one-output-cell edge tolerance.
There is one nondegenerate affine, so no internal transform discontinuity.
Keep imagery in `.crown-grant-local/sheet110/`; public records contain metadata,
coordinates and measurements only. Geographic assessment, user acceptance,
browser rendering and repository CI remain distinct.
