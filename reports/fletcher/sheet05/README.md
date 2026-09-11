# Fletcher Sheet 5 — provisional full-sheet georeferencing

**Draft / whole-sheet geography unaccepted.** Four fresh checks pass the numerical limits: median **80.706303340 m**, worst **117.235618843 m**, against 100 m median / 200 m worst. These local checks do not establish full-sheet coverage. Actual raster review shows substantial western and interior displacement, including Sunday Lake and upper Clyburn, and unresolved adjacent-sheet joins. Production eligibility remains false. No repair or check promotion was made; all eleven frozen controls remain unchanged.

## Source, extent and reference

The direct [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2630~280044/manifest) identifies Sheet 5, `RUMSEY~8~1~2630~280044`. The native raster is 10729 × 7623; all 24 downloaded regions passed assembled-pixel parity. PNG SHA-256 `10ce67bd1d08c5838cdb5891d17775c230bac69527619419d9520640034c2ac0`. [source-receipt.json](source-receipt.json) preserves TIFF and manifest hashes, attribution and the manifest's null licence field.

Credit: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. Existing scoped direct-source permission is documented in [the Fletcher inventory](../INVENTORY.md). The collection's CC BY-NC-SA 3.0 terms require attribution, noncommercial use, identification of changes and ShareAlike. The null manifest field is retained separately from that permission record. These derivatives are georeferenced and annotated; imagery is not relicensed under the repository MIT licence. Hosting clearance remains separate.

Native overview, all corners, coordinate labels and the complete red boundary were personally inspected. One continuous boundary retains the entire mapped interior land frame; no outside mapped extensions were identified. The exterior left legend remains in the native source. Unsupported mapped regions are not clipped to the control hull. Boundary SHA `62c74443d23941582bab32111700eee4f9f45a1229430d6f1f8fced04767e766`.

The two original grid-only files remain unchanged ([prior-state.json](prior-state.json)); no earlier physical Sheet 5 packet was found within the recorded search scope. Eight previously recorded slanted crossings at 60°45′–60°30′ W and 46°45′/46°40′ N guide search only. This pass checked both latitude labels and outer retained longitude labels on the native scan; it did **not** freshly measure every crossing. [guide-audit.json](guide-audit.json) preserves this distinction and the old encoding hash.

NSTDB bbox −60.88, 46.60, −60.43, 46.82 returned 369 roads, 15,407 water lines and 8,387 water polygons. Rail returned empty (0), which is not evidence of absence. [reference-receipts.json](reference-receipts.json) retains URLs, counts, dates and hashes. Four native/modern regional pairs and a stable node index are in [matching-context](matching-context/).

## Reviewed identities and frozen experiments

Original proposals and corrected stages remain distinct. All corrections below occurred before fitting or scoring:

- C01 moved onto the North Aspy / Big Southwest junction.
- C02 moved from a nearby lower fork to the named Black / Doherty confluence. C03 moved onto Black / Donovan; bank width adds placement uncertainty. C04 moved onto Black / Snipe.
- C05 moved onto Curtis / Dauphiney. C06 moved onto Clyburn / South Clyburn, with a nearby northern tributary retained in the context. C07 moved from land onto Clyburn / Curtis.
- C08 moved from the east bank onto Chéticamp / LeBlanc. C09 moved from upstream land onto Chéticamp / Artemise.
- C10 moved onto the northern river's eastern tributary, modern MacKenzies River. Local bend and upstream tributary order support the identity; historical and modern tributary lengths differ. The wider drainage is unaccepted.
- C11 moved onto Fishing Cove River's southwestern tributary. Initial J0713 was an eastern twig. Intermediate J0711 was a node-ID transcription error on Black Brook far east. Final J0710 has Fishing Cove segments 263339/263340 and southwestern tributary 179953. Both incorrect world stages are preserved; neither entered the fit or scored checks. Exact final close and wide frames were inspected before fitting.

All eleven controls were frozen at SHA `f04cbd3f80ff7361bf6d719f0989834dfa4cc9833242f0c18f6ffed1f2e80db9` before the diagnostic checks. Q01, a proposed upper Clyburn northern tributary, remains rejected and unscored: the historical branch arrangement and proposed modern J1879 did not establish the same junction. Q02 moved onto Fishing Cove's short western tributary just north of C11. Q03 moved onto Chéticamp's eastern tributary north of Artemise; its modern arm is longer and divided. The two reviewed diagnostic checks gave:

| Initial experiment, same 2 checks | Median ground m | Worst ground m |
|---|---:|---:|
| Affine | 562.933877620 | 683.230345645 |
| TPS | 75.950499174 | 133.868271228 |

Q02 is 18.032727119 m away and Q03 is 133.868271228 m away. Their aggregate TPS result passes the numerical limits but covers only small western areas. [final-freeze.json](final-freeze.json) records the unchanged eleven-control freeze before collecting four fresh checks. There was **no repair and no promotion**. `final-fit.json` is a byte-identical copy of `reviewed-fit.json`, SHA `f04cbd3f80ff7361bf6d719f0989834dfa4cc9833242f0c18f6ffed1f2e80db9`. The two initial checks remain separate diagnostics and are not counted as fresh validation.

