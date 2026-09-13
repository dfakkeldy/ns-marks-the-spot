# Port Hawkesbury source-feature review

The first **30 of 301** annotations have source and geographic decisions. **26**
are integrated locally: 17 approximate marks and nine unresolved source groups.
Three northern marks are outside supported coverage; McMaster's Mill retains an
unresolved geographic prediction. The remaining 271 source associations are pending.
Eight Hawkesbury features merged in PR455; the next eighteen are locally verified.
The combined 152-record web export retains all 126 Judique annotations unchanged.

## Source and geography

[Input reconciliation](hawkesbury-input-reconciliation.json) verifies the original
10790 × 7687 scan, the actual boundary-fit raster and the independently pinned
28-control fit. Its SHA256 is
`e96a8934ae42cc6dbc079e69afebb743c05decf0a61f19ac24eb620be48c32ed`,
from nightly commit `a6619d96ba8fa8279ea6a8027654a92b15942b9d`.
The later PR448 packet describes reversible drafts and preserves downstream pins;
no experimental or rejected fit is adopted here.

[Source associations](sheet-22-source-review.json) retain actual native points
or candidate regions, separate from the unlocated original lettering inventory.
The [first source figure](hawkesbury-services-1-20260912.jpg) covers
001,002,004,008,023,025; the [second](hawkesbury-services-2-20260912.jpg) covers
026,028,031,032,041,042. Their frame receipts record native crop origins and display
sizes. Eight final point crosshairs were inspected at 4×. Ink components only aided
measurement: larger marks and a cross connected to lettering required direct review.
School 026's note explicitly distinguishes its road-and-watercourse corridor.

The [placement decisions](sheet-22-placement-review.json) use six paired scenes,
with the actual hash-verified raster and independent vectors at identical extents:

- [Craignish church and Highway 19](hawkesbury-craignish-church-geography.jpg)
- [Craignish school](hawkesbury-craignish-school-geography.jpg)
- [Northern Denys postal/mill district](hawkesbury-denys-north-services-geography.jpg)
- [McInnes Hill school](hawkesbury-mcinnes-hill-school-geography.jpg)
- [Askilton school and church](hawkesbury-askilton-services-geography.jpg)
- [Cape Jack school and postal groups](hawkesbury-cape-jack-services-geography.jpg)

[Reference receipts](hawkesbury-reference-receipts.json) cover the entire sheet
plus a margin: `-61.63,45.54,-61.18,45.78`. The four existing roads, rail and water
extracts retain their original hashes. Newly paged Highways 7 and Bridges 5 extracts
add 288 and 103 records, including 36 Highway 19 segments and one Highway 19 bridge.
Unique object IDs were checked. The northern Judique bbox is not substituted here.
The [geographic frame receipt](hawkesbury-geographic-review-frames.json) records
all drawn context IDs; they are not accepted control correspondences.

| Held annotation | Remaining requirement |
| --- | --- |
| 001 School / 002 Shop | Supported coverage for the actual northern marks. |
| 028 Church | Supported coverage for the cross near the northern neatline. |
| 025 McMaster's Mill | Reconcile the predicted candidate group with the brook, confluence and road crossing; do not substitute the spring or a convenient channel. |

The complete source geometry is preserved. The mill's computed geometry remains
in the [feature evidence](sheet-22-features.geojson), excluded from the web export.
Postal 023 retains its opposite modern road-side prediction, and Cape Jack's group
retains outlet-channel overlap. These limitations prevent exact current-site claims.
The Craignish church receives no coordinate correction from the separate Judique
church. Original readings, identifiers and image pixels remain unchanged.

The next three source figures add eighteen service, bridge and light reviews:

- [Services 3](hawkesbury-services-3-20260912.jpg): 005,030,045,046,053,055.
- [Services 4](hawkesbury-services-4-20260912.jpg): 056,057,058,061,064,067.
- [Services 5](hawkesbury-services-5-20260912.jpg): 047,068,070,073,077,084.

