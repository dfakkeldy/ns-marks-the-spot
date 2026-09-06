# Sheet 22 / Hawkesbury: saved-control diagnostic

The next sheet south of Judique has a reproducible cropped draft, but **does not
pass geographic acceptance**. Seventeen saved hand controls were preserved;
eight new stream/shoreline checks were frozen in commit `f486c98b` before scoring.
No checks were added to either fit, and no saved hand point was moved.

| Fit on the same 17 controls | Median ground error | Worst ground error | Gate |
| --- | ---: | ---: | --- |
| Affine | 112.7 m | 277.6 m | Fail |
| TPS | 159.8 m | 290.0 m | Fail |

The [predeclared limits](PROTOCOL.md) are median ≤100 m and worst ≤200 m for this
browsing experiment. Affine is the simpler, better-scoring **diagnostic** here.
These checks have now informed model selection; they are not fresh validation
for a future repair. A zero script exit means successful analysis, not acceptance.
See the full [scores](scores.json) and unchanged [observations](observations.json).

The main failures are the northern Queensville fork (Q01: 264 m affine) and a
western inland tributary (Q04: 278 m). The overlays retain the discrepancy:
[Q01](Q01-mismatch.jpg), [Q04](Q04-mismatch.jpg). Stream topology identifies the
candidates, but these errors alone cannot distinguish old survey distortion,
changed hydrology, reference generalization or a correspondence problem. They
are not grounds to drag a pixel toward a model prediction.

## Inputs and visual evidence

The native Rumsey scan is **10790×7687**, item `RUMSEY~8~1~2647~290015`, catalogue
3997.024. Native IIIF regions were assembled with dimensions checked per region;
the scan hash is in the observations and artifact receipt.

The latest saved CSV and matching IIIF annotation agree on all coordinates.
[The original CSV](saved-user-controls.csv) remains intact. Its 17 `gcp-*` rows
are reproduced with their original numeric strings. The remaining `corner-se`
placeholder is excluded from fitting, while retained in the export. This is a
reconstruction from those 17 manual points, not a measurement of the published
Rumsey layer or an exact replay of the full 18-row saved session.

Modern evidence uses Nova Scotia NSTDB 1:10k water lines/polygons, roads and rail,
requested in EPSG:4326. [Reference receipts](reference-receipts.json) record URLs,
extract bounds, counts, retrieval times and hashes. Each check retains feature
IDs, native crop origin/extent, displayed dimensions, pixel convention, uncertainty
and identity evidence. Native crosshairs and marked modern references are paired
in [page 1](check-evidence-1.jpg) and [page 2](check-evidence-2.jpg).

Checks cover available land in the north, west and southwest. Q04/Q06 share a
catchment; Q07/Q08 are nearby coastal features. They provide limited spatial
independence. Seven checks lie inside the control hull; Cape Jack Q07 lies outside.
The hull occupies **60.5% of the cropped area, including sea**. It leaves much of
the east/southeast unsupported and does not certify accuracy inside it.

Rejected candidates remain excluded: the historical McIntyre mill lake has no
clear modern shoreline equivalent; Beaver Dam Lake has no unambiguous mapped
outlet; several small Horton/Browns Brook branches and the Little River
mill/road/rail area were too obscured or inconsistent to match confidently.
The changed Canso causeway/industrial coast was avoided. The old experimental
printed-grid observations were not used as geographic truth.

## Crop and northern join

[The crop](boundary.json) traces the native inner neatline with a conservative
approximately 12 px inset. Original scan coordinates remain unchanged. The
[overview](coverage-overview.jpg) shows cyan crop, magenta control hull, white
saved controls and yellow checks. This is a reversible content mask.

[The join comparison](northern-join.jpg) uses the verified Judique frozen TPS
raster, retaining its known southern lake error, and this Sheet 22 affine draft.
Both panels show the same geographic window with modern water/roads. Across 101
samples of the facing edges, the signed extent difference ranges from a **174 m
gap to a 165 m overlap** ([measurements](northern-join.json)). This excludes
rotated side corners and is an extent diagnostic, not feature agreement. The
stream offsets remain visible. No final shared seam or seamless tileset is ready.

## Artifacts and reproduction

Large files remain in `~/Downloads/fletcher-sheet22/result/`:

- `sheet22-supported-diagnostic.tif`: transparent outside the existing control
  hull; geographic gate still fails inside it.
- `sheet22-neatline-diagnostic.tif`: full cropped content, including unsupported
  east/southeast coverage.
- Matching PNG previews, native crosshairs, modern references, projected cutlines
  and raster metadata.

Both TIFFs are RGBA, affine, EPSG:3857, cubic resampled on a shared 5 projected
metre working grid (about 3.5 ground metres here). This cell size is not an
accuracy claim or the final XYZ tile grid. [Hashes](artifact-receipt.json)
identify the outputs. The [editable CSV](sheet22-controls-checks.csv) is for the
**original native scan**, with affine selected in NSMtS. Do not attach its native
pixel coordinates to the resampled GeoTIFF; that file has embedded positioning.

```sh
python reports/fletcher/sheet22/build_draft.py \
  --out /path/to/output \
  --source /path/to/native/sheet22.png \
  --reference-dir /path/to/reference \
  --judique-dir /path/to/judique-boundary-checks/result
```

Requires NumPy, SciPy, Pillow, Matplotlib and GDAL CLI tools on PATH. Omit
`--judique-dir` to omit the join comparison. `--score-only --out /path/to/output`
replays both fits without source/reference rasters. Input hashes, saved numeric
strings, GDAL/NumPy affine agreement, crop/hull containment, sampled Jacobian
signs, raster grid alignment and alpha range are checked by the build.

## Verification

The actual 8157×5305 supported diagnostic was imported through NSMtS's My Maps
file input in isolated Chromium at `http://127.0.0.1:4197`. The Browser plugin was
not available, so regular Playwright was used. The layer was enabled and its
painted canvas checked, then the page reloaded. Embedded EPSG:3857 positioning,
enabled state, native dimensions and the original TIFF hash survived. The saved
4096×2664 display preview retains transparent and opaque pixels; that preview
resolution is distinct from the preserved source dimensions.

See [browser receipt](browser-verification.json), [desktop render](browser-desktop.jpg)
and [mobile render](browser-mobile.jpg). No runtime/console errors were observed
in the successful run. This checks import/render/persistence, not geographic
accuracy or native iOS/Safari behaviour. No production browser records changed.

Full rendering and score replay, Ruff, and all 257 existing Fletcher tests pass.
No application code or live layer was replaced. Hosted CI is reported on the PR.

## Remaining geographic work

Audit the saved controls around Q01/Q04 against additional persistent features,
then add independent controls along the northern join and eastern/southeastern
land. Any justified revision must preserve this failed baseline and use new
checks for acceptance. Judique's southern lake region also needs correction.
Choose a shared seam only after physical features agree across that join.

Imagery: David Rumsey Map Collection, David Rumsey Map Center, Stanford University
Libraries. CC BY-NC-SA 3.0 and the project's recorded permission apply; see the
[rights record](../INVENTORY.md). Crop, annotations and warp are modifications.
Modern vectors: Nova Scotia NSTDB 1:10k; see reference receipts above.
