# Web Georeferenced PDF Export Design

## Purpose

Add a direct, downloadable **georeferenced PDF export** to the NS Marks The
Spot web map. One exported file must serve four confirmed consumers:

1. **Field GPS apps** (Avenza Maps and similar) — load the PDF on a phone and
   see a live GPS position over the historical map.
2. **Paper printing** — a composed, attractive Letter page with title block,
   optional legend, scale bar, and neatline.
3. **GIS interchange** — QGIS and GDAL open the file as a correctly
   georeferenced raster.
4. **Sharing and archiving** — a self-contained record of what the map showed,
   with sources, licences, dates, and a share QR.

The existing print system deliberately deferred "direct one-click PDF
generation" (`2026-07-23-web-map-print-export-design.md`, Non-Goals). This
design fills that gap. It does not replace the `window.print()` flow, which
remains the path for the research sheet and evidence appendix.

This feature is a rendered presentation of the map's existing state. It is not
a new evidence engine, raw-data export, survey product, or accuracy claim
beyond the registration contract stated below.

## Chosen Approach

A fully client-side pipeline in four units:

1. a **paper frame selector** on the live map that fixes the exported extent;
2. a **headless map compositor** that renders the framed extent to an
   offscreen canvas at export resolution;
3. a **georeferencing registration writer** that stamps the page with both
   GeoPDF flavours (ISO 32000 `/Measure` + `/VP`, and OGC Best Practice
   `/LGIDict`); and
4. a **PDF composer** that assembles the page from a declarative template —
   map image plus vector-drawn text, neatline, scale bar, legend, attribution,
   and QR — using the already-pinned `pdf-lib@1.17.1`.

This approach is preferable to:

- **screenshotting the print preview DOM** (html2canvas or similar), which
  rasterizes text, inherits tile CORS taint fragility, inflates file size, and
  still requires the registration writer; and
- **batch GDAL generation in `tools/`**, which cannot power an interactive
  in-app export because the deployment is a static site with no server.

Writing both registration flavours on one page follows current and historical
USGS practice, costs roughly a kilobyte, and maximizes consumer compatibility.
The repository already parses both flavours
(`web/src/userMaps/parsers/geoPdfMetadata.ts`), so every writer change is
validated by round-tripping through the existing reader.

## Entry Point and Frame Selection

A map-level **Export map (PDF)** action sits in the side panel near the
existing print entry. Unlike print, it does **not** require a selected parcel:
a field map over any area is valid. The selected-parcel inspector's print
action is unchanged.

Activating export enters **frame mode** on the live map:

- A paper-shaped rectangle — the template's map area at the current
  orientation, correct aspect ratio, margins already subtracted — appears
  centred on the viewport.
- The user drags to reposition and resizes from corner handles. Resizing
  preserves aspect; it changes the map scale, not the page shape.
- A compact toolbar shows: a **portrait / landscape** toggle that flips the
  frame aspect in place, a live computed scale readout ("≈ 1:9,400"), and
  **Cancel** / **Continue** actions.
- The frame never rotates. Exports are north-up Web Mercator, matching the
  on-screen map.

Letter is the only page size in the first version. Page dimensions are
constants in the template file, so adding A4 later is a constant, not a
redesign.

## Export Dialog

**Continue** seals the frame bounds and opens the export dialog:

- **Title, Subtitle, Notes** — free-text fields, pre-filled from context: the
  selected parcel (PID/AAN) when one is selected, otherwise the dominant
  visible historical sheet name, otherwise a neutral default. All three are
  editable before export.
- **Legend** — a checkbox, on by default, controlling the boxed legend block.
  The attribution and licence strip is always rendered and has no control.
- A **live layout mock** — a lightweight HTML approximation of the chosen
  template so edits to title or legend are visible immediately. The real page
  is drawn only by the PDF composer at download time; the mock is a
  presentation aid, not the renderer.
- **Download** — runs the compositor with per-layer progress, then the
  composer, then saves the file. Cancel is available throughout.

The file name is the slugified title plus the capture date
(`inverness-mabou-harbour-2026-07-30.pdf`). PDF DocInfo carries Title, the
application name as Producer, and the creation date.

## Templates

One declarative template file per orientation under
`web/src/print/pdf/templates/`. A template is data, not layout code: a typed
object naming the page size in points, margins, and a list of blocks with
rectangles and style tokens:

