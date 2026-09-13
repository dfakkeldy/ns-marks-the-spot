# Reviewed Fletcher features

The combined export contains **152 annotations**: 126 from Judique and 26
from [Port Hawkesbury](HAWKESBURY.md). Source and fit identities stay separate.

Judique contributes **126 annotations: 27 approximate points,
53 source-group records and 46 traced reaches/road sections**. Shared groups
leave 122 selectable geometries. All **166 annotations** have source-feature
and geographic review decisions: 156 retain native feature geometry and ten
remain unlocated. Forty records are withheld for explicit source, coverage or
geographic reasons; none remain pending initial review. Lettering geography is
separate from feature geometry. Other sheets remain in the digitization queue.

## Source review and placement

The initial six additions were Sh. Mill 006, School 007, Shop 009, P.O. 010,
Shop 011 and Forge 013. [Source review](sheet-19-source-review.json) records original pixels,
qualified associations and group ambiguity. The [source figure](judique-north-services-20260912.jpg)
was inspected after drawing the actual stored points/groups; [frames](judique-north-services-20260912-frames.json)
record the native origin, display size and image hash. School 007 lies between
the road and watercourse, not between two road lines. Mill 006 and the three-mark
Shop/P.O. row do not support selecting individual buildings.

Three further source figures record the 18 subsequent reviews:

- [Central services](judique-central-services-20260912.jpg): 018,019,024,050,057,058.
- [Eastern services](judique-eastern-services-20260912.jpg): 060,062,068,071,072,073.
- [Southern services](judique-southern-services-20260912.jpg): 074,082,085,087,089,091.

Each figure has a matching `-frames.json` receipt. Stored source points were
checked against enlarged native pixels and final crosshairs; preliminary school
points 071,073,091 were corrected before geographic review. School 072 retains
both a faint possible mark and a clearer candidate in a group, without claiming
that the faint mark is a confirmed building. Earlier source rows are unchanged,
with append receipts recording the old/new source-review hashes.

The 12 existing pilot source geometries are reused unchanged. All map-derived
coordinates are explicitly reprojected through the merged **44-control Judique
fit**, SHA256 `fabbe2df06d4283c3ddbd3f9c259be5d966eb6391fdf6785711d5167891f0ca5`,
pinned to nightly merge `a6619d96ba8fa8279ea6a8027654a92b15942b9d`.
[Feature geography](sheet-19-features.geojson) retains every prior pilot feature
under `previous_placements`, its original source annotation, the current native
geometry, fit revision/hash and the separate placement review. Groups have
sampled edges at no more than ten native pixels; they are not property or site
boundaries. Geometry outside the source control hull remains unsupported.

The church's corrected coordinate is **unchanged**, east of Highway 19. The
rejected old source prediction and new TPS prediction are retained separately.
The locally reviewed gold mine 094 moves about 0.8 ground metre under the new
fit; the prior user corroboration is preserved without claiming new user review.
Mine 061 moves about **151 ground metres** from its earlier pilot prediction;
its modern road/tributary context was rechecked, and both revisions remain
explicit. No modern opening or exact historical footprint is established.

The last service pass adds 20 source reviews:

- [Glendale services](judique-glendale-services-20260912.jpg): 046,048,099–102.
- [Kingsville services](judique-kingsville-services-20260912.jpg): 118–120,122–124.
- [Crossroads services](judique-crossroads-services-20260912.jpg): 125,143,146–148,156.
- [Southern border services](judique-last-services-20260912.jpg): 158,165.

Mills 101 has no distinct source mark or defensible building group; it is
explicitly `unlocated-source-feature`, with null native and map geometry.
The pipeline no longer describes such a record as a reviewed group. Shop
122/123 and Tannery/P.O.146/147 each retain shared candidate geometry. Final
point centres were measured from native ink and checked on the stored-coordinate
figures; an ink component is only a measurement aid, not automatic identification.

