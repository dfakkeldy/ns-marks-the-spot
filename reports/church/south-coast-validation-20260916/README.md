# Inverness south: coastal mouth and northern-edge validation

**Eleven fresh checks give 182.59 m horizontal ground RMS on the unchanged TPS13 fit.** IS43 Broad Cove River mouth gives **125.82 m**; IS44 Chimney Corner headland gives **201.56 m**. The new pair gives **168.02 m RMS**. No fit, control, promotion or post-score coordinate change followed either first result. Whole-panel acceptance remains unproven.

| New check | Definition | TPS13 error m | Accepted baseline error m | Judged uncertainty m |
|---|---|---:|---:|---:|
| IS43 | River/coast junction, compared with original bank-mouth midpoint | 125.82 | 369.47 | 180 |
| IS44 | Northern apex of Chimney Corner headland | 201.56 | 339.70 | 150 |

The cumulative median is **192.46 m**, empirical P95 **262.11 m**, maximum **322.66 m**, bias **+60.07 m east / +24.17 m north**, and scatter **170.72 m RMS** about that mean. The accepted baseline gives **346.86 m RMS** on the same eleven. The existing 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference direction apply. P95 is a linear sample percentile, not a confidence guarantee; uncertainty is not subtracted. The preserved northern-pair 251.43 m RMS and Marsh Point 322.66 m discrepancy remain included in the history.

## Correspondences and frames

**IS43:** The labelled Broad Cove River approaches the sea from the south/southeast after the bends through Broad Cove Mines. A separate coastal entry lies northeast, and the shore continues southwest toward the separately drawn McIsaac Pond locality. This sequence matches the original reference network. The river/coast junction is visible beside the river label and is measured at display [710,497] in the crop at native origin [20500,6100], extent 2200×1900 and display 1540×1330. The resulting native point is recorded exactly in `observations/IS43.json`.

The reference is the midpoint of the original transitions **WARV10 156991 v162 / WACO20 11661 v40** and **WARV20 171067 v194 / WACO20 11333 v0**. The source depicts a single-line mouth; its definition is paired with the midpoint of the two modern banks. Mouth migration and historical generalization limit precision. No permanent-channel or engineering-change bound is asserted. IS43 lies inside the control hull.

**IS44:** The long western coastal face terminates at the north-facing Chimney Corner headland. Its eastern side returns into a beach/cove, with the road inland and the north coast continuing toward the neatline. The apex is fully drawn below that neatline. It is measured at display [664,211], native **[25064,991]**, in an unrotated 1600×1300 crop at origin [24400,780]. The shoreline crosses the engraved meridian nearby; the point follows the shore, not the rule or label centre. Original **WACO20 3927 v25** is the local northern apex.

IS44 lies **outside the control hull**, so it adds a northern extrapolation check. The actual raster window confirms that the measured source point has nonzero alpha below the cutline. One such point does not establish accuracy along the entire northern edge. Both native crosshairs, original reference vertices and crop frames remain preserved.

## Preserved history and coverage boundary

`freeze.json` pins both selected-fit inputs and the preceding nine-check inventory/summary to nightly ancestry commit **82f3ac8f19c6374a536821dc8034ee2fbee9b7a2**. The [previous central-western report](../south-central-validation-20260916/README.md), all earlier first results, selected controls and accepted July baseline remain untouched. The cumulative CSV keeps the exact prior byte prefix and adds IS43/IS44. No diagnostic or control is promoted into the fresh count.

A separate footprint search for MacKenzie Pond returned zero raster alpha at its namepoint. Native source inspection shows that the inverse-guide location falls inside the separately framed **WEST BAY town inset**. This is a legitimate exclusion from the main-sheet transform, not missing main-map content or evidence that the geographic pond is absent. The source crop and footprint record are retained under `search-evidence/`; no point was adopted from the inset.

The same 4,751×6,488 EPSG:3857 raster remains byte-identical, SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. Two actual-raster/reference windows preserve the northeast discrepancies. The earlier full-content alpha and sampled-distortion receipts remain applicable to these bytes; no new full raster was generated. The overview shows thirteen controls and eleven fresh reference positions, with remaining spatial gaps.

## Browser and replay

Both features were inspected using only the persisted TPS13 raster at 70% opacity, in 2D and 10× terrain. The source/reference coordinates come from native and original-vector evidence, never perspective screenshots. Local captures and DOM receipts are indexed in `browser-review.json`. At 10× exaggeration, the coastal relief is easier to distinguish, but steep slopes hide some shoreline at 50° tilt; the paired 2D views retain the direct planimetric comparison. No new import or raw-scan mesh acceptance is claimed.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-coast-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays the two first results, cumulative eleven, new pair and preserved nine-check aggregate. It checks original river/coast endpoints, the reference apex, native frames, input/raster hashes and rendered receipts. Three editable inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. All ten metric sets replayed successfully, three editable inventories passed parser/solver verification, and all 428 Church tests passed. Computational checks are separate from geographic acceptance.

Continue distributed validation toward 20–30 identifiable checks where feasible without weak matches or repeated tuning. No whole-panel acceptance, catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; original provincial reference and Mapzen terrain provenance remain intact.
