# Inverness south: Cape Mabou coast validation

**Sixteen fresh checks give 217.04 m horizontal ground RMS on the unchanged TPS13 fit.** The new Green Point / Sight Point coastal pair gives **308.66 m RMS**. Green Point's **392.85 m** discrepancy is now the largest fresh error. These regional errors remain part of the evidence; the lower cumulative RMS does not establish whole-panel acceptance.

| New check | Definition | TPS13 error m | Accepted baseline error m | Hull position |
|---|---|---:|---:|---|
| IS48 | Green Point western shoreline extremum | 392.85 | 798.07 | Inside |
| IS49 | Stream/coast junction north of Sight Point | 190.28 | 533.08 | Outside |

The cumulative median is **194.17 m**, empirical P95 **341.74 m**, maximum **392.85 m**, bias **+75.71 m east / −2.73 m north**, and scatter **203.39 m RMS** about the mean. The accepted baseline gives **382.28 m RMS** on the same sixteen. The new pair has bias **+248.87 m east / +126.86 m north**. Distances retain the 6,371,008.8 m sphere and mean-latitude cosine convention, warped minus reference. P95 is a linear sample percentile, not a confidence guarantee. Both observations have 150 m judged uncertainty; it is not subtracted.

## Physical points and original frames

**IS48:** The coast approaches from the north/northeast below Beaton Point, projects west at Green Point, then returns south/southeast toward Mabou Harbour. That sequence and the harbour entrance identify the cape. The original reference shoreline has finer detail than the engraved apex. Display **[786,798]**, in the unrotated 1600×1600 crop at origin **[15550,12250]**, gives native **[16336,13048]**. The actual western extremum is **WACO20 6552 v132**, **[−61.48452762321244,46.09605776698746]**. The first residual is **+307.69 m east / +244.25 m north**.

**IS49:** The creek reaches the coast from the southeast after crossing the inland coastal road. Separate drainage entries lie northeast and farther south; their order and the winding inland channel distinguish the mouth. Display **[873,629]**, in the unrotated 1600×1600 crop at origin **[17100,8800]**, gives native **[17973,9429]**. **WARV50 196692 v33** meets **WACO20 12778 v101 / 12779 v0** at **[−61.424902523706635,46.18523513425128]**. Its first residual is **+190.04 m east / +9.47 m north**. The river's reference name is blank; no stream name is invented.

Native crosshairs were inspected before scoring. Exact-coordinate reference figures were finalized and inspected afterward, confirming the chosen original vertices without changing either observation. The unscored context plots retain their purple locality-name markers; those markers were not the measured reference points. Review timing and enlargement frames are recorded under `search-evidence/`.

The public Cape name records for Green Point and Sight Point identify locality only. The separate Sight Point community record and Green Point records from other counties are not measurement evidence. **Finlay Point remains withheld and unscored:** its label overlaps the western cape front, and the nearby rounded source turn does not establish a uniquely comparable point on the angular modern front. Its crops and original reference context remain preserved.

## Preserved fit and rendered evidence

`freeze.json` pins the selected controls, preceding fourteen-check inventory and summary, selection freeze, and accepted baseline inputs to nightly ancestry commit **df2722b34bd516deaa0eadf5f4d672ca98d9356c**. The [previous extension report](../south-extension-validation-20260916/README.md) and all earlier first results remain unchanged. The cumulative CSV preserves the exact prior byte prefix. Neither new point was moved, promoted or used to tune the fit after its first result.

The unchanged 4,751×6,488 EPSG:3857 raster has SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. Actual-raster/reference windows show the northeast Green Point discrepancy and eastward Sight Point discrepancy; both source points have nonzero alpha. Previous full-content alpha and sampled-distortion receipts still apply to these bytes. The overview shows thirteen controls and sixteen fresh reference positions, with remaining interior, shore and seam gaps.

The persisted TPS13 raster was the only active historical raster at 70% opacity during 2D and **10× terrain, north-up, 50° tilt** inspection. Both features were also viewed at 0° tilt because exaggerated slopes obscure them in the tilted view. Terrain supplies geographic context, not measurement coordinates. Browser evidence is indexed in `browser-review.json`. No new import or raw-scan mesh acceptance is claimed.

## Reproduction and remaining work

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-western-coast-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays both first scores, the cumulative sixteen, new pair and preserved fourteen. It checks original vertices, the local western extremum, river/coast connectivity, frames, hashes, raster windows and browser receipts. Three inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. All ten metric sets replayed successfully, all three parser/solver inventories passed, and all 428 Church tests passed. Console inspection returned no errors. Use the frozen caches; acquisition/adoption scripts are archival recipes.

Continue distinct checks toward 20–30 defensible features where feasible, particularly the northeastern interior and remaining mapped intervals. A control hull and low pooled RMS do not resolve regional errors or establish whole-panel accuracy. No catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
