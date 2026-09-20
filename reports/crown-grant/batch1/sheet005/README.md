# Sheet 005 — Digby County

**Fifth and final sheet of the requested batch. Provisional, not geographically
accepted.** The main map and boxed Brier/Long Island inset use separate frozen
affine fits in the original 5762 × 3894, 150 ppi JPEG coordinate frame. The official
PDF is https://novascotia.ca/natr/land/indexmaps/005.pdf; the scan says March 2009.
Imagery, references, native paired crosshair images and rendered rasters remain
private in `.crown-grant-local/`.

## Independent ground accuracy

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| Main, source-audited | 6 | 7 | 123.46 | 62.89 | 228.60 | 264.02 |
| Brier/Long inset | 5 | 7 | 35.36 | 28.56 | 54.58 | 57.88 |

The current RMS ceiling is **100 m**. Main fails. Inset statistics pass RMS and
the unchanged companion bounds, but all seven checks cover Brier/Peters Island;
none validates Long Island. Both components also lack the distributed 12-check
coverage required for broad acceptance. No scores are pooled across components.
Main bias is +27.55 m east, −31.91 m north; inset +0.71 m east, +8.55 m north.
Source placement uncertainty is estimated at 6 pixels and modern correspondence
at 20 m; these are declared working estimates, not a formal error budget.

Main initially scored 184.29 m RMS. MQ10 was then found on the north sloping
face instead of the shared western corner at the Weymouth entrance. Its native
source position was corrected from [4825, 2850] to [4783, 2892], with the modern
shore corner audited on OBJECTID 9463. The unchanged fit scores 123.46 m after
this audit. Both results remain published; the latter is explicitly source-audited,
not an untouched holdout result. No fit was tuned after either check set.

A later MQ10 proposal accidentally used the cached inset guide. Native review
rejected the wrong candidate before scoring/fitting. The preserved checks2
packet is **rejected**, and checks3 explicitly names the frozen main guide.
`rejected-attempts.json` records this. Final checks and frozen fit files are
canonical; raw proposal packets are not additional adopted controls/checks.

## Evidence and remaining coverage

All adopted ties are physical shoreline features from NSTDB water layer 4.
The bounded coastal reference query returned 672 features without truncation.
A separate roads query returned 3331 features over two complete pages; its
Sandy Cove junction proposal was rejected because the historic thin line could
not be securely distinguished from parcel annotation. Geonames narrowed local
searches only; no locality centroid supplies a control or check.

Main checks cover Tiddville, Mink Cove, East Sandy Cove, Little River Cove and
the Weymouth entrance. Smooth shores, ambiguous harbour geometry, mainland
interiors and much of Long Island remain unsupported. Inset checks cover Seal,
Pero Jack, Cow, Lighthouse and Hog Yard coves, the western cape and Peters
Island. Seven other inset proposals were rejected before scoring for ambiguous
coast geometry, changed lagoon connections, or misplaced source markers.
Rejections and all pre-score proposal/correction packets are retained.

## Full-content rendering

The inset touches the outer neatline. Two complementary polygons share its
boundary; the main polygon is notched rather than cut with a touching hole.
Separate matrices place both components at their real locations. Their union
retains 19,794,288 native source pixels with **zero missing, excess or overlapping
pixels**, allowing a one-pixel exterior tolerance. Output-alpha checks also pass
with zero missing/excess cells outside the one-cell edge tolerance. The original
complete scan remains available, including marginal attribution and warning.

The actual private browser review was inspected at full extent and a 2 km scale.
Main 6177 × 5083 and inset 2805 × 2585 images loaded; 35% opacity, modern-only,
restore and original-scan controls worked, with no browser warnings/errors.
This verifies the standalone Leaflet raster review, not the native app's raw-scan
importer or TPS mesh, and does not override the geographic limitations above.

Reproduce with the shared `score.py`, `render_sheet.py`, `verify_coverage.py`
and this directory's `verify_source_union.py`. SHA-256 receipts identify original
source, references, frozen fits, component masks and rendered results. Research
records are public; no scan, reference extract, warp or screenshot is committed.
