# Fletcher Sheet 6 — provisional full-sheet georeferencing

**Draft / geographically unaccepted.** The ten-control TPS fails fresh validation: median **442.674045000 m**, worst **596.295010046 m**, against the 100 m median / 200 m worst limits. Two fresh checks cover Daphiné and Jumping brooks; they do not establish full-sheet coverage. The complete mapped frame is retained, including the broad western sea, legend and northern Chéticamp Island. Production eligibility is false.

## Source, extent and reference

The direct [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2631~280045/manifest) identifies Sheet 6, `RUMSEY~8~1~2631~280045`. The native raster is 10739 × 7552; all 24 downloaded regions passed assembled-pixel parity. PNG SHA-256 `f0eba470a9ff0ae9e89a2c211c2d6eab6b7a647cd71c706c8913708a625091e3`. [source-receipt.json](source-receipt.json) preserves TIFF and manifest hashes, attribution and the manifest's null licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). The collection's CC BY-NC-SA 3.0 terms require attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field is retained separately from that permission record. These derivatives are georeferenced and annotated; imagery is not relicensed under the repository MIT licence. Hosting clearance remains separate.

Native overview, all corners, coordinate labels and the complete red boundary were personally inspected. No mapped extension outside the main frame was identified. The single continuous boundary retains all mapped material and unsupported areas without control-hull clipping. Boundary SHA `93393f755fa44330e007192757a7564375b38db3c593ac1b19b7c607a59d749b`.

The two original grid-only files remain unchanged ([prior-state.json](prior-state.json)); no earlier physical Sheet 6 packet was found within the recorded search scope. Eight previously recorded slanted crossings at 61°10′–60°55′ W and 46°45′/46°40′ N guide search only. This pass checked both latitude labels and outer longitude labels on the native scan; it did **not** freshly measure every crossing. [guide-audit.json](guide-audit.json) preserves this distinction and the old encoding hash.

NSTDB bbox −61.25, 46.60, −60.81, 46.81 returned 1,282 roads, 3,299 water lines and 1,721 water polygons. Rail returned empty (0), which is not evidence of absence. [reference-receipts.json](reference-receipts.json) retains URLs, counts, dates and hashes. Three native/modern regional pairs and the stable node index are in [matching-context](matching-context/).

## Reviewed identities and frozen experiments

Original proposals, corrected records and rejected controls remain separate. Native placement and world-identity corrections happened before scoring:

- C03 moved onto Jumping Brook's mouth; neighbouring tributary geometry remains different.
- C04 moved onto Corney Brook's mouth. The modern final reach is marked indefinite.
- C05 changed from J0223, a smaller southeastern tributary, to J0227 at the main South Branch junction, and moved onto the printed junction.
- C06 moved onto the major southern tributary of historical Trout Brook, modern Anthony Aucoins Brook. Local branch order supports the correspondence.
- C09 changed from the next eastern junction J0320 to the smaller northwestern tributary J0324 of historical Robert Brook, with a corrected native pixel. Modern tributary lengths differ.
- C11 and C12 moved onto the Faribault and Daphiné confluences with Chéticamp River; their original pixels were on land or upstream.
- C13 moved onto Enragée Point. The proposed modern point was independently checked as the northernmost vertex of the connected Chéticamp Island shoreline within the reference query. The modern small hook and historical broad tip differ; the query does not cover the whole island.
- C01, C02, C07, C08 and C10 remain rejected and unscored: sea/land placements, ambiguous river mouths and unmatched branch/coast geometry did not establish identities. Similar names alone were insufficient.

Eight physical controls were frozen at SHA `3adf65c3c5c3e314071b94592694767dd442d9b1a084f8b5058082495628bc05`. Three subsequent diagnostic checks gave:

| Initial experiment, same 3 checks | Median ground m | Worst ground m |
|---|---:|---:|
| Affine | 286.158624666 | 388.102783535 |
| TPS | 239.634279723 | 286.251828778 |

Q01, Corney's smaller southeastern tributary, failed at 286.251828778 m. Q03, the island's eastern headland, failed at 239.634279723 m. They were promoted unchanged to C14 and C15. The original eight full fit records remain unchanged. [repair-freeze.json](repair-freeze.json) records the ten-control freeze **before fresh validation**. Final fit SHA `007808040feca6310cf934bafcf3467f594bed43ba056c32faea45dc1758c54e`.

