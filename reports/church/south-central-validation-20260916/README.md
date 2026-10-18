# Inverness south: central-western confluence validation

**Nine fresh checks give 185.67 m horizontal ground RMS on the unchanged TPS13 fit.** New IS42, MacLellan Brook / Broad Cove River, gives **198.58 m**, compared with **544.43 m** on the preserved accepted baseline. Its first result remains unchanged. No fitting, promotion or post-score pixel adjustment occurred.

The cumulative median is **192.46 m**, empirical P95 **273.46 m**, maximum **322.66 m**, bias **+48.21 m east / +3.71 m north**, and scatter **179.27 m RMS** about that mean. The accepted baseline gives **345.05 m RMS** on the same nine. These retain the existing spherical mean-latitude ground-distance convention, warped minus reference. P95 is a linear sample percentile, not a confidence guarantee; uncertainty is not subtracted. Nine points remain insufficient for whole-panel acceptance.

## Physical correspondence

The main channel approaches the selected junction from the northeast. The western tributary crosses the road shortly before entering it, and the joined channel continues southwest to a separate road crossing and lower tributary. That sequence agrees with the original MacLellan Brook / Broad Cove River network. The source junction itself is visible away from nearby lettering. Repeated property-owner names are contextual and do not establish stream identity.

The source point is **[21080,10460]** in the original 34,427×34,543 Inverness scan. Its native crop has origin [20000,9950], extent/display 1600×1600, without rotation. An initial unscored proposal at display [1081,515] lay just below the visible junction. Enlarged crosshair review corrected it to **[1080,510] before scoring**. The proposal, correction reason and detail-crop frame remain preserved.

The exact original WARV50 node is shared by **261221 v0**, **261222 v152** and **269549 v129**, at **[-61.31095125991059,46.157302015640155] longitude/latitude**. The judged observation uncertainty is 150 m, not an independently measured engineering or channel-change bound. IS42 is inside the control hull and is displaced about 61 m west / 189 m north under the frozen fit.

The nearby Beatons Brook candidate remains unscored: lettering and the road crossing obscure the exact source junction. Its original context and modern reference proposal are retained in `search-evidence/`. This is separate from the adopted downstream MacLellan junction. Earlier Frasers/Strathlorne and east-shore road-loop uncertainties are not silently resolved by this check.

## Preservation and actual artifact

`freeze.json` pins the controls, preceding eight-check inventory/summary, selection freeze and accepted baseline inputs to nightly ancestry commit **609e61ed91df664e72ad18247b2c46c4b0d69155**. The [preceding interior report](../south-interior-validation-20260916/README.md) remains untouched, as do every earlier first score and the preserved northern 251.43 m RMS pair. The new cumulative CSV retains the exact prior byte prefix and adds IS42.

The same 4,751×6,488 EPSG:3857 GeoTIFF remains byte-identical, SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. The actual raster/reference window shows the northwest discrepancy and nonzero alpha at the source point. The earlier full-content alpha and sampled-distortion receipts remain applicable; no new full raster was generated.

The browser review uses only the persisted TPS13 at 70% opacity in ordinary 2D and 10× terrain at 50° and 0° tilt, north up. Exaggerated foreground relief obscures parts of the valley at 50°, so the straight-down terrain view was also inspected. The actual view and local captures are recorded in `browser-review.json`; no coordinate is measured from perspective, and no new import or raw-scan mesh acceptance is claimed. `coverage-overview.jpg` shows thirteen controls and nine fresh reference locations, with substantial gaps remaining.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-central-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays the new first scores, cumulative nine and preserved eight-check aggregate; it audits native-frame conversion, original three-line reference vertices, frozen hashes and rendered receipts. Three editable inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. Computational verification does not establish geographic acceptance.

All six metric replays, three parser/solver comparisons and 428 Church tests passed. The browser returned no console errors. These local results remain separate from hosted CI and geographic acceptance.

Continue distributed physical checks without tuning to every new result. No whole-panel acceptance, catalog activation, tiles or deployment follows. Source imagery retains David Rumsey Map Collection / Stanford Libraries attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
