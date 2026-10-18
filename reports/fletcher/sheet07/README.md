# Fletcher Sheet 7 — provisional full-sheet georeferencing

**Draft / geographically unaccepted.** The eleven-control TPS fails fresh validation: median **311.995499622 m**, worst **476.977450962 m**, against the 100 m median / 200 m worst limits. Physical support occupies a narrow western strip; most of the sheet is offshore extrapolation. This packet supplies editable controls, preserved failures and local raster/browser evidence. Production eligibility is false.

## Source, boundary and references

The direct [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2632~280046/manifest) identifies Sheet 7, `RUMSEY~8~1~2632~280046`. Native dimensions are 10821 × 7693; all 24 downloaded regions passed assembled-pixel parity. PNG SHA `a75274bc0f1849bc024c1013d84d0904845c3893b9599827ed1521948fec3b61`. [source-receipt.json](source-receipt.json) preserves TIFF and manifest hashes, attribution and the null manifest licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). The collection's CC BY-NC-SA 3.0 terms require attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field does not replace the separate permission record. These review derivatives are georeferenced and annotated; collection imagery is not relicensed under the repository MIT licence. Hosting and publication clearance remain separate.

The complete native overview, four corners, coordinate labels and mapped boundary were personally inspected. One continuous ring retains the entire mapped frame, including the offshore area and legend. No mapped extensions beyond the main frame were identified. Boundary SHA `ebf62db3000ce6fd6393ac213d6125fe87ac4d469128ea2fe8ca7b0f0b7c593d`. No clipping to the control hull or supported coast was used.

The two prior grid-only files remain unchanged ([prior-state.json](prior-state.json)); no earlier physical Sheet 7 packet was found in the recorded search scope. Eight intersections derived from the **existing approximate Cartesian guide** at 60°25′/20′/15′/10′ W and 46°35′/30′ N support search only. The native grid is slightly slanted; these are not newly measured individual crossings and never constrain the physical fit. Native labels were inspected and the original encoding hash remains distinct from the new native source hash. See [guide-audit.json](guide-audit.json).

NSTDB bbox −60.50, 46.43, −60.03, 46.66 returned 820 roads, 1,574 water lines and 627 water polygons. Rail returned empty (0), which is not evidence of absence. URLs, dates, counts and hashes remain in [reference-receipts.json](reference-receipts.json). Three native/modern regional search pairs and a stable modern-node index are in [matching-context](matching-context/). Modern geometry is reference evidence, not survey ground truth.

## Reviewed points and frozen experiments

Twelve original control proposals remain in [candidate-controls.json](candidate-controls.json). Ten were retained after close and wider inspection. Before fitting, C02 Pathend, C06 Wreck Cove and C08 Mill mouths moved from inland positions to the coast. C04 changed from an inner bank junction J0344 to coastal intersection J0346, with an indefinite modern final reach recorded. C05 Ferry and C07 Mill tributary pixels were refined. C03 Morrison, C09 historical North Shore/modern French River and C11 the western tributary north of Breeding Cove retained their identities. C10 changed from an incorrect adjacent sea shoreline to the northern tip of the lake shore represented by WALK20 objects 125610/125611/125612. Lake shape and bank width remain uncertain.

C01 remains rejected unscored because the northwestern branching pattern does not establish the proposed modern identity. C12 remains rejected unscored because the historical western pond inlet differs from the proposed modern short northern tributary. Original coordinates and figures remain available; none was silently dropped to improve a score.

Initial ten-control SHA `606f269ad100a7901a3b9afad6fd5a0920135cf40d46f7765a9e1a7636e9d4f2` was frozen before diagnostic selection. Two diagnostic checks produced:

| Initial experiment, same two checks | Median ground m | Worst ground m |
|---|---:|---:|
| Affine | 146.915449474 | 166.857627185 |
| TPS | 36.896767518 | 44.012047503 |

Q01 is the smaller **western** Ferry tributary; its initial northern-direction description and native pixel were corrected before scoring. Q02 is the second southern Mill tributary. Q03 was rejected unscored: the proposed modern point was a coastal contact on a partial lake shoreline, not a reliable counterpart of the historical pond's southern tip. Wider review showed changed coastal-water geometry.

The initial fit stayed unchanged through [final-freeze.json](final-freeze.json), then received three fresh checks. V01 Pathend scored 76.004089417 m, V02 Morrison 65.143592745 m, and V03 the northern interior fork **760.512276959 m**. Their native pixels were corrected to actual stream junctions before first scoring. All original and corrected stages and the failed [validation-scores.json](validation-scores.json) remain intact.

