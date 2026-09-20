# Sheet 004a — three map components, provisional

This is the fourth sheet in the five-sheet batch. Official Yarmouth and
Shelburne Counties scan: 3912 × 5727 pixels, embedded JPEG, 150 dpi. No imagery
is committed or enabled in production.

## A single whole-sheet transform would be wrong

Native inspection found separate notes stating that the **Northern Seal** and
**Southern Seal** groups are drawn five miles east of their true positions.
They are unboxed cartographic relocations, not scan distortion. All source
coordinates remain in the original JPEG frame; each group has its own fit and
mask. A curved global warp bridging these discontinuities is not supported.

The main affine, applied without correction to the six Northern Seal checks,
gives **8,015.74 m RMS**. The independently fitted Northern Seal component gives
**167.56 m RMS on the same physical observations**. The baseline is a deliberately
incorrect one-transform counterfactual, never a published layer. Both results
are retained. Removing the deliberate displacement does not establish that the
remaining error meets the 100 m acceptance objective.

A geodesic due-west five-mile search guide did not match the physical arrangement.
A paper-frame displacement located it; the final transforms come from reviewed
physical controls, not an assumed exact translation. Printed “east” must not be
silently interpreted as a modern true-bearing operation.

## Separate geographic results

| Component | Model | Controls | Excluded checks | RMS, ground m | Status |
|---|---|---:|---:|---:|---|
| Main | Affine | 5 | 10 | 101.96 | Fails 100 m RMS; limited sample |
| Northern Seal | Similarity | 4 | 6 | 167.56 | Fails 100 m RMS; paired island checks correlated |
| Southern Seal | Similarity | 3 | 0 | Not available | Control-only, unvalidated |

Do not pool these components into an apparent whole-sheet pass. Detailed median,
empirical P95, maximum, signed bias and individual errors are in the corresponding
score files. The user-revised RMS criterion and original 50 m history are in
`../acceptance-criteria.json`.

The two narrow displaced groups use constrained similarity models chosen before
scoring: scale, rotation and translation without unsupported affine shear. The
main-frame component has enough distributed support for affine fitting.
All three fits were frozen before their checks were scored; no model was tuned
against failed checks.

Six Southern Seal check proposals were rejected for insufficiently identifiable
shared point definitions: smooth/generalized shores, historical indentations
without counterparts, and a changed/complex intertidal connection. A low fitting
residual is not an independent accuracy measurement. Its score is explicitly
null, never zero. Two proposed Southern controls on the tidal connection and
changed eastern projection were also excluded before fitting; retained controls
SA01, SA03 and SA05 have their paired native crosshair evidence locally.

The Northern Round Island check initially selected a nearby 21 m perimeter rock.
The broad outline audit corrected it to the main Round Island shoreline
(OBJECTID 19951) before first scoring. Original proposals and the identity
correction remain preserved. Smooth Northern shoulders/waists and symbolic main
map outlines were rejected rather than used to fill a quota.

## Source/reference investigation

The apparent absence of the Seal groups in the first reference views was caused
by their deliberate map displacement, not missing NSTDB coverage. Final controls
and checks use **NSTDB only**, with 4,788 features over three complete ordered
pages. Longitude/latitude, native pixels and EPSG:32620 fit coordinates remain
explicit. Ground errors use WGS84 geodesics.

An OpenStreetMap diagnostic lookup corroborated Noddy Island's actual vicinity
and helped expose the displaced frame. Its geometry is not used in the final
fits or scored checks. Both Overpass request forms returned HTTP 406; a bounded
read from OSM's main public API succeeded. The private raw response contains
metadata that is not committed. OSM coastline source tags often identify
NRCan-CanVec-7.0; that is provenance, not a surveyed accuracy guarantee.

Official Elbow/Purdy Rock locality coordinates corroborate that their symbols
share the Southern group's relocation. Those place-name points are **not**
precise shoreline checks. Rock symbols and other untested small components remain
unsupported. `source-receipt.json` preserves reference queries, hashes and the
rejected/diagnostic guide versions.

## Complete mapped content and rendered output

`components.json` retains the full main neatline, removes the two relocated
regions from that original display position, and renders each region separately.
The Northern rectangle includes all four islands and their explanatory note.
The Southern rectangle includes both large islands, nearby symbols, Elbow/Purdy
Rocks and the displacement note. There is no control-hull clipping.

All three output-alpha checks pass with zero interior omissions and zero excess
beyond the fixed one-output-cell tolerance. The union of all native alpha masks
also matches an independently sampled full-neatline polygon: zero missing,
excess or overlapping source pixels (one-native-pixel boundary tolerance).
`verify_source_union.py --artifacts <private-sheet004a-folder>` replays that check.
Numerical coverage does not substitute for the separate geographic limitations.

Each component is a private georeferenced GeoTIFF plus its browser PNG. Use the
main fit and component file with `tools/crown-grant/render_sheet.py`; the component
file carries the two separate similarity matrices and fit hashes. Apply controls
to the original JPEG only, not to the resampled output pixel frames. The frozen
matrices, source identities and editable control/check JSON records are sufficient
to reproduce the exact render and score path.

The actual three-component raster was inspected in the Codex browser against
modern geography. All images loaded at recorded dimensions; a 35% opacity setting
applied to all three, and modern-only/restore controls worked without console
errors. The printed-position holes and relocated groups remain visible rather
than concealing the transformation. This is local rendering proof, not acceptance.
