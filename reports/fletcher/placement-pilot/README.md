# Judique annotation placement pilot

**Source-derived placement, September 6, 2026: eight approximate points and four group areas exported from reviewed marks on the original sheet. Another 121 transcribed annotations await source-mark review.**

Download [mapped-annotations.geojson](mapped-annotations.geojson) and load it through the web map's shared file drop zone (it appears under Your data). The [mapping queue](mapping-queue.json) retains the remaining IDs and original label rectangles. Teal marks in the comparison panels show the exported geometry. This is a research preview using Judique's supported-area draft, not a fully accepted sheet or surveyed historical-site layer.

**Road-context correction (September 6):** the initial comparison loaded NSTDB Roads (layer 8) but omitted Highways (7) and Bridges (5). The corrected panels include both, with Highway 19 highlighted and labelled. Earlier missing/shifted through-road conclusions for the school, forge and church are withdrawn. The modern highway supports the historic coastal-road comparison; local offsets still do not distinguish actual realignment from map/warp error.

Open [the illustrated review](review.html) for same-extent historical/modern comparisons, native source excerpts, and links to the modern map. [The evidence data](pilot.json) contains the source pixels, search areas, reference IDs and remaining questions. The [lettered mill board](images/mill-board.jpg) distinguishes the three southern annotations from the separate Rory Chisholm's Brook mill.

This transfers reviewed printed feature marks into modern coordinates through the frozen sheet transform. Distinct symbols become approximate points; ambiguous groups become transformed source-region outlines. No per-site historical record is required for this map-derived placement. The separate larger search windows remain research aids. The 133-entry transcription inventory remains unchanged, with null historical-site geometry throughout. No production layer, source control point, theme, or app behaviour changed.

## Results

| Annotation | Source-symbol result | Geographic result |
| --- | --- | --- |
| 004 School | Supported mark | Road/stream corridor recognized with Highway 19 restored; exact school-site/junction linkage unresolved. |
| 005 Forge | Supported mark | Two eastern tributaries, coastal inlet and restored Highway 19 constrain the locality; the road is present. |
| 008 Stage Stables | Supported mark | Inlet, tributary mouths and island sequence constrain the coastal corridor; building footprint unresolved. |
| 015 R.C. Church | Supported mark | Locality constrained between two brooks. A 1968 history supports rebuilding St. Andrew's on its predecessor's site; exact footprint unresolved. |
| 021 Mill, Rory Chisholm's Brook | Unresolved group | Brook bend sequence and diagonal road crossing constrain the locality; no individual mill mark selected. |
| 077 Mill (A) | Unresolved pond/mark group | Northeastern stream corridor recognized; label does not identify a precise dam or building. |
| 078 Mills (B) | Unresolved group | Western crossing and road bend recognized; 1892 district account names Alex. and Donald Chisholm's mills, without assigning either to B. |
| 079 Mills (C) | Unresolved group | Eastern crossing/building cluster recognized; individual facilities unresolved. |
| 061 Gold Mine | Supported overprinted mark | Candidate Melford district record cluster: MODB F14-015 and AMO MAU-1-001. |
| 094 Gold Mine | Supported oval mark | Candidate Cameron's Mountain/Glendale Brook cluster: MODB F14-017 and AMO GBG-1-001; user visually corroborated the displayed locality on September 6. |
| 103 Plumbago Mine | Supported isolated mark | Candidate AMO graphite pit GLM-1-001; a different graphite complex farther north is not adopted. |
| 117 Red Bridge | Supported printed road/river crossing | River reach and crossing corridor recognized; historical bridge identity has not been linked to a present crossing. |

