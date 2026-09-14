# Victoria northwest: distributed physical refinement and terrain review

The selected review is a fifteen-control TPS with **two fresh checks, 185.25 m horizontal RMS**. Four separate model-selection diagnostics have **233.46 m RMS**. These small sets do **not** establish whole-panel geographic acceptance. The complete reviewed content is rendered and works in the web importer, including the requested 10× terrain view. Production controls, cutlines, accepted baselines and catalog state remain unchanged.

This continues the four-control affine from the earlier physical review, using frozen input commit `145197182659eda548ac61a692a573430b2c5dc3` on nightly. Victoria main remains a separate panel; its already-corrected graticule index must not receive another −10′ adjustment.

## Current accuracy and coverage

All errors are horizontal ground metres, warped source minus reference. P95 is the empirical linear sample percentile, not a confidence bound.

| Set | Count / role | RMS | Median | P95 | Maximum | Mean east / north |
|---|---|---:|---:|---:|---:|---:|
| Frozen TPS15, VN25 Zwicker and VN26 Archibald Point | 2 fresh checks | 185.25 | 181.35 | 215.39 | 219.17 | +145.88 / −103.93 |
| Frozen TPS15, VN17, VN11, VN19, VN24 | 4 diagnostics used in selection | 233.46 | 252.70 | 279.41 | 282.53 | +40.30 / +55.86 |

VN25 is the labelled Zwicker Brook junction with Wilkie, 143.53 m; VN26 is the eastern mainland tip of Archibald Point, 219.17 m. Neither entered the fit. Their observations, first results, native crosshairs and original reference geometry are preserved. Stated observation uncertainty is 100 m and 150 m respectively; it is not subtracted from errors.

The check distribution is insufficient: northern interior, western context, intervening watersheds and sheet seams remain weakly assessed. The two North Pond islands are one regional sample, not distributed validation. Cape St Lawrence VN11 reuses the world reference of Inverness north I14 and is therefore not an independent second seam reference. The island/coast geometry and stream reaches are generalized between fitted points; matching a junction or centroid does not establish the surrounding entire outline.

The reviewed full-content envelope restores western tributaries and eastern/southern context while excluding the independent New Haven / Neil’s Harbour inset. Compared with the production envelope, 48,324,800 native square pixels are restored and 4,419,800 removed; the previously retained 4,316,800 square pixels of tested inset area are excluded. This is a reviewed content envelope with margins, not a tracing of every engraved border. `boundary-comparison-proposal.jpg` and `boundary-audit.json` preserve the comparison. Production cutlines are not replaced.

## Preserved model and observation history

Every comparison uses the same stated checks within that experiment. Scores from different rows below are not directly interchangeable validation sets.

- The unchanged affine4 first failed VN11 Cape St Lawrence at 549.01 m, VN12 Cape North at 482.97 m and VN13 Sunday Lake at 718.51 m. With earlier VN08, four first observations had 558.16 m RMS. VN08, VN12 and VN13 were subsequently promoted unchanged.
- `distributed-trial/`: affine7 was selected over same-check TPS/poly2 alternatives. Its fresh VN14 Smoky and VN15 Donovan results were 373.20 and 773.67 m. A larger original crop resolves the prior withheld “Duncan” label as **Donovan**, corroborated by the original named river geometry. The unrelated modern Duncan Brook was not adopted.
- `north-pond-audit/`: the two old island centroids were retraced independently in native source detail. Revised VN16 and VN17 are diagnostics, with original supply-04/supply-06 observations preserved. VN16 moved about 12.4 native pixels; VN17 about 1.1. A valid concave island can have its area centroid outside its polygon.
- `interior-trial/` and `edge-and-interior-trial/`: adding Donovan and Smoky supports TPS9, but fresh Snipe VN18 and Doherty VN19 still fail at 756.09 and 627.27 m. A recorded forward/inverse probe rules out a large inverse inconsistency at the tested points; it does not establish geographic correctness.
- `western-repair/`: unchanged Snipe becomes a control. Doherty improves to 97.62 m, while western North Pond fails at 393.52 m. An initial commentary misattributed that maximum to Doherty; `western-corridor-trial/rejection.json` preserves the correction and the rejected attempt that added Doherty. That alternate eleven-control fit is not the selected TPS11.
- `north-pond-support/`: audited VN16 is promoted instead, excluding supply-04. TPS11 has 139.14 m RMS on the same three remaining diagnostics, but fresh VN20 Upper Halfway, VN21 Middle Head and VN22 Mary Ann fail at 459.50, 358.01 and 348.01 m (391.76 m RMS). Actual TPS11 raster windows preserve those failures. VN22 is explicitly a project-derived midpoint of two original bank junctions, not an official point.
- `regional-support/`: the last three points are promoted unchanged for TPS14. Their first results remain historical evidence, not fresh checks on the new fit.
- `southwestern-support/`: South Clyburn VN23 was chosen as a **prospective control**, before evaluating its effect; its 1,973.31 m TPS14 discrepancy is a scouting diagnostic. Reserved Curtis VN24 improves from its first TPS14 result of 1,590.14 m to 261.78 m on TPS15. Curtis was not fitted and becomes a selection diagnostic. The fifteen-control fit is then frozen before VN25/VN26 validation.