Fresh V01 uses a western North Aspy tributary southwest of Big Southwest; its native pixel stayed unchanged. V02 moved onto Black River's eastern tributary between Snipe and Doherty. V03 moved from the branch onto Donovan's eastern tributary upstream of Black. V04 moved from upstream onto Dauphiney's eastern tributary above Curtis. Local tributary order supports the correspondences, while lengths and extra branches differ. All exact final crosshairs were personally inspected before scoring.

| Fresh ID | Feature | Ground error m |
|---|---|---:|
| V01 | North Aspy River western tributary southwest of Big Southwest Brook | 77.178230644 |
| V02 | Black Brook eastern tributary between Snipe and Doherty brooks | 84.234376037 |
| V03 | Donovan Brook eastern tributary upstream of Black Brook | 117.235618843 |
| V04 | Dauphiney Brook eastern tributary upstream of Curtis Brook | 51.527019694 |

Fifty-five point frames were personally inspected, including original, wide and corrected stages. [frame-verification.json](frame-verification.json) checks every figure's metadata against the exact preserved-stage coordinates. Pending-review wording in immutable candidate records describes the stage when those records were created; the later visual review receipt records completed inspection. Native uncertainty is recorded as 20 pixels, with additional bank and historical-geometry limitations.

## Deliverables and verification

- [Control CSV](sheet-05-controls.csv): 11 editable controls.
- [Diagnostic CSV](sheet-05-diagnostic-review.csv): the same controls plus 2 initial checks.
- [Fresh validation CSV](sheet-05-validation-review.csv): the same controls plus 4 fresh checks. Check rows do not constrain fitting.
- Complete local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet05/regional-eleven/sheet-05-full-sheet.tif`, 8558 × 5697 RGBA, SHA `edda68be62add08f293ec6fba64bad9dc40678e12f97114aaa92271e9598269b`.
- Native source: `/Users/dfakkeldy/Downloads/fletcher-sheet05/native/sheet05.png`. Large native imagery, reference GeoJSON and GeoTIFF bytes remain outside Git; the packet preserves paths and hashes.

One exact GDAL TPS (`-et 0`), cubic resampling, EPSG:3857 and 5 projected metre cells produced the raster. Coverage found 45,441,550 interior cells and **zero alpha holes**. All 71,533 sampled Jacobians have the expected negative sign (native y points down). These are rendering checks, not geographic acceptance.

The actual web CSV parser semantically round-trips all three files. Web/GDAL predictions differ by at most 5.89020114423e-09 projected metres. The actual GeoTIFF was imported through My Maps in isolated Chromium, reloaded on desktop and viewed on mobile. Stored bytes/hash, georeference, dimensions, transparency and enabled state survived reload. No console or page errors were recorded. All three screenshots were personally inspected; [browser-verification.json](browser-verification.json) preserves their external paths and hashes. This is local proof, not deployment.

Nine actual warped-raster frames were personally inspected. Local fitted forks are closer, but Fishing Cove and MacKenzies diverge away from them. North Aspy / Big Southwest meanders and upstream reaches differ. Black's local junctions are closer, while distant Lake of Islands and tributary paths remain unsupported. Sunday Lake and its headwaters are displaced. Upper Clyburn and Midlake differ substantially despite locally closer lower Clyburn/Curtis forks. Chéticamp's western main reach is locally closer, but intervening bends and tributaries disagree. The southern interior and eastern brook paths remain displaced. Chéticamp Flowage is a later reservoir: modern shoreline differences cannot all be attributed to registration error, and no reservoir shoreline was used as a control or check. See [reservoir-caution.md](reservoir-caution.md) for primary-source context.

Four actual comparisons with western Sheet 6 and southern Sheet 8 were personally inspected. Western interior streams disagree and northern edge placement differs. Chéticamp is locally closer at the western southern junction, but this does not establish the surrounding seam. The Sheet 8 comparisons show differing boundary placement and gaps with unsupported stream continuation. No seam is accepted. Northern Sheet 3 and eastern Sheet 4 remain to be compared. Shared render/score/coverage and web code remain unchanged.

## Handoff

Keep Sheet 5 fail-closed despite its passing local point statistics. Establish additional western/interior identities, distinguish historical drainage changes from registration, and compare the northern/eastern sheets. Preserve the eleven-control fit, all incorrect proposals, rejected Q01 and every score. Freeze any further repair before collecting new independent checks; existing checks cannot then be called fresh. Retain the complete mapped frame.

Local provenance, parser, raster coverage and browser verification passed. Four fresh point checks pass numerically; whole-sheet geographic acceptance remains unaccepted. Hosted CI is reported separately on the PR. No merge, deployment or publication was performed.