The strongest new independent leads are the mine records. [AMO](https://novascotia.ca/natr/meb/download/dp010.asp) describes individual openings; [MODB](https://novascotia.ca/natr/meb/download/dp002.asp) describes mineral occurrences, sometimes with several representative points for one occurrence number. These remain separate objects in [mining-records.json](mining-records.json). The Glendale shaft's `xy_sources` is GPS; its quality code `10` is preserved without interpreting it as metres. Record precision does not prove its correspondence with the Fletcher mark.

For Plumbago Mine, no MODB graphite point was returned in the bounded 2.5 km search. The MacColls Brook occurrence F14-018 and D.J. Beaton opening cluster lie roughly 4.76 km from the initial guide and are not adopted merely because of the commodity/name. The nearby GLM-1-001 pit is the better lead. [Search receipts and limitations](mining-search.json) retain this distinction. Noninteractive Gesner report pages returned empty shells; no historical narrative was inferred from them.

The [1968 history by Janette MacDonald](https://epe.lac-bac.gc.ca/100/205/301/ic/cdc/celtic/judrel.htm?nodisclaimer=1) explicitly places the stone church where its predecessor stood. This supports site continuity for annotation 015, while exact foundations remain unresolved. The wooden church's completion date is disputed (1879 in MacDonald; 1860 in the Participaper). [Historical-record findings](historical-records.md) retain this conflict and the new Long Point mill-name lead.

## What the pictures and coordinates mean

- **Native detail:** original 10815 × 7549 sheet coordinates, x right/y down, unrotated. A red broken crosshair marks an approximate printed-symbol centre; pink rectangles bound unresolved groups. These are source associations, not building footprints.
- **Paired comparison:** both panels have the same 3600 × 3600 EPSG:3857 metre extent and 800 × 800 display size, north up. This is approximately 2.5 km on the ground here. Grey is outside the frozen draft's supported clipping area.
- **Teal mapped geometry:** the reviewed symbol point or source-group outline passed through the frozen TPS. Group edges are sampled at intervals no greater than 10 native pixels before transformation. The area bounds ambiguous printed marks, not the historical property, mill grounds or positional error. Lettering centres and operational search windows never become exported feature geometry.
- **Ochre box:** an operational search window, with a reviewer-selected half-width of 300–500 ground metres. It is not a site extent, statistical confidence interval, accuracy claim, or assurance that evidence cannot lie outside it.
- **Purple records:** official provincial point geometries, with record number and feature ID. Multiple points with one MODB occurrence number do not become multiple mines. They have not been snapped to Fletcher or adopted as Fletcher pins.
- **Modern context IDs:** the NSTDB features drawn in each extent, retained for reproducibility. This list is not a set of accepted individual control-point correspondences. Roads include driveways, tracks and trails; the illustration distinguishes highway/bridge context but does not establish access. Highway 19 is identified from the provincial `RTE_NO=19` attribute, not inferred from geometry.

The final [locality review](locality-review.json) records both supporting topology and contradictory/changed details. Corridor recognition relies on branch order, neighbouring bends, shoreline relationships and road approaches visible in these references. It is a qualitative coordinator judgment. This pilot supplies no fresh independent geographic accuracy score.

## Frozen inputs and review ownership

The source is Fletcher sheet 19, Rumsey `RUMSEY~8~1~2644~290012`, list 3997.021. Its native scan SHA-256 is `8a6588e2029c433ac85e190c9e10d1b4cda7dbba555f7824cfe6c5960163d724`.

The [existing Judique draft](../visual-expansion/README.md) is reused unchanged: 39 controls and eight separate diagnostic checks, with check rows excluded from fitting. Its previously reported check errors are 20–94 ground metres, median 68 m. Those checks were used in diagnosis and are not fresh blind validation or per-annotation uncertainty. The 5 projected-metre raster cells are not 5 m site accuracy. Source, warp, observation and NSTDB hashes are checked before rendering. Later [boundary checks](../judique-boundary/README.md) failed full-sheet acceptance: the southern outlet was 513 ground metres off; the seven inside-hull checks had median/worst errors of 94/181 m. All twelve pilot features lie wholly inside the existing control hull, which limits extrapolation but does not establish accuracy everywhere. Sheet 22 also failed acceptance and is not included in this export. [Supplemental road-context receipts](road-context-receipts.json) cover 156 highway features (95 Route 19) and 139 bridge features (10 Route 19) in the original envelope. They augment this pilot only; the frozen benchmark reference receipts and fitted draft remain unchanged.

NSTDB input acquisition requested `outSR=4326`; geometry arrays are longitude then latitude. The mining services also returned EPSG:4326 geometry. Their stored latitude/longitude attribute fields differ slightly from returned geometry after service transformation; both are retained and clearly named, and only returned geometry is plotted. Product metadata versions and individual record extraction/version fields are kept distinct.

Sol workers handled bounded printed-mark proposals and official-record lookup. The coordinator reviewed the geography and native crosshairs. [Worker source proposals](source-worker-proposals.json) are retained separately from [the final source review](source-review.json): the coordinator corrected offsets, rejected a road/brook junction as an individual mill, and identified two mine marks omitted from worker proposals. Delegation is useful for preparation and retrieval; these results do not support unattended placement acceptance. The separate [DeepSeek geographic benchmark](../deepseek-georeferencing/README.md) also failed its geographic matching test, despite useful label-extraction results.

## Source-derived assembly line

1. Extract exact wording and label rectangles in the original scan frame.
2. Revisit the native scan and identify the actual symbol, feature line or bounded group. Leave an unresolved association unlocated rather than falling back to its lettering centre.
3. Transform that reviewed source geometry through the sheet's existing alignment. Sample area edges for curved transforms. Reject failed alignments and geometry outside supported coverage.
4. Check the result visually against modern geography and retain the alignment status, source coordinates, hashes and approximate-placement meaning.
5. Export points, lines or areas as appropriate. Historical records and local knowledge can improve the interpretation without blocking ordinary map-derived annotations.

The current implementation covers the pilot's points and bounded groups. Roads and brooks in the remaining queue still need source-line tracing; their label boxes must not become point locations. Source-mark review can continue while other sheets' alignment is repaired. Correcting the sheet transform later allows all attached annotations to be regenerated from their retained native coordinates.

`tools/fletcher/annotation_placement.py` supplies the point/group conversion used by the existing builder. It never changes controls, snaps to modern references or assigns a name from a nearby record. The source-review file retains its original distinction between supported individual marks and unresolved groups. Personal context is not part of the public research data.

## Rebuild and verification

Requires Pillow and GDAL CLI. Large source/reference files remain outside Git. Supplemental highway/bridge files live beside the original references. To acquire a new supplemental snapshot, run `python3 reports/fletcher/placement-pilot/fetch_road_context.py --out /path/to/fletcher-matching-benchmark`; this records a new dated receipt and does not alter the original four reference files. Example rebuild with locally held inputs:

```sh
python3 reports/fletcher/placement-pilot/build_review.py \
  --source /path/to/native-sheet19/sheet19.png \
  --raster /path/to/judique-sheet19-draft.tif \
  --references /path/to/fletcher-matching-benchmark
python3 reports/fletcher/placement-pilot/verify_review.py
node reports/fletcher/placement-pilot/verify_geojson_import.mjs
python3 -m unittest discover -s tools/fletcher/tests
```

The verifier checks eight exported points, four transformed group areas, and the 121-item remaining queue separately from the null historical-site geometries. It also requires the highway and bridge layers and Route 19 coverage in the coastal comparisons, then checks IDs, unchanged source wording and null inventory/site geometries, source bounds, search polygon validity, coordinate provenance and artifact hashes. When locally archived mining responses exist it checks their hashes and returned geometry; those raw inputs are optional for a fresh checkout. The builder separately checks the full native scan, frozen raster and modern reference hashes. The Node check uses the actual web GeoJSON parser and verifies that feature IDs, geometries and provenance survive import. It requires Node with `stripTypeScriptTypes`; this is parser verification, not a browser storage/render test. These mechanical checks do not prove historical-site identity.

The raw mining responses and enlarged coordinator audit crops are archived locally under `~/Downloads/fletcher-placement-pilot-20260906/`; repository mining data selects the fields needed for correspondence, without republishing unrelated site-condition or ownership attributes.

## Attribution

Historical imagery: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. [Collection terms](https://www.davidrumsey.com/about/copyright-and-permissions), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) and [scoped project permission](../INVENTORY.md). Cropping, annotation and frozen georeferencing are project changes. The software's MIT licence does not replace imagery terms.

Modern reference data: Province of Nova Scotia, NSTDB and the separately identified provincial mining products. This is research evidence and establishes no present condition, operation, ownership or access.
