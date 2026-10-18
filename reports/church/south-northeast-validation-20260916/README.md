# Inverness south: northeastern interior validation

**Eighteen fresh checks give 211.08 m horizontal ground RMS on the unchanged TPS13 fit.** The new northeastern pair gives **155.40 m RMS**. Both points are outside the control hull, adding evidence in previously weakly checked territory. They do not establish every intervening or more distant extrapolated location; whole-panel acceptance remains unproven.

| New check | TPS13 error m | Accepted baseline error m | Hull position |
|---|---:|---:|---|
| IS50 — Nile Brook / South Nile Brook | 122.40 | 692.29 | Outside |
| IS51 — Gallant River / Deep Brook | 182.52 | 542.18 | Outside |

The cumulative median is **191.37 m**, empirical P95 **334.93 m**, maximum **392.85 m**, bias **+61.57 m east / +7.46 m north**, and scatter **201.76 m RMS** about the mean. The accepted baseline gives **415.76 m RMS** on the same eighteen; the new pair gives 621.78 m on that baseline. Green Point remains the largest error, and the prior Cape Mabou and southwestern-interior regional failures remain included in the history. The 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference convention are unchanged. P95 is a linear sample percentile, not a confidence guarantee. Both new observations have 150 m judged uncertainty, which is not subtracted.

## Native observations and original reference nodes

**IS50:** The northern Nile branch swings west, east and west again before joining the eastern South Branch; the combined stream runs west through the valley flank. The eastern branch's broad upstream bend and the neighbouring drainage agree with the original reference network. The source's North Branch Nile Brook and South Branch labels corroborate that physical sequence. A fourth, smaller unnamed reference tributary shares the node but is not clearly drawn in the source; it supplies no additional matching feature or independent check.

Display **[562,452]**, in the unrotated 1600×1600 native crop at origin **[31200,2800]**, gives source **[31762,3252]**. The point is the clear main-branch convergence, away from lettering and hatching. Original **WARV50 187960 v143, 272344 v343, 272346 v0 and 277416 v118** share **[−60.93342722974329,46.341581284194895]**. Its first residual is **−122.35 m east / −3.39 m north**.

**IS51:** The river approaches from the north beside the road. The road turns east while the river continues south to meet an eastern tributary; below that junction the river bends southwest across a separate road crossing and continues west. The eastern branch and neighbouring road arrangement identify the reach. The water junction is visible east of the separate sawmill symbol, not at that symbol or at the lower road crossing.

Display **[614,367]**, in the unrotated 1500×1500 native crop at origin **[28400,1000]**, gives source **[29014,1367]**. Original **WARV50 264257 v287, 264258 v0 and 265684 v4** share **[−61.02983972970874,46.385951923599315]**. Its first residual is **+19.35 m east / +181.50 m north**.

Both enlarged native crosshairs and marked exact-reference candidate figures were inspected before scoring. The original proposals were retained unchanged. Source frames, reference subsets, hashes and first results remain in the report. **Charlie Brook / Ingram Brook remains withheld and unscored:** the source junction enters a narrow outlined pond beside a mill symbol, so no unique equivalent of the modern centreline junction was adopted. Earlier unresolved Lake O'Law matches were not reused.

## Frozen inputs, coverage and rendering

`freeze.json` pins selected controls, the preceding sixteen-check inventory and summary, selection freeze, and accepted baseline inputs to nightly ancestry commit **749036f0f3e3936b5160098da6c69b1337a97b19**. The [preceding coastal report](../south-western-coast-validation-20260916/README.md) and every earlier first result remain unchanged. The cumulative CSV preserves the exact prior byte prefix. No point was moved, promoted or used to tune the fit after its first score.

The original cached NSTDB extraction covers the region; its relevant receipt is preserved under `search-evidence/`. Measurements use the unchanged combined reference geometry and its recorded hash, not an inverse-search prediction. No new reference-service refresh was needed.

The same 4,751×6,488 EPSG:3857 raster has SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. Actual-raster/reference windows show the westward Nile discrepancy and northward Gallant discrepancy; both measured source pixels have nonzero alpha. Prior full-content alpha and sampled-distortion receipts remain applicable to these bytes. The overview shows thirteen controls and eighteen fresh reference positions. Additional mapped intervals and seams remain insufficiently checked.

The persisted TPS13 raster was the only active historical raster at 70% opacity during 2D and **10× terrain, north-up** review. The 50° tilted views hide the junctions behind exaggerated relief, so both were also inspected at 0° tilt. Browser captures and DOM receipts are indexed in `browser-review.json`. Terrain supplies landscape context; measurement coordinates remain from native scan and original vector geometry. No new import or raw-scan mesh acceptance is claimed.

## Reproduction and continuation

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-northeast-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays both first scores, cumulative eighteen, new pair and preserved sixteen, and checks original vertices, frames, hashes, raster evidence and browser receipts. Three editable inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. All ten metric sets replayed successfully, all three parser/solver inventories passed, and all 428 Church tests passed. Console inspection returned no errors. Use the frozen caches rather than refreshing inputs; acquisition/adoption scripts are archival recipes.

Continue distinct checks toward 20–30 defensible features where feasible and assess remaining geographic gaps. Low pooled RMS and successful rendering do not erase local errors or establish whole-panel accuracy. No catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
