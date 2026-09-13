# Port Hawkesbury source-feature review

All **301 retained annotations** now have initial source-feature and geographic
decisions. **184** are integrated locally, while **117** remain withheld. No
Hawkesbury annotation remains without an initial decision. The
[closeout receipt](hawkesbury-initial-review-closeout.json) lists every holdback:
59 source locations unresolved, 49 outside conservative coverage, 2 outside the fit
neatline and 7 local geographic relationships unresolved. This is not acceptance of
the whole-sheet fit or completion of the 24-sheet project.

One hundred sixty-three Hawkesbury features merged through PR472 ; 21 final placements
pass local checks. The combined 310-record export retains all 126 Judique annotations.
Original wording, source boxes, qualified readings and correction histories remain
preserved. Work continues with sheet 16 Port Hood/Mabou and its recorded 36-control fit.

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
junction. [New Road 243](hawkesbury-road-243-geography.jpg) was initially withheld for its
reservoir overlap; the later documented historical-change review below supersedes
that decision while preserving it and the unchanged geometry. Three other whole traces are
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
paths remain outside control support: 012,020,185,239,272,273. Emery Brook157's northern pond/branch connection and North Branch of Tracadie192's
displaced eastern corridor remain unresolved. Seacoal Brook278's reservoir holdback
was subsequently superseded by the documented review below. No path is trimmed
or snapped.

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

## Shorelines, water notes and heights

The [water-detail append receipt](hawkesbury-water-details-append-receipt.json)
records fourteen bounded bank traces and sixteen water-note decisions. Three
shoreline figures and three water-note figures retain native source evidence:

- [Shorelines 1](hawkesbury-shorelines-1-20260913.jpg), [2](hawkesbury-shorelines-2-20260913.jpg), [3](hawkesbury-shorelines-3-20260913.jpg).
- [Water notes 1](hawkesbury-water-notes-1-20260913.jpg), [2](hawkesbury-water-notes-2-20260913.jpg), [3](hawkesbury-water-notes-3-20260913.jpg).

Spring233 and Ferrug. Spr.241 use actual source glyphs. The tidal-rock note36 retains
an unresolved candidate cluster. Fall93 remains unlocated; no unique mark or reach
was identified. Spring24, flow note162 and Mc Intyre Lake164 retain specific geographic
discrepancies. Complete source paths/clusters for 33,34,36,181,266 exceed control
support and remain withheld. The other twenty-one new water details are integrated.

[Reservoir-history reconciliation](reservoir-history-reconciliation.json) records
independent corroboration, exact document/page identity, prior holdback reviews and
unchanged geometry for New Road243 and Seacoal278. These two additional placements
are now reviewed; related Landrie bank234 and Spring233 carry the same linked source.
The assessment corroborates historical change, not exact source coordinates.

[All 41 height captions](hawkesbury-heights-append-receipt.json) were inspected in seven
native contact plates, with targeted details separating geological dots and roadside
marks. No separate associated spot-height mark was identified. Values and original
lettering geography remain intact without terrain points, benchmarks or inferred
vertical datums.

The [browser receipt](browser-hawkesbury-water-details-verification.json) records all
23 additions/reconciled placements, shoreline semantics, four visible assessment
links, native excerpts, clean consoles and absence of all 79 Hawkesbury holdbacks.
Local checks: 300 Python tests (eight existing skips), eight Fletcher component tests,
web script tests, lint and build pass. PR463's initial simulator-launch timeout passed
on an unchanged-head rerun before merge; it introduced no native code change.

## Settlement and personal-name review

[The append receipt](hawkesbury-names-append-receipt.json) records all 37 original
inventory entries, using actual source groups, marks, road/river crossings, a street
junction and a cove bank. Seven native figures preserve the source associations:

- [Names 1](hawkesbury-names-1-20260913.jpg), [2](hawkesbury-names-2-20260913.jpg), [3](hawkesbury-names-3-20260913.jpg), [4](hawkesbury-names-4-20260913.jpg).
- [Names 5](hawkesbury-names-5-20260913.jpg), [6](hawkesbury-names-6-20260913.jpg), [7](hawkesbury-names-7-20260913.jpg).

Bounded settlement groups reuse reviewed service marks where appropriate, without
inventing settlement limits or treating individual marks as current residences or
properties. Named bridge crossings retain their actual source locations. Auld Cove
uses a printed bank, and Hastings uses a specific printed street junction as its
locational anchor. Original categories remain in the source annotations.

[L. Murray reconciliation](lake-murray-identity-reconciliation.json) preserves the
first unlocated review and raw personal-name category. The source waterbody and
CGNDB CBAWC record support a derived waterbody classification; the native bank is
traced without substituting modern coordinates. The pipeline permits this explicit,
evidenced shoreline correction while leaving the original inventory unchanged.

Ferguson94 remains unlocated. Mathy Settlement190 retains an unresolved road/stream
relationship and modern-channel overlap. Complete source geometry for 95,245,252,
262,285 exceeds conservative support. Thirty other entries are integrated.

