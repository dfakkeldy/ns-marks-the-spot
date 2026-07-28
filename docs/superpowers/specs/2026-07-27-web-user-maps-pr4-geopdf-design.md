# Web "Your Maps" PR 4 — GeoPDF Import Design

**Date:** 2026-07-27  
**Status:** Approved in design review on 2026-07-27; written-spec review pending  
**Target:** `feature/web-geopdf-import` → `nightly`  
**Surface:** Web map only

## Goal

Let a user import page 1 of a PDF as a browser-local user map. A GeoPDF with
supported, validated registration renders immediately; every other readable PDF
page opens in the existing manual georeferencer. Nothing is uploaded.

The feature must not claim broad GeoPDF compatibility from the presence of a
dictionary or a successful page render. Automatic placement is limited to
registration variants proven against real files and an independent GDAL oracle.

## Readiness

This work starts from `origin/nightly` at `b972313db`, where the existing
user-map foundation is complete:

- GeoTIFF and PNG/JPEG import;
- browser-local IndexedDB persistence with session-only fallback;
- affine and TPS georeferencing;
- a shared warped-raster renderer;
- real mounted interaction coverage; and
- Allmaps Georeference Annotation export.

At design time the web surface passed 917 tests with one skip, lint, and a
production build. GeoPDF remains the explicit unchecked PR 4 item in
`plan.md`. The file sniffer already recognizes PDF magic bytes, the picker
accepts `.pdf`, and `UserMapSource` already reserves `"geopdf"`.

## Approved product decisions

| Decision | Approved choice |
|---|---|
| PDF page scope | Import page 1 only. Report the total page count and say explicitly when later pages were not imported. |
| Canonical raster | Render page 1 once with its longest edge exactly 4,096 px, preserving aspect ratio, crop box, and rotation. Those dimensions are the PDF map's permanent pixel space. |
| Automatic compatibility | Probe both `/Measure` and `/LGIDict`; ship only variants independently proven during the spike. |
| Readable fallback | Missing, unsupported, invalid, or ambiguous registration becomes a successful plain-scan import and opens the manual georeferencer. |
| Valid registration | Render immediately and retain **Adjust points**. Extracted registration is stored as ordinary affine GCPs. |
| Ambiguity | Never rank, guess, or silently select among multiple map frames. Open the manual georeferencer. |
| Dependencies | Use PDF.js for rendering and pdf-lib for low-level dictionary traversal. Both are lazy-loaded only after a PDF is selected. |
| Passwords | No password UI in v1. Ask the user to unlock or export the PDF first. |
| PDF appearance | Render the page against an opaque white background, matching paper/PDF viewing rather than turning blank paper into transparent map pixels. |

## Non-goals

- Importing or choosing pages after page 1.
- PDF layer/optional-content controls.
- Password entry or decryption UI.
- Executing actions, scripts, forms, links, or attachments.
- Extracting PDF vector features as GIS layers.
- Treating the PDF neatline as a cutline.
- Automatic TPS selection.
- Replacing the existing GeoTIFF, image, storage, georeferencer, or rendering
  paths.
- Native-app parity.
- Full compatibility with every producer-specific GeoPDF variant.

## Dependency boundary

PDF.js owns document loading, page count, page viewport calculation, and page
rasterization. Its supported display API does not provide a general arbitrary
PDF-object traversal contract.

pdf-lib owns low-level dictionary, array, name, number, string, and indirect
reference traversal for geospatial registration. The importer must use
pdf-lib's public object APIs; it must not reach into PDF.js internals.

Both libraries and their workers belong behind a dynamic import from the PDF
branch. A normal application load must not request their chunks.

The spike selects exact compatible versions and pins them in `package.json`.
Floating runtime ranges are not permitted for this parser boundary.

Primary references:

