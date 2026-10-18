# Fletcher Sheet 4 — provisional full-sheet georeferencing

**Draft / geographically unaccepted.** Three fresh checks fail the 100 m median / 200 m worst limits: median **125.757995703 m**, worst **219.577753759 m**. Actual raster review also shows displaced northern and interior drainage, differing harbour details, and unresolved adjacent-sheet joins. Production eligibility is false. All eight frozen controls remain unchanged; no repair or check promotion was performed.

## Source, extent and reference

The direct [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2629~280043/manifest) identifies Sheet 4, `RUMSEY~8~1~2629~280043`. Native dimensions are 10629 × 7603; all 24 downloaded regions passed assembled-pixel parity. PNG SHA-256 `6f6a3436e048c23cc5c8d8aef1382be9803801bac401c2cdae285e0ed30399cf`. [source-receipt.json](source-receipt.json) preserves TIFF and manifest hashes, attribution and the manifest's null licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). The collection's CC BY-NC-SA 3.0 terms require attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field remains separate from that permission record. These derivatives are georeferenced and annotated; imagery is not relicensed under the repository MIT licence. Hosting clearance is separate.

The native overview, four corners, coordinate labels and full red boundary were personally inspected. A continuous ring retains the complete mapped frame, including the broad eastern sea, interior legend, Ingonish Island and offshore rocks. No mapped extension outside this frame was identified. Unsupported areas remain present; there is no control-hull clipping. Boundary SHA `2856d3476dfe640644cd10bafbd6151447833b2d1d44c895c29b015b1ff2ed15`.

The two original grid-only files remain unchanged ([prior-state.json](prior-state.json)); no earlier physical Sheet 4 packet was found in the recorded search scope. Eight Cartesian crossings reconstructed from prior meridian/parallel coordinates at 60°25′–60°10′ W and 46°45′/46°40′ N provide approximate search guidance only. This pass checked the native latitude and outer longitude labels; it did **not** remeasure each crossing. [guide-audit.json](guide-audit.json) retains this distinction and the earlier encoding hash.

NSTDB bbox −60.50, 46.60, −60.02, 46.83 returned 894 roads, 2,462 water lines and 996 water polygons. Rail returned empty (0), which is not evidence of absence. [reference-receipts.json](reference-receipts.json) records source URLs, counts, dates and hashes. Three native/modern regional pairs and the stable node index are in [matching-context](matching-context/).

## Reviewed identities and frozen experiments

Original proposals, corrected stages and rejections remain separate. Corrections occurred before fitting/scoring:

- C01 moved onto the northern-bank Black / historical Pine Brook junction. Tributary length and bank width remain limitations.
- C02 moved onto Mary Ann Brook's western tributary. Its position relative to Black and the next upstream western branch supports the local identity; branch lengths differ.
- C03 moved from adjacent land onto Warren Lake's eastern outlet. C04 moved from the small southern peninsula onto the northern inlet. The lake outline and upstream tributary arrangement differ.
- C05 moved from the northern arm onto Cameron Brook's junction. Northern/southern tributary order supports the correspondence, while historical arms are shorter.
- C07 moved from sea onto Archibald Point / Red Head's eastern extremity. The historical rounded outline differs from the detailed modern coast.
- C08 initially used offshore rock 21509. It was corrected to the northernmost vertex of the connected Ingonish Island shoreline seeded at 17782 (component 17780, 17781, 17782, 17819), and the native point moved to its northern lobe. Both exact corrected close and wide frames were inspected.
- C10 initially used offshore rock 20224. It was corrected to mainland coast WACO20 object 10612, vertex 22, behind that rock, and the native pixel moved to the eastern extremity of the rounded Smoky Cape headland. Fine shoreline differences remain explicit.
- C06 is rejected and unscored: the proposed historical northern Clyburn tributary meets or is obscured by the road before reaching the river; exact branch order is unestablished. C09 is rejected and unscored: the selected modern tip belongs to coastal island 22540, whereas the historical target is attached Middle Head. No historical shoreline-change explanation was assumed.

Eight controls were frozen at SHA `36e898f50cd6980892c46d66ca41e61de8142f248a7b66c44e30844454daf877` before diagnostics. Q01 moved onto Cameron's southern tributary immediately east of C05. Q02 moved onto Warren Brook's northwestern lake inlet. Q03 remains rejected and unscored: its initial native pixel was offshore on the Mill label, and the exact Freshwater Lake outlet through the overprinted barrier was not established.

| Initial experiment, same 2 checks | Median ground m | Worst ground m |
|---|---:|---:|
| Affine | 131.422246180 | 228.182699782 |
| TPS | 51.534669208 | 76.578308978 |