[Natural-feature source review](judique-natural-features-20260912.jpg) covers
Barytes 017, Quarries 026, Fall 30 034, Falls 035/036 and underground-brook note
040. Four reviewed source paths are stored as native `source_path_xy`; the full
034 path is withheld outside coverage. A path is sampled at no more than ten
native pixels before transformation, preserving bends and open endpoints. It
is never replaced with a label centre, closed into an area, or snapped to a
modern stream. Bounds mark reviewed evidence, not a complete waterway or exact
waterfall extent. The height wording remains historical source text.

Wider native context showed that the first candidate for 040 followed a dotted
geological boundary. That rejected trace and evidence are retained in the source
review. The replacement follows only the visible brook stroke beside the text;
no subsurface route, flow direction, entrance or exit is inferred.

The subsequent native figures complete the falls/mineral/landscape review:

- [Middle falls](judique-middle-falls-20260912.jpg): 041–045,051.
- [River falls and coal](judique-river-falls-20260912.jpg): 069,070,109–112.
- [Eastern falls](judique-eastern-falls-20260912.jpg): 129,134–138.
- [Southern natural annotations](judique-southern-natural-20260912.jpg): 151,154,162,090,159,031.

The tentative Falls 070 remains separate from Quartz Mill; wider source context
identifies the adjacent tributary. Coal 112 preserves three separate printed
strokes as a MultiPolygon, not a continuous resource boundary. Enlarged source
review follows the curved stream through the straight geological strokes at
137. Descriptive geology, Barrens and unmarked height text remain unlocated.

The road figures cover every road-caption and railway-proposal occurrence:

- [First road sections](judique-roads-first-20260912.jpg): 022,027,037,052,053,055.
- [Middle road sections](judique-roads-middle-20260912.jpg): 067,086,092,093,104,131.
- [Roads and proposals](judique-roads-and-proposals-20260912.jpg): 149,163,133,141.

Twelve road sections are exported. Victoria Road 131 and proposal 133 retain
unresolved surrounding river/crossing geography; road 149 and proposal 141 extend
outside support. Their full source traces and predictions/holdbacks are preserved.
The app distinguishes historical road sections and railway proposals from reaches;
both proposals remain withheld in this revision. A bounded DeepSeek road candidate
was drawn against native pixels and rejected; [adjudication](road-candidate-adjudication.json)
retains the attempt. Accepted road axes were traced and checked directly.

The waterway figures review all 22 named occurrences:

- [First waterways](judique-waterways-first-20260912.jpg): 020,025,038,039,047,054.
- [Middle waterways](judique-waterways-middle-20260912.jpg): 056,064–066,081,095.
- [Southern waterways](judique-waterways-south-20260912.jpg): 096,113,126,132,139,140.
- [Last waterways](judique-waterways-last-20260912.jpg): 144,150,157,161.

Sixteen traces have reviewed approximate geography and enter the export. West
Branch 056 lacks a distinguishable source watercourse beside the caption; five
other full traces extend outside supported coverage. Larger source contexts
preserve winding captions and the traced reaches. Their native crop frames are
explicit; review thumbnails record their display scale, while web excerpts keep
native dimensions. Cropping never changes or clips source feature geometry.
River Inhabitants 126 follows the northern printed course around the small
western island, with all three original lettering boxes retained. Same-name
occurrences remain separate; no unreviewed connection or current flow is inferred.

The later [three-round fit packet](../route19-three-rounds-20260912/README.md),
merged in PR448, describes reversible drafts and explicitly preserves downstream
pins. This batch retains its recorded supported fit and geographic evidence.
Adopting another fit requires preserving these predictions and renewed review.

The final source figures cover all places and historical name inscriptions:

