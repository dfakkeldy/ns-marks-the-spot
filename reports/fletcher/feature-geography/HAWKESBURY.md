# Port Hawkesbury source-feature review

All **80 service, industrial and transport annotations**, **17 road captions** and
**26 stream/river captions** now have initial source and geographic decisions.
**92** are integrated locally: 44 approximate marks, eighteen source groups,
thirteen road segments and seventeen watercourse reaches. Thirty-one records
remain explicitly withheld. The other **178 of 301** annotations still need initial
source association. Seventy-five Hawkesbury features merged through PR462; seventeen
further reaches pass local checks. The combined 218-record export retains all 126
Judique annotations.

## Source and geography

[Input reconciliation](hawkesbury-input-reconciliation.json) verifies the original
10790 × 7687 scan, the actual boundary-fit raster and the independently pinned
28-control fit. Its SHA256 is
`e96a8934ae42cc6dbc079e69afebb743c05decf0a61f19ac24eb620be48c32ed`,
from nightly commit `a6619d96ba8fa8279ea6a8027654a92b15942b9d`.
The later PR448 packet describes reversible drafts and preserves downstream pins;
no experimental or rejected fit is adopted here.

[Source associations](sheet-22-source-review.json) retain actual native points
candidate regions or bounded source lines, separate from the unlocated original lettering inventory.
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

The next source pass reviews eighteen further annotations:

- [Services 6](hawkesbury-services-6-20260913.jpg): 089,102,104,105,109,114.
- [Services 7](hawkesbury-services-7-20260913.jpg): 116,118,129,132,134,137.
- [Services 8](hawkesbury-services-8-20260913.jpg): 145,165,166,172,173,174.

[Candidate history](hawkesbury-services-more-append-receipt.json) retains the
initial measurements, enlarged ink inspection and final geometry. Three station
symbols were measured independently of the tracks; connected ink required native
microgrids for their centres. The kiln is a distinct hollow circle, separate from
the degree sign and nearby grid patterns. The Archie Pond postal mark remains a
qualified small candidate region. Auld Cove Mill 132 has no confidently separable
symbol and stays unlocated; neither its crossing nor circled fossil notation is
promoted to a mill site.

Ten additional geographic scenes support fifteen approximate placements:

