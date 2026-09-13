# Port Hood / Mabou source-feature review

The first **30 of 256 annotations** have initial source and geographic decisions.
All 30 retain native feature geometry. **16 annotations** (four glyph anchors and
12 group records) are integrated locally, yielding 14 selectable geometries because
two pairs share groups. **14** complete source geometries remain withheld; **226**
annotations still need initial source association. This batch covers the first 30
of 84 service/industrial entries; the rest of the sheet remains open.

The [source and raster receipt](mabou-input-verification.json) verifies the native
10822 × 7531 scan and the recorded 36-control Glendyer raster. The fit stays pinned
to nightly revision `249b2be0b378adec894abc34520f83b009dbf8fd`, with fit SHA256
`21c8c1acfbab6cc484af1af4eb0a27e6869579cb1b88aaf58173fbf9757f307e`.
No earlier Mabou fit or separate experimental replacement is adopted.

## Source association

[The first receipt](mabou-first-source-receipt.json) records observation-station,
breakwater, quarry, school, factory, forge, postal, shop, church and weaving-mill
marks. [The second receipt](mabou-second-source-receipt.json) appends Mabou/Glendyer
services and eastern schools/quarry/pit evidence without changing those first rows.
Native figures and matching frame JSONs preserve all pixel transformations:

- [Services 1](mabou-services-1-20260913.jpg), [2](mabou-services-2-20260913.jpg), [3](mabou-services-3-20260913.jpg), [4](mabou-services-4-20260913.jpg), [5](mabou-services-5-20260913.jpg).

Actual glyph centres, bounded compact-mark groups and a printed breakwater line
replace neither source lettering nor current coordinates. Tannery/Shop and the
telegraph-postal/School captions share unresolved groups. Stage Stables retains
two flanking candidate groups; individual buildings and current properties are
not inferred. Original inventory wording, boxes and null geometry stay intact.

## Geographic review

The paired figures use the exact current raster and the six hash-verified NSTDB
extracts recorded in [reference receipts](mabou-reference-receipts.json). The
existing bbox covers the recorded sheet bounds and includes Highways 7, Roads 8
and Bridges 5. Reuse is explicit; these are not newly fetched geometry extracts.
The existing figure generator now accepts sheet 16 with explicit scenes and keeps
its source/raster/fit/reference identity checks.

[Supplemental type metadata](mabou-water-context-types.json) distinguishes the
Swamp Area polygon 4216 (WASW40) overlapping the tannery/shop group from Coast
River Water polygons 254 and 1578 (WACORV40) touching the Mabou junction group.
The newly returned geometry exactly matches the frozen extract for all three
objects. Bounding-group overlap does not establish a building footprint, current
site condition or historical inundation. Local road/channel offsets remain in
placement notes instead of being snapped away.

Fourteen records remain withheld: observation station 001 exceeds the fit
neatline; 003,005,006,007,017,019,021,022,023,064,069,085,086 exceed the conservative
control hull. Their complete native geometry stays retained. Geographic review
of the 16 supported records establishes approximate locality only, not modern
site identity or whole-sheet geographic acceptance.

## Integration and checks

The combined 326-record export keeps all 310 earlier Judique/Hawkesbury records
exactly unchanged. [The browser receipt](browser-mabou-first-verification.json)
records all 16 additions selected through visible labels at alternating desktop
and phone widths, with native excerpts, placement notes and clean consoles.
Local checks: 302 Python tests (eight existing skips), ten Fletcher component
tests, web script tests and build pass. Added checks preserve the 36-control fit,
original sheet 16 records and independent three-sheet export provenance.

Continue the remaining 54 service/industrial entries, then the other sheet 16
annotations. Keep sheet 14 and the remaining 20-sheet queue open. Repository
integration is separate from KinNoKi publication and production acceptance.
