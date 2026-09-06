# Judique annotation placement pilot

**First pass completed September 6, 2026: 12 candidate areas, eight reviewed printed-symbol anchors, four unresolved mill groups, and provincial record candidates for all three mines. Zero confirmed historical site pins.**

Open [the illustrated review](review.html) for same-extent historical/modern comparisons, native source excerpts, and links to the modern map. [The evidence data](pilot.json) contains the source pixels, search areas, reference IDs and remaining questions. The [lettered mill board](images/mill-board.jpg) distinguishes the three southern annotations from the separate Rory Chisholm's Brook mill.

This moves the selected annotations from transcription into geographic research. The areas are useful places to investigate; their centres are frozen-warp predictions, not independently measured site locations. The 133-entry transcription inventory remains unchanged, with null historical-site geometry throughout. No production layer, source control point, theme, or app behaviour changed.

## Results

| Annotation | Source-symbol result | Geographic result |
| --- | --- | --- |
| 004 School | Supported mark | Road/stream corridor recognized; changed through-road alignment prevents direct modern junction substitution. |
| 005 Forge | Supported mark | Two eastern tributaries and the coastal inlet constrain the locality; old road segment is absent from the reference. |
| 008 Stage Stables | Supported mark | Inlet, tributary mouths and island sequence constrain the coastal corridor; building footprint unresolved. |
| 015 R.C. Church | Supported mark | Locality constrained between two brooks. St. Andrew's is an institutional candidate; earlier church footprint unresolved. |
| 021 Mill, Rory Chisholm's Brook | Unresolved group | Brook bend sequence and diagonal road crossing constrain the locality; no individual mill mark selected. |
| 077 Mill (A) | Unresolved pond/mark group | Northeastern stream corridor recognized; label does not identify a precise dam or building. |
| 078 Mills (B) | Unresolved group | Western crossing and road bend recognized; plural mills not collapsed into one building. |
| 079 Mills (C) | Unresolved group | Eastern crossing/building cluster recognized; individual facilities unresolved. |
| 061 Gold Mine | Supported overprinted mark | Candidate Melford district record cluster: MODB F14-015 and AMO MAU-1-001. |
| 094 Gold Mine | Supported oval mark | Candidate Cameron's Mountain/Glendale Brook cluster: MODB F14-017 and AMO GBG-1-001. |
| 103 Plumbago Mine | Supported isolated mark | Candidate AMO graphite pit GLM-1-001; a different graphite complex farther north is not adopted. |
| 117 Red Bridge | Supported printed road/river crossing | River reach and crossing corridor recognized; historical bridge identity has not been linked to a present crossing. |

