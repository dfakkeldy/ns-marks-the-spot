# Sheet 11 — 10 September refinement

The current **provisional** whole-sheet result is `central-fit.json` (25 controls),
`central-checks.json` (nine excluded diagnostics), and the local GeoTIFF
`~/Downloads/fletcher-sheet11/refinement-20260910/sheet-11-exact.tif`.
`../status.json` is the canonical status. The source, original 18 controls,
mainland extension and separate Sea Wolf Island crop are preserved.

This is useful progress, **not acceptance for tiles or production labels**.
The nine diagnostics score **100.707 m median / 174.382 m worst** in approximate
ground metres. The median is slightly above the predeclared 100 m goal. More
importantly, independent validation caught a central-valley discrepancy, and the
repair still needs new checks. Existing four-sheet tiles and digitization handoffs
remain unchanged.

## Correspondences and validation history

- The northern printed name is **Mink Brook**, corroborated by the named modern
  drainage. It is distinct from East Branch Gallant River farther south. Three
  reviewed confluences N01–N03 support Gallant; excluded Q08 checks the first
  western tributary below Mink. The earlier “Trunk Brook” description was wrong.
- W01 is the coastal creek outlet beside the historical lime kiln; W02 is the
  major western Mill Valley tributary. F01 supports the western tributary of
  Fionnar above the existing eastern-arm check. Native crosshairs and broad
  branch-order context, rather than the graticule guide, determine the pixels.
- Cameron Q06 originally selected the **second** eastern fork at `[3561,6159]`.
  Modern J1062 corresponds to the **first**, at `[3586,6064]`. The old wrong point
  and its failed results remain in the earlier files. This post-score repair
  does not create independent validation.
- Q03's exact Grey headwater-fork identity remains uncertain. It is retained
  visibly in the legacy diagnostics and is not evidence of independent acceptance.
- The 24-control fit was frozen before selecting V01–V03. V01 (Southwest Margaree
  western tributary) scored 115.936 m, V02 (Ranalds northern tributary) 112.164 m,
  and V03 (Tompkins outlet through the eastern river bank) **372.595 m**. That
  failed three-point validation is preserved in `validation-checks.json` and
  `validation-scores.json` with its exact fit hash.
- The verified Tompkins outlet became control **T01** in the 25-control repair.
  **V03 is omitted from every subsequent check set.** V01/V02 remain excluded
  but are now diagnostic replays after a validation-informed repair. No fresh
  validation of the repaired fit is claimed. Tompkins and Marsh Brook headwaters
  are separate; the apparent connection in a broad view was lettering/hatching.
- Beatons Brook forks and the remaining central small forks were not adopted:
  their precise correspondence was unresolved. The source uncertainty is not
  hidden by fitting predicted pixels.

| Revision | Excluded set | Median / worst ground m |
|---|---|---:|
| Baseline 18 | Original six | 175.743 / 341.266 |
| Baseline 18 | Same six plus new Q08 | 224.313 / 382.517 |
| Gallant 21 | Same seven, original Q06 | 137.665 / 347.330 |
| Western 24 | Seven, corrected Q06 | 94.287 / 167.298 |
| Frozen western 24 | Three new V checks | 115.936 / 372.595 |
| Central 25 | Nine diagnostics; V03 excluded as now T01 | 100.707 / 174.382 |

Rows with different check sets or repaired pixels are not direct comparisons.
`protocol.json`, proposals, crosshair frames, sensitivity results, and all trial
fits/scores preserve the sequence. `final-point-review/` has the final new and
corrected pixels; the unchanged 18 baseline controls retain `../final-review/`.
`validation-review/` contains V01/V02 and the original excluded T01/V03 review.

## Raster and join verification

The final EPSG:3857 RGBA GeoTIFF is **9450 × 5956**, with **5 projected m** cells.
The original full scan remains 10771 × 7551; CSV pixels refer to that scan.
The two-component cutline preserves the full mainland and island rather than a
route corridor. The 25-pixel orientation grid has **73,418 samples and no sign
reversals**; this is a sampled diagnostic, not proof of a continuous surface.

The initial render left one zero-alpha cell 3.688 projected m from the southwest
cutline. Rerendering the original controlled scan with GDAL `-et 0` fixed it:
**48,974,214 interior cells, zero holes**. Both receipts and the exact command are
retained in `raster-edge-repair.json`. The shared full-sheet render helper now
uses exact transformation calculations. No pixels were painted or extrapolated
to fill a seam. `warped-review/` uses the final actual GeoTIFF, with eight regions
including the repaired central valley, against directly projected modern vectors.

The unchanged Sheet14 northern edge and Sheet11 southern edge share longitude
−61.270025° to −61.225002°. The measured signed gap ranges from **−13.522 m
(overlap) to 139.445 m (gap)**. This measures coverage, not feature alignment;
`sheet14-join.json` pins both fits and boundaries. No edge adjustments were made.

The editable controls-only and controls/checks CSV files preserve 25/9 roles,
roundtrip through the actual application parser, and agree between the web TPS
solver and GDAL to less than 0.001 projected m. Browser mesh, save/reload and
production activation have not been exercised for this provisional revision.

Next on Sheet11: independently validate the repaired central valley and western
interior, resolve or replace Q03, then reconsider whole-sheet acceptance and the
remaining join. Sheet9 has been started separately; it does not replace this
outstanding work.
