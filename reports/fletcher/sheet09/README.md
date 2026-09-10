# Sheet 9 — whole-sheet work started 10 September

Sheet9 is the printed neighbour north of Sheet11, covering the coast toward
Chéticamp and the inland valleys. This starts the **whole sheet**, including
coast, lakes, northern/eastern mountains and its southern boundary.

Rumsey item `RUMSEY~8~1~2634~290002` identifies “Province of Nova Scotia (Island
of Cape Breton). Sheet no. 9.” The native scan is **10762 × 7642**. All 24 fetched
IIIF regions have their stated native dimensions and pixel parity with both the
assembled PNG and TIFF. The source receipt records hashes and attribution; the
manifest has no license field, which is not a redistribution clearance.

Local source: `~/Downloads/fletcher-sheet09/native/sheet09.png`.
Modern references: `~/Downloads/fletcher-sheet09/reference-full/`, bbox
`[-61.25,46.435,-60.82,46.635]`, EPSG:4326 longitude/latitude. Returned feature IDs
were checked against the complete requested ID sets: **4,836 water lines, 1,917
water polygons, 2,623 roads, and zero rail features**. Hashes and source URLs are
in `reference-receipts.json`.

`seed-controls.json` contains two reviewed physical seeds: the western lake
outlet north of Grand Etang and its coastal mouth beside the historical lobster
factory. The lake outline, outlet creek, road crossing and separate Grand Etang
mouth establish the correspondence. C01 was moved from the lake interior to the
outlet throat during native crosshair review, before any fitting. The offshore
line meeting C02 in the water dataset is a dataset boundary, not a matched stream.
`seed-review/` contains the corrected native/modern crosshairs.

These two nearby seeds **cannot support a full-sheet fit**. There is no new warp,
accuracy claim, tile revision or production label transform for Sheet9.

Investigated but not adopted:

- Stewart Brook: the broad drainage is identifiable, but the exact upper forks
  have contradictory or omitted branch details. Keep these as proposals until
  larger context resolves the sequence; do not snap them to graticule predictions.
- Pembroke Lake: the historical large continuous outline differs substantially
  from the current wetland/lake geometry. Do not treat that outline as unchanged
  or infer a cause of the difference without evidence.

The saved context views retain original crop extents. Modern panels use the old
printed-graticule guide solely to search; it is not accepted georeferencing.
Next: spread additional physical controls across the northern coast and eastern
valleys, reserve independent checks, and review the shared Sheet11 boundary before
fitting and cropping the whole sheet.