- [First places](judique-places-first-20260912.jpg): 001,012,014,029,049,059.
- [Middle places](judique-places-middle-20260912.jpg): 083,084,098,121,130,145.
- [Southern places](judique-places-last-20260912.jpg): 155,164.
- [Name groups 1](judique-names-1-20260912.jpg): 002,003,016,023,028,030.
- [Name groups 2](judique-names-2-20260912.jpg): 032,033,063,075,076,080.
- [Name groups 3](judique-names-3-20260912.jpg): 088,097,105–108.
- [Name groups 4](judique-names-4-20260912.jpg): 114–116,127,128,142.
- [Name groups 5](judique-names-5-20260912.jpg): 152,153,160,166.

Six printed settlement groups and 22 historical name groups enter the map.
Kingsville shares the actual candidate geometry of shop records 122/123; it is
not a community boundary or exact centre. Name inscriptions retain nearby
printed candidates without identifying ownership, current residences, parcels,
addresses or individual buildings. McIntosh 153 retains its partly overprinted
upper candidate as uncertain. Initial measurement rectangles that clipped marks
were expanded before review; the append receipt preserves both candidate files.

The three cape captions have actual shoreline traces, but all three remain
outside supported coverage. The full diagonal Craignish Hills caption retains
all fourteen original letter boxes, without inventing a summit or landscape
boundary. Ben Noah also remains unlocated after wider source review.

## Geographic review

[Placement decisions](sheet-19-placement-review.json) record the inspected scenes
and limitations. The figures compare the actual hash-verified current raster
against separately projected NSTDB vectors at identical EPSG:3857 extents:

