# Web "Your Maps" PR 4 — GeoPDF Import Design

**Date:** 2026-07-27; revised 2026-07-28
**Status:** Approved by the maintainer on 2026-07-28
**Target:** `feature/web-geopdf-import` → `nightly`
**Surface:** Web map only

## Goal

Let a user import page 1 of a PDF as a browser-local user map. A GeoPDF with
supported, validated registration uses its embedded coordinates without asking
the user to place control points. A page with one valid registration renders
immediately. A page with several valid registrations either uses an
independently proven producer-specific main-map rule or asks the user which
registered frame to use, then renders that frame immediately. Nothing is
uploaded.

The feature must not claim broad GeoPDF compatibility from the presence of a
dictionary or a successful page render. Automatic placement is limited to
registration variants proven against real files and an independent GDAL oracle.
Manual control-point georeferencing is limited to genuinely missing, malformed,
unsupported-CRS, unsupported, or unreadable registration. Ordinary multi-frame
USGS GeoPDFs are not manual-georeferencing fallbacks.

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
| Automatic compatibility | Probe both `/Measure` and `/LGIDict`; ship only variants independently proven by the frozen spike evidence plus the revised candidate/frame validation pass. |
| Readable fallback | Missing, unsupported, unsupported-CRS, malformed, or unreadable registration becomes a successful plain-scan import and opens the manual georeferencer. Multiple valid registrations do not. |
| Valid registration | Render immediately and retain **Adjust points**. Extracted registration is stored as ordinary affine GCPs. |
| One valid frame | Place it automatically from its embedded coordinates. |
| Multiple valid frames | Apply only an independently accepted, exact producer rule. Otherwise open a lightweight frame chooser; choosing a frame places it from embedded coordinates without GCP entry. |
| Frame heuristics | Never silently select the first, largest, or name-only candidate. A failed producer-rule match falls back to the chooser, not manual georeferencing. |
| Selected raster extent | Keep the complete opaque-white page-1 raster as the canonical pixel space, but draw only the selected registered source rectangle. Manual scans draw the complete page. |
| Selection versus adjustment | **Choose/Change frame** selects embedded registration. **Adjust points** edits the selected registration. They are separate actions and states. |
| Dependencies | Use PDF.js for rendering and pdf-lib for low-level dictionary traversal. Both are lazy-loaded only after a PDF is selected. |
| Passwords | No password UI in v1. Ask the user to unlock or export the PDF first. |
| PDF appearance | Render the page against an opaque white background, matching paper/PDF viewing rather than turning blank paper into transparent map pixels. |

## Non-goals

- Importing or choosing pages after page 1.
- PDF layer/optional-content controls.
- Password entry or decryption UI.
- Executing actions, scripts, forms, links, or attachments.
- Extracting PDF vector features as GIS layers.
- Inferring a frame from array order, source-frame area, a generic label match,
  or GDAL's internal choice.
- Supporting arbitrary polygonal cutlines in v1. The proven USGS source frames
  are normalized to finite registered rectangles; an unproven non-rectangular
  frame is unsupported until separately evidenced.
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
  geoPdfFrameSelection.ts
  geoPdfFrameSelection.test.ts
  geoPdfWorker.ts

web/src/userMaps/components/
  GeoPdfFrameChooser.tsx
  GeoPdfFrameChooser.test.tsx
