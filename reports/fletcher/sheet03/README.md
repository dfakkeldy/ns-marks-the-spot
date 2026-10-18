# Fletcher Sheet 3 — provisional full-sheet georeferencing

**Draft / whole-sheet geography unaccepted.** The two fresh northeastern checks pass the 100 m median / 200 m worst numerical limits: median **81.364536843 m**, worst **98.211068156 m**. Their limited distribution does not validate the full sheet. Actual raster review shows substantial displacement in northern, interior and eastern regions, with unresolved southern joins. Production eligibility is false. Seven controls remain unchanged after the initial freeze; there was no repair or promotion.

## Source, complete extent and reference

The [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2628~280042/manifest) identifies Sheet 3, `RUMSEY~8~1~2628~280042`, native 10668 × 7613. All 24 acquired regions passed assembled-pixel parity. PNG SHA `1dd5a8cc142b452fc594b6ab53d0eb94de24e1435fed25da61d8f3cf03a9a413`. [source-receipt.json](source-receipt.json) retains source, TIFF and manifest hashes and the manifest's null licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). CC BY-NC-SA 3.0 requires attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field remains distinct from the permission record. These derivatives are georeferenced and annotated; imagery is not relicensed under repository MIT terms. Hosting clearance is separate.

The native overview, four corners, coordinate labels, left-frame end, southwest extension and red boundary were personally inspected. The continuous ring retains the complete mapped frame, broad western sea, interior legend, North Pond islands and offshore rocks, plus the southwest **Fishing Cove / White Capes extension and labels**. Unsupported areas remain visible; no control-hull clipping. Boundary SHA `3956eff0f13aba1316eed2e8df40d36fb3429138e4e356f3a1a7be10739a547b`. Original full source remains available externally.

The two original grid-only files remain unchanged; no prior physical packet was found in the recorded search scope ([prior-state.json](prior-state.json)). Eight prior slanted crossings at 60°45′–60°30′ W and 46°55′/46°50′ N are search guidance only. Native latitude and outer retained longitude labels were rechecked; individual crossings were not remeasured. [guide-audit.json](guide-audit.json) retains the earlier source encoding hash.

NSTDB bbox −60.90, 46.77, −60.42, 46.99 returned 844 roads, 6,225 water lines and 2,504 water polygons. Rail returned empty (0), not evidence of absence. [reference-receipts.json](reference-receipts.json) preserves source URLs, dates, counts and hashes. Five native/modern regional pairs and the modern node index are in [matching-context](matching-context/).

## Identity review and frozen experiments

Original and corrected proposal stages remain separate. All corrections preceded fitting. C01 moved onto the Fishing Cove / South Fishing Cove junction. C02 and C03 moved onto Grande Anse's MacIntosh and Sugar Brook junctions, respectively; their order and branching support identity despite simplified channels. C04 moved onto Red River's Eastern Brook junction; the road overprint and river-bank width add uncertainty. C05 and C06 moved onto Grays Hollow's North Branch and Southwest Branch junctions. C07 moved onto Wilkie's western tributary; the downstream bend and sequence of eastern tributaries support local identity. Historical widths, branch lengths and meanders differ, with 20 native pixels recorded uncertainty.

C08 and C09 remain rejected and unscored. Both initial North Aspy proposals fell on report lettering rather than a river; wider inspection did not establish the intended Little Southwest / MacGregor junctions. Their original pixels, world identities and rejection reasons are preserved.

Seven controls were frozen at SHA `2325f9159275e4a03f19c3a1e7189b26322e11fa4f600ed161dcf36cfa1f8422` before diagnostics. Q01 is North Branch / Whiskey Den Brook; Q02 is Fishing Cove River's shoreline mouth. Exact native and modern close/wide frames were personally inspected before scoring. The mouth has additional bank-width and shoreline-detail uncertainty.

| Same two initial diagnostics | Median ground m | Worst ground m |
|---|---:|---:|
| Affine | 408.340049176 | 482.973966937 |
| TPS | 78.803046402 | 102.964389035 |