- **Map frame** — the dominant block, drawn with a thin neatline border.
- **Title block** — title, subtitle, and notes with a clear type hierarchy.
- **Legend box** (optional) — one row per rendered layer: a swatch and the
  layer name, sourced from `renderedPrintLayerSources()`; plus the historical
  sheet citation and the capture date. When the catalog defines a symbol
  colour the swatch uses it; otherwise a neutral chip.
- **Scale bar** — round increments (1 / 2 / 5 × 10ⁿ metres) sized from ground
  distance at the frame's centre latitude via the existing
  `groundMetresBetween`, spanning roughly a quarter to a third of the map
  width.
- **North arrow** — a small vector glyph; trivially vertical because exports
  are north-up.
- **Attribution strip** — always present: rendered sources, licence names and
  URLs, and the capture timestamp, reusing the print system's attribution
  services.
- **QR block** — the share URL QR from the existing `printQr` service,
  embedded as a small image. The share URL obeys the same location-privacy
  rules as the print flow
  (`docs/superpowers/plans/2026-07-23-web-map-print-location-privacy.md`).

Typography uses pdf-lib's built-in standard fonts (Helvetica family) in the
first version — no new dependency. The template's font slot is a named token,
so a later custom-font upgrade via `@pdf-lib/fontkit` changes the token
binding, not the templates.

"Easy to edit" therefore means two things, both in scope: end users edit
title, subtitle, and notes in the dialog; the developer restyles margins,
blocks, and type by editing one small template file per orientation.

## Map Compositor

`mapCompositor.ts` is headless and Leaflet-free: input is the sealed frame
bounds, the output pixel size, and the visible-layer descriptors; output is a
canvas plus a per-layer status report. Layer families composite as follows:

- **XYZ tile layers** (basemap, Fletcher and Church pyramids): compute the
  tile set covering the bounds at the zoom nearest the export resolution,
  fetch with CORS enabled, and draw by plain tile math against the existing
  `webMercator.ts`. The Fletcher sheet bounds table in `fletcherLayer.ts`
  limits fetches to sheets intersecting the frame.
- **ArcGIS layers**: one bbox export-image request per service at the exact
  output size. The server rasterizes parcel lines, labels, and symbology, so
  the client re-implements no styling.
- **User-imported maps**: warped with the same triangle-mesh primitives
  (`mesh.ts` — `buildSrcMesh`, `affineFromTriangles`) that power
  `WarpedRasterLayer`.
- **Selected parcel highlight**: drawn as a vector ring from the geometry
  already sealed in the print snapshot, when a parcel is selected.

Layers composite in the same z-order as on screen (the pane registry in
`mapPanes.ts` is the ordering authority), with the same opacity settings.

First-version layer coverage is every raster-servable layer plus the
selected-parcel vector. Client-only vector decorations — the measure tool's
drawings in particular — are excluded; if one is active when export starts,
the dialog says so plainly.

## Resolution and Memory Budget

The target is **300 DPI** for the Letter map area, roughly 2,550 × 3,300 px
worst case — inside the established 4,096 px per-dimension canvas cap. On
mobile Safari the export follows the memory-budget findings from the GeoPDF
import work and drops to roughly 150–200 DPI. Any reduction is stated in the
dialog before download ("Rendering at 200 DPI to fit this device's memory"),
never applied silently. Tile zoom is chosen to match the output resolution so
historical sheets stay sharp.

## Georeferencing Registration

`geoRegistration.ts` writes both flavours against the map image's placed
rectangle on the page. Coordinates are geographic WGS 84 longitude/latitude,
matching what the existing parser normalizes to.

`/Measure` + `/VP` emission contract:

- One viewport whose `/BBox` equals the map frame rectangle in PDF units.
- `/GPTS` lists the four frame corners as latitude–longitude pairs and
  `/LPTS` the corresponding normalized viewport corners, in consistent
  winding.
- `/GCS` declares geographic WGS 84.

`/LGIDict` emission contract:

- A registration whose `/CTM` maps PDF space to map coordinates and whose
  `/Neatline` is the map frame as an explicitly **closed** ring — the GeoPDF
  compatibility spike recorded GDAL's "Non closed ring" warning for
  open-ring producers, and this writer does not reproduce that defect.
- A geographic projection description consistent with the `/Measure` GCS.

Numerical gates:

- Round-trip through `geoPdfMetadata.ts` reproduces the frame corners to
  1 × 10⁻⁹ degrees for both flavours.