```

Responsibilities:

- `geoPdfSource.ts` coordinates lazy loading, page-1 rasterization, error
  mapping, and the normalized parser result.
- `geoPdfMetadata.ts` contains pure extraction and validation logic over
  pdf-lib objects and returns every valid page-1 candidate. It has no React,
  Leaflet, IndexedDB, or DOM dependencies.
- `geoPdfFrameSelection.ts` contains the pure, versioned producer-rule matcher.
  A no-match result always preserves the candidates for user selection.
- `geoPdfWorker.ts` is the off-main-thread entry point selected by the spike.
  Worker messages return typed success or typed user-facing failure results.
- `GeoPdfFrameChooser.tsx` is an accessible radio-group chooser over the
  canonical page preview. It highlights one registered source rectangle at a
  time and confirms a frame without invoking the georeferencer.
- `useUserMaps.ts` only chooses the parser, converts its normalized result into
  a record, persists it, and selects the automatic-render, frame-selection, or
  manual-editor outcome.

`UserMapRecord` gains an optional generic `sourceRect` in original-raster pixel
space. Existing records omit it and continue to draw the complete image.
`recordMesh`, the georeference session's draft-mesh construction, and
`WarpedRasterLayer` receive that already-normalized rectangle; none inspects
PDF metadata. The mesh builders evaluate their lattice over the rectangle and
the renderer builds the matching source lattice over the same rectangle. No
PDF-specific branch is added to `useGeoreferenceSession`, the affine/TPS
solvers, or `MapCanvas`.

## Normalized parser result

```ts
type PdfRegistrationFlavor = "measure" | "lgidict";

type PdfManualReason =
  | "absent"
  | "unsupported"
  | "unsupported-crs"
  | "invalid"
  | "unreadable";

type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfRegistrationCandidate = {
  id: string;
  flavor: PdfRegistrationFlavor;
  embeddedLabel: string | null;
  sourceRect: PixelRect;
  gcps: Gcp[];
};

type ParsedPdfRegistration =
  | {
      status: "automatic";
      selection:
        | { kind: "sole" }
        | { kind: "producer-rule"; ruleId: string };
      selected: PdfRegistrationCandidate;
      candidates: PdfRegistrationCandidate[];
    }
  | {
      status: "selection-required";
      candidates: PdfRegistrationCandidate[];
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
        status: "embedded";
        flavor: PdfRegistrationFlavor;
        selection:
          | { kind: "sole" }
          | { kind: "producer-rule"; ruleId: string }
          | { kind: "user" };
        selectedFrameId: string;
        selectedLabel: string | null;
        candidates: PdfRegistrationCandidate[];
        adjusted: boolean;
      }
    | {
        status: "selection-required";
        candidates: PdfRegistrationCandidate[];
      }
    | {
        status: "manual";
        reason: PdfManualReason;
        adjusted: boolean;
      };
};

