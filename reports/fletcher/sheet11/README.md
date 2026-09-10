# Fletcher Sheet 11 — whole-sheet provisional georeferencing

**Sheet 11 is a rendered, editable draft; it is not accepted for tiles or production
label projection.** Eighteen reviewed physical controls and six excluded diagnostic
checks support this first full-sheet trial. The current TPS trial scores **175.7 m
median / 341.3 m worst**, exceeding the predeclared working goals of 100 / 200 m.
The actual warped imagery also shows unresolved northern and western inland
alignment. The existing four-sheet tileset and digitization handoffs are unchanged.

Start with [status.json](status.json), [the full-sheet preview](full-sheet-preview.jpg),
and [the current point review](final-review/frames.json). The canonical trial files
are `coastal-fit.json` and `coastal-checks.json`; other fitting files preserve earlier
attempts. None is an active production transform.

## Source, extent and coordinate frame

The Rumsey manifest identifies **Province of Nova Scotia (Island of Cape Breton),
Sheet no. 11**, item `RUMSEY~8~1~2636~290004`. The printed sheet number and Sheet 14's
northern neighbour notation were visually inspected. Sheet 11 is staggered east
of Sheet 14; its southwest mapped extension supplies the western connection.

The [source receipt](source-receipt.json) verifies all 24 downloaded native IIIF
regions, including clipped edge dimensions, against both the assembled TIFF and
the lossless PNG, pixel for pixel. Native dimensions are **10771 × 7551**. The
fitting PNG has SHA256
`1613a37c74f65f6f09a4fb3a7eaad32f72eca540da4af2a3ab9835af6ce8a916`.
Coordinates are image-edge x/y in that full scan, x right and y down. Prior July
graticule observations supplied a search guide only; they are not physical controls
or evidence of identical source pixels.

The mapped mainland protrudes west of the main rectangular frame. Sea Wolf /
Margaree Island is also printed outside that frame, in geographic position.
The [crop review](boundary-review.jpg) preserves both, including the island name.
The mainland crop follows the inner frame with an approximately eight-pixel inset
and a small offshore margin along the western extension. The island has a separate
component. This is whole-sheet coverage, not a Route 19 strip or control-hull crop.
The crop remains provisional and is not a seamless mosaic claim.

Modern coordinates come from the NSTDB water and road layers in the
[reference receipts](reference-receipts.json), fetched for
`[-61.34, 46.24, -60.83, 46.46]` in longitude/latitude order. Water lines contain
3,574 features and polygons 603; paged object-ID completeness was checked at
acquisition. The earlier narrower local reference cache is not the fitting
reference. NRCan 11K06 edition 4 was consulted for drainage/name context only;
no point coordinate is taken from it and its map-content date has not been
established here. Rumsey attribution is retained; the absent manifest licence
field is not interpreted as redistribution clearance.

## Correspondence review and retained failures

Control selection uses branch connectivity, neighbouring junctions, shoreline
shape and road context. Every delivered point has an enlarged native crosshair
and marked modern view in `final-review/`, with crop coordinates recorded in
`frames.json`. The agent reviewed the points; no user review is claimed.

- C02 was moved between candidate modern junction identities during the native
  review; the final correspondence is J0505, the major northeastern Martha arm.
- After the first scores, C12's tributary sequence exposed an incorrect modern
  junction. Its native pixel stayed fixed; the supported modern junction is
  J0416. The earlier fit and failed check remain available.
- C16 was rejected because its proposed native crosshair lay on a road rather
  than a demonstrable matching stream junction. It is absent from every fit.
- Coastal review corrected C18's native tip pixel. For C20 it rejected a nearby
  offshore islet (OBJECTID 21772) and identified Grey Point's actual mainland
  apex (OBJECTID 6081), before coastal-fit scoring.
- C17 is the NSTDB **Murdoch MacLeods Brook** mouth in the historical Broad Cove
  Marsh locality. Earlier text calling it Broad Cove River is superseded; the
  selected native and modern coordinates did not change for that naming repair.

