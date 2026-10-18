# Fletcher Sheet 10 — provisional full-sheet georeferencing

**Draft / geographically unaccepted.** The twelve-control TPS fails fresh validation: median **515.042393302 m**, worst **556.374737031 m** against the 100 m median / 200 m worst limits. Three fresh checks cover upper Middle River, Barasois and upper North Branch Baddeck; they do not establish full-sheet coverage. No eastern-shore validation was accepted. This packet adds research evidence and editable controls; no production map, tile catalogue, licence gate or native code is changed.

## Preserved source and extent

The direct [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2635~290003/manifest) identifies Sheet 10, `RUMSEY~8~1~2635~290003`. Native raster is 10782 × 7612; all 24 downloaded regions passed assembled-pixel parity. Source PNG SHA-256 `492a7b5b6cf6e0b33576c5b9489bc9bd91bc43d8f0f63a125c44225929fcab46`. TIFF and manifest hashes, source attribution and the manifest's null licence field are retained in [source-receipt.json](source-receipt.json).

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). The collection's CC BY-NC-SA 3.0 terms require attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field is preserved as retrieved; it does not replace that separate permission record. These review derivatives are georeferenced and annotated. Collection imagery is not relicensed under the repository MIT licence. Hosting and publication clearance remain separate.

The full main mapped frame, northeast Bentinck Point and labels, and the southern point near St Anns remain in one continuous boundary. Native overview, corners, printed coordinate labels and both extensions were personally inspected before fitting. Full-warp overview and browser proof also show both extensions. The Bentinck close geographic window cuts part of its label at the window edge; the raster itself retains the full notch. Boundary hash `6ac04881d5ed210a745434fe9763a18e5fee941b3c29e274b0157243d7c3353b`. No control-hull or corridor clipping.

The two pre-existing grid-only files are unchanged ([prior-state.json](prior-state.json)). No earlier physical Sheet 10 packet was found in the recorded search scope. The ten individually measured, slanted graticule crossings at 60°50′–60°30′ W and 46°25′/46°20′ N guide feature search only; they never entered the physical fit. [guide-audit.json](guide-audit.json) records the native label review.

Modern NSTDB snapshots cover query bbox −60.89, 46.25, −60.43, 46.48: 2,525 roads, 6,494 water lines and 3,215 water polygons. Rail returned empty (0); that is not evidence of absence. Query URLs, response counts and hashes are in [reference-receipts.json](reference-receipts.json). Five regional search pairs and the stable modern node index are under [matching-context](matching-context/).

## Controls, corrections and failed experiments

The original proposals are in [candidate-controls.json](candidate-controls.json), with preserved corrections and rejected identities in [corrected-candidates.json](corrected-candidates.json). C01's world point changed from the eastern tributary J1162 to western tributary J1167; C09 changed from eastern J1936 to western J1953. These were identity corrections before the first fit. Native placement corrections were made from crosshairs. C11's first world proposal landed on adjacent mainland and was corrected to the southern Beacon spit tip before fitting. C10's braided Middle/West Branch identity and C12's inland Oyster Pond proposal were rejected unscored.

Ten controls were frozen in [reviewed-fit.json](reviewed-fit.json), SHA `1aa0ede8ec06ee965a390fd30bcb4e07c7a679c0b28a58242e977191ccd77cff`. Three later reviewed diagnostic checks gave:

| Experiment | Median ground m | Worst ground m |
|---|---:|---:|
| Initial affine, same 3 checks | 426.134615737 | 528.671180392 |
| Initial TPS, same 3 checks | 287.983148384 | 632.460426224 |

Q01 (western interior confluence, 632.460426224 m) and Q03 (Elders Brook/North River, 207.070240796 m) were promoted as C13 and C14 without moving either pixel or world coordinates. The original ten controls are byte-equivalent JSON records in the final fit. [repair-freeze.json](repair-freeze.json) records the twelve-control freeze **before** collecting fresh validation. Fit SHA `684472b4fdbe8b6e6afe8c13de4d123c0b43144880dc3340a3f21f8585ac982d`. Q02 remained diagnostic and worsened from 287.983148384 m to 314.763879495 m; this is reused diagnostic evidence, not independent validation. Q04's barrier connection and Q05's lake inlet were rejected before scoring and remain visible in their original proposals.