- [North inland name](judique-north-inland-name-geography.jpg)
- [Judique clergy name](judique-judique-clergy-name-geography.jpg)
- [Rory chisholm name](judique-rory-chisholm-name-geography.jpg)
- [Allan mcdonald name](judique-allan-mcdonald-name-geography.jpg)
- [Northern name spurs](judique-northern-name-spurs-geography.jpg)
- [Squire name](judique-squire-name-geography.jpg)
- [Doug mcdonald name](judique-doug-mcdonald-name-geography.jpg)
- [Mcpherson names](judique-mcpherson-names-geography.jpg)
- [Western mcdougall name](judique-western-mcdougall-name-geography.jpg)
- [Rough brook names](judique-rough-brook-names-geography.jpg)
- [Glendale north name](judique-glendale-north-name-geography.jpg)
- [Smith mctaggart names](judique-smith-mctaggart-names-geography.jpg)
- [Eastern road names](judique-eastern-road-names-geography.jpg)
- [Buchanan name](judique-buchanan-name-geography.jpg)
- [Eastern border names](judique-eastern-border-names-geography.jpg)
- [Southern mcisaac name](judique-southern-mcisaac-name-geography.jpg)
- [Southern mcarthur name](judique-southern-mcarthur-name-geography.jpg)
- [Settlement judique](judique-settlement-judique-geography.jpg)
- [Settlement dennistown](judique-settlement-dennistown-geography.jpg)
- [Settlement river denys road](judique-settlement-river-denys-road-geography.jpg)
- [Settlement glendale](judique-settlement-glendale-geography.jpg)
- [Settlement kingsville](judique-settlement-kingsville-geography.jpg)
- [Settlement river denys crossroads](judique-settlement-river-denys-crossroads-geography.jpg)
- [Coastal named waterways](judique-coastal-named-waterways-geography.jpg)
- [Southwest mabou waterways](judique-southwest-mabou-waterways-geography.jpg)
- [Diogenes brook trace](judique-diogenes-brook-trace-geography.jpg)
- [Graham inland trace](judique-graham-inland-trace-geography.jpg)
- [Diogenes east trace](judique-diogenes-east-trace-geography.jpg)
- [Middle branch traces](judique-middle-branch-traces-geography.jpg)
- [Chisholm brook trace](judique-chisholm-brook-trace-geography.jpg)
- [Glendale brook trace](judique-glendale-brook-trace-geography.jpg)
- [Macpherson brook trace](judique-macpherson-brook-trace-geography.jpg)
- [Rough brook west trace](judique-rough-brook-west-trace-geography.jpg)
- [River inhabitants east trace](judique-river-inhabitants-east-trace-geography.jpg)
- [Mclennan brook trace](judique-mclennan-brook-trace-geography.jpg)
- [Big brook south trace](judique-big-brook-south-trace-geography.jpg)
- [Western named roads and Highway 19](judique-western-named-roads-geography.jpg)
- [Northern inland road](judique-northern-inland-road-geography.jpg)
- [Dennistown road captions](judique-dennistown-named-roads-geography.jpg)
- [Old Road alternative](judique-old-road-alternative-geography.jpg)
- [Northern Victoria Road](judique-north-victoria-road-geography.jpg)
- [Coastal inland roads](judique-coastal-inland-roads-geography.jpg)
- [Wood Road](judique-wood-road-geography.jpg)
- [Glendale road caption](judique-glendale-road-caption-geography.jpg)
- [Southern Victoria Road and proposal](judique-southern-victoria-proposal-geography.jpg)
- [Princeville Old Road](judique-princeville-old-road-geography.jpg)
- [Upper Diogenes falls](judique-upper-diogenes-falls-geography.jpg)
- [Diogenes fall](judique-diogenes-fall-geography.jpg)
- [Dennistown falls](judique-dennistown-falls-geography.jpg)
- [West Branch fall](judique-west-branch-fall-geography.jpg)
- [Quartz district falls](judique-quartz-falls-geography.jpg)
- [Glendale falls](judique-glendale-falls-geography.jpg)
- [Coal marks](judique-coal-marks-geography.jpg)
- [Northeastern reaches](judique-northeast-falls-reaches-geography.jpg)
- [McLennan tributary falls](judique-mclennan-tributary-falls-geography.jpg)
- [Big Brook falls](judique-big-brook-falls-geography.jpg)
- [Princeville fall](judique-princeville-fall-geography.jpg)
- [Barytes group](judique-barytes-geography.jpg)
- [Northern falls reach](judique-northern-falls-geography.jpg)
- [Western falls reach](judique-western-falls-geography.jpg)
- [Underground-brook note](judique-underground-brook-note-geography.jpg)
- [Colin Chisholm mill](judique-colin-chisholm-mill-geography.jpg)
- [River Denys postal group](judique-river-denys-post-geography.jpg)
- [Glendale services](judique-glendale-services-geography.jpg)
- [Kingsville approach](judique-kingsville-approach-geography.jpg)
- [Kingsville crossing](judique-kingsville-crossing-geography.jpg)
- [River Denys crossroads](judique-river-denys-crossroads-geography.jpg)
- [Southern school](judique-southern-school-geography.jpg)
- [Central coastal services](judique-central-coastal-services-geography.jpg)
- [Dennistown school](judique-dennistown-school-geography.jpg)
- [River Denys services](judique-river-denys-services-geography.jpg)
- [Eastern forge and quartz mill](judique-eastern-forge-mill-geography.jpg)
- [McLennan mill group](judique-mclennan-mill-geography.jpg)
- [Central school sequence](judique-central-schools-geography.jpg)
- [Long Point north](judique-long-point-north-geography.jpg)
- [Long Point south](judique-long-point-south-geography.jpg)
- [Western school](judique-western-school-geography.jpg)
- [Northern services](judique-north-services-geography.jpg)
- [Church and Rory Chisholm brook](judique-church-brook-geography.jpg)
- [Chisholm mill groups](judique-chisholm-mills-geography.jpg)
- [Northeastern gold mine](judique-northeast-mine-geography.jpg)
- [Glendale mines and Red Bridge](judique-glendale-geography.jpg)