Their native source review was completed on September 12; geographic decisions
were recorded September 13. [The append receipt](hawkesbury-services-next-append-receipt.json)
retains initial measurements and final crosshair/group evidence. Long Stretch
Bridge uses the actual road/river crossing beside its caption, separate from
the railway and grid-patterned areas. School 061's distinct mark is partly
overprinted by a dotted geological boundary and retains increased source-pixel
uncertainty. The three lights use their actual radiating symbols; heights and
abbreviations remain historical source wording, not current navigation data.
Factory, shop, forge, hotel, postal and school groups preserve individual-feature
ambiguity and are not property or operating-facility boundaries.

Eleven further geographic comparisons cover these additions:

- [Craignish postal group](hawkesbury-craignish-postal-geography.jpg)
- [Long Stretch Bridge](hawkesbury-long-stretch-bridge-geography.jpg)
- [Northern Havre Bouche industry](hawkesbury-havre-north-industry-geography.jpg)
- [Southern Havre Bouche services](hawkesbury-havre-south-services-geography.jpg)
- [North Canso school](hawkesbury-north-canso-school-geography.jpg)
- [North Canso light](hawkesbury-north-canso-light-geography.jpg)
- [Coastal school and forge](hawkesbury-coastal-school-forge-geography.jpg)
- [Horton mill](hawkesbury-horton-mill-geography.jpg)
- [Brown Brook school](hawkesbury-brown-brook-school-geography.jpg)
- [Brown's Mill](hawkesbury-browns-mill-geography.jpg)
- [Inland school](hawkesbury-inland-school-geography.jpg)

All eighteen have supported approximate locality. The Craignish group partly
crosses the modern shore, the northern Havre shop group overlaps a pond margin,
and Brown's Mill retains a bank-side disagreement. These remain explicit in the
placement notes; no source geometry was shifted, snapped or trimmed. The four
earlier holdbacks remain unchanged.

## Integration and verification

The [browser receipt](browser-hawkesbury-first-verification.json) records selection
of all eight additions at desktop and phone widths against the 134-record export:
native images decode, placement notes are visible, the basemap is ready and the
console is clean. The combined-export test verifies each sheet's source and fit
identity, preserves Judique's single explicit church correction, and prevents that
correction from appearing in a Hawkesbury-only receipt. The geographic renderer's
unchanged Judique default reproduces every prior scene hash and its frame receipt.

The [second browser receipt](browser-hawkesbury-services-verification.json)
records all eighteen additions against the 152-record export and normal-map
density previews. Mobile review reproduced the new 3D terrain button covering
the source popup's close control. The existing mobile popup rule now hides it
with the other map tools. A real-browser regression failed before the fix,
then verified an unobstructed close-button click and restored terrain control
after closing, with a settled final screenshot and clean console.

Local checks: 299 Fletcher Python tests passed, with eight existing skips; seven
Fletcher component tests and web script tests passed; lint and build passed.
Repository integration, hosted CI and production publication remain separate.

To replay the feature and geographic evidence from the repository root:

```sh
python3 -m tools.fletcher.project_features --sheet 22
python3 reports/fletcher/feature-geography/build_geographic_review.py \
  --sheet 22 --scenes reports/fletcher/feature-geography/hawkesbury-services-scenes.json \
  --raster /path/to/boundary-result/sheet-22-full-sheet.tif \
  --references /path/to/sheet22-reference
python3 -m tools.fletcher.export_features --sheet 19 --sheet 22
```

Use Python with Pillow for figures and native excerpt generation. Generate a
single sheet's new excerpts in a separate `--out` directory with `--source`, copy
those verified excerpts into the public excerpt directory, then run the combined
export. Do not replace Judique's public inventory with a single-sheet batch.

Source imagery: David Rumsey Map Collection / David Rumsey Map Center, Stanford
University Libraries, CC BY-NC-SA 3.0; existing scoped permissions remain separate.
Modern vectors: Province of Nova Scotia NSTDB. No current building, parcel,
ownership, access or site condition is established by these approximate features.
