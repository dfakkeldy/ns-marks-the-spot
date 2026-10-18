# Northern expansion of frozen south TPS13 validation

Two new checks provide the first northern validation of this frozen fit: **IS39 Dunvegan western road crossing, 149.42 m**, and **IS40 Marsh Point north-facing spur, 322.66 m**. Their first RMS is **251.43 m**, slightly above the 250 m working target. Both are inside the control hull. The cumulative seven-check RMS is **181.65 m**, with no tuning, promotion or post-score coordinate change. This small sample does not establish whole-panel accuracy.

The new pair's median is 236.04 m, empirical P95 313.99 m, maximum 322.66 m, bias +235.73 m east / -11.47 m north, and scatter 86.69 m RMS about that mean. The same ground-distance convention and linear sample percentile apply; the judged 150 m observation uncertainties are not subtracted. The accepted baseline gives 117.34 m and 341.04 m on the same two features. Marsh Point's discrepancy remains preserved rather than adjusted to the fit.

## Correspondence evidence

**IS39:** The native crossing joins the coast-side loop from behind Marsh Point, a southwest/northeast through route, and a southeast arm. The separate junction and nearby water crossing to the northeast agree in the source and modern network. This selects the western crossing, not the Shore Road junction northeast. The original reference node is shared by local-road layer 8 features **3842 v0 / 155492 v30** and highway layer 7 features **60159 v0 / 155494 v34**. Native line thickness and road generalization limit precision; this does not establish an engineering-change bound.

**IS40:** The small north-facing Marsh Point spur is bounded by a northeast cove and a western face continuing south toward the coastal road. The name record identifies the locality, not the measurement. Original WACO20 **7059 v1** is the local northern apex. The first unscored source proposal at display [368,246] was visibly below the apex; enlarged crosshair inspection corrected it to [370,240] before scoring. `source-placement-history.json` and the initial image retain that correction. No residual was used to place it.

Both adopted points use the unrotated original source crop at native origin [22300,4250], extent/display 1600×1300. The JP2 frame remains 34,427×34,543. Their original-source hashes, exact pixel coordinates, modern vertices and layered reference context are preserved.

## Withheld river-bank candidate

A reference-only search for three-way single-line Margaree nodes returned none in the selected region. The actual main river uses WARV10/WARV20 **double-line banks**, so that result is not evidence of missing waterways. A bank-aware search found four nearby original river-name joins. Such metadata transitions alone do not define a physical corner.

The northern land-tongue tip at the fork is a possible physical reference, but the corresponding source bank could not be isolated confidently from bridge/road and label ink. No source pixel or score was adopted. The source 1700×1700 crop was displayed at 1600×1600 during review; no coordinate was transferred from that resized view. The bank-node proposal, native context and withholding remain preserved. This is separate from the adopted road/coast observations.

## Preservation, raster and terrain

`previous-published.json` pins the original five observations, first scores, controls and CSV prefix to nightly ancestry commit `08507c6fb7b96920a32fbda129fa4e1f9d33537d`. First-three and first-five aggregate/verification snapshots remain intact. The original freeze, selected controls, previous model trials and accepted July baseline remain unchanged.

The two actual-raster/reference windows show the eastward discrepancies directly and have nonzero alpha at the inspected source positions. The frozen raster bytes and earlier full-content alpha/distortion receipts remain applicable. Browser 2D and 10× terrain views use only the persisted TPS13 raster at 70% opacity; no coordinate is measured from perspective, and no new import or raw-scan mesh acceptance is claimed. The new overview shows all thirteen controls and seven fresh reference positions; the western first-five overview remains preserved separately.

Verification replayed twenty-four metric sets and passed all 428 Church tests. Four editable inventories round-tripped through the production parser/solver, and the browser returned no console errors. These local results are separate from hosted CI and geographic acceptance.

The northern pair covers one coastal locality, leaving northeastern/intervening areas, farther edges and seam intervals insufficiently checked. Continue independent validation without tuning to these first results. No whole-panel acceptance, catalog activation, tiles or deployment follows. David Rumsey / Stanford imagery retains the recorded CC BY-NC-SA 3.0 terms; original provincial reference and Mapzen terrain provenance remain intact.