Q01 is 26.491029438 m away and Q02 is 76.578308978 m away. The TPS diagnostics pass numerically but cover only two small areas. [final-freeze.json](final-freeze.json) records the unchanged eight-control freeze before fresh validation. `final-fit.json` and `reviewed-fit.json` are byte-identical, SHA `36e898f50cd6980892c46d66ca41e61de8142f248a7b66c44e30844454daf877`. There was no repair or promotion. Initial checks remain diagnostics, separate from fresh validation.

Fresh V01 moved onto Pine Brook's nearest northern tributary upstream of Black; local branch order supports the match, while the modern arm is much longer. V02 moved onto the southernmost Ingonish Island shore, using the same verified island component but a different vertex from C08; its broad historical outline adds uncertainty. V03 moved onto Cameron's southern tributary west of C05. Exact final crosshairs were inspected before scoring. Fresh proposal V04 is rejected and unscored: the initial pixel lies on land at the McKinnon label and the historical short southern branches do not establish the proposed modern Ingonish western-arm confluence.

| Fresh ID | Feature | Ground error m |
|---|---|---:|
| V01 | Historical Pine Brook northern tributary upstream of Black Brook | 219.577753759 |
| V03 | Cameron Brook southern tributary west of C05 | 125.757995703 |
| V02 | Ingonish Island southernmost shoreline | 123.559906294 |

All fresh scores and coordinates remain unchanged after scoring. Forty-nine point frames were personally inspected, including original, wide and corrected stages. [frame-verification.json](frame-verification.json) checks every figure against its preserved-stage coordinates. Pending-review wording in immutable candidate records describes their creation stage; the later visual receipt records completed inspection. Native uncertainty is 20 pixels, with the additional shoreline, bank and historical-topology limitations above.

## Deliverables and verification

- [Control CSV](sheet-04-controls.csv): 8 editable controls.
- [Diagnostic CSV](sheet-04-diagnostic-review.csv): the same controls plus 2 initial checks.
- [Fresh validation CSV](sheet-04-validation-review.csv): the same controls plus 3 fresh checks. Check rows do not constrain fitting.
- Complete local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet04/regional-eight/sheet-04-full-sheet.tif`, 8691 × 5714 RGBA, SHA `e62f084f1bb73de336d9e1740337701812c5c607155ec689b7e6aed82b54dd10`.
- Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet04/native/sheet04.png`. Large native imagery, reference GeoJSON and GeoTIFF bytes stay outside Git; paths and hashes are retained.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the raster. Coverage found 47,309,533 interior cells and zero alpha holes. All 71,737 sampled Jacobians have the expected negative sign (native y points down). These verify rendering, not geography.

The actual web CSV parser semantically round-trips all three files. Web/GDAL predictions differ by at most 8.01153971538e-09 projected metres. Actual My Maps GeoTIFF import, desktop reload and mobile viewing succeeded in isolated Chromium. Stored bytes/hash, georeference, dimensions, transparency and enabled state survived reload; no console or page errors were recorded. All three screenshots were personally inspected. [browser-verification.json](browser-verification.json) records external evidence paths and hashes. This is local proof, not deployment.

Eight actual warped-raster views were personally inspected. Black Brook is locally closer near the fitted Pine junction, but Pine's upper drainage and Mary Ann / Black's downstream junction diverge. Black Point and adjacent shoreline differ. Warren Lake is locally closer near its controls; upper Warren, neighbouring streams and the northern pond differ. Archibald and the island's north tip fit locally; island and Jackson Point shorelines differ away from controls. Clyburn's channel/meanders and Middle Head differ. Freshwater Lake and Ingonish Harbour details are displaced or differently shaped. Smoky Cape fits locally at its control but the adjacent coast and southern drainage are unsupported. The broad eastern sea remains extrapolation.

Four actual adjacent comparisons were inspected. Western Sheet 5 has locally closer Black Brook continuation, but intervening and southern drainage disagree and boundary placement differs. Southern Sheet 7 has offset/tilted coast and interior placement. The fourth, sea-only comparison documents placement but supplies no physical geographic seam evidence. No seam is accepted. Northern Sheet 2 remains outstanding; the eastern area is sea. Shared render/score/coverage and web code remain unchanged.

## Handoff

Keep Sheet 4 fail-closed. Preserve the eight-control fit and failed fresh validation. Revisit Pine's local geometry, obtain supported southern/interior identities, resolve Middle Head and the historical outlet/river ambiguities, and compare northern Sheet 2. Freeze any further repair before collecting new independent checks; current checks cannot then be called fresh. Retain the entire mapped frame and all rejected identities.

Local provenance, parser, raster coverage and browser checks passed. Fresh numerical and whole-sheet geographic acceptance failed. Hosted CI is reported separately on the PR. No merge, deployment or publication was performed.
