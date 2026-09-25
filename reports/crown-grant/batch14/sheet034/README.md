# Sheet 034 — Liverpool, Port Mouton and displaced offshore inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 8 | 7 | 81.93 | 56.94 | 127.50 | 138.39 |
| offshore-inset | 2 | 3 | 63.89 | 64.36 | 68.17 | 68.60 |

Original source: https://novascotia.ca/natr/land/indexmaps/034.pdf, 5304 × 3689, 140 ppi. The complete original scan is separately accessible with marginal attribution and warning.

The whole mapped frame, including all open water and Port Mouton islands, is partitioned exactly into the main map and the complete displaced inset. The inset rectangle is removed from the main transform and rendered through its own original-frame transform. Unmatched inset island outlines remain visible and explicitly provisional.

Main observations comprise eight controls and seven excluded checks. The inset has two controls and three checks fixed before either first fit and score. Both source frames remain the original embedded JPEG.

The inset labels identify the south margin of sheet 040 and east margin of sheet 034. A native southwestern crop of sheet 040 explicitly says it joins the inset on sheet 034. These establish adjacency for discovery. A direct sheet-040 guide replaced the rough chained sheet-033 guide before adopting observations.

The inset southern islet and mainland corner have recognizable local geometry; the oval middle island and clipped northern island remain unresolved. The chosen similarity has only uniform scale, rotation and translation, with no unsupported shear. Its two control points provide no fitting redundancy.

All twenty original native crosshairs and the corrected Town Lake source crosshair were inspected before fitting. The two preliminary inset detail views accidentally generated using the main-map guide were not used; correctly framed replacement details were inspected. Original proposals and guide versions remain retained.

Limitations:

- Main: checks include paired control lakes/islands, a separate Spectacle island, White Point pond and Eagle Point; the largely empty southern/eastern ocean and northwestern interior lack independent validation.
- Inset: only two physical controls, one mainland corner and the southern islet west shore, define the constrained four-parameter similarity exactly. There is no fitting redundancy.
- Inset: three excluded checks are on those same two features, and the islet south check is only about 12 ground metres from its west control. This is weak local validation, not independent whole-inset support.
- Inset: the middle oval and northern cropped island outlines remain unmatched and unvalidated. They are retained in full under provisional extrapolation; no geometric acceptance is claimed.
- Generalized natural shorelines and small island tips carry 24 px working source uncertainty.

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Whole-sheet and 500 m inset historical/modern-only browser views, image decoding and opacity checks passed; the separate receipt records them. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.
