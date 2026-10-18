# Web GeoPDF export — real-world test plan — 2026-07-31

## Scope and evidence boundary

Automated gates (GeoPDF registration round-trips, layout invariants,
headless-compositor pixel tests, and export-dialog interaction tests)
already passed in CI on `feature/web-geopdf-export`. This plan covers
what only real consumers — GDAL, QGIS, Avenza Maps, and plain PDF
readers — can verify. Local verification, hosted CI, merge to
`nightly`, KinNoKiLabsSite deployment, and device acceptance are
separate states; a pass in one does not establish another. Every
checklist below is **unrun** as of this entry — it is work to execute,
not a record of results. Record actual runs only in the Results table
at the bottom, and only after they have actually happened.

## Feature under test

"Export map (PDF)" in the side panel is gated only on Province
restricted-services licence acceptance — it does **not** require a
selected parcel. Flow: frame mode (drag/resize a paper-aspect rectangle
over the live map, portrait/landscape toggle, live "≈ 1:N" scale
readout) → Continue → export dialog (editable Title / Subtitle / Notes,
legend on/off, per-layer render progress) → Download.

Output is one Letter page, portrait or landscape. The map is a JPEG
raster; all text and chrome (title block, legend, scale bar with round
increments, north arrow, neatline, attribution strip) are vector. A QR
of the share URL is embedded as a PNG. Both flavours of georeferencing
are declared on the page — ISO 32000 `/Measure` + `/VP`, and OGC Best
Practice `/LGIDict` — in **EPSG:3857** (the raster's own projection,
which keeps the pixel→map transform affine-exact) with WGS 84 lat/lon
corner values in `/GPTS`. This was validated in CI by round-tripping
through the app's own GeoPDF parser, not by an external tool — that
external validation is exactly what this plan exists to add.

Resolution targets 300 DPI; constrained devices (iOS, low
`deviceMemory`, including modern iPadOS Safari, which reports as
Macintosh with touch points) start at 200 DPI, with a hard 4096 px
canvas cap and an honest effective-DPI report when the cap is hit.

Layers exported: OpenStreetMap basemap, Fletcher historical sheets
intersecting the frame, ArcGIS province layers (requested as bbox
export images), and the selected-parcel ring — composited in the same
order as the on-screen pane z-order, including aerial imagery correctly
below Fletcher. **User-imported maps are not exported in this
version**; if one is visible, the dialog names it so the omission is
never silent. Any layer that fails to composite is surfaced by name
with an explicit "Download anyway" or Cancel; cancelling (button,
Escape, or unmount) aborts the in-flight export — no file downloads
after a cancel.

## Exports under test

Produce two exports over a Fletcher-covered area (e.g. Mabou Harbour,
sheet 14): one Letter portrait, one Letter landscape, both with legend
on, modern basemap + Fletcher + property boundaries visible.

## GDAL (oracle)

- [ ] `gdalinfo <file>` reports `WGS 84 / Pseudo-Mercator` (EPSG:3857) —
      not geographic WGS 84. The registration is deliberately declared
      in the raster's own Web Mercator projection (see Task 4
      rationale in the plan), so this is the expected string, not a
      defect.
- [ ] Corner coordinates match the framed bounds (spot-check against
      the share URL's centre).
- [ ] No "Non closed ring" warning.

## QGIS

- [ ] Layer → Add Raster; the PDF lands aligned with an OSM basemap.
- [ ] The neatline edge sits within ~2 screen px of NSPRD parcel lines
      at 1:10,000.

## Avenza Maps (device)

- [ ] Import the PDF on a phone; the map opens with no "not
      georeferenced" warning.
- [ ] On location (or with a simulated GPX track), the position dot
      tracks correctly against the historical map.

## Acrobat / Preview (plain readers)

- [ ] Page renders correctly; text is selectable; file size noted.

## Results

| Date | Consumer | File | Result | Notes |
| ---- | -------- | ---- | ------ | ----- |
| _(none recorded yet — every row above is unrun; see Scope and evidence boundary)_ | | | | |

## Fixture notes

- Frame the export over a public, owner-free area; do not export or
  commit a fixture that surfaces a private note or address.
- Use the same public tax-sale PID convention as the existing print
  test plan (`docs/real-world-testing/2026-07-23-web-print-export-test-plan.md`)
  when including a selected-parcel ring in the export.
- Exported PDFs used for this plan are temporary acceptance artifacts;
  do not commit them to the repository.

## Known scope cut

User-imported maps are not exported in this version. The compositor
supports the warp path (covered by Task 5's tests), but App-level
wiring ships user-map layers empty — extracting decoded bitmaps from
`useUserMaps` records for compositing is a follow-up. The export
dialog names the omission whenever a user map is visible, so it is
never a silent gap; this plan does not add a check for it because
there is nothing to verify beyond "does the dialog say so," which is
already covered by automated tests.

## Automated gate log

Run from a clean `web/` working tree on 2026-07-31, on
`feature/web-geopdf-export`, immediately before committing this plan:

| Command | Result | Receipt |
|---|---|---|
| `npm test` | Pass | `test:scripts` (12 Node subtests) plus vitest: 102 test files passed, 1 intentionally skipped (live-service); 1,145 tests passed, 1 skipped. |
| `npm run lint` | Pass | ESLint completed with no errors or warnings. |
| `npm run build` | Pass | `tsc -b` and Vite production build completed. Vite retained its existing advisory for chunks over 500 kB (`geoPdfWorker`, `pdf.worker.min`, `index`, `invernessHydroPotential`); it is not a build failure. |

This row is local verification only. It is not hosted CI, not a merge,
and not a deployment — see the checklist above for what remains to be
proven by real consumers.