- Because the raster is Web Mercator and corner registration interpolates
  linearly in geographic space, interior deviation is nonzero. A unit test
  computes the worst-case interior ground deviation for representative frames
  (1:5,000 through 1:100,000 at Nova Scotia latitudes) and asserts it stays
  below one ground metre. This is the same registration model USGS topo
  GeoPDFs use; the test makes the error budget explicit instead of assumed.

## PDF Composition

`pdfComposer.ts` assembles the document with pdf-lib:

- The composited map canvas embeds as **JPEG at quality ≈ 0.85** to keep files
  in the size range field apps handle comfortably; everything else — text,
  neatline, scale bar, legend chrome, north arrow — is drawn as vector
  objects, so text prints crisp, remains selectable, and stays editable in
  Illustrator or Inkscape.
- One page per export. The research-sheet multi-page appendix stays in the
  `window.print()` flow.
- Output targets under ~15 MB at 300 DPI for a full-frame export; the test
  suite asserts an upper bound on a fixture export.

## Failure Behaviour

There is no silently incomplete map:

- Every compositor layer reports fetched / failed / skipped. Any failure
  surfaces in the dialog by layer name ("Waterfalls layer could not be
  included") with an explicit choice: proceed without it, or cancel.
- Tile fetches use CORS; a taint would poison the whole canvas, so a
  non-CORS-readable response is treated as that layer failing, not as a
  degraded success.
- The existing licence-acceptance gate applies to export exactly as it does
  to print. The attribution strip cannot be disabled.
- Export never mutates live map state; cancelling at any stage returns to the
  unchanged map.

## Module Layout

New code lives under `web/src/print/pdf/`:

- `templates/portrait.ts`, `templates/landscape.ts` — declarative template
  specs and shared template types.
- `mapCompositor.ts` — headless bounds-to-canvas renderer with per-layer
  status.
- `geoRegistration.ts` — dual-flavour registration writer.
- `pdfComposer.ts` — template + canvas + snapshot → PDF bytes.
- `ExportFrame.tsx`, `ExportDialog.tsx` — frame mode and dialog UI, wired in
  `App.tsx`, sealing state through the print-snapshot pattern.

The compositor, registration writer, and composer are Leaflet-free and
testable headlessly, matching the discipline of
`web/src/userMaps/transform/`.

## Testing and Verification

Automated (vitest, part of the standard `npm test` gate):

- Registration round-trip through the existing parser, both flavours, corner
  exactness and closed neatline asserted.
- Interior-deviation error budget test as specified above.
- Template invariants: every block inside the page, no overlaps between the
  map frame and text blocks, margins respected in both orientations.
- Scale-bar rounding and tile-selection math against `webMercator.ts`.
- Compositor integration with mocked tile fetches, including a forced
  per-layer failure asserting the status report.
- A fixture export asserting the file-size upper bound.

Real-world acceptance (manual, recorded under `docs/real-world-testing/`):

- `gdalinfo` reports the expected CRS and bounds.
- QGIS opens the file georeferenced and aligned with reference layers.
- Avenza Maps on a device shows the GPS position correctly on an exported
  historical map.

Local verification, hosted CI, merge, deployment, and device acceptance are
separate states and are reported separately.

## Non-Goals

- A4 or additional page sizes (template constants are ready for it).
- Round map-scale snapping in the frame selector (the readout is
  informational).
- Frame rotation or non-north-up exports.
- GeoTIFF, PNG, or raw-data export.
- Rendering catalog vector layers as PDF vector objects (the map is raster
  except the parcel highlight and template chrome).
- Custom embedded fonts (`@pdf-lib/fontkit` is a deliberate later upgrade).
- Multi-page output or evidence-appendix integration.
- Server-side or batch GDAL generation.

## Acceptance Criteria

1. From the side panel, a user can frame an area, toggle portrait/landscape,
   edit title/subtitle/notes, toggle the legend, and download a Letter PDF.
2. The exported page shows the framed map area exactly, with neatline, title
   block, scale bar with round increments, north arrow, attribution strip
   with licences and capture date, QR share link, and — when enabled — the
   legend of actually-rendered layers.
3. All text in the PDF is vector (selectable), and the file passes the
   round-trip, error-budget, and size tests.
4. `gdalinfo`, QGIS, and Avenza each read the georeferencing correctly on at
   least one portrait and one landscape export over a Fletcher-covered area.
5. A compositing failure in any layer is surfaced by name with a
   proceed-or-cancel choice; no export ships a silently missing layer.
6. `npm test`, `npm run lint`, and `npm run build` pass in `web/`.