type UserMapRecord = {
  // existing fields unchanged
  sourceRect?: PixelRect;
  pdf?: PdfImportMetadata;
};
```

Existing records omit `pdf`, so this is an additive IndexedDB value change and
does not require a database-version migration.

An automatically or manually selected embedded frame starts with
`adjusted: false`. A real GCP addition, deletion, or move sets it to `true`;
merely opening the editor does not. Manual-fallback records also begin false and
become true when the user creates or changes points. Changing affine/TPS method
alone does not claim that the points were adjusted.

The record retains `source: "geopdf"` even after manual adjustment. That
preserves file identity without pretending the final placement is still solely
embedded metadata.

A `selection-required` record stores the full-page preview and normalized
candidates, has no selected `sourceRect`, is excluded from visible-map
rendering, and exposes **Choose frame** rather than **Georeference**. This is a
separate readiness state from `needsGeoreferencing(record)`.

After a frame is selected, its GCPs become the record's ordinary affine GCPs
and its source rectangle becomes `record.sourceRect`. Keeping every candidate
allows **Change frame** without reparsing the PDF. Changing an unadjusted frame
is immediate. If `adjusted` is true, the UI confirms that choosing a different
frame will replace the edited points with that frame's original embedded
points.

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
10. Inspect page 1 for supported geospatial registrations.
11. Normalize every independently valid registration into a labelled candidate
    containing WGS84 affine GCPs and a finite source rectangle in canonical
    raster pixel space.
12. Keep only candidates whose coordinates, source rectangle, existing affine
    solver, and mesh gates all pass. Classify rejected registrations for
    focused tests and corpus evidence, but never offer them as frames.
13. If there is one valid candidate, select it automatically.
14. If there are several, apply an accepted producer-specific rule. A no-match
    result preserves every candidate and returns `selection-required`.
15. If there are no valid candidates, return a typed manual reason while
    preserving the rendered page.
16. Persist the untouched PDF, canonical PNG, record, candidates, and PDF
    provenance using the existing store.
17. Automatic records render immediately. Selection-required records open the
    frame chooser. Manual records open the existing georeferencer.

Batch imports remain sequential, matching the current progress and outcome
model. The first selection-required record opens in the frame chooser. If none
need selection, the first manual record opens in the georeferencer. Later
records retain distinct **Choose frame** or **Needs georeferencing** rows.

## Worker and memory model

The preferred topology is one feature worker that parses metadata and renders
through `OffscreenCanvas`. It receives the PDF `ArrayBuffer` by transfer and
returns the preview plus normalized metadata.

The separate unresolved browser/worker acceptance pass must test that topology
in current Chrome, Firefox, and Safari. If PDF.js cannot render reliably from
that worker context, the accepted fallback topology is:

1. pdf-lib metadata extraction in a dedicated feature worker;
2. transfer the original buffer back rather than copying it;
3. PDF.js document parsing in its supported worker;
4. page painting on the main-thread canvas; and
5. acceptance only if measured long tasks stay within the responsiveness gate.

If neither topology meets compatibility and responsiveness acceptance,
shipping stops and the design is revisited.

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
  leaving the canonical page unexpectedly;
- the transformed viewport bounding box becomes a finite, positive-area source
  rectangle within the canonical page; and
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

For the evidenced TerraGo-era USGS variant, a candidate's `Neatline` must be a
closed four-corner rectangle after duplicate closing-point removal. It is
transformed through the page viewport into the canonical source rectangle.
Arbitrary polygonal or self-intersecting neatlines are outside v1 rather than
being reduced to their bounding box.

## Candidate and ambiguity rules

Candidate validity and frame selection are separate passes. The metadata
extractor never returns a preferred candidate; it returns all independently
usable candidates in stable document order solely for display and provenance.
The selection pass must not treat that order as a rank.

- No geospatial candidate: `manual/absent`.
- A recognized family whose structure is outside the proven support matrix:
  `manual/unsupported`.
- A supported structure declaring a CRS outside the project's verified
  conversion set: `manual/unsupported-crs`.
- A supported structure with malformed, non-finite, contradictory, or
  numerically refused values: `manual/invalid`.
- A registration whose public PDF objects cannot be read reliably:
  `manual/unreadable`.
- Exactly one independently valid candidate: `automatic/sole`.
- Several independently valid candidates plus an accepted exact producer-rule
  match: `automatic/producer-rule`.
- Several independently valid candidates without that match:
  `selection-required`.

If a page contains several registrations but exactly one passes the complete
candidate gate, that candidate is the sole valid registration and may be
placed automatically. Rejected registrations remain in diagnostic evidence but
are not offered as selectable frames.

### Evidence-gated USGS main-map rule

The proposed v1 rule ID is `usgs-ustopo-map-layers-v1`. Each allow-list entry
is an exact selector signature: producer string, registration family/page
structure, and complete sibling-label multiset. An entry may be enabled only
after its own holdout gate below passes. A match requires all of:

- an allow-listed exact PDF producer signature;
- the allow-listed `/Measure` or `/LGIDict` page structure for that signature;
- one allow-listed complete sibling-label multiset for that structure;
- exactly one valid candidate whose decoded, outer-whitespace-trimmed embedded
  label is exactly `Map Layers`;
- no duplicate `Map Layers` label;
- every sibling expected by that signature to be present and independently
  valid; and
- the selected candidate to pass the same coordinate, affine, source-rectangle,
  and mesh gates as a sole candidate.

The rule does not inspect candidate index or source-rectangle area. Reordering
candidates or changing their relative sizes must not change its answer. Any
unknown producer, version, label set, duplicate label, missing sibling, invalid
sibling, non-rectangular source frame, or other structural difference is a
clean no-match and opens the chooser.

The five recorded USGS files are the discovery corpus, not holdout evidence.
They support proposing the rule because all five contain one candidate labelled
`Map Layers`, but they disprove generic shortcuts:

- current `/Measure` files list `Map Layers` first, while both legacy
  `/LGIDict` files list `Quadrangle Location` first; and
- both legacy files give `UTM Grid and Projection` a larger neatline rectangle
  than `Map Layers`.

The selector therefore cannot be approved as "first", "largest", or
label-only, and cannot be validated only against the files from which the rule
was derived.

## Numerical gates

Extracted points use `method: "affine"`. Automatic TPS is prohibited because
embedded registration does not imply a curved historical-map warp.

Before automatic placement:

- source and destination values must be finite;
- source points must be distinct and well distributed;
- WGS84 latitude/longitude values must be valid;
- the source rectangle must be finite, positive-area, and contained within the
  canonical page except for the existing floating-point edge tolerance;
- the existing affine conditioning gate must pass;
- the existing anisotropy gate must pass;
- `needsGeoreferencing(record)` must be false; and
- `meshForRecord(record)` must return a drawable mesh evaluated over the
  selected source rectangle rather than the complete PDF page.

The importer uses the existing solvers rather than duplicating their
thresholds.

## User experience

Automatic example:

> `county-map.pdf added — page 1 of 4, placed from embedded GeoPDF metadata.`

The layer renders immediately at the standard opacity. Its row identifies the
source as GeoPDF, the selected embedded frame, and whether selection was sole,
producer-rule, or user-made. It offers **Change frame** whenever more than one
candidate was retained and **Adjust points** for the selected frame.

Multiple-frame example:

> `county-map.pdf added — page 1 contains 3 registered frames. Choose the map
> frame to display.`

The frame chooser:

- shows the opaque-white page-1 preview without a basemap;
- uses a labelled radio group containing the exact embedded label for each
  valid candidate, or `Unnamed frame N` when no label exists;
- highlights the selected candidate's source rectangle on the page preview;
- does not call a candidate `Main map` unless an accepted producer rule
  establishes that meaning;
- confirms with **Use this frame**; and
- offers no map click, GCP control, affine/TPS choice, or accuracy claim.

Confirming a frame copies its embedded GCPs and source rectangle into the
record, closes the chooser, fits the live map to the selected drape, and
renders it immediately. The full opaque-white page remains the canonical
preview, but `WarpedRasterLayer` evaluates and draws only the selected source
rectangle. This prevents page margins and other registered insets from being
extrapolated through the chosen frame's transform.

Manual outcomes are successful additions:

- “No supported geospatial registration was found. Add matching points to
  place it.”
- “This GeoPDF registration uses an unsupported coordinate system. Add
  matching points to place it.”
- “The embedded positioning could not be validated. Add matching points to
  place it.”
- “The embedded positioning could not be read. Add matching points to place
  it.”

When `pageCount > 1`, every automatic, selection-required, or manual outcome
also says that only page 1 was imported.

The saved map name remains the filename without its extension. The layer row
keeps controls compact and presents page, frame, registration, selection, and
adjustment provenance as secondary status text. A selection-required row says
**Choose frame**, never **Needs georeferencing**. Once selected, choosing
**Adjust points** opens the existing georeferencer with the embedded points
already present.

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

The completed 2026-07-27 compatibility spike froze five official USGS files:
three current `/Measure` products and two pre-June-2017 `/LGIDict` products.
They prove that both families expose readable page-1 registrations through
pdf-lib's public APIs. The previous stop result was caused by the old contract
classifying all multiple registrations as manual ambiguity, not by absent or
unreadable geospatial metadata.

Those five files are now the discovery corpus. They remain immutable regression
inputs for frame extraction, source rectangles, labels, and coordinate
normalization, but they are not independent evidence for the producer rule
derived from their shared `Map Layers` label.

Do not rewrite the compatibility report's historical `BLOCKED` decision as
though the old no-selection contract passed. A new dated frame-selection
validation report records the corrected contract, candidate-level oracle
results, holdouts, negative controls, and revised decision. Extend the external
corpus ledger without deleting or changing the five original receipts. Change
fixture-manifest expected statuses only after the new evidence pass, with a
schema-version increment that makes the contract change explicit.

Before an `usgs-ustopo-map-layers-v1` selector signature is enabled, add at
least two untouched holdout files for that exact producer/family/sibling-label
combination. Select and hash them before inspecting their page dictionaries.
Across the holdouts, prefer different quadrangles, regions, publication runs,
dates, and page layouts. The discovery corpus contains one current
three-frame signature and two distinct legacy signatures with three and four
frames. Enabling all three therefore needs at least six new holdouts; a
signature may instead remain disabled while the chooser supports its proven
candidates. Evidence for one selector signature does not authorize another.
Unknown signatures use the chooser when their candidate structures are within
the independently proven extraction matrix.

The expanded corpus also includes negative controls for:

- reordered candidates;
- changed relative source-rectangle areas;
- duplicate and missing `Map Layers` labels;
- an otherwise similar non-USGS producer;
- an unknown USGS producer/version;
- unexpected or missing sibling labels;
- one invalid sibling; and
- an unproven non-rectangular frame.

Every negative control must return `selection-required` when several valid
candidates remain. It must never select first or largest and must never turn
valid multi-frame metadata into manual georeferencing.

Large corpus files stay outside Git. A tracked manifest records for each:

- authoritative source URL;
- retrieval date;
- SHA-256;
- producer and publication date where known;
- page count;
- observed registration family;
- producer signature, embedded frame labels, and normalized source rectangles;
- GDAL version and command;
- frozen `gdalinfo -json` result or the exact relevant extraction;
- expected candidate, selection, and support result; and
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

For every real-corpus candidate variant proposed for automatic placement or
the chooser, freeze:

- GDAL version;
- command and options;
- chosen page and frame;
- CRS;
- geotransform or GCPs;
- neatline/bounds where present; and
- expected raster and geographic coordinates.

The installed GDAL PDF driver exposes a `NEATLINE` open option. Use
`gdalinfo -oo NEATLINE=<embedded-name> -json` where it exposes the named
registration so each main map and inset is checked independently instead of
assuming GDAL's default frame. If a candidate cannot be selected through that
independent driver path, it needs a second independent decoder or an
authoritative known extent before the chooser may offer it. Our own pdf-lib
extractor cannot serve as its own oracle.

This is a support-matrix gate, not a claim that GDAL runs against a user's
private file at import time. At runtime the local file must match an
independently proven candidate structure and pass all numeric/source-rectangle
gates; no bytes leave the browser.

For the producer rule's selected `Map Layers` candidate, also record that its
registered ground extent agrees with the official USGS product footprint and
that its page source rectangle encloses the printed primary map rather than an
informational inset.

Freeze the tolerance before running the untouched holdouts. The acceptance
ceiling is one canonical raster pixel and five ground metres; use a tighter
threshold when the discovery measurements permit it. Both pixel and
ground-metre gates must pass, and neither threshold may be loosened after a
failed holdout.

## Automated verification

### Metadata unit tests

- Direct and indirect dictionaries.
- Page inheritance.
- Exact `/Measure` and `/LGIDict` variants in the support matrix.
- Coordinate and axis order with asymmetric signed values.
- Crop-box, media-box, rotation, and raster coordinate conversion.
- Missing, unsupported, unsupported-CRS, invalid, and unreadable results.
- Every valid candidate retains its label, flavor, source rectangle, and GCPs.
- Exactly one valid candidate becomes `automatic/sole`.
- Several valid candidates become `selection-required` without an accepted
  rule.
- The exact producer rule selects only its unique `Map Layers` candidate.
- Candidate reordering and relative-area changes do not affect rule selection.
- Unknown producer/signature, duplicate label, missing sibling, and invalid
  sibling cases return `selection-required`.
- Malformed values never produce automatic GCPs.

### Rasterization tests

- Only page 1 is requested.
- Page count is retained.
- Longest edge is exactly 4,096 px.
- Aspect ratio and rotation are correct.
- Background is opaque white.
- The canonical preview remains the complete page.
- PNG encoding failure becomes a typed error.
- Loading tasks, workers, documents, and canvases are released on success and
  every failure branch.

### Import integration tests

- A valid GeoPDF renders immediately.
- A multiple-frame GeoPDF persists as `selection-required`, opens the chooser,
  and never opens the georeferencer.
- Selecting each independently accepted main-map or inset candidate places it
  from embedded GCPs with no map click.
- Only the selected source rectangle is drawn; margins and sibling frames are
  not extrapolated through its transform in either saved-layer or
  **Adjust points** draft rendering.
- **Change frame** replaces the source rectangle and embedded GCPs.
- Changing an adjusted frame requires confirmation and resets `adjusted`.
- The first selection-required item in a batch opens; later ones remain
  manageable **Choose frame** rows.
- An unreadable registration imports as a manual draft and opens the editor.
- If no frame needs selection, the first manual item in a batch opens; later
  ones remain manageable **Needs georeferencing** rows.
- Original PDF and canonical preview survive IndexedDB reload.
- Candidate, rule, selection, frame, page, and adjustment provenance survives
  reload.
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
3. Import one real current `/Measure` and one real legacy `/LGIDict` USGS file.
4. For a rule-enabled signature, confirm automatic `Map Layers` selection and
   independently verified placement.
5. For a no-match signature, confirm **Choose frame** rather than
   **Georeference**.
6. Select the primary map and every independently accepted inset in turn.
   Confirm each uses embedded coordinates and only its source rectangle draws.
7. Confirm **Change frame** and the adjusted-points replacement warning.
8. Adjust an extracted point.
9. Reload and confirm raster, candidates, selection, placement, and provenance
   persistence.
10. Remove the map and confirm resources are released.
11. Import a plain PDF and complete the real scan-to-map georeferencing path.
12. Confirm only page 1 is imported from a multi-page file.
13. Confirm a clean console.

This browser/worker-topology matrix is a separate unresolved acceptance gate.
Metadata extraction, a passing producer rule, unit tests, or a production build
does not satisfy it. It is local/browser acceptance, not production deployment
proof.

## Spike exit rule

The corrected metadata decision is:

- a failed or insufficiently evidenced producer rule disables that rule and
  uses the frame chooser;
- several valid frames never fall back to manual GCP placement;
- a registration family is supported only when every candidate variant offered
  by its support matrix has real-corpus independent-oracle evidence within the
  frozen pixel and ground gates, and each runtime candidate matches that exact
  structure and the numeric gates;
- a family whose embedded candidates cannot pass those gates remains
  unsupported and may use the typed manual fallback; and
- if neither real registration family can place a selected frame from embedded
  coordinates, stop. A page renderer with manual-only placement is not an
  acceptable product.

After separate implementation authorization, metadata and chooser work may
proceed without an approved automatic USGS rule because the chooser is the
fail-closed, useful path for valid multi-frame files. Enable
`usgs-ustopo-map-layers-v1` only for each exact producer signature that passes
its untouched holdouts and negative controls with zero selection errors.

Shipping remains blocked until the separate browser/worker-topology gate proves:

- extraction uses pdf-lib public APIs and no PDF.js internals;
- page-1 rasterization and selected-frame drawing work in the required browser
  matrix;
- the responsiveness and cleanup gates pass; and
- the dependency chunks and PDF.js assets remain lazy and local.

If neither worker topology passes, stop regardless of metadata success. Do not
reinterpret a metadata pass, local build, or chooser test as browser
acceptance.

## Documentation and publication

Implementation updates:

- `README.md`: PDF page-1 behavior, automatic-versus-selection-versus-manual
  contract, and local privacy.
- `ARCHITECTURE.md`: parser boundary, lazy dependencies, registration support
  matrix, producer-rule gate, chooser boundary, selected source rectangle,
  canonical PDF pixel space, and provenance field.
- `plan.md`: mark GeoPDF PR 4 complete only after implementation and
  verification.

The feature PR targets `nightly`. Local gates, hosted CI, merge, KinNoKi
publication, and live custom-domain acceptance remain separate states.
