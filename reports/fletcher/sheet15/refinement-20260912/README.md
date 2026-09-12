# Fletcher Sheet 15 — Hume Island repair, 2026-09-12

**Whole-sheet geographic acceptance remains withheld.** A twelve-control trial repairs Hume Island by promoting the existing failed eastern-tip check unchanged. New Bell Rock and McPhedran Brook mouth checks improve from **224.496 / 313.836 m** to **63.427 / 197.829 m**. Their **130.628 m median** still fails the 100 m target. Central inland identities, shoreline differences and adjacent-sheet continuity remain unresolved. This is a local improvement, not an accepted whole-sheet replacement.

## Source and complete mapped area

[David Rumsey Sheet 15 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2640~290008/manifest), retrieved 2026-09-11. Credit: David Rumsey Historical Map Collection. The manifest licence field is null; existing CC BY-NC-SA 3.0 source restrictions and repository publication boundaries remain. No deployment clearance is inferred.

Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet15/native/sheet15.png`, **10832 × 7582**, SHA-256 `7a5e7ec0e1a8ce9c6095d4b8e65abb11f86841a337a7b937ddbb084261bb1b72`. The complete source overview and all four native corners were personally inspected. The retained inner mapped ring includes the lake, channel water, all mapped islands, terrain and internal labels. No mapped extension was visible outside it; the external marginal legend remains in the preserved native source. Boundary SHA-256 `1d6afd62fe504a68f70fc0397bdd8a12ebc8b4956179ebbbe45e43c286571ff8`. No corridor or control-hull clipping.

Parent inputs are pinned to nightly-history commit `c32c85e917aa8746fa0b98f928f76a366127b7ee`. All eleven prior control records remain identical; parent proposals, rejections, failures and the eleven-control raster remain preserved. The original observation file has a different source hash: its measured slanted graticule intersections remain search-only, not physical control or check coordinates, and were not remeasured in this pass.

Dated NSTDB reference hashes/counts were reverified: **3097 roads, 76 rail, 3893 water lines and 1249 water polygons**, bbox −61.26,45.90,−60.81,46.115, EPSG:4326 longitude/latitude. Modern source geometry is reference evidence, not survey ground truth.

## Repair and checks

V03 → C14 is Hume Island's easternmost tip, native **[7877,2663]**, modern **[-60.93404435122135,46.04547710092628]**. Modern object **22123**, part 0, vertex 58 is the easternmost vertex of its complete closed coastal-island line. Personal native close/wide and modern context review supports its identity west of Cranberry Point and north of Bell Rock. The **284.007 m** prior failure remains in the parent score. The coordinate was promoted unchanged, before new selection and scoring; historical island shape remains generalized.

Twelve-control fit SHA-256 `f7081a2addfd19fd70fb9c33358274b22fab7621ffc9631ea87befe3194439d6`, frozen at `2026-09-12T15:57:39.489854+00:00`. Six reused checks retain their original records: Q02/Q04/Q05 and V01/V02/V05, excluding promoted V03. Their median/worst is **85.640 / 147.918 m**; this is reused evidence, not fresh acceptance.

Fresh checks were selected after the freeze, personally inspected in exact unrotated native close/wide frames with direct modern geometry, and scored without coordinate changes:

| Check | Native pixel | Modern evidence | Error, old → new |
| --- | --- | --- | --- |
| F01 Bell Rock eastern tip | [7712,2957] | Closed coastal island 22090, part 0, vertex 14 | 224.496 → 63.427 m |
| F02 McPhedran Brook mouth | [7025,3529] | Direct endpoint junction J0547 | 313.836 → 197.829 m |

Exact modern coordinates, source uncertainty and selection/review timestamps are in `validation.json`. Bell Rock is a different island near C14; the McPhedran mouth shares the drainage anchored by C04. Neither provides independent central-headwater coverage. Old rejected C03/C06 and Q06/V04 remain excluded. No failure was erased, moved after scoring or silently fitted.

## Raster, geography and joins

External TIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet15/refinement-20260912/sheet-15-full-sheet.tif`

SHA-256 `c0340eb0c91d8f37defc299880583d202a283a99f27620f6dd6250a0164ad3ba`, **8385 × 5779**, EPSG:3857, RGBA, exact GDAL TPS (`-et 0`), 5 projected metre cells. Cell size is not ground accuracy. **71,854** sampled Jacobians remain negative. Independent alpha verification finds **46,642,829** interior cells with **zero transparent holes**, one-cell tolerance. Cutline SHA-256 `e7013d7dd55192f285f4cb7d8f088f1a0036200e958c565a303e143c4e7817be`.

Nine actual geographic windows compare the prior eleven-control raster, the new raster over modern vectors and the new raster alone. Hume/Bell Rock and parts of the neighboring coast improve. McPhedran's lower brook still differs; Lake Ainslie upper shore, central Lewis Mountain headwaters, Little Narrows, the MacKinnon interior and channel shorelines remain unsupported. All mapped islands remain present.

Eight current same-window comparisons cover Sheet 13 north, Sheet 16 west, Sheet 18 south, and corner-only Sheet 12 northeast / Sheet 17 southeast. These retain gaps, displaced continuations or unsupported water. All neighbor rasters are provisional and hash-pinned. The intervening eastern edge has no adjacent coverage among the available sheet packets.

An initial setup incorrectly selected Sheet 14 as the eastern neighbor. Its verified extent is northwest, so the two empty panels are **rejected setup evidence, not geographic join gaps**. `neighbor-selection-audit.json` and `rejected-neighbor-review/` preserve that failure; the current recipe uses the corrected corner neighbors. Do not run the archived wrong-neighbor recipe as a current review.

## Verification and continuation

All **28 figures** were personally viewed: six native frames, nine raster windows, eight current joins, two rejected neighbor comparisons and three browser screenshots. Actual CSV parser/semantic roundtrip/TPS solver passed for **12 controls, 6 reused diagnostics and 2 fresh checks**, within 0.000001 projected m of GDAL. Editable CSVs retain original source pixels and roles.

Actual My Maps desktop import, desktop reload and mobile reload passed in an isolated browser context. Stored TIFF bytes/hash, pixel dimensions, alpha and enabled state persisted; console/page errors were empty. This verifies the GeoTIFF path, not the native-image browser mesh geography. Run `python3 reports/fletcher/sheet15/refinement-20260912/verify_packet.py` for integrity checks; scripts and external files preserve the reproduction path. Hosted CI is separate and reported in the PR.

Keep draft. Resolve independent inland identities and remaining coastal/neighbor differences before another freeze and fresh validation. No merge, tile publication, label projection, KinNoKi pin or deployment. Continue the authorized queue with Sheet 17.