Fresh checks, never used for fitting:

| ID | Feature | Ground error m |
|---|---|---:|
| V01 | Long eastern tributary of upper Middle River above Camp; original short tick/tributary proposal discarded after wider topology review. | 556.374737031 |
| V02 | Small eastern tributary of Barasois below western confluence | 57.528574528 |
| V04 | Upper North Branch Baddeck western tributary below Stillwater | 515.042393302 |

V03 was rejected before scoring: wide native context places named Smith Brook southwest of the proposed small intervening creek, and the modern stream identity was unresolved. Original, corrected, final and rejected validation stages are preserved; the three measured failures were not removed or moved after their scores became known. Forty-nine native crosshair frames were personally inspected, including wide topology views. [frame-verification.json](frame-verification.json) verifies each frame against its exact stage coordinates.

## Delivered files and verification

- [Control CSV](sheet-10-controls.csv): 12 editable controls.
- [Diagnostic CSV](sheet-10-diagnostic-review.csv): same controls plus reused Q02.
- [Fresh validation CSV](sheet-10-validation-review.csv): same controls plus 3 fresh checks. Check rows never become fitting constraints.
- Local complete GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet10/regional-twelve/sheet-10-full-sheet.tif` (9277 × 5964 RGBA), SHA `990434356bf80c3c5a9fd310b220d3da9fa6b0dff61177286c5f5c90092b6c8a`.
- Local native source: `/Users/dfakkeldy/Downloads/fletcher-sheet10/native/sheet10.png`. Large native imagery, reference GeoJSON and GeoTIFF bytes remain outside Git; hashes and paths are in the packet.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the raster. Coverage verified 50,064,134 interior cells with **zero alpha holes**; 72,510 sampled Jacobians had the expected negative sign (native y points down). These are rendering checks, not geographic acceptance.

The real web CSV parser round-trips all three files; web/GDAL predictions differ by at most 5.66501406049e-09 projected metres. The **actual GeoTIFF** was imported through My Maps in an isolated browser, reloaded on desktop, and viewed on mobile. Its stored bytes/hash, georeference, pixel size, transparency and enabled state survived reload; no console or page errors were recorded. All three screenshots were personally inspected. See [browser-verification.json](browser-verification.json), [verify-browser.mjs](verify-browser.mjs), and the local browser directory listed there.

Eleven actual-raster review frames were personally inspected. Upper/lower Middle River and West Branch show substantial tributary/path displacement. Upper Barasois remains offset; Barasois/McKay is locally closer. Bentinck and McAskill are locally closer, while the Indian mouth and Macdonald Pond differ. Baddeck Lakes and the western interior remain poorly aligned. North River's main channel and parts of St Anns coast are closer, but tributaries, delta and shoreline shapes still differ. The full frame is retained through unsupported regions.

Four actual comparisons with Sheet 11 to the west and Sheet 12 to the south were personally inspected. They show frame gaps/overlap and stream/shore discontinuities; none is an accepted seam. Northern Sheet 8 remains outstanding. Reproduction code is [review_warp.py](review_warp.py), [review_join.py](review_join.py), [verify_import.ts](verify_import.ts), and [verify_packet.py](verify_packet.py). Shared score/render and coverage scripts are unchanged.

## Handoff

Keep this sheet fail-closed. A subsequent repair should review the upper Middle River topology and the displaced western interior, establish stronger southeast and Baddeck Lakes identities, and compare Sheet 8 once available. Preserve this twelve-control fit and every failed score. Freeze any next repair before choosing new independent checks; do not reuse this validation set as fresh evidence. Do not delete unsupported portions to make the raster look better.

Local parser, source/provenance, coverage and browser checks passed. Geographic acceptance failed. Hosted CI, merging, deployment and publication are separate states; no merge or deployment was performed.
