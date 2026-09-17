# Road-junction expansion of the frozen south validation

Three independently placed road checks extend the unchanged affine4 batch to **ten fresh physical features**. Their road-only RMS is **376.30 m**, versus **425.30 m** on the accepted-baseline TPS at those same coordinates. The full ten-check affine RMS is **337.00 m**, above the 250 m working target. No tuning, promotion or new model-selection trial followed these results.

| New check | Affine error m | Accepted-baseline TPS error m | Mean east / north m |
|---|---:|---:|---:|
| IS27: Doyle’s Bridge north approach | 511.89 | 498.53 | −254.02 / −444.42 |
| IS28: West Lake Ainslie Road / Highway 395 | 112.00 | 190.34 | +35.59 / −106.19 |
| IS29: Glencoe Road / Whycocomagh Port Hood Road | 387.60 | 507.81 | +387.40 / +12.21 |

All three lie outside the source control hull. For this three-check phase, median error is 387.60 m, empirical P95 499.46 m and maximum 511.89 m. The mean residual is +56.33 m east / −179.47 m north, with 325.92 m RMS scatter about it. Directions are warped minus reference; the existing ground-distance convention and linear sample percentile remain unchanged. Each observation has a judged 150 m uncertainty; this is not a measured bound on route changes and is not subtracted from its error.

## Physical identity and native placement

**IS27** marks the three-way meeting at the north approach of the crossing explicitly labelled Doyles Bridge, east of Margaree Forks. The north-running valley road, east-running north-bank road, bridge approach and position relative to the main river confluence establish the correspondence. The original reference node joins East Margaree Road and West Big Intervale Road. The source point is the road meeting, not the bridge midpoint, a water confluence or the separate modern Cabot Trail route south of the river. Local engineering differences remain a limitation; no unchanged-bridge-structure claim is made.

**IS28** marks the western of two nearby forks at Southside/Ainslie Glen. The west-lake road approaches from the northwest; the main road runs northeast–southwest; the separate Lewis Mountain fork lies northeast and a stream crossing lies southwest. Those relationships distinguish the selected road meeting from the neighbouring fork, ford and bridge. The primary original reference endpoint is on West Lake Ainslie Road; the two Highway 395 endpoints are separately recorded and checked against the highway layer.

**IS29** marks the three-road meeting north of the Glencoe label. The northwest approach turns northeast, while the southern leg bends southeast then south across the stream and meets an alternate western route farther downstream. Native detail and the original road/water network support that configuration. The nearby upper road junction is not substituted for this point.

All source coordinates come from recorded native scan frames and were checked with crosshairs before scoring. Street names alone were not treated as proof of historical continuity. The first IS28/IS29 description drafts phrased the uncertainty allowance too strongly; the original unscored wording is retained in `unscored-proposals/`, with coordinates unchanged. The final definitions clarify that engineering differences were not independently measured.

## Reference layers and unresolved cases

The inspected provincial MapServer separates **local roads (8), highways (7), bridges (5) and railways (6)**. Layer 8 alone does not provide a complete transport network. The query bounds were `-61.65,45.65,-60.87,46.42`; original geometry was retained in EPSG:4326 without clipping or simplification:

| Layer | Unique features |
|---|---:|
| Local roads | 14,920 |
| Highways | 643 |
| Bridges | 381 |
| Railways | 286 |

Every extract was paged and its IDs compared with a separate complete ID query. Receipts, raw ID audits, service metadata and hashes are preserved here. The source records carry their own dates; retrieval in 2026 does not imply a new survey. Layer identities remain attached to the reference vertices. In context figures, the water plotting code `0` is explicitly a local code for earlier NSTDB water-layer-4 extracts, not the MapServer’s layer 0.

Mabou, Strathlorne and Orangedale remain **unscored** in this road pass. Native label/transport-line overlap prevents precise placement in the first and third cases; the historic forks and current approaches did not establish one exact junction at Strathlorne. Railways were added to the context rather than conflated with roads. `withheld.json`, source crops and the two enlarged detail frames preserve these searches without invented coordinates or unsupported realignment dates.

## Raster, terrain and preservation

Three new windows compare actual retained GeoTIFF pixels with original road, bridge, railway and water geometry. The affine/raster bytes remain unchanged. Doyle’s Bridge is displaced southwest, Ainslie Glen is relatively close, and Glencoe is displaced mainly east. All three inspected raster positions have nonzero alpha. Earlier full-content coverage diagnostics remain attached to the same raster, not a new geographic acceptance.

The existing imported raster was inspected in 2D and 10× terrain at the three sites. It remained the only active My Maps raster at 70% opacity. `browser-review.json` records the captures and DOM state. Terrain provides context; observation coordinates were measured in the original scan/reference frames. No new import, raw-scan mesh acceptance, catalog activation or deployment is claimed.

`previous-published.json` checks the original seven observations, first scores, controls, freeze and CSV prefix against nightly ancestry commit `5e33ec03291d61c38eea3aae3158da5ac6ebf56b`. The original seven-check summary and verification receipts are retained under `../snapshots/`. The shared verifier replays the phases separately; the ten-check aggregate does not erase earlier results.

Verification passed: all 428 Church tests, 34 metric replays, four transport ID-set audits and four production-parser inventories. Affine/GDAL differences remain below 0.001 projected metre. The first-five raster renderer was restricted to its frozen phase; a temporary replay reproduced all five original figures byte-for-byte without overwriting them. Browser review returned no captured console errors.

Continue the frozen batch with identifiable features in remaining northern/eastern intervals, interior gaps and seams. Ten points are still short of the 20–30 sampling ambition and do not establish whole-panel accuracy. Source-derived figures retain David Rumsey Map Collection / Stanford Libraries credit and recorded CC BY-NC-SA 3.0 terms; reference geometry retains provincial provenance.