`proposals.json`, `observations.json`, `initial-*`, `revised-*`, and the earlier
review folders retain the history. **Use `final-review/` for the delivered trial**;
earlier pictures can show superseded pixels or identities.

| Fit | Controls | Six-check median | Worst | Status |
|---|---:|---:|---:|---|
| Initial affine | 15 | 122.9 m | 419.6 m | Retained baseline trial |
| Initial TPS | 15 | 204.0 m | 628.7 m | C12 correspondence subsequently repaired |
| Revised TPS | 15 | 176.6 m | 336.3 m | C12 repaired |
| Coastal affine | 18 | 152.4 m | 401.8 m | Still misses working goals |
| Coastal TPS | 18 | 175.7 m | 341.3 m | Rendered trial; not geographically accepted |

The six checks are excluded from every fit, but were used for model comparison
and diagnosis. They are **diagnostics, not fresh validation after the repairs**.
The coastal TPS gives a lower worst error than the coastal affine but a worse
median. There is no claim of uniform improvement or that TPS is finally selected.
All metrics are approximate spherical ground metres.

## Rendered artifact and verification

The local GeoTIFF is:

`~/Downloads/fletcher-sheet11/trial/sheet-11-provisional.tif`

It is 9483 × 5970, RGBA, EPSG:3857, with five projected-metre cells. SHA256:
`c1c5cafe60fdfb5fb9fa49820e0212f6acb1f6cb414393fd2d6f6e1f6c6e6b8c`.
Source pixels are unchanged; the warp and two cutlines are separate artifacts.
Large source imagery and rasters stay outside Git.

- The two rendering receipts record 72,604 mainland and 814 island orientation
  samples on a 25-native-pixel grid, with no sign reversals. This sampled check
  does not prove the continuous surface is fold-free.
- [Alpha coverage](raster-coverage.json): 48,687,078 interior cells, zero transparent
  holes, with one output cell of boundary tolerance. Coverage is not accuracy.
- [Import verification](import-verification.json): 18 controls / 6 separate checks,
  semantic CSV roundtrip, and web/GDAL TPS agreement within 0.001 projected m.
  No Sheet 11 browser layer was activated; browser mesh and save/reload acceptance
  are not claimed for this provisional artifact.
- [Seven actual-raster reviews](warped-review/frames.json) compare the rendered
  pixels alone and with NSTDB water/roads, rather than a search-guide projection.
  Sea Wolf's whole outline and major Martha/Ranalds and Middle River junctions
  are promising. Northern Gallant, Cameron's southern tributary, upper Fionnar,
  and some western inland features remain displaced. Roads are corroboration,
  not assumed unchanged since the historical survey.

Editable files are `sheet-11-provisional-controls.csv` (controls only) and
`sheet-11-provisional-review.csv` (controls plus separately labelled checks).
Both explicitly warn against production use. Do not substitute the review rows
for fitting input or project the digitized labels with this draft.

Replay each component with the existing `reports/fletcher/full-sheets/render.py`,
using `coastal-fit.json`, `coastal-checks.json`, the full native PNG, and respectively
`boundary-mainland.json` / `boundary-island.json`. Mosaic the two resulting RGBA
rasters with `gdalbuildvrt`, then lossless `gdal_translate` with tiled DEFLATE.
`review_warp.py` regenerates the seven review panels. Bundle `verify_import.ts`
with the repository's rolldown and run it from the repository root.

## Remaining geographic work

First resolve the northern Gallant / printed Trunk Brook branch sequence and add
controls only when identities are established independently of the guide or fit.
The tempting northern eastern branch was not adopted: its relationship to the
modern main and tributaries is still ambiguous. Do not turn a guide prediction
into a control to reduce the visible displacement.

Then investigate Cameron, upper Fionnar and western inland discrepancies. Freeze
the repaired fit before selecting new geographically distributed checks. Review
the Sheet 11–Sheet 14 join after those controls support Sheet 11's geography.
Only then reconsider tiles and production label projection. The separate
[Mabou–Sheet 14 audit](../northern-validation-20260909/README.md) leaves both existing
transforms and their gap unchanged.
