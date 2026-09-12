# Reviewed Fletcher features

The current export integrates **34 Judique annotations: 20 approximate points
and 14 source-group records**. Shop 009 and P.O. 010 deliberately share one
group, so 33 geometries are selectable. Source association has been reviewed for
36 of 166 annotations; 130 remain pending. Forge 060 has an unresolved geographic
correspondence, and Forge 085 lies outside supported coverage. Both are withheld
from the web export. Lettering centres remain separate.

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

## Geographic review

[Placement decisions](sheet-19-placement-review.json) record the inspected scenes
and limitations. The figures compare the actual hash-verified current raster
against separately projected NSTDB vectors at identical EPSG:3857 extents:

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

## Web integration

Selecting **Atlas · Fletcher** enables the reviewed-feature overlay. Its checkbox
is beneath the basemap selector. Features appear from zoom 12; labels become
persistent at zoom 15. Hollow symbols identify approximate points; dashed,
lightly filled outlines identify unresolved groups. Select a mark or keyboard
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