Q01 error is 102.964389035 m; Q02 is 54.641703769 m. These are limited initial diagnostics. [final-freeze.json](final-freeze.json) records the unchanged fit before new validation; `final-fit.json` and `reviewed-fit.json` are byte-identical. Initial diagnostics are never relabelled fresh.

Fresh V01 is Wilkie's first eastern tributary upstream of C07; V02 is North Branch's eastern tributary below Whiskey Den. Native crosshairs and modern close/wide context were inspected before scoring. Relative branch order supports the local matches; tributary lengths differ.

| Fresh check | Ground error m |
|---|---:|
| V01 | 98.211068156 |
| V02 | 64.518005529 |

The fit and all check coordinates remain unchanged after scoring. All **33 point frames** were personally inspected; [frame-verification.json](frame-verification.json) checks metadata against preserved-stage coordinates. Pending-review language in immutable candidate files describes their creation stage, not the final review status.

## Deliverables and rendered evidence

- [Editable controls](sheet-03-controls.csv): 7 controls.
- [Diagnostic review CSV](sheet-03-diagnostic-review.csv): controls plus 2 initial checks.
- [Fresh validation CSV](sheet-03-validation-review.csv): controls plus 2 fresh checks. Checks do not constrain fitting.
- Complete external GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet03/regional-seven/sheet-03-full-sheet.tif`, 10050 × 6312 RGBA, SHA `86f27229ea21c2e36d822be8f9871c16241a28bb1b4daa8abd7ec2761eaed951`.
- Native image: `/Users/dfakkeldy/Downloads/fletcher-sheet03/native/sheet03.png`. Large sources, reference GeoJSON and GeoTIFFs remain outside Git.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the full raster. Coverage found 50,374,176 interior cells with zero alpha holes. All 73,201 sampled Jacobians have the expected negative sign. These establish rendering integrity, not geographic acceptance.

The actual web CSV parser semantically round-trips all three files; maximum web/GDAL prediction difference is 6.51925802231e-09 projected metres. Actual My Maps GeoTIFF import, desktop reload and mobile viewing succeeded in isolated Chromium. Stored raster bytes/hash, georeference, dimensions, transparency and enabled state survived reload. There were no console/page errors. All three screenshots were personally inspected; external evidence paths and hashes are in [browser-verification.json](browser-verification.json). This is local verification, not deployment.

Eight actual raster views were personally inspected. Fishing Cove fits locally at its junction and mouth, but the coastline, White Capes and MacKenzies drainage differ away from them. Grande Anse's fitted junctions are locally closer; upstream MacIntosh and nearby drainage diverge. Red River's lower junction is locally closer, while its upper drainage and Otter Brook are displaced. Blair River, Pollets/Poulet Cove and the northern coast show substantial displacement. Grays/North Branch fit locally at controls but upper western branches and the North Aspy channel differ. Wilkie is closer locally, but its upper/lower geometry, Zwicker Brook and North Pond's shoreline/islands disagree. The southeastern Aspy drainage and Chain Lakes remain unsupported and displaced. Broad western sea remains extrapolation.

Three actual adjacent comparisons were inspected: two along southern Sheet 5 and one between the southwest extension and northeastern Sheet 6. Boundary placement has gaps or differing tilt; river continuations and coastal placement do not establish accepted seams. Sheet 6's portion is a southwest extension comparison, not a claim that its full northern edge directly adjoins Sheet 3. Eastern Sheet 2 and northern Sheet 1 remain outstanding.

## Handoff

Keep Sheet 3 fail-closed. Preserve the frozen seven-control fit, local passing checks, rejected proposals and complete extension. Obtain supported northern, interior and southeastern identities and distributed independent checks, resolve North Aspy and North Pond, and inspect the remaining Sheet 2/1 joins. Freeze any repair before collecting new independent validation; existing checks then become diagnostics.

Local provenance, raster coverage, CSV and actual browser checks passed. Fresh numerical thresholds passed only for two local checks; **whole-sheet geographic acceptance failed**. Hosted CI is reported separately on the PR. Shared render/score/coverage and web code remain unchanged. No merge, deployment or publication was performed.
