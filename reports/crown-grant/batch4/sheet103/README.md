# Sheet 103 — Antigonish Harbour, Cape George and Doctors Brook–Morar coastal inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 5 | 4 | 174.43 | 97.05 | 285.41 | 311.28 |
| coastal-inset | 2 | 2 | 89.34 | 79.37 | 116.29 | 120.39 |

Original source: https://novascotia.ca/natr/land/indexmaps/103.pdf, 5992 × 4111, 160 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Full original mapped frame retains Antigonish Harbour and its western shore fragment, the Creeping Head–Lakevale coast, Cape George peninsula, all small islands and St Georges Bay. The true displaced Doctors Brook–Malignant Cove–Georgeville–Morar coastal strip is fitted separately. Its angled native mask exactly fills the main-map hole; no coastline or northern inset fragment is cropped away.

Both original fits and every first check score remain unchanged. Main uses a five-control affine; the narrow coastal inset uses a constrained two-control similarity, with role plans fixed before the respective first scores.

Unresolved Plaster Cove/tidal-bank and harbour proposals, a presumed parcel-line watercourse and ambiguous northern inset outlets were rejected before fitting. All initial, revised and rejected proposal packets are retained.

The native arrow explicitly reads Magnetic 1963. Locality positions from CGNDB/NSLPS and printed orientation were search aids only, never GCPs. A near-collinear affine discovery attempt produced extreme anisotropy and was discarded; constrained discovery guides preserved shoreline shape before physical matching.

Modern NSTDB reference contains 9,114 features over five fully retrieved pages. Original scan is 5,992 × 4,111 at 160 ppi; border and angled inset corners were inspected at native scale.

Main check errors are 138.86, 49.82, 55.25 and 311.28 m. Ground residual bias is +49.75 m east / +61.71 m north. Inset bias is +15.92 m east / -77.32 m north. No component scores or sample counts are pooled.

Limitations:

- Main: five controls and only four independent coastal checks give RMS 174.43 m, failing the 100 m ceiling. Median 97.05 m, P95 285.41 m and maximum 311.28 m also exceed suggested companion bounds. Western Antigonish Harbour and interior lack secure local controls/checks.
- Inset: two controls and only two independent southern-corridor checks give RMS 89.34 m, median 79.37 m, P95 116.29 m and maximum 120.39 m. RMS passes numerically, median exceeds suggested 75 m, and this extremely small sample does not establish whole-inset accuracy.
- Doctors Brook/Malignant Cove northern inset, western main estuary, parcel interiors and harbour works remain unvalidated. Their complete imagery is retained as provisional extrapolation.
- Near-zero inset fitting residual follows from the two-control similarity and provides no accuracy evidence. Two-point empirical P95 has little statistical support; no confidence interpretation is made.
- Working source uncertainty is 12 px, raised to 18 px at generalized Creeping Head, Lakevale bank and Cape George corner.

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Browser proof is recorded separately. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