[Frame and reference receipt](judique-geographic-review-frames.json) records the
raster, reference hashes, viewport extents, drawn feature IDs and Highway 19
labels. NSTDB Highways 7, Roads 8 and Bridges 5 are all included. Context IDs are
not accepted correspondences. Local offsets and imperfect joins remain visible;
this review supports approximate locality, not whole-sheet geographic acceptance.

Shop 018 projects west of Highway 19 despite lying east of the historical road;
that disagreement remains explicit, without a speculative coordinate correction.
Shop 089 is beside the separate narrow coastal road west of the highway, which
must not be conflated with Highway 19. Forge 060 projects onto a modern stream
without the matching terminal road bend: its geographic review is unresolved,
so the projection remains evidence only. Forge 085's source group crosses the
conservative control hull; its map geometry is null. It must not be shrunk to
circumvent the coverage gate. Accepted local controls or an independently
supported correspondence are needed before either withheld record can advance.

The earlier twenty-six holdbacks remain unchanged:

| Annotation | Remaining requirement |
| --- | --- |
| 026 Quarries | A distinct extraction mark or defensible quarry boundary. |
| 031 Barrens | A defensible landscape boundary; geological hatching is not vegetation. |
| 034 Fall 30 | Accepted support covering the complete associated stream reach. |
| 045 Iron Ore | A distinct ore mark or defensible extent. |
| 056 West Branch | Identify the actual printed watercourse; parallel road/geological strokes cannot substitute. |
| 060 Forge | Resolve the projected terminal-road versus modern-stream conflict. |
| 085 Forge | Accepted support covering the complete native candidate group. |
| 090 700 FT. | An actual spot-height mark, benchmark or identified summit. |
| 101 Mills | Identify a distinct source feature; a road/river junction is not a building. |
| 124 P.O. | Resolve the prediction in the modern river corridor and mismatched crossing. |
| 125 Blue Bridge | Establish the historical crossing locality; do not substitute the modern highway bridge northwest of it. |
| 129 Shale/fossil description | A distinct outcrop mark or defensible extent. |
| 131 Victoria Road | Resolve the surrounding river/road crossings and the existing Blue Bridge mismatch. |
| 132 River Inhabitants | Accepted support for the complete native river trace. |
| 133 Railway proposal | Reconcile the proposal’s surrounding river/road geography; no built-railway match is assumed. |
| 134 Falls | Accepted support for the complete source junction group. |
| 139 West Branch / 140 East Branch | Accepted support for both complete northeastern traces. |
| 141 Railway proposal | Accepted support for the complete native proposal trace. |
| 143 Shop | Accepted support beyond the current control hull. |
| 144 McPhail Brook | Accepted support for the complete native brook trace. |
| 149 River Denys Road | Accepted support for the complete native road trace. |
| 156 P.O. | Accepted support beyond the current control hull. |
| 159 850 FT. | An actual spot-height mark, benchmark or identified summit. |
| 161 Rough Brook | Accepted support for the complete southern trace. |
| 165 P.O. | Supported treatment of the source group crossing the frozen native neatline. |

Each remains in the evidence and annotation queue, excluded from the web export.
School 158 and Forge 119 retain explicit modern road-side disagreements even
where the broader approximate locality is supported.

The final place/name review adds fourteen holdbacks, for **40 total**:

| Annotation | Remaining requirement |
| --- | --- |
| 001 Mackay Point / 029 Campbell Point / 084 Long Point cape | Supported coverage for each complete shoreline section. |
| 002 John Gillis / 080 J Chisholm / 142 John R. Morrison | Supported coverage for each complete name-associated candidate group. |
| 003 McEachern | Reconcile the historical junction/stream crossing with the substantially displaced modern corridors. |
| 012 Ben Noah | A distinct named terrain mark or defensible source feature association. |
| 083 Long Point settlement / 155 Big Brook settlement | Supported coverage for the full printed settlement groups. |
| 128 Neil McCuish | Resolve the prediction at a modern tributary/road crossing absent at the source marks. |
| 130 Craignish Hills | A defensible source feature extent or distinct terrain mark; lettering and geology are not boundaries. |
| 160 Don. McIsaac | Reconcile the historical terminal road and northern waterbody relationship. |
| 164 Princeville | Supported treatment of the complete group crossing the southern neatline. |