- [New Bridge](hawkesbury-new-bridge-geography.jpg)
- [Little Tracadie services](hawkesbury-little-tracadie-services-geography.jpg)
- [Tracadie mill and station](hawkesbury-tracadie-mill-station-geography.jpg)
- [Inland school and station](hawkesbury-inland-school-station-geography.jpg)
- [Archie Pond postal candidate](hawkesbury-archie-pond-post-geography.jpg)
- [Porcupine station](hawkesbury-porcupine-station-geography.jpg)
- [Long Pond forge](hawkesbury-long-pond-forge-geography.jpg)
- [Coastal forge](hawkesbury-coastal-forge-geography.jpg)
- [McIntyre mill group and school](hawkesbury-mcintyre-mill-school-geography.jpg)
- [St Peter's Road kiln](hawkesbury-peters-road-kiln-geography.jpg)

The original four holdbacks remain. The three new holdbacks are **132 Mill**
(source location unresolved), **173 School** and **174 Church** (outside supported
coverage in the eastern McLeods Bridge district). Their complete source evidence
is retained, with no trimming to force coverage. The accepted groups and points
still carry explicit road, rail, bank and shoreline differences; no current
station, building, service or property is inferred.

The harbour pass reviews eighteen more source annotations:

- [Services 9](hawkesbury-services-9-20260913.jpg): 175,176,179,182,189,191.
- [Services 10](hawkesbury-services-10-20260913.jpg): 197,201,205,206,207,208.
- [Services 11](hawkesbury-services-11-20260913.jpg): 210,212,214,217,220,221.

[Native candidate history](hawkesbury-harbour-append-receipt.json) records the
final centres and groups. The Point Tupper caption was enlarged and confirms
**44 ft.**; its original reading is unchanged. Emery's Wharf retains three
nearby shoreline structures as one candidate region, without inventing a
continuous wharf or choosing one structure. The cemetery is a small source
symbol, not a traced cemetery boundary. The railway-side Mill 201 has no distinct
site mark separable from the crossing/loops and remains unlocated.

Eight more geographic scenes support fourteen additions:

- [Long Point school](hawkesbury-long-point-school-geography.jpg)
- [New Glasgow road school and mill](hawkesbury-new-glasgow-school-mill-geography.jpg)
- [Grosvenor postal group](hawkesbury-grosvenor-post-geography.jpg)
- [Northern Mulgrave church and tannery](hawkesbury-mulgrave-north-services-geography.jpg)
- [Mulgrave town services](hawkesbury-mulgrave-town-services-geography.jpg)
- [Emery's Wharf candidates](hawkesbury-emery-wharf-geography.jpg)
- [Point Tupper light and marine slip](hawkesbury-point-tupper-services-geography.jpg)
- [Southern coastal school and station](hawkesbury-southern-coastal-school-station-geography.jpg)

The four new holdbacks are **175 P.O.**, **176 Forge**, **179 Cemetery**
(outside supported coverage), and **201 Mill** (source location unresolved).
All eleven held records retain their source evidence. Accepted waterfront
features keep explicit shoreline and road/rail differences; the southern
station's prediction is slightly seaward of the modern shore and is not
snapped inland or identified with a current station.

The final service source figures complete this initial category pass:

- [Services 12](hawkesbury-services-12-20260913.jpg): 227,235,250,251,253,260.
- [Services 13](hawkesbury-services-13-20260913.jpg): 261,268,269,280,281,282.
- [Services 14](hawkesbury-services-14-20260913.jpg): 283,284.

[Candidate history](hawkesbury-last-services-append-receipt.json) retains native
measurements and wider detail. Richmond Mine keeps its four bold source marks
as a candidate group, without choosing an entrance or a resource boundary.
McCarthy's Ferry retains only its actual western landing mark; no route or
opposite landing is inferred. Wider context resolves the postal block beside
the coastal transport ink and the school mark west of the railway bend.

Four geographic scenes support seven additions:

- [Hawkesbury church](hawkesbury-hawkesbury-church-geography.jpg)
- [Richmond Mine group](hawkesbury-richmond-mine-geography.jpg)
- [Pirate Harbour postal and forge marks](hawkesbury-pirate-harbour-services-geography.jpg)
- [Caribacou services](hawkesbury-caribacou-services-geography.jpg)

Seven complete source geometries remain outside support: **250 Ferry landing**,
**251 P.O.**, **253 School**, **260 P.O.**, **261 Old Mill**, **283 Malcolm's Wharf**
and **284 School**. No geometry is trimmed or extrapolated. With the earlier
holdbacks, eighteen service records remain explicitly withheld.

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

The [station/mill browser receipt](browser-hawkesbury-stations-verification.json)
records all fifteen later additions against the 167-record export, with decoded
source images, visible placement notes and clean desktop/phone consoles.

The [harbour browser receipt](browser-hawkesbury-harbour-verification.json)
records all fourteen additions against the 181-record export, with source images,
visible placement evidence and clean desktop/phone consoles.

The [final service browser receipt](browser-hawkesbury-final-services-verification.json)
records all seven additions against the 188-record export, with native excerpts,
visible placement notes and clean desktop/phone consoles.

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

## Road captions

Three source figures record all seventeen bounded traces:

- [Roads 1](hawkesbury-roads-1-20260913.jpg): 007,014,015,019,027,085.
- [Roads 2](hawkesbury-roads-2-20260913.jpg): 108,121,147,159,160,188.
- [Roads 3](hawkesbury-roads-3-20260913.jpg): 198,231,236,243,265.

[Candidate history](hawkesbury-roads-append-receipt.json) preserves native contexts
and the rejected long-road candidates. Old Post Road 188 required native detail to
separate two thin road strokes from a parallel stream that changes sides. Victoria
Road 147 turns north at Big Brook Road, and Saint Peter's Road 159 excludes the
southeastern Kiln branch. No trace is trimmed to fit coverage.

Fourteen paired raster/NSTDB scenes are recorded in the geographic frame receipt.
Thirteen support approximate historical placement. Old Road 015 has no continuous
modern road counterpart; its note retains that limitation and the offset northern
junction. [New Road 243](hawkesbury-road-243-geography.jpg) remains withheld because
its projection crosses substantial modern Landrie Lake water and the evidence does
not resolve shoreline change versus local fit error. Three other whole traces are
withheld: 019 exceeds the fit neatline, and 236/265 exceed conservative control support.

The [road browser receipt](browser-hawkesbury-roads-verification.json) records real
selection of all thirteen additions at alternating desktop/phone widths, decoded
native excerpts, visible placement evidence and clean consoles. All previous eighty
Hawkesbury evidence records are unchanged. Local checks: 299 Python tests (eight
existing skips), seven Fletcher component tests, web script tests, lint and build pass.

## Stream and river captions

Five source figures record all twenty-six bounded source paths:

- [Watercourses 1](hawkesbury-watercourses-1-20260913.jpg): 011,012,013,018,020,071.
- [Watercourses 2](hawkesbury-watercourses-2-20260913.jpg): 076,079,081,088,090,100.
- [Watercourses 3](hawkesbury-watercourses-3-20260913.jpg): 107,120,123,155,156,157.
- [Watercourses 4](hawkesbury-watercourses-4-20260913.jpg): 168,185,192,239,246,272.
- [Watercourses 5](hawkesbury-watercourses-5-20260913.jpg): 273,278.

[Candidate history](hawkesbury-watercourses-append-receipt.json) retains manual
seeds, unreviewed ink candidates and final native paths. Review rejected departures
onto lettering, roads and a short Chisholm spur. River Inhabitants retains its
qualified reading and sixteen lettering boxes; its geometry is a bounded actual
western-bank trace, not a channel centreline or reconstructed river extent.

Twenty paired scenes support seventeen approximate placements. Six complete
paths remain outside control support: 012,020,185,239,272,273. Three other traces
retain explicit geographic discrepancies: Emery Brook157's northern pond/branch
connection, North Branch of Tracadie192's displaced eastern corridor, and
Seacoal Brook278's overlap with the modern reservoir. These paths are not trimmed,
snapped or exported.

[Typed water context](hawkesbury-water-context-types.json) distinguishes reservoir
water from swamp polygons in the source extract. Reservoir OBJECTID434 contains
84 of Seacoal's 110 projected vertices; this is a containment diagnostic, not an
accuracy or inundation-history measurement. The same reservoir intersects the
previously withheld New Road243. Sugar Camp/Northwest Arm intersected polygons
6476/4276 are swamp areas, not open-water evidence.

The [watercourse browser receipt](browser-hawkesbury-watercourses-verification.json)
records real selection of every addition with native excerpts and visible placement
notes. It also records the reproduced desktop popup obstruction and its CSS fix:
floating tools now stay clear of source evidence at every width and return on close.
All local Python/component/script checks, lint and build pass; desktop and phone
browser consoles are clean. No production publication is claimed.