The [browser receipt](browser-hawkesbury-names-verification.json) records pointer
selection of every addition, the CGNDB link, native excerpts and clean consoles.
Visible labels now receive pointer events; multipart-group labels and popups use
the group bounds centre for presentation so a reused service label does not obscure
the settlement label. These display anchors do not alter stored feature geometry.
Labels also remount when crossing the hover/permanent zoom threshold, with real
zoom-control and unit regressions. The earlier Judique Coal multipart group remains
selectable. Local checks: 301 Python tests (eight existing skips), ten Fletcher
component tests, web script tests, lint and build pass.

Base reconciliation preserves PR465's terrain-control work. PR435's sheet21 handoff
retains the fifteen-control provisional baseline and rejects its seventeen-control
experiment; no new priority-corridor fit or whole-sheet acceptance is adopted.

The final branch also preserves PR466’s mobile terrain and Crown Land loading changes.
All thirty browser cases, the real label zoom threshold, prior Coal selection,
component tests, lint and build passed again with that nightly base.

## Coastal review

[The append receipt](hawkesbury-coasts-append-receipt.json) records 30 retained
coastal entries: 29 bounded source-bank traces and the complete Jack Shoal symbol
group. Five native figures preserve the source associations:

- [Coasts 1](hawkesbury-coasts-1-20260913.jpg), [2](hawkesbury-coasts-2-20260913.jpg), [3](hawkesbury-coasts-3-20260913.jpg), [4](hawkesbury-coasts-4-20260913.jpg), [5](hawkesbury-coasts-5-20260913.jpg).

Ghost Beach’s earlier westward and inner-tip candidates remain in the proposal
history; the retained seaward trace was checked in enlarged native detail. Keaton
Point and Wylde’s Cove use the coastal edge distinguished from parallel road/rail
lines. The Strait of Canso has one bounded western-bank reference shared with
Cape Porcupine; it is not a whole-strait outline or centreline. The visible Evans
or Macnamara Island trace stays open where the source does not show the perimeter.

Eighteen traces pass approximate-locality review against the actual current raster
and NSTDB Highways7, Roads8, Bridges5, rail and water. Their notes preserve inland
and seaward offsets and distinguish historical banks from present shores. Twelve
complete source geometries exceed conservative support and remain withheld:
10,37,48,180,183,244,254,255,256,286,287,288. They are not trimmed to gain acceptance.

The [browser receipt](browser-hawkesbury-coasts-verification.json) verifies all
18 additions by visible-label selection at desktop/phone widths, including both
annotations on the shared bank, native excerpts, placement notes and clean consoles.
All 271 earlier export records keep their geometry/content apart from the updated
Hawkesbury evidence hash. Local checks: 301 Python tests (eight existing skips), ten
Fletcher component tests, web script tests and build pass. No web code changed.

Final base reconciliation preserves PR467/471 terrain controls, retries and popup
fixes, plus PR470’s separate Church-map evidence. All 18 coastal browser cases,
component tests, lint and build passed again on that combined base.

## Final initial-review batch

[The append receipt](hawkesbury-final-append-receipt.json) records the final 40
annotations: 26 associated source geometries and 14 unlocated captions. Seven native
figures preserve those decisions:

- [Final 1](hawkesbury-final-1-20260913.jpg), [2](hawkesbury-final-2-20260913.jpg), [3](hawkesbury-final-3-20260913.jpg), [4](hawkesbury-final-4-20260913.jpg).
- [Final 5](hawkesbury-final-5-20260913.jpg), [6](hawkesbury-final-6-20260913.jpg), [7](hawkesbury-final-7-20260913.jpg).

Native detail confirms the ice-groove glyph, four cable marks, a quarry circle and
two pit circles. Two other apparent quarry marks were rejected as italic-y
descenders, with the candidates preserved. The railway-terminus projection, Salmon
Hole loop and two red dyke patches remain bounded source groups. Railway proposals,
the dated survey note, the printed county-line segment and fault bands retain their
source meanings. No proposed route is promoted to a built railway, and no historical
fault line is promoted to current geological activity. Broad landscape, material and
administrative captions without distinct feature geometry remain unlocated.

Twenty-one additional placements pass geographic locality review. Four complete
source geometries exceed the conservative control hull (240,263,291,297), and 299
exceeds the fit neatline; they remain withheld. The 14 new unlocated records are
21,80,122,154,219,224,232,238,242,257,258,259,264,267.

The [browser receipt](browser-hawkesbury-final-verification.json) verifies all 21
additions at desktop/phone widths, including both annotations sharing the proposed
railway geometry. The long combined railway/survey label originally overflowed a
390px viewport as a 702px nowrap line. Fletcher labels now keep their natural width
up to a viewport-based maximum and wrap, preserving the full text. No source or
map geometry is changed by this presentation fix. Native excerpts, placement notes
and clean consoles were checked. Local checks: 301 Python tests (eight existing
skips), ten Fletcher component tests, web script tests, lint and build pass.