Q02 was corrected before initial scoring from a downstream western fork to J0521 at Faribault's main southeastern-arm/western-tributary junction. It remains a reused diagnostic: 96.673802427 m initially, 83.587395012 m after repair. It is not fresh evidence.

Fresh checks were selected after the ten-control freeze. V02 moved west to the first southern branch of Daphiné Brook; its main outlet and next divided southeastern tributary agree in order, while the southern branch's historical length differs. V03 moved east to Jumping Brook's southern tributary at the Fall label; later branch orientation and length remain different. Both exact corrected crosshairs were personally inspected before scoring. V01 Faribault remains rejected, unscored: a short historical twig did not establish a clear correspondence with the long divided modern branch.

| Fresh ID | Feature | Ground error m |
|---|---|---:|
| V02 | Daphiné Brook first eastern tributary south of Chéticamp River | 289.053079953 |
| V03 | Jumping Brook southern tributary upstream of the first coastal tributary | 596.295010046 |

Both failed checks remain unchanged after scoring. Fifty-one point frames were personally inspected, including original, wide and corrected stages. [frame-verification.json](frame-verification.json) verifies every frame against the coordinates for that stage. Native uncertainty is recorded as 20 pixels, with explicit additional shoreline, bank and historical-geometry limitations.

## Deliverables and verification

- [Control CSV](sheet-06-controls.csv): 10 editable controls.
- [Diagnostic CSV](sheet-06-diagnostic-review.csv): the same controls plus reused Q02.
- [Fresh validation CSV](sheet-06-validation-review.csv): the same controls plus 2 fresh checks. Check rows do not constrain fitting.
- Complete local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet06/regional-ten/sheet-06-full-sheet.tif`, 8401 × 5861 RGBA, SHA `9f3cbc615328c16e806daf15954b0cf58595105e41205fc0f922521de44d3544`.
- Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet06/native/sheet06.png`. Large native imagery, reference GeoJSON and GeoTIFF bytes stay outside Git; this packet preserves paths and hashes.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the raster. Coverage found 45,534,791 interior cells and **zero alpha holes**. All 71,502 sampled Jacobians have the expected negative sign (native y points down). These are rendering checks, not geographic acceptance.

The actual web CSV parser semantically round-trips all three files. Web/GDAL predictions differ by at most 6.58544507983e-09 projected metres. The actual GeoTIFF was imported through My Maps in isolated Chromium, reloaded on desktop and viewed on mobile. Stored bytes/hash, georeference, dimensions, transparency and enabled state survived reload. No console or page errors were recorded. All three screenshots were personally inspected; [browser-verification.json](browser-verification.json) preserves paths and hashes. This is local proof, not production deployment.

Seven actual warped-raster frames were personally inspected. The northern coast is locally closer, while Pigeon/George and the interior rivers differ markedly. Jumping Brook and upper Corney show substantial upstream displacement; fitted mouths and junctions do not establish neighbouring reach accuracy. Trout/Robert and Jerome/Rigwash show differing tributary paths. The island tip and eastern headland fit locally, but the harbour and adjacent shores differ. Chéticamp River is locally close near controls; Daphiné and other southern tributaries diverge. The full western sea/legend remains unsupported extrapolation.

Two actual comparisons with southern Sheet 9 were personally inspected. The island outlines are offset and the interior boundary tilts/overlaps; river continuation is inconsistent. Neither seam is accepted. Eastern Sheet 5 remains outstanding. Graticule comparison places Sheet 3 northeast, not directly north of Sheet 6; no direct northern or western adjoining sheet has been established. Reproduction scripts and all immutable experiment records are included. Shared render/score/coverage and web code remain unchanged.

## Handoff

Keep Sheet 6 fail-closed. Revisit Jumping and Daphiné topology and registration, add supported northern/eastern identities, and compare the eastern edge with Sheet 5. Preserve the ten-control fit, original and rejected proposals, promotions and every failed score. Freeze any further repair before selecting new independent checks; these checks cannot be reused as fresh evidence. Do not crop unsupported regions to improve appearances.

Local provenance, parser, raster coverage and browser verification passed. Geographic acceptance failed. Hosted CI is reported separately on the PR. No merge, deployment or publication was performed.