The [per-annotation queue](../digitization/sheet-19-queue.json) retains each
remaining question and stage. Computed predictions for unresolved localities
remain evidence only; no geometry was moved to a convenient modern feature.

## Web integration

Selecting **Atlas · Fletcher** enables the reviewed-feature overlay. Its checkbox
is beneath the basemap selector. Features appear from zoom 12; labels become
persistent at zoom 15. Hollow symbols identify approximate points; dashed,
lightly filled outlines identify unresolved groups. Separate dashed lines carry
reviewed historical reaches, with pointer and keyboard selection. Select a mark or keyboard
focus a group to open its original scan and evidence. Shared geometry exposes
both annotations in the same popup. Reading and placement uncertainty are
separate. Source excerpts are local derivatives of the verified native scan.

The [web receipt](../../../web/public/fletcher-features/source.json) records the
export and excerpt hashes, native crop frames, source provenance and licences.
The live layer is explicitly excluded from print/PDF exports. The map footer and
selection retain source credit. This is source integration; no production
publication or custom-domain acceptance is claimed.

The [service-batch browser receipt](browser-services-verification.json) records
selection of all 16 additions at alternating desktop/phone widths, decoded
native excerpts, placement notes and a clean final console. That pass exposed
a popup auto-pan feedback loop during parent viewport updates. The layer now
preserves its children across unchanged parent updates; a real React/Leaflet
regression test and the complete browser replay verify the fix.

The [final service browser receipt](browser-final-services-verification.json)
records all 14 later additions, including shared shop and tannery/postal groups,
with decoded excerpts, placement notes and a clean final console.

The [natural-feature browser receipt](browser-natural-verification.json) records
pointer selection of both falls reaches, keyboard selection of the brook note,
source evidence, and the final separated dashed line style on desktop and phone.

The [all-falls browser receipt](browser-all-falls-verification.json) records
all 18 later additions, including the separated coal regions and traced stream
segments, with source excerpts, placement notes and clean final consoles.

The [road browser receipt](browser-roads-verification.json) records all twelve
new road selections with a ready basemap, source excerpts and distinct road
wording. Local Chromium range-cache failures were reproduced and isolated to
HTTP caching; only Vite dev/preview archive responses now disable HTTP storage.
Production hosting and the existing client error handling are unchanged.

The [waterway browser receipt](browser-waterways-verification.json) records all
sixteen new trace selections, varying native excerpt dimensions and placement
notes, with a ready basemap and clean console on desktop and phone.

The [final Judique browser receipt](browser-final-judique-verification.json)
records all 28 place/name additions at desktop and phone widths against the
126-record export, including decoded excerpts, visible placement notes and
clean consoles. All original 166 records retain their source identities.

## Reproduce

From the repository root, Python 3.11+ and GDAL on PATH:

```sh
python3 -m tools.fletcher.project_features --sheet 19
python3 -m tools.fletcher.export_features --sheet 19
python3 -m unittest tools.fletcher.tests.test_project_features -v
```

To recreate source excerpts, pass `--source /path/to/native/sheet19.png` to the
exporter using Python with Pillow. The source-review figure builder takes
`--sheet 19 --source ...`. The geographic-review builder takes the current
`--raster ...` and hash-matching NSTDB `--references ...` directory. Re-rendering
is computational evidence only; new or changed geometry needs visual review.

Source: David Rumsey Map Collection / David Rumsey Map Center, Stanford University
Libraries, CC BY-NC-SA 3.0. Existing scoped permissions remain in the repository
inventory. Modern references retain Province of Nova Scotia NSTDB provenance;
the corrected church separately credits OpenStreetMap contributors, ODbL 1.0.
