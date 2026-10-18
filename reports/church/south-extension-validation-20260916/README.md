# Inverness south: southern-extension validation

**Fourteen fresh checks give 200.57 m horizontal ground RMS on the unchanged TPS13 fit.** New check IS47, North Little River / engraved South Branch, gives **183.51 m**, compared with **242.87 m** for the accepted baseline on that same point. IS47 is outside the control hull and adds a southern extrapolation check. One point does not establish accuracy across the extension; whole-panel acceptance remains unproven.

| Fourteen-check metric | TPS13 |
|---|---:|
| RMS | 200.57 m |
| Median | 194.17 m |
| Empirical P95 | 323.37 m |
| Maximum | 324.71 m |
| Mean east / north residual | +50.97 / −21.25 m |
| RMS scatter about the mean | 192.81 m |

The accepted baseline gives **318.15 m RMS** on the same fourteen. The previous interior pair remains **285.28 m RMS**, and its two local regressions remain preserved. The 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference convention are unchanged. P95 is a linear sample percentile, not a confidence guarantee. The new observation has 150 m judged uncertainty, which is not subtracted from its error.

## Physical observation

The northwestern river approach bends south into the long western tributary. That tributary has a broad upstream northward bow. After their junction, the combined river continues southeast to a separate southern tributary, then bends east. This branch order matches the original provincial network. The western reference tributary has a blank name field; the source's “South Branch” label is historical context, not an asserted modern name.

Display **[884,708]** in the unrotated 1600×1600 native crop at origin **[20200,30900]** gives source **[21084,31608]**. Its enlarged crosshair lies on the three-way water-line convergence, separate from lettering and the downstream road crossing. The first proposal was retained unchanged before scoring.

Original **WARV50 196410 v188, 271460 v276 and 271461 v0** share **[−61.31164076115359,45.64589889785037]**. The first residual is **+182.94 m east / −14.41 m north**. `observations/IS47.json` preserves the frame, exact vertices, source identity and hashes. No point was moved or promoted, and no tuning followed the first result.

## Reference coverage and withheld lake

The existing cache did not cover all water around McIntyre Lake. Its incomplete search plot remains preserved. A new bounded query to the original NSTDB water layer returned **1,346 features** for **[−61.46,45.56,−61.23,45.71]**. Original geometry was neither clipped nor simplified; the unique IDs matched a separate `returnIdsOnly` query. `search-evidence/reference-receipt.json` records parameters, retrieval time, CRS, counts and SHA-256 **7072888111b756bd27e2da5e04b0790db91303af0be4a0485344fa091d8a762f**. Empty cached areas were not treated as absence of water. The complete extract stays outside Git at its recorded local path.

**McIntyre Lake was withheld, unscored.** Its historical basin outline differs from the wider modern water extent. The 2026 environmental assessment describes MacIntyre Lake as a reservoir formed by an embankment dam and spillway, bordered by Barberton Road and Highway 4. This corroborates the concern about using its whole basin as an unchanged feature; it does not establish the date or exact magnitude of change from the Church scan. See section 5, page 5-16 of the [provincial assessment](https://novascotia.ca/nse/ea/little-river-pumping-transmission-system/little-river-ea-registration-document.pdf). The source crop, incomplete/filled reference plots and exclusion receipt remain under `search-evidence/`.

## Preserved inputs and verification

`freeze.json` pins controls, previous thirteen-check inventory and summary, selection freeze and accepted baseline inputs to nightly ancestry commit **c95312709514bd62c3e4e067c2324070e2137a2a**. The [preceding interior report](../south-southern-validation-20260916/README.md) and every earlier first result remain unchanged. The cumulative CSV preserves the prior byte prefix.

The same 4,751×6,488 EPSG:3857 raster remains byte-identical, SHA-256 **b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040**. The actual raster/reference window confirms nonzero alpha at the new source point and shows the eastward discrepancy. Earlier full-content alpha and sampled-distortion receipts still apply to these bytes. The overview shows thirteen controls and fourteen fresh reference positions, with remaining geographic gaps.

The persisted TPS13 raster was the only active historical raster at 70% opacity during 2D and **10× terrain, north-up, 50° tilt** review. Modern map was enabled. Terrain provides valley context, not observation coordinates. The console returned no errors; `browser-review.json` indexes the local screenshots and DOM receipts. No new import or raw-scan mesh claim follows.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-extension-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

All **six metric sets** replayed; **three editable inventories** passed production parser/TPS comparison; **428 Church tests** passed. Verification uses the recorded existing caches rather than refreshing frozen inputs. Acquisition/adoption scripts are archival recipes. Continue distributed checks toward 20–30 defensible features where feasible, retaining the provisional fit and local failures. No whole-panel acceptance, catalog activation, tiles or deployment follows. Source imagery retains David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.
