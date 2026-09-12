# Sheet 10 — failed physical repair, 12 September 2026

**Draft; this 13-control experiment is not recommended as a replacement.** It fits the re-inspected upper Baddeck tributary locally but worsens several lower Middle River, West Branch and Baddeck reaches. The two newly collected check results are 894.14 m and 103.36 m; broader F01 branch hierarchy remains unresolved after an additional post-score review. Preserve that failure with its identity limitation, not as a confirmed 894 m map error. Whole-sheet geography and all reviewed seams remain unaccepted.

## Editable experiment and exact artifacts

- [Controls CSV](sheet-10-controls.csv): 13 native-frame controls. [Reused diagnostic CSV](sheet-10-diagnostic-review.csv): 13+3 rows. [Collected validation CSV](sheet-10-validation-review.csv): 13+2 rows, including the unchanged failed F01 candidate with the limitation above. Full records: [fit](repaired-fit.json), [diagnostics](reused-checks.json), [validation](validation.json), [post-score identity review](postscore-identity-review.json).
- Complete experiment GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet10/refinement-20260912/sheet-10-full-sheet.tif`, 9287 × 5962, EPSG:3857, RGBA, 5 projected metre cells; SHA-256 `5e7ef029cd6c5289fc6ff5f242fb08b7b238ca464853203f73c1e6ee0f946deb`.
- Original native PNG: `/Users/dfakkeldy/Downloads/fletcher-sheet10/native/sheet10.png`, 10782 × 7612, SHA-256 `492a7b5b6cf6e0b33576c5b9489bc9bd91bc43d8f0f63a125c44225929fcab46`.
- Experiment fit SHA-256 `c2d78d959d656e0f8d718cca620774dc25853bfe676ec67392ab1ab984e57a67`. Original twelve-control fit and raster remain unchanged; [baseline verification](baseline-verification.json) pins both.
- Complete original boundary unchanged: `6ac04881d5ed210a745434fe9763a18e5fee941b3c29e274b0157243d7c3353b`. Main frame, northeast Bentinck extension and labels, southern St Anns point, islands and unsupported mapped content remain. No corridor or control-hull crop.

## Identity review, freeze and failure

All twelve earlier controls and all previous proposals, rejected matches, corrections, scores and rasters remain intact. V04's upper North Branch Baddeck western tributary was personally re-inspected on the original unrotated scan in close and wide views against modern branch ordering. It became C15 with the same [3230,5333] native pixel and modern coordinate; the full old point and its 515.04 m failure remain nested in the promotion. The original 20 px pick uncertainty remains.

V01 is not promoted: the native eastern arm's nearby southeastern fork and separation from the western Camp confluence are not sufficiently corroborated by modern hierarchy. Q02 is not promoted: modern braided/pond-bank geometry versus native main channel and parallel eastern strokes requires more interpretation. Their coordinates and failures remain as uncertain reused diagnostics. Prior rejected C10/C12 and validation V03 are not reinstated.

The [13-control freeze](repair-freeze.json) preceded new F01/F02 collection. Every original and corrected native crosshair was personally inspected close and wide alongside marked modern geometry before the first score. F01's original J1878 world pick was below the western confluence; it was corrected to J1875, and its native crosshair moved from [3210,5759] on the western arm to [3235,5759] at the merger. F02 moved six pixels north from [5984,2451] to [5984,2445]. Both original proposals and corrected stages remain unchanged.

| Check | Original 12 controls | Experiment 13 controls |
| --- | ---: | ---: |
| F01, proposed lower North Branch Baddeck western confluence | 622.78 m | **894.14 m** |
| F02, Barasois western tributary at Fall 80 | 104.75 m | **103.36 m** |

Median 498.75 m and worst 894.14 m fail the pre-existing 100/200 m thresholds. After scoring, a further 1000 px / 4000 m original-context review exposed unresolved F01 branch hierarchy: the native main channel turns west with a short southeastern arm, while the modern southeastern reach connects a larger network. It remains a failed candidate with an identity caveat, never promoted or moved after scoring. This uncertainty cannot be used to manufacture a pass. F02 alone provides no whole-sheet validation and itself exceeds the median threshold.

The Indian mouth/Macdonald Pond search did not establish a sufficiently shared shore definition; [unresolved searches](unresolved-searches.json) records the reason. No eastern shore point was invented or scored. No further coordinate tuning or refitting followed these results.

## Actual raster, seams and import

[Visual review](visual-review.json) records personal inspection of all 35 hashed figures: six old-point frames, eight new/corrected frames, the additional F01 topology frame, eleven real raster comparisons, six adjacent-sheet pairs and three browser screenshots. The original complete boundary overview was also inspected. The three regional search grid/modern pairs were used only to locate features.

The new control improves its immediate vicinity. Lower Middle River, West Branch and Baddeck downstream reaches become worse in several places; lake shapes and tributaries remain displaced. Upper Middle River and Barasois, Bentinck/McAskill, Indian mouth/Macdonald Pond, North River and St Anns change little, retaining existing errors. These comparisons use directly projected modern vectors on actual GDAL raster windows, not an inverse guide.

The previously outstanding Sheet 08 northern seam is now reviewed in two windows. It shows overlaps/gaps and displaced river connections. Two western Sheet 11 windows and two southern windows using the new Sheet 12 17-control raster also retain gaps and stream/shore discontinuities. No seam is accepted. [Join provenance](join-provenance.json) pins the exact neighboring rasters; [reference receipts](../reference-receipts.json) retain the hash-verified September 11 NSTDB snapshot and its limits.

Exact GDAL TPS uses `-et 0`, cubic resampling and the unchanged complete boundary. [Coverage](coverage.json) verifies 50,087,210 interior cells with zero transparent holes. All 72,510 sampled Jacobians have the expected negative sign for native y-down coordinates; this is not a continuous no-fold proof.

[Import verification](import-verification.json) passes the real CSV parser, semantic round-trip and TPS consistency for 13/3/2 roles; maximum web/GDAL difference is 6.25e-9 projected m. The actual GeoTIFF imports into My Maps and survives desktop and mobile reload with the same exact raster hash, georeference, transparency and enabled state, with no console/page errors. All three screenshots were personally inspected; desktop 1440×1000 shows the whole map frame, mobile 390×844 a narrower viewport. [Browser proof](browser-verification.json) verifies TIFF persistence, not geographic or native PNG+CSV browser mesh acceptance.

[Packet verification](packet-verification.json) passes provenance, preservation, coordinate/role isolation, CSVs, reference and raster hashes, coverage and browser checks. [Acceptance](acceptance.json) remains false and the experiment is not a recommended replacement. No application or Apple code changed; hosted CI is separate from these findings.

## Reproduction and rights

See [HANDOFF.md](HANDOFF.md). Keep frozen files intact and use a new dated directory for future hypotheses. Large native, modern reference, GeoTIFF and browser artifacts remain outside Git.

Historical imagery: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**, [Sheet 10 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2635~290003/manifest). Scoped permission remains in [INVENTORY.md](../../INVENTORY.md). Cropped, annotated and georeferenced derivatives retain applicable CC BY-NC-SA 3.0 attribution, noncommercial and ShareAlike conditions. The manifest's null license field does not replace that permission. No imagery is relicensed under the software license and no deployment clearance is granted by this packet.
