# Fletcher Sheet 20 — provisional full-sheet georeferencing

**Geographic acceptance failed.** The twelve-control repair has five fresh checks at **206.974876 m median / 269.898737 m worst**, exceeding the predeclared 100 m / 200 m limits. Actual warped imagery also shows serious upper Grand River and northeastern discrepancies. This is a draft research packet, not an accepted layer or publication change.

## Source and full boundary

The [David Rumsey native sheet](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2645~290013/manifest) is 10,792 × 7,662 pixels. `source-receipt.json` records native tile rectangles, hashes and decoded-pixel parity. Original PNG, TIFF, manifest and reference geometry stay outside Git under `/Users/dfakkeldy/Downloads/fletcher-sheet20`. Source SHA-256: `3be7a138e4fd1a42cef0a549b7317180718a36fc7134777323ff2f1f8eb053dc`.

The old repository observation file remains unchanged. Its latitude guide is ten minutes north of the native printed 45°40′ and 45°35′ labels. `search-guide-audit.json` and `graticule-labels.jpg` preserve this finding; the separate search guide uses those two confirmed labels. Printed coordinates are search aids only. No prior physical control set was used.

The complete mapped sheet includes St Peters Inlet, Grand River, Beauvais/Condon lakes, Ferguson Lake and the Saint Esprit coast. The southern mainland notch retains Red Point, Red Island, Michaux Point, its nearby island and mapped extensions below the neatline. Two separate rings retain both tiny southern AB islets with white margins. All three components use **one TPS**, not separate island placement. Full overview, native corners and southern close-up were personally inspected. Some caption fragments are incidentally retained in the broad mainland notch.

NSTDB references cover −60.87,45.55 to −60.45,45.76: 2,664 road features, 3,714 water lines, 2,921 water polygons, and a **returned-empty** rail response. The empty response is not proof of railway absence. URLs, queries, counts and hashes are in `reference-receipts.json`. Historical proposed railway marks are not modern alignment controls.

## Fit, diagnostics and fresh validation

`reviewed-fit.json` freezes eleven reviewed physical controls: Murchison Brook junction; Cape George, Chapel, St Peters, Saint Esprit and Michaux coast tips; Beauvais, Condon, Ferguson and McNab lake outlets; and Kemp Point. Native click corrections are preserved in proposal stages and crosshair figures. C11/J0188 and C12/J0222 are rejected, unscored upper Grand River proposals: the claimed lake outlet / eastern branch identities did not hold up in context.

Five independently selected diagnostics followed the initial freeze. Affine: 311.878076 m median / 707.262485 m worst. Initial TPS: 60.352208 / 269.144161 m. Q04, the Little Saint Esprit northwestern tributary mouth, failed at 269.144161 m. Its original wrong-land click and subsequent native corrections are retained. Q05's wrong eastern branch was corrected to J0677, the actual Murchison western mouth, before scoring.

Q04 became C14 with **identical pixel and world coordinates**. All eleven original fit records remain unchanged. `regional-fit-freeze.json` freezes this twelve-control repair before any fresh checks. Fit SHA-256: `511a3d1f8209ce7df876fc2a169b8cb01fe050c8cb6e0e5742066a580cd8c208`. Four reused diagnostics are 54.589578 / 170.373507 m; the same four under the initial fit were 57.075964 / 154.644622 m. Reused points are diagnostic evidence, not fresh validation.

| Fresh check | Physical feature | Ground error |
|---|---|---:|
| V01 | McNab lake northern tributary | 37.856143 m |
| V04 | Little Saint Esprit western tributary | 77.743161 m |
| V02 | Doctor Island south coast | 206.974876 m |
| V03 | St Peters Island north coast | 269.898737 m |
| V05 | Red Island south coast | 216.989151 m |

These five checks were never fitted. Red Island's historical elongated outline differs from the smaller modern island; its coast-tip identity carries explicit morphology uncertainty. Northern/eastern spatial coverage is inadequate and the printed “not explored” area remains unsupported. Passing a subset cannot accept the sheet.

## Actual raster and browser evidence

`/Users/dfakkeldy/Downloads/fletcher-sheet20/regional-fit/sheet-20-full-sheet.tif`

SHA-256: `5fa544e6c2b48f399dc93d6ab5a16970ed80363b03dec45bb589b0518b497f9b`. Dimensions: **8,381 × 6,114**, EPSG:3857, 5 projected metre cells, cubic resampling, RGBA, exact GDAL TPS (`-et 0`). Only the repaired twelve-control raster was rendered. Nine direct geographic raster windows were personally inspected: anchored tips and lake outlets are recognizable, but bay widths, island shapes, upper river routing, northeastern streams and the Grand River estuary disagree. The southern review visibly contains the mainland notch and both AB islets.

Coverage passes: **45,702,369** inset interior cells, **zero transparent holes**. All **72,292** sampled Jacobians have the expected negative sign (native Y points down), including 15/16 samples on the tiny islets. This is orientation and coverage evidence only.

Three actual northern comparisons against Sheet 17 were personally inspected. Northwest shorelines disagree; central and eastern windows show gaps between sheet frames. No seam is accepted. The western Sheet 21 comparison remains outstanding. `join-provenance.json` hashes both real GeoTIFFs.

Editable files: `sheet-20-controls.csv`, `sheet-20-diagnostic-review.csv` (12 controls + 4 reused checks), and `sheet-20-validation-review.csv` (12 + 5 fresh checks). The actual web parser round-trips all three; web/GDAL TPS predictions agree within 7.509e-9 projected metres. This does not prove a PNG/CSV browser mesh import.

Actual GeoTIFF UI import, desktop reload and mobile screenshots were personally inspected. Stored raster SHA, georeference, dimensions, alpha and enabled state survive reload, with zero console/page errors. Full browser evidence stays in `/Users/dfakkeldy/Downloads/fletcher-sheet20/regional-fit/browser`; the compact receipt is committed. Desktop shows all sheet components; mobile shows the responsive central map viewport.

## Replay and next work

Use the existing benchmark Python for `render.py`, `review_warp.py`, `review_join.py` and native `review_points.py`, with `/opt/local/bin` on PATH. `render.py` verifies the native source hash and renders all three rings together. Score `diagnostic-reused.json` and `validation.json` separately with `../full-sheets/score.py`. Use the existing Sheet 14 coverage verifier against `regional-fit/cutline.geojson`. `verify_import.ts` bundles with web's rolldown; `verify-browser.mjs` uses the local Vite server on port 4198 and an isolated Playwright profile.

Further repair needs supported north/east identities, investigation of the island displacement and a new frozen fit followed by genuinely fresh checks. Preserve all failed scores and proposal stages. Continue the queue with adjacent Sheet 21. This packet changes no application code, active production source, licence gate or deployment pin. Native builds are not a local georeferencing check. Hosted CI, geography, merge and publication are separate. Source/derived-image redistribution clearance remains separate from this research packet; no production acceptance is implied.
