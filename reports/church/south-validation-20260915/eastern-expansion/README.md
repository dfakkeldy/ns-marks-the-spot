# Eastern and southern expansion of the frozen south validation

Four fresh physical checks extend the unchanged affine4 batch to **fourteen points**. The new-four RMS is **279.99 m**. Their errors are 244.85 m at McLennan Brook, 104.74 m at the eastern River Denys road junction, 169.91 m at Portage and 462.37 m at Long Stretch. All first results were frozen before the subsequent distributed-control comparisons; they now serve as historical validation and model-selection diagnostics. The full fourteen-check RMS is **321.75 m**, still above the 250 m target.

The new phase's median is 207.38 m, empirical P95 429.74 m and maximum 462.37 m. Mean residual is +23.39 m east / −152.65 m north, with 233.55 m RMS scatter about that mean. The same ground-metre distance convention, residual direction and linear sample percentile apply. These are discrepancies against original reference geometry; the judged 150 m observation uncertainties are not subtracted.

**IS31 is inside the control hull; the other three new checks are outside.** The full set therefore contains one inside-hull check and thirteen outside. A single close inside-hull result does not validate the whole supported area.

## Correspondences

- **IS30, McLennan Brook / River Denys:** The source names the southwest tributary and shows it joining the main river just downstream of Chisholm Bridge. The exact original WARV50 node is shared by River Denys 266455 v33 / 266586 v0 and McLennan Brook 274498 v412. The main river approaches from the north and turns east. MacPhail Brook joins farther upstream and is a different feature. The initially considered nearby road meeting remains unscored because its closely spaced ink did not establish an exact road node. The adopted source pixel is on the separate water junction, not on the bridge or road meeting.
- **IS31, Southside River Denys / Marble Mountain roads:** The west approach follows the south side of the river, the north arm approaches across the channel near Crowdis Bridge, and the east arm follows the shore beneath the hill. This shared three-way configuration distinguishes the selected meeting from the northwestern junction and the crossing itself. The original road node is shared by 6525, 45577 and 51612 in the local-roads layer.
- **IS32, Portage crossroads:** The source explicitly labels Portage or Matheson at the land corridor between Whycocomagh Bay and the channels toward Denys Basin. The west road reaches the north-south route and an east branch at one compact crossroads. The retained local-road node joins Portage Road, Orangedale-Iona Road and Farghers Lane. The nearby Highway 223 alignment is distinct. Peninsula/channel context and branch order support the selected legacy crossroads; no road continuity was inferred from names alone.
- **IS33, Crandall / Long Stretch roads:** The source has a compact northern meeting of the Crandall route, the west approach from Dorton Bridge and a northeastern route. The lower crossing and triangular road arrangement are separate. The original road/water network supports that northern meeting and surrounding approaches. The drawn meeting is generalized; the uncertainty allowance is not an independently measured bound on engineering changes.

Each observation records the exact source frame, native crosshair, original reference vertices and first score. No coordinates were changed after scoring. The Long Stretch failure remains included.

## Reference coverage and preservation

A coverage check against the previously cached extraction bounds found a gap at western River Denys and partial southern-context coverage. A new original-water extract for `-61.37,45.65,-61.18,45.91` supplies **1,455 unique features**, paged and checked against a separate complete ID query. No geometry was clipped or simplified. The source receipt, ID audit and coverage check are retained here. The road references reuse the earlier original transport extracts; local roads, highways, bridges and railways remain distinct.

`previous-published.json` protects the original ten observations, first scores, controls and CSV prefix against nightly ancestry commit `a38e8f6b7bd377fa5e4eb89a6659ec8e749530de`. The original ten-check summary and verification receipts are preserved under `../snapshots/`. Earlier five- and seven-check phases remain unchanged.

## Raster and browser review

Four new windows compare actual retained GeoTIFF pixels with original water and transport geometry. The raster and affine are unchanged. The McLennan confluence is displaced mainly south, the eastern Denys junction is close, Portage is displaced northeast, and Long Stretch is displaced mainly south. The new inspected source positions have nonzero raster alpha. Previous full-content alpha coverage still refers to the same raster bytes.

The existing imported map was inspected in 2D and at 10× terrain at McLennan / River Denys. The other three new points have offline raster/reference windows; no browser review of those three is claimed here. It remained the only active My Maps raster at 70% opacity. Browser captures and DOM receipts are recorded in `browser-review.json`; terrain supplied context rather than measurement coordinates. No new import, raw-scan mesh acceptance, tiles, catalog activation or deployment is claimed.

This first-validation phase is closed; continue with the separately frozen [TPS13 candidate](../../south-distributed-refinement-20260915/README.md). Fourteen points remain short of the 20–30 sampling ambition, and seam and intervening-area checks remain incomplete. Neither the new phase nor the full fourteen establish the working target. Source-derived figures retain David Rumsey Map Collection / Stanford Libraries credit and recorded CC BY-NC-SA 3.0 terms; original provincial reference provenance is preserved.
