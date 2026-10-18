# Inverness south: southwestern interior validation

**Thirteen fresh checks give 201.82 m horizontal ground RMS on the unchanged TPS13 fit.** The two new interior checks give **285.28 m RMS**, compared with **131.70 m** for the accepted baseline on those same features. Both new discrepancies are predominantly southward. The lower cumulative RMS does not establish whole-panel acceptance or erase these local failures.

| New check | Shared physical definition | TPS13 error m | Accepted baseline error m | Judged uncertainty m |
|---|---|---:|---:|---:|
| IS45 | MacLeod Brook / Southwest Mabou River confluence | 324.71 | 167.57 | 180 |
| IS46 | MacColls Brook / River Inhabitants confluence | 239.44 | 81.29 | 180 |

The thirteen-check median is **195.89 m**, empirical P95 **323.48 m**, maximum **324.71 m**, bias **+40.82 m east / −21.77 m north**, and scatter **196.44 m RMS** about that mean. The accepted baseline gives **323.22 m RMS** on the same thirteen. The new pair has bias **−65.05 m east / −274.44 m north**. Distances retain the 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference convention. P95 is a linear sample percentile, not a confidence guarantee; observation uncertainty is not subtracted.

## Correspondence evidence

**IS45:** The southeast tributary meets the southwest river branch, and the combined channel continues north below the McLeod Settlement locality. Two eastern tributaries farther north help identify the reach. The southeastern branch continues past the MacEachern locality. A smaller western reference tributary farther north is not clearly depicted in the source; it is not used as a matching point. Modern roads differ locally, so no road node is assumed unchanged.

The native water-line convergence is clear away from lettering. Display **[491,575]** in the unrotated 1300×1500 native crop at origin **[19300,19800]** gives source **[19791,20375]**. The first proposed crosshair was inspected enlarged and retained unchanged before scoring. The original reference node is shared by **WARV50 269441 v46, 277650 v0 and 277651 v37** at **[−61.354561320999906,45.919512795453265]**. Its first error is **−70.73 m east / −316.91 m north**.

**IS46:** MacColls Brook approaches from the north, with a split/rejoining reach farther upstream, and crosses the east-west road before entering River Inhabitants. The main river approaches from the east through the separately marked falls reach and continues west/southwest toward Glendale and Red Bridge. The separate Glendale Brook junction is farther west amid dense road/label ink; it is not the adopted point.

The source junction is clear south of the road and north of the chapel lettering. Display **[873,992]** in the unrotated 1800×1800 crop at origin **[19900,23800]** gives source **[20773,24792]**. The full crop was displayed at reduced size during context inspection; measurement and enlarged-crosshair review used the recorded native crop frame, not the resized tool image. Original **WARV50 269367 v12, 276069 v0 and 276071 v291** share **[−61.318905073694495,45.811838020279964]**. Its first error is **−59.36 m east / −231.97 m north**.

Both points are inside the control hull, which does not guarantee local accuracy. Neither was moved, promoted or used to tune the fit after its first score. Native crops, crosshairs, original reference subsets, search guides and withheld-candidate records are preserved. The Lamey–MacMaster candidate was withheld because its source water outline widens beside a labelled mill and does not establish a unique equivalent of the modern centreline junction. No score was computed for it or the obscured Glendale junction.

## Frozen inputs, raster and browser

`freeze.json` pins controls, previous eleven-check inventory and summary, selection freeze, and accepted baseline inputs to nightly ancestry commit **50da4966fc325a524fb1672940aa187e62037b41**. The [preceding coastal report](../south-coast-validation-20260916/README.md) and all earlier first results remain unchanged. `first-twelve.csv` and `first-twelve-summary.json` retain the intermediate twelve-check phase (**198.36 m RMS**) before IS46 was added. The cumulative CSV preserves the exact previous eleven-check prefix.

The same 4,751×6,488 EPSG:3857 raster remains byte-identical, SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. Two actual-raster/reference windows show the southerly discrepancies; both adopted pixels have nonzero alpha. The previous full-cutline and sampled-distortion receipts remain applicable to these bytes. No new full raster was generated. The overview shows thirteen controls and thirteen fresh reference positions; intervening interior, southern extensions, edges and seams remain sparsely checked.

The persisted TPS13 raster was the only active historical raster at 70% opacity during final browser comparison. Both features were viewed in 2D and at **10× terrain, north up, 50° tilt**; MacLeod was also viewed at 0° tilt. Terrain clarifies the valley context but supplies no measurement coordinates. An initial position-only share link disabled the modern basemap; that initial capture is retained, and the basemap was enabled before final comparison. The second location used the explicit `layers=modern` parameter. Console inspection returned no errors. `browser-review.json` indexes local screenshots and DOM evidence. No new import, raw-scan mesh acceptance or production deployment is claimed.

## Verification and continuation

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-southern-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays first observations, the cumulative thirteen, new pair, intermediate twelve and preserved eleven; it checks frames, original shared vertices, input/raster hashes, rendered evidence and browser receipts. Three editable inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. Acquisition and adoption recipes under `search-evidence/` are archival; use the verifier to replay results. All twelve metric sets replayed successfully, all three parser/solver inventories passed, and all 428 Church tests passed. Existing source/reference caches are required and must retain their recorded bytes.

Continue toward 20–30 defensible distributed checks where feasible, without manufacturing weak matches or retuning to these first failures. No whole-panel acceptance, catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