- [PDF.js](https://github.com/mozilla/pdf.js)
- [pdf-lib](https://github.com/Hopding/pdf-lib)
- [GDAL Geospatial PDF driver](https://gdal.org/en/stable/drivers/raster/pdf.html)
- [OGC GeoPDF Encoding Best Practice 2.2](https://docs.ogc.org/bp/08-139r3/08-139r3.pdf)
- [USGS GeoPDF overview](https://www.usgs.gov/faqs/what-a-geopdfr)

## Module layout

New logic remains inside the existing feature:

```text
web/src/userMaps/parsers/
  geoPdfSource.ts
  geoPdfSource.test.ts
  geoPdfMetadata.ts
  geoPdfMetadata.test.ts
  geoPdfWorker.ts
```

Responsibilities:

- `geoPdfSource.ts` coordinates lazy loading, page-1 rasterization, error
  mapping, and the normalized parser result.
- `geoPdfMetadata.ts` contains pure extraction and validation logic over
  pdf-lib objects. It has no React, Leaflet, IndexedDB, or DOM dependencies.
- `geoPdfWorker.ts` is the off-main-thread entry point selected by the spike.
  Worker messages return typed success or typed user-facing failure results.
- `useUserMaps.ts` only chooses the parser, converts its normalized result into
  a record, persists it, and selects the automatic-render or manual-editor
  outcome.

No PDF-specific branch is added to `WarpedRasterLayer`,
`useGeoreferenceSession`, the affine/TPS solvers, or `MapCanvas`.

## Normalized parser result

```ts
type PdfRegistrationFlavor = "measure" | "lgidict";

type PdfManualReason =
  | "absent"
  | "unsupported"
  | "unsupported-crs"
  | "invalid"
  | "ambiguous";

type ParsedPdfRegistration =
  | {
      status: "automatic";
      flavor: PdfRegistrationFlavor;
      gcps: Gcp[];
    }
  | {
      status: "manual";
      reason: PdfManualReason;
    };

type ParsedGeoPdf = {
  pixelSize: PixelSize;
  previewSize: PixelSize;
  preview: Blob;
  pageCount: number;
  registration: ParsedPdfRegistration;
};
```

For a PDF, `pixelSize` and `previewSize` are identical. The fixed raster is the
canonical image rather than a downsampled view of some larger intrinsic pixel
grid. GCPs therefore remain stable across reloads and devices.

## Persistent provenance

`UserMapRecord` gains an optional PDF-specific field:

```ts
type PdfImportMetadata = {
  pageNumber: 1;
  pageCount: number;
  registration:
    | {
        status: "automatic";
        flavor: PdfRegistrationFlavor;
        adjusted: boolean;
      }
    | {
        status: "manual";
        reason: PdfManualReason;
        adjusted: boolean;
      };
};

type UserMapRecord = {
  // existing fields unchanged
  pdf?: PdfImportMetadata;
};
```

Existing records omit `pdf`, so this is an additive IndexedDB value change and
does not require a database-version migration.

An automatically extracted record starts with `adjusted: false`. A real GCP
addition, deletion, or move sets it to `true`; merely opening the editor does
not. Manual-fallback records also begin false and become true when the user
creates or changes points. Changing affine/TPS method alone does not claim that
the points were adjusted.

The record retains `source: "geopdf"` even after manual adjustment. That
preserves file identity without pretending the final placement is still solely
embedded metadata.

## Import data flow

1. Apply the existing 500 MB file-size refusal before reading bytes.
2. Read the file once and identify it by `%PDF` magic bytes.
3. Dynamically load the PDF parser boundary.
4. Open the document without executing embedded actions.
5. Reject an encrypted document that requests a password with a specific
   unlock/export message.
6. Read `numPages` and request page 1 only.
7. Obtain the page viewport with the page's crop and rotation semantics.
8. Choose a scale whose longest output edge is 4,096 px and whose other
   dimension is at least 1 px.
9. Paint an opaque white background, render the page, and encode the canonical
   PNG preview.
10. Inspect page 1 for supported geospatial registration.
11. Normalize one valid registration into WGS84 affine GCPs in canonical raster
    pixel space.
12. Return automatic registration only if the existing affine solver and mesh
    gates accept those GCPs.
13. Otherwise return a typed manual reason while preserving the rendered page.
14. Persist the untouched PDF, canonical PNG, record, and PDF provenance using
    the existing store.
15. Automatic records render immediately. Manual records open the existing
    georeferencer.

Batch imports remain sequential, matching the current progress and outcome
model. The first manual record in a batch opens in the editor; later manual
records retain their **Needs georeferencing** rows.

## Worker and memory model

The preferred topology is one feature worker that parses metadata and renders
through `OffscreenCanvas`. It receives the PDF `ArrayBuffer` by transfer and
returns the preview plus normalized metadata.

The spike must test that topology in current Chrome, Firefox, and Safari. If
PDF.js cannot render reliably from that worker context, the accepted fallback
topology is:

1. pdf-lib metadata extraction in a dedicated feature worker;
2. transfer the original buffer back rather than copying it;
3. PDF.js document parsing in its supported worker;
4. page painting on the main-thread canvas; and
5. acceptance only if measured long tasks stay within the responsiveness gate.

If neither topology meets compatibility and responsiveness acceptance, the
spike stops and the design is revisited.

Every path must:

- terminate feature and PDF.js workers;
- destroy loading/document tasks;
- release pdf-lib document references;
- clear or release canvases after PNG encoding;
- revoke object URLs through the existing lifecycle;
- avoid retaining a second PDF byte copy after parsing; and
- preserve the existing session-only behavior if IndexedDB storage fails.

The 4,096-pixel output bounds the retained RGBA canvas to about 64 MiB for a
square page. It does not prove a bound on transient PDF decode memory, so real
large-file profiling remains an acceptance gate.

## `/Measure` extraction contract

A `/Measure` candidate is eligible only when all of the following are proven
for its exact structure:

- it belongs to page 1 through a usable viewport;
- the viewport has a finite, non-degenerate bounding box;
- the measure dictionary has `/Subtype /GEO`;
- `LPTS` and `GPTS` are finite numeric arrays of equal, even length;
- at least three distinct point pairs exist;
- coordinate ordering and CRS interpretation match the specification and the
  real-file oracle;
- local page points transform through crop, rotation, and raster scaling without
  leaving the canonical page unexpectedly; and
- ground points convert to finite WGS84 coordinates.

No alternate array ordering is tried after a validation failure. A format
variant either has evidence for its ordering or falls back.

## `/LGIDict` extraction contract

`/LGIDict` support is limited to the exact transform or registration-point
structures proven by the spike corpus. The extractor may follow indirect
references and inherited page entries using pdf-lib's public APIs, but it may
not infer missing projection, datum, axis order, or registration values.

An unknown `/LGIDict` shape is `unsupported`, not `invalid`. A known shape with
malformed values is `invalid`. Keeping those states separate makes later
compatibility work measurable.

## Candidate and ambiguity rules

Automatic placement requires one unambiguous usable registration for page 1.

- No geospatial candidate: `manual/absent`.
- One supported candidate that passes every gate: `automatic`.
- A recognized family whose structure is outside the proven support matrix:
  `manual/unsupported`.
- A supported structure declaring a CRS outside the project's verified
  conversion set: `manual/unsupported-crs`.
- A supported structure with malformed, non-finite, contradictory, or
  numerically refused values: `manual/invalid`.
- Multiple map frames, viewports, neatlines, or competing usable
  registrations: `manual/ambiguous`.

The importer does not copy GDAL's largest-neatline selection rule. Choosing a
frame is a user decision in this product because selecting the wrong inset can
place a plausible-looking map in the wrong location.

## Numerical gates

Extracted points use `method: "affine"`. Automatic TPS is prohibited because
embedded registration does not imply a curved historical-map warp.

Before automatic placement:

- source and destination values must be finite;
- source points must be distinct and well distributed;
- WGS84 latitude/longitude values must be valid;
- the existing affine conditioning gate must pass;
- the existing anisotropy gate must pass;
- `needsGeoreferencing(record)` must be false; and
- `meshForRecord(record)` must return a drawable mesh.

The importer uses the existing solvers rather than duplicating their
thresholds.

## User experience

Automatic example:

> `county-map.pdf added — page 1 of 4, placed from embedded GeoPDF metadata.`

The layer renders immediately at the standard opacity. Its row identifies the
source as GeoPDF and offers **Adjust points**.

Manual outcomes are successful additions:

- “No supported geospatial registration was found. Add matching points to
  place it.”
- “This GeoPDF registration uses an unsupported coordinate system. Add
  matching points to place it.”
- “The embedded positioning could not be validated. Add matching points to
  place it.”
- “Page 1 contains multiple geospatial map frames, so none was selected
  automatically. Add matching points to place it.”

When `pageCount > 1`, every automatic or manual outcome also says that only
page 1 was imported.

The saved map name remains the filename without its extension. The layer row
keeps controls compact and presents page/registration provenance as secondary
status text.

## Rejected imports and typed errors

A readable page with unusable geospatial metadata is never rejected.

Rejection is limited to:

- corrupt or truncated PDF;
- no readable page 1;
- password request;
- page viewport with unusable dimensions;
- PDF.js or canvas rasterization failure;
- existing file-size refusal; or
- an unexpected worker failure.

Add a typed password-protected error code and preserve the existing corrupt,
too-large, quota, and storage-failed meanings. Do not collapse a password
request into “corrupt file.”

## Privacy and active-content boundary

The importer receives bytes from the local `File`; it does not pass a URL to
PDF.js. All worker assets, CMaps, standard fonts, and code are bundled with the
application. The importer does not execute or expose:

- document JavaScript or actions;
- form submission;
- annotation links;
- embedded attachments;
- remote resources; or
- PDF vector features as interactive objects.

The existing “Files stay on this device — nothing is uploaded” line remains
visible throughout import.

## Spike corpus and provenance

The one-day spike runs before implementation details are committed.

The external corpus includes:

- independent modern USGS/open GeoPDF files;
- independent pre-June-2017 USGS/TerraGo files;
- at least one file with multiple frames or insets; and
- a large real file for memory observation.

Large corpus files stay outside Git. A tracked manifest records for each:

- authoritative source URL;
- retrieval date;
- SHA-256;
- producer and publication date where known;
- page count;
- observed registration family;
- GDAL version and command;
- frozen `gdalinfo -json` result or the exact relevant extraction;
- expected support result; and
- rights/provenance note.

Small committed fixtures include:

- an ISO-style GeoPDF generated from the existing NS UTM 20N raster fixture;
- a proven `/LGIDict` fixture with compatible redistribution terms;
- a plain PDF;
- rotated and cropped variants;
- a multi-page file with registration only after page 1;
- multiple-candidate registration;
- unsupported CRS;
- mismatched/truncated/non-finite arrays;
- password-protected PDF; and
- corrupt PDF.

Fixture generation commands and inputs are committed. CI does not download
external files or require GDAL.

## Independent oracle

GDAL is the comparison oracle because its PDF driver independently reads both
major geospatial registration families and rasterizes ordinary PDFs.

For every automatically supported real fixture, freeze:

- GDAL version;
- command and options;
- chosen page and frame;
- CRS;
- geotransform or GCPs;
- neatline/bounds where present; and
- expected raster and geographic coordinates.

The spike establishes a tolerance expressed in both canonical raster pixels and
ground metres. The tolerance must be smaller than a visibly meaningful
placement error and must not be loosened after a failed fixture.

## Automated verification

### Metadata unit tests

- Direct and indirect dictionaries.
- Page inheritance.
- Exact `/Measure` and `/LGIDict` variants in the support matrix.
- Coordinate and axis order with asymmetric signed values.
- Crop-box, media-box, rotation, and raster coordinate conversion.
- Missing, unsupported, unsupported-CRS, invalid, and ambiguous results.
- Multiple candidates never silently select a winner.
- Malformed values never produce automatic GCPs.

### Rasterization tests

- Only page 1 is requested.
- Page count is retained.
- Longest edge is exactly 4,096 px.
- Aspect ratio and rotation are correct.
- Background is opaque white.
- PNG encoding failure becomes a typed error.
- Loading tasks, workers, documents, and canvases are released on success and
  every failure branch.

### Import integration tests

- A valid GeoPDF renders immediately.
- An unreadable registration imports as a manual draft and opens the editor.
- The first manual item in a batch opens; later ones remain manageable rows.
- Original PDF and canonical preview survive IndexedDB reload.
- PDF provenance survives reload.
- A real GCP edit sets `adjusted`; merely opening the panel does not.
- Storage failure preserves the session-only map.
- Password, corrupt, and oversize outcomes remain distinct.

### Bundle verification

The production build must show PDF.js, its worker, and pdf-lib in lazy chunks
that are not dependencies of the initial application entry. The build receipt
records initial and lazy chunk sizes so the dependency cost is explicit.

### Repository gates

From `web/`:

```bash
npm test
npm run lint
npm run build
```

Run these on the final pushed branch head. Earlier or prerebase results do not
prove the published commit.

## Performance and browser acceptance

Record total duration, peak observed memory, and main-thread long tasks for:

- the small deterministic NS fixture;
- a normal 10–20 MB real GeoPDF;
- a large real stress fixture; and
- three consecutive import/remove cycles.

The user-visible responsiveness gate is:

- progress text paints before expensive work starts;
- map/UI input continues to respond during worker parsing;
- the accepted topology introduces no import-caused main-thread task longer
  than 200 ms on the reference desktop browser; and
- repeated import/remove cycles do not show monotonically retained PDF or
  canvas memory after cleanup.

Total import duration is recorded rather than normalized into a universal time
limit; valid PDF complexity varies too widely for a truthful fixed promise.

Manual rendered acceptance covers current desktop Chrome, Firefox, and Safari,
plus mobile Safari:

1. Import the deterministic NS GeoPDF.
2. Confirm automatic placement against known live-map features.
3. Confirm page and registration status.
4. Adjust an extracted point.
5. Reload and confirm raster, placement, and provenance persistence.
6. Remove the map and confirm resources are released.
7. Import a plain PDF and complete the real scan-to-map georeferencing path.
8. Confirm only page 1 is imported from a multi-page file.
9. Confirm a clean console.

This is local/browser acceptance, not production deployment proof.

## Spike exit rule

Proceed with implementation when:

- at least one registration family matches the independent GDAL oracle across
  independent real files;
- extraction uses pdf-lib public APIs and no PDF.js internals;
- page-1 rasterization meets the browser and responsiveness gate; and
- the dependency chunks remain lazy.

Ship both families only if each independently passes.

If one family fails, support the proven family and retain explicit manual
fallback for the other. If both families fail, stop and return to design. A
page renderer alone must not be presented as automatic GeoPDF support.

## Documentation and publication

Implementation updates:

- `README.md`: PDF page-1 behavior, automatic-versus-manual contract, and local
  privacy.
- `ARCHITECTURE.md`: parser boundary, lazy dependencies, registration support
  matrix, canonical PDF pixel space, and provenance field.
- `plan.md`: mark GeoPDF PR 4 complete only after implementation and
  verification.

The feature PR targets `nightly`. Local gates, hosted CI, merge, KinNoKi
publication, and live custom-domain acceptance remain separate states.
