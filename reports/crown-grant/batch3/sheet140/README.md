# Sheet 140 — Louisbourg, Main-a-Dieu and complete Scatarie inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 6 | 7 | 70.07 | 55.66 | 108.31 | 114.41 |
| scatarie-inset | 4 | 5 | 61.52 | 61.25 | 81.80 | 82.56 |
| mainadieu-inset | 2 | 3 | 52.93 | 59.41 | 68.64 | 69.67 |

Original source: https://novascotia.ca/natr/land/indexmaps/140.pdf, 5766 × 3937, 150 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Complete source rectangle partitioned into the main Louisbourg–Cape Breton coast and partial Scatarie map, the separately boxed full Scatarie Island inset, and the pasted enlarged Main-a-Dieu inset. Native main-mask holes exactly equal the two separately fitted inset masks. Every mapped island, offshore rock and repeated geographic region is retained; geographic overlap between the main Scatarie fragment and the complete inset is intentional.

All three models were chosen and their final physical correspondences audited before their respective first scores. Main uses affine; both displaced insets use constrained similarity. Each first score and fit remains unchanged; no valid failed check was removed after scoring.

Original and revised proposal packets retain rejected matches, code-filter mistakes and coordinate corrections. Source-type filtering alone did not establish identity: mainland-only coastline filters sent Scatarie proposals to distant shores, and a broad island search initially selected a neighboring Brown islet. Native topology review resolved those errors before fitting.

Full-source border and inset corners were inspected at native resolution. The complete original scan remains separately available with attribution, warning and marginal notes. Modern reference pagination yielded 4,421 features over three pages.

Mean residual bias (warped minus reference, ground metres): main +21.89 east / -20.00 north; Scatarie -27.71 east / -8.63 north; Main-a-Dieu +0.35 east / -42.73 north. Companion medians, P95 and maxima are retained per component in the table and score files.

Limitations:

- Main: six controls and seven checks, RMS 70.07 m. Coastal and lake checks provide regional support; parcel interiors, much of the northern margin and the main Point Howe fragment remain unvalidated.
- Scatarie inset: four controls and five checks, RMS 61.52 m. Shores and Hay Island are sampled, but the fragmented Point Howe tip, small rocks and interior are not independently validated.
- Main-a-Dieu inset: two controls and three clustered checks, RMS 52.93 m. Near-zero control residual follows from the two-control similarity and is not accuracy evidence. Western coastline, urban and parcel geometry remain unsupported.
- Main and inset repeat some physical features; their check counts and scores must not be pooled as independent series observations.
- Working source uncertainty is 12 native pixels for main/Scatarie and 8 pixels for the enlarged Main-a-Dieu inset; shoreline generalization and real coastal changes remain relevant.

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. All three actual browser images decoded successfully; full view and enlarged Main-a-Dieu alignment, opacity and modern-only comparisons were verified. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