V03 was then promoted unchanged to C13. All original ten fit records remain identical. [repair-freeze.json](repair-freeze.json) froze eleven controls **before selecting the final fresh checks**. Final fit SHA `b36039ccc4f179f600c3136a3126b93efc4abd9a8917e3c4c9fa0426fcdd153a`. Q01, Q02, V01 and V02 are reused diagnostics after this repair, with median 62.793132227 m and worst 113.801213762 m. They are not fresh validation; V03 is now a fitting control.

| Final fresh check, never fitted | Feature | Ground error m |
|---|---|---:|
| V04 | Morrison Brook northern tributary well upstream of fitted mouth and former V02 | 476.977450962 |
| V05 | Distinct brook coastal mouth north of the historical North Shore/French River mouth | 147.013548282 |

Both final fresh points remain unchanged after scoring. V04 moved from the nearby native tributary to its actual Morrison junction; V05 moved from nearby coast to the brook mouth, before any fresh score. Their modern coordinates did not change. The two checks provide limited geographic coverage. All 57 point figures were personally inspected; their metadata matches the exact preserved-stage coordinates. A proposal's pending-review status records its generation stage; [visual-review.json](visual-review.json) records completed inspection. Source uncertainty is 20 pixels, with additional shoreline/topology limitations.

## Deliverables and verification

- [Control CSV](sheet-07-controls.csv): 11 editable controls.
- [Diagnostic CSV](sheet-07-diagnostic-review.csv): those controls plus four reused checks.
- [Fresh validation CSV](sheet-07-validation-review.csv): those controls plus two fresh checks; check rows do not constrain the fit.

Complete local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet07/regional-eleven/sheet-07-full-sheet.tif`, 7679 × 6160 RGBA, SHA `49263f0abb5bfb5bd5a12edecd908fbcf12f24ee88c3e1c18a5d470eda71c5dd`. Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet07/native/sheet07.png`. The original ten-control raster is retained separately with [initial-raster-receipt.json](initial-raster-receipt.json). Large imagery, references and GeoTIFFs remain outside Git; paths and hashes are recorded here.

The final raster uses one exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells. All 39,505,059 interior cells are covered with zero alpha holes. All 71,931 sampled Jacobians have the expected negative sign because native y points down. Coverage and orientation are rendering checks, not geographic acceptance.

All three CSVs semantically round-trip through the actual web parser. Web/GDAL prediction disagreement is at most 5.43049713117e-09 projected metres. The actual GeoTIFF was imported through My Maps in isolated Chromium, reloaded on desktop and viewed on mobile. Bytes/hash, georeference, dimensions, transparency and enabled state survived reload, with zero console/page errors. Three screenshots were personally inspected and are referenced in [browser-verification.json](browser-verification.json). This is local browser proof, not deployment.

Seven actual warped-raster frames were personally inspected. The northern fork is locally aligned after repair, but northwestern and adjacent reaches diverge. Pathend/Morrison and McLeod have substantial upstream and tributary offsets. Ferry and Mill are closer around fitted junctions, with differing surrounding reaches and branch patterns. Wreck Cove and North Shore/French River mouths align locally while inland channels and nearby mouths differ. Breeding Cove pond shapes, inlets and southern coastal waters remain unaccepted. The full offshore frame and legend are present, with unsupported extrapolation explicitly retained.

Three actual Sheet 8 comparisons cover the western edge from north to south. Northern corners are separated and tilted differently; central river continuations and southern branches differ, with gaps and varying offsets. No seam is accepted. Northern Sheet 4 remains pending; the southern and eastern edges are offshore. Review scripts use actual raster geographic windows and directly projected modern vectors, never the inverse search guide.

## Handoff

Keep this sheet fail-closed. Revisit Morrison's upstream tributary identity/registration, strengthen northern and western coverage, reconcile Sheet 8's river continuations, and compare Sheet 4 when available. Preserve the initial ten-control fit, its failed V03, the eleven-control repair, rejected identities and all scored checks. Freeze any later repair before collecting different independent checks. Do not treat previously scored points as fresh or clip unsupported areas to make the result appear accepted.

Local source/provenance, CSV, coverage and browser checks passed. Geographic validation failed. Hosted CI is reported separately on the PR; no merge, deployment or publication was performed.
