# Fletcher Sheet 8 — provisional full-sheet georeferencing

**Draft / geographically unaccepted.** The ten-control TPS fails fresh validation: median **154.800614288 m**, worst **344.071022172 m**, against the 100 m median / 200 m worst limits. Three fresh checks cover two northeastern tributaries and Coulmeach Brook. They do not establish full-sheet coverage. Substantial western and central distortion remains. This packet supplies research evidence and editable controls; production map eligibility is false.

## Source, extent and reference

The direct [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2633~290001/manifest) identifies Sheet 8, `RUMSEY~8~1~2633~290001`. The native raster is 10812 × 7622; all 24 downloaded regions passed assembled-pixel parity. Source PNG SHA-256 `aa324565b0b25bdd1ae102f14e4bad8b542547d6e5bba76dd620a52dafa1d4aa`. TIFF and manifest hashes, attribution and the manifest's null licence field are retained in [source-receipt.json](source-receipt.json).

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). The collection's CC BY-NC-SA 3.0 terms require attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field is preserved as retrieved; it does not replace the separate permission record. These review derivatives are georeferenced and annotated. Collection imagery is not relicensed under the repository MIT licence. Hosting and publication clearance remain separate.

Native overview, all corners, coordinate labels and the complete mapped boundary were personally inspected. No mapped extension beyond the main frame was identified. One continuous ring retains all mapped river and lake regions, including unsupported areas; no control-hull clipping. Boundary SHA `1fabe8fc6eecd9a4ce4529280e7b51f0e6ccffa6da5f5ccd3999725575c31025`. The warped overview and browser import retain the complete frame.

The two pre-existing grid-only files remain unchanged ([prior-state.json](prior-state.json)); no earlier physical Sheet 8 packet was found within the recorded search scope. Ten individually measured, slanted graticule crossings at 60°50′–60°30′ W and 46°35′/46°30′ N guide search only. They were never physical fitting constraints. [guide-audit.json](guide-audit.json) records the native label review. The old encoding hash is preserved rather than substituted for the new native source hash.

NSTDB query bbox −60.89, 46.43, −60.43, 46.65 returned 2,042 roads, 13,598 water lines and 7,214 water polygons. Rail returned empty (0), which is not evidence of absence. [reference-receipts.json](reference-receipts.json) retains URLs, counts, dates and hashes. Five regional search pairs and the stable modern node index are under [matching-context](matching-context/).

**Reservoir caution:** Gisborne, Wreck Cove and other water bodies were altered by hydroelectric development after Fletcher's survey. [reservoir-caution.md](reservoir-caution.md) links the primary records. Modern names or nearby outlines do not establish unchanged historical shorelines. No reservoir shoreline was used as a control or independent check. The records do not establish an exact historical shoreline, water level or dam footprint for this georeferencing exercise.

## Review and frozen experiments

Original proposals remain in [candidate-controls.json](candidate-controls.json), followed by [corrected-candidates.json](corrected-candidates.json) and the final initial [reviewed-fit.json](reviewed-fit.json). All native placement and world-identity corrections below happened before initial scoring:

- C01 moved to the printed Two Brooks confluence; modern J1472 was an eastern braid/tributary and changed to J1478 at the northern bank confluence. Bank width remains uncertain.
- C02 changed from southern tributary J0931 to northern tributary J0932, with its native pixel placed on the junction.
- C03 changed from smaller northern tributary J1209 to the main eastern-arm confluence. Intermediate J1250 was a southwest bank/tributary junction; final J1256 matches the eastern arm. All stages are retained.
- C04 changed from small northern tributary J0734 to the northwest/southwest main-arm junction J0744.
- C05 moved onto the long southern tributary junction; C06's original McKinnon Brook junction was retained.
- C07 changed from northern J2665 to southern J2671 and moved onto the printed junction. Its description was corrected: this is a small tributary to French River, not the French/Little River confluence.
- C08 moved from land to the eastern tributary's Indian Brook junction; C11 moved onto the Little River western-tributary junction.
- C09 and C10 remain rejected, unscored: the proposed First/Second Fork pixels were off their junctions and wider modern topology did not establish a reliable identity.

Nine physical controls were frozen at SHA `2016e596356476f281c840d4ae44d17d109e8eadb9256625c75c6f89b3cea85b`. Two reviewed diagnostic checks, collected after that freeze, produced:

| Initial experiment, same 2 checks | Median ground m | Worst ground m |
|---|---:|---:|
| Affine | 1520.354703980 | 2299.791545969 |
| TPS | 993.609086579 | 1855.418101536 |