The strongest new independent leads are the mine records. [AMO](https://novascotia.ca/natr/meb/download/dp010.asp) describes individual openings; [MODB](https://novascotia.ca/natr/meb/download/dp002.asp) describes mineral occurrences, sometimes with several representative points for one occurrence number. These remain separate objects in [mining-records.json](mining-records.json). The Glendale shaft's `xy_sources` is GPS; its quality code `10` is preserved without interpreting it as metres. Record precision does not prove its correspondence with the Fletcher mark.

For Plumbago Mine, no MODB graphite point was returned in the bounded 2.5 km search. The MacColls Brook occurrence F14-018 and D.J. Beaton opening cluster lie roughly 4.76 km from the initial guide and are not adopted merely because of the commodity/name. The nearby GLM-1-001 pit is the better lead. [Search receipts and limitations](mining-search.json) retain this distinction. Noninteractive Gesner report pages returned empty shells; no historical narrative was inferred from them.

The [parish-maintained history](https://standrewsparishjudique.weebly.com/) describes two wooden churches before today's sandstone church. It does not establish an identical footprint. A present church address therefore does not replace annotation 015's historical location.

## What the pictures and coordinates mean

- **Native detail:** original 10815 × 7549 sheet coordinates, x right/y down, unrotated. A red broken crosshair marks an approximate printed-symbol centre; pink rectangles bound unresolved groups. These are source associations, not building footprints.
- **Paired comparison:** both panels have the same 3600 × 3600 EPSG:3857 metre extent and 800 × 800 display size, north up. This is approximately 2.5 km on the ground here. Grey is outside the frozen draft's supported clipping area.
- **Red search centre:** the source mark or unresolved group's centre passed through the frozen TPS. The lettering centre is no longer used for any of the 12 final guides.
- **Ochre box:** an operational search window, with a reviewer-selected half-width of 300–500 ground metres. It is not a site extent, statistical confidence interval, accuracy claim, or assurance that evidence cannot lie outside it.
- **Purple records:** official provincial point geometries, with record number and feature ID. Multiple points with one MODB occurrence number do not become multiple mines. They have not been snapped to Fletcher or adopted as Fletcher pins.
- **Modern context IDs:** the NSTDB features drawn in each extent, retained for reproducibility. This list is not a set of accepted individual control-point correspondences. Roads include driveways, tracks and trails; the simplified illustration does not classify them or imply access.

The final [locality review](locality-review.json) records both supporting topology and contradictory/changed details. Corridor recognition relies on branch order, neighbouring bends, shoreline relationships and road approaches visible in these references. It is a qualitative coordinator judgment. This pilot supplies no fresh independent geographic accuracy score.

## Frozen inputs and review ownership

The source is Fletcher sheet 19, Rumsey `RUMSEY~8~1~2644~290012`, list 3997.021. Its native scan SHA-256 is `8a6588e2029c433ac85e190c9e10d1b4cda7dbba555f7824cfe6c5960163d724`.

The [existing Judique draft](../visual-expansion/README.md) is reused unchanged: 39 controls and eight separate diagnostic checks, with check rows excluded from fitting. Its previously reported check errors are 20–94 ground metres, median 68 m. Those checks were used in diagnosis and are not fresh blind validation or per-annotation uncertainty. The 5 projected-metre raster cells are not 5 m site accuracy. Source, warp, observation and NSTDB hashes are checked before rendering.

NSTDB input acquisition requested `outSR=4326`; geometry arrays are longitude then latitude. The mining services also returned EPSG:4326 geometry. Their stored latitude/longitude attribute fields differ slightly from returned geometry after service transformation; both are retained and clearly named, and only returned geometry is plotted. Product metadata versions and individual record extraction/version fields are kept distinct.

Sol workers handled bounded printed-mark proposals and official-record lookup. The coordinator reviewed the geography and native crosshairs. [Worker source proposals](source-worker-proposals.json) are retained separately from [the final source review](source-review.json): the coordinator corrected offsets, rejected a road/brook junction as an individual mill, and identified two mine marks omitted from worker proposals. Delegation is useful for preparation and retrieval; these results do not support unattended placement acceptance. The separate [DeepSeek geographic benchmark](../deepseek-georeferencing/README.md) also failed its geographic matching test, despite useful label-extraction results.

## Assembly line after this pilot

1. Transcribe exact wording and its source rectangles; keep extraction confidence separate.
2. Inspect the printed mark or bound the unresolved group; retain the original coordinate frame.
3. Generate a frozen-warp search guide and compare the surrounding physical topology.
4. Retrieve independent records and retain their source identities and coordinate meanings.
5. A coordinator accepts or rejects the linkage and chooses point, area, or unlocated display based on the evidence.

For this packet, the next useful work is site-specific historical corroboration: mine descriptions/plans, church-site evidence, old aerials and mill records. A local identification can narrow an annotation, but alone does not establish a surveyed historical footprint. Personal context is not part of the public research data.

## Rebuild and verification

Requires Pillow and GDAL CLI. Large source/reference files remain outside Git. Example with locally held inputs:

```sh
python3 reports/fletcher/placement-pilot/build_review.py \
  --source /path/to/native-sheet19/sheet19.png \
  --raster /path/to/judique-sheet19-draft.tif \
  --references /path/to/fletcher-matching-benchmark
python3 reports/fletcher/placement-pilot/verify_review.py
python3 -m unittest discover -s tools/fletcher/tests
```

The verifier checks IDs, unchanged source wording and null inventory/site geometries, source bounds, search polygon validity, coordinate provenance and artifact hashes. When locally archived mining responses exist it checks their hashes and returned geometry; those raw inputs are optional for a fresh checkout. The builder separately checks the full native scan, frozen raster and modern reference hashes. These mechanical checks do not prove historical-site identity.

The raw mining responses and enlarged coordinator audit crops are archived locally under `~/Downloads/fletcher-placement-pilot-20260906/`; repository mining data selects the fields needed for correspondence, without republishing unrelated site-condition or ownership attributes.

## Attribution

Historical imagery: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**. [Collection terms](https://www.davidrumsey.com/about/copyright-and-permissions), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) and [scoped project permission](../INVENTORY.md). Cropping, annotation and frozen georeferencing are project changes. The software's MIT licence does not replace imagery terms.

Modern reference data: Province of Nova Scotia, NSTDB and the separately identified provincial mining products. This is research evidence and establishes no present condition, operation, ownership or access.