The selected controls are VN01, VN04, VN06, VN05, VN08, VN12, VN13, VN15, VN14, VN18, VN16, VN20, VN21, VN22 and VN23. Every promoted feature and alias is excluded from subsequent checks. Prior withheld VN10 is the Donovan identity alias; supply-04 is the audited VN16 alias. VN19 Doherty and VN24 Curtis remain checks, not controls. `VN14-context-erratum.json` corrects a description: the Smoky observation itself was inside the old crop, while surrounding cape context was restored. Coordinates and first scores did not change.

Additional searches for Rorys, Tongue, Franey and Cameron are documented in `unresolved-searches.json`. No name-point, predicted coordinate, wrong-bank junction or uncertain estuarine correspondence was fitted to fill a quota. The current fit remains frozen; remaining work is distributed validation and resolved physical identities, rather than tuning against the two fresh checks.

## Artifact and actual web path

Local review GeoTIFF:

`/Users/dfakkeldy/Downloads/church-victoria-nw-continuation-20260914/tps15-rendered/victoria-northwest-tps15-review-20m.tif`

- SHA-256 `aec83eeca7f49a82c88009d01ccda482e59130f3808eede04b5825480ccf3e82`.
- 2,435 × 3,906 pixels, EPSG:3857, 20 **projected** metre cells; this cell size is not positional accuracy.
- Original Victoria TIFF: 33,711 × 31,468, SHA-256 `81a694ed1cd7a9b3b7d77c4b16dd947a984932214397f319cab072375f695621`.
- Full-envelope coverage: 8,517,540 tested interior cells, zero transparent holes, one output-cell boundary tolerance.
- Orientation sampling: 30,934 samples, no sign reversals; sampled anisotropy maximum 1.4841. Finite samples do not prove the continuous surface fold-free or geographically accurate.
- Thirteen actual TPS15 raster/reference windows, including controls, four diagnostics and both fresh checks, are in `tps15-warped-review/`. Their roles are printed on each figure. Historical TPS11 windows remain separately available.

The actual web app imported the GeoTIFF through My Maps, retained it after navigation/reload, and rendered the entire sheet in 2D and at 10× terrain exaggeration. Wilkie/North Pond drainage was reviewed at zoom 13 with 50° and 0° tilt. Strong relief makes ridges and valleys clearer but can hide valley bottoms at an oblique angle. Terrain screenshots are context, not measured GCP coordinates. `browser-review/` contains screenshots and a receipt; no console errors were reported in the inspected log. The local file stays in the browser.

The production parser round-trips the three selected inventories with 15 controls and 0/4/2 checks. The web TPS agrees with GDAL at checks and content vertices within 0.001 projected metre. The production GeoTIFF decoder verifies native dimensions, CRS, alpha and 81 embedded projection nodes. This is the embedded-raster path; it is not a claim that a full raw-scan browser TPS mesh has been accepted.

Historical imagery remains Rumsey / Stanford material under its existing CC BY-NC-SA 3.0 provenance; original source and licence receipts remain in the predecessor reports. Modern water references retain original NSTDB feature IDs and file hashes. Official provincial geographic-name records in `name-identity-audit/` corroborate identities only. This report grants no new publication clearance. No tiles, catalog activation, production deployment or accepted-baseline replacement occurred.

## Reproduction

From the repository root, with the recorded local reference/crop/raster cache available:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/victoria-northwest-continuation-20260914/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verification replays 76 stored metric sets, audits 16 observations and parses 23 inventories. It checks original reference vertices/ring membership, source-coordinate conversion, source/reference hashes, role separation, freeze hashes, preserved predecessor inputs and final raster receipts. The 428 Church tests pass. `verify_import.ts` and `southwestern-support/verify_embedded.ts` are bundled with the existing Rolldown dependency for the separate production-web probes; recorded JSON outputs accompany them.

Full georeferencing remains incomplete. Preserve this provisional result while continuing the outstanding physical coverage and the separate Victoria main review.