Q01 Coulmeach Brook failed at 1855.418101536 m under TPS. It was promoted to C12 with identical pixel and world coordinates; the original nine fit records are unchanged. [repair-freeze.json](repair-freeze.json) records the ten-control freeze **before fresh validation**. Final fit SHA `ba667e84c9379252c3a444ae64c47a2ab209813dd4961eff17500bfee0a81ca3`. Q03 lower Indian Brook remains a reused diagnostic: 131.800071621 m initially and 131.195863343 m after repair, not fresh independent evidence. Q02 West Branch Indian Brook was rejected unscored: the modern point was a southwestern tributary, while the proposed native northern tributary had no established match.

Fresh, never-fit checks:

| ID | Feature | Ground error m |
|---|---|---:|
| V01 | Short northern tributary to Ingonish River near fitted southern tributary | 154.800614288 |
| V02 | Fork on southern McKinnon tributary below its fitted mouth | 125.321909817 |
| V03 | Southern tributary on Coulmeach Brook downstream of fitted northern tributary | 344.071022172 |

All three failures remain unchanged after scoring. The fresh set has limited regional coverage. Forty-six point figures were personally inspected, including original, corrected and wide-context views. [frame-verification.json](frame-verification.json) checks every figure against its preserved stage coordinates. Native source uncertainty is recorded as 20 pixels, with explicit additional bank-width and historical-geometry limitations.

## Deliverables and verification

- [Control CSV](sheet-08-controls.csv): 10 editable controls.
- [Diagnostic CSV](sheet-08-diagnostic-review.csv): the same controls plus reused Q03.
- [Fresh validation CSV](sheet-08-validation-review.csv): the same controls plus 3 fresh checks; check rows do not constrain the fit.
- Complete local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet08/regional-ten/sheet-08-full-sheet.tif`, 9483 × 5846 RGBA, SHA `e5bcdd37da6e814297d3b432f3549ecf81bbc5b1f558b2f78c3fc600e98006a9`.
- Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet08/native/sheet08.png`. Large native imagery, reference GeoJSON and GeoTIFF bytes stay outside Git. Hashes and paths remain in this packet.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the raster. Coverage checks found 45,158,967 interior cells and **zero alpha holes**. All 71,548 sampled Jacobians have the expected negative sign (native y points down). These are rendering checks, not geographic acceptance.

The actual web CSV parser semantically round-trips all three files. Web/GDAL predictions differ by at most 8.01153971538e-09 projected metres. The **actual GeoTIFF** was imported through My Maps in an isolated Chromium browser, reloaded on desktop and viewed on mobile. Stored raster bytes/hash, georeference, size, transparency and enabled state survived reload. No console or page errors were recorded. All three screenshots were personally inspected; [browser-verification.json](browser-verification.json) records their local paths and hashes. This is local browser proof, not production deployment.

Eleven actual warped-raster frames were personally inspected. North Branch and Northeast Margaree align locally at fitted junctions but diverge along neighbouring reaches and tributaries. Coulmeach has substantial downstream path differences; First/Second Fork and the southwest remain unsupported. Upper Ingonish and McKinnon have significant reach displacement away from controls. The West Branch/McMillan interior and Gisborne/Wreck Cove area differ markedly, with post-survey reservoirs complicating identity. Indian Brook is locally closer around the fitted junction but diverges downstream. French/Loon lakes and neighbouring tributaries do not establish shoreline acceptance. The complete frame is retained.

Four actual comparisons with Sheet 9 to the west and Sheet 10 to the south were personally inspected. The western frames show a large gap and different river placement, especially in the southwest. Southern frames show offsets, overlap and inconsistent river continuation. None is an accepted seam. Northern Sheet 5 and eastern Sheet 7 remain outstanding. Reproduction code includes [review_warp.py](review_warp.py), [review_join.py](review_join.py), [review_points.py](review_points.py), [verify_import.ts](verify_import.ts), [verify-browser.mjs](verify-browser.mjs) and [verify_packet.py](verify_packet.py). Shared render/score/coverage tools remain unchanged.

## Handoff

Keep this sheet fail-closed. A next repair should revisit western topology and the large Sheet 9 discontinuity, add supported central/southwest identities, distinguish altered drainage from registration error using historical evidence, and compare Sheets 5 and 7 when available. Preserve the ten-control fit, original proposals, rejected identities and every failed score. Freeze any next repair before choosing new independent checks; these validation points cannot be reused as fresh evidence. Do not clip unsupported regions to improve appearances.

Local source/provenance, parser, raster coverage and browser checks passed. Geographic acceptance failed. Hosted CI is reported on the PR separately; no merge, deployment or publication was performed.
