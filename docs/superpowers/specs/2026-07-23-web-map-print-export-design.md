# Web Map Print and Export Design

## Purpose

Add a print-ready mode to the NS Marks The Spot web map for people researching
a selected parcel or carrying a paper map into the field. The first version
must reproduce clearly on a monochrome Letter printer and support browser
**Print / Save as PDF**.

This feature is a rendered presentation of the map's existing state and
evidence. It is not a new evidence engine, raw-data export, survey product, title
report, appraisal, access opinion, or source-completeness claim.

## Chosen Approach

Build one print-preview system with two purpose-specific templates:

1. **Research sheet** — Letter portrait, selected-parcel fit, one summary page,
   and an optional evidence appendix.
2. **Field map** — Letter landscape, current geographic view, one
   map-dominant page with a compact legend and receipt.

Both templates render from one sealed, immutable print snapshot and use the
browser's native print dialog for paper or PDF output. The first version does
not generate a downloadable PDF or PNG directly.

This approach is preferable to:

- printing the current application screen, which would make output depend on
  screen proportions and expose controls rather than a composed document; and
- building separate research and field export engines, which would allow PID,
  layers, sources, timestamps, and limitations to drift.

## Entry Point and Preview Flow

The selected-parcel inspector gains one **Print / export** action. A selected
PID is required in the first version.

Activating it opens an in-app, full-screen print preview. The preview contains:

- a two-choice template control for **Research** and **Field map**;
- fixed output metadata for paper, extent rule, and monochrome style;
- an **Evidence appendix** checkbox for the research template, on by default;
- an **Aerial imagery** checkbox, off by default;
- a readiness or warning panel;
- **Cancel** and **Print / Save PDF** actions; and
- a large preview of the page that will print.

The research template is selected initially. Switching templates changes the
orientation, extent rule, page count, and applicable controls without returning
to the live map.

The preview does not edit the live map. Cancelling or cancelling the browser
print dialog returns to the same frozen preview and preserves its choices.
Closing the preview returns to the unchanged live map.

The existing **Export evidence note** action remains separate. Markdown is the
machine-readable screening receipt; print/PDF is the composed human-readable
artifact.

## Print Capture and Immutable Snapshot

Opening preview immediately creates a capture token and freezes parcel identity,
map state, layer choices, and the evidence-request generation associated with
the selected PID. Evidence that was already pending for that PID may settle
inside this capture; a newer parcel selection, map request, or evidence
generation cannot enter it.

When every included evidence request reaches a terminal state or the bounded
readiness timeout expires, the capture is sealed as an immutable
`PrintSnapshot`. It is derived from the same normalized state and source
semantics used by map sharing and evidence-note export. It contains:

- selected PID and exact multipart parcel geometry;
- current or historical mode;
- selected current event or historical event identifiers;
- current map centre, zoom, and geographic bounds;
- enabled layer identifiers;
- settled layer status for every enabled layer;
- generated timestamp;
- mapped area and building-count state;
- civic-address state;
- assessment state;
- road and water context states;
- flood-hazard state;
- geology/resource state;
- historical-record context;
- official source and licence URLs; and
- the application URL from which the snapshot was created.

The snapshot preserves semantic states rather than flattening them to display
strings. In particular, returned results, returned-empty results,
outside-coverage results, source errors, and not-applicable states remain
distinct.

Panning, selecting another parcel, toggling a live-map layer, or receiving a
request from another capture token cannot mutate the capture or sealed
snapshot. The user must close and reopen preview to capture newer live state.

## Template-Specific Map State

Each template derives a print map state from the frozen snapshot.

### Research sheet extent

The research map fits the complete selected Polygon or MultiPolygon geometry
with consistent print padding. It must:

- retain every polygon part and hole;
- use a bounded close-detail zoom supported by the enabled parcel and context
  layers;
- avoid clipping narrow or unusually shaped parcels; and
- show an explicit layer zoom warning rather than silently implying that a
  below-threshold layer was rendered.

### Field map extent

The field map preserves the frozen live map's geographic bounds. Because the
print map has a different aspect ratio than the browser map, it fits the whole
frozen bounds and may reveal additional context in one dimension; it must never
crop part of the captured view.

### Reproducible print link

The written link and QR code encode the template's derived map position and the
layers that actually appear in print. Therefore:

- the research receipt opens the parcel-fit composition;
- the field receipt opens the field composition;
- excluding aerial imagery also excludes it from the print receipt's layer
  list; and
- appendix inclusion does not affect map-share state.

The print receipt uses the existing validated map-share URL representation. It
does not introduce a second URL format.

## Research Sheet

### Summary page

The portrait summary page contains:

- NS Marks The Spot identity;
- selected PID;
- current-notice or historical-records mode;
- generation date and time;
- the parcel-fit monochrome map;
- north indicator and approximate scale;
- mapped area with the existing not-a-survey qualifier;
- mapped building count and bounded explanation;
- civic-address result summary;
- assessment result summary;
- compact status summaries for roads, water, flood evidence, and
  geology/resources;
- active-layer legend;
- official event identity when applicable;
- screening limitations;
- required source and licence attribution;
- written map-state URL; and
- locally generated QR code for the same URL.

The summary must not use an unqualified zero or “none” when the underlying state
is empty, unavailable, outside coverage, or not assessed.

### Evidence appendix

The appendix is enabled by default and adds as many portrait pages as needed.
It contains the same settled evidence that the selected-parcel inspector and
Markdown evidence note support, including:

- official current-notice or historical-record sources and lifecycle wording;
- civic-address results and their authority boundary;
- mapped area and building-count detail;
- separate assessment accounts and match method;
- intersecting, adjacent, and civic-address-named road relationships;
- water-feature results;
- river and coastal flood evidence with coverage/scenario distinctions;
- exact and proximity geology/resource relationships;
- source-unavailable states;
- source links and retrieved/source dates where available; and
- source-specific limitations.

Page breaks occur between evidence sections where practical. A long section may
continue on a later page, but its heading and state label must remain with at
least the first result. Text is never reduced below the approved print minimum
to force the appendix onto one page.

Disabling the appendix is allowed. The summary page still retains its compact
status cells, essential limitations, sources, and receipt.

## Field Map

The landscape field sheet contains:

- NS Marks The Spot identity;
- selected PID;
- generation date and time;
- the frozen current geographic view;
- selected parcel highlighted above context layers;
- north indicator and approximate scale;
- legend for only the layers actually rendered;
- compact current/historical mode and event identity when applicable;
- required attribution;
- a concise screening/not-a-survey/not-an-access-conclusion warning;
- written map-state URL; and
- locally generated QR code for the same URL.

The map occupies most of the printable area. The field template does not include
the evidence appendix, assessment detail, long source explanations, or parcel
inspector prose.

## Monochrome Rendering

Monochrome is a deliberate print composition, not an unbounded promise to
replace every upstream renderer.

### App-owned geometry

Geometry controlled by the application receives explicit print styling:

- selected parcel: very heavy black outline and light diagonal hatch;
- ordinary property boundaries: thin grey line;
- current and historical tax-sale parcels: distinguishable solid and dashed
  outlines;
- app-derived proximity parcels: a pattern distinct from selected and tax-sale
  parcels;
- hydro-pilot paths: line patterns or weights that remain distinct in greyscale;
  and
- app-rendered point markers: shapes and outlines that do not depend on colour.

The selected parcel remains visually dominant.

### Province and third-party rendered tiles

Several Province layers arrive as server-rendered PNG tiles. Print mode:

- preserves their published renderer;
- applies layer-appropriate greyscale, contrast, and opacity treatment;
- retains the established layer ordering;
- shows actual monochrome samples in the enabled-layer legend; and
- does not invent a new legal or thematic classification from colour
  conversion.

Modern OpenStreetMap tiles receive the same print-only monochrome treatment
when enabled.

### Aerial imagery

Aerial imagery is excluded by default even when it is visible on the live map.
The user may include it explicitly. Included aerial imagery becomes
high-contrast greyscale and remains below boundaries, roads, water, parcel
selection, and other context overlays.

No other hidden live-map layer is automatically enabled for print. If aerial
and modern map are both absent, the preview may use a white background with the
enabled transparent context layers.

## Map Readiness and Failure Behaviour

The print map uses a display-only Leaflet instance separate from the live map.
It does not render zoom, location, attribution, or interaction controls.

The preview tracks every enabled print layer until it reaches one of:

- ready;
- valid empty;
- below supported zoom;
- source error; or
- tile error.

**Print / Save PDF** becomes available only after parcel geometry, print map,
and snapshot sealing have reached terminal states. Research output includes
every evidence request covered by the capture token. Field output may seal
without waiting for evidence that its template does not include.

A bounded readiness timeout prevents a source from leaving preview in an
indefinite loading state. On timeout, the affected item becomes
**Unavailable at export time**; it does not become empty.

Evidence-source failure does not block the entire research export. The affected
section prints:

- the named source;
- **Source unavailable at export time**;
- the generation timestamp;
- the source link; and
- the applicable limitation.

Map tile failures produce a prominent preview warning naming the affected
layer. The user may retry or deliberately choose **Print incomplete map**.
Incomplete printing keeps the warning on the printed page so an incomplete
image cannot look authoritative.

If local QR creation fails, printing remains available and the complete written
URL remains. The feature must not send the share URL, PID, or coordinates to a
remote QR service.

## Licence, Attribution, and Privacy

### Province restricted geographic services

Restricted Province layers remain unavailable until the existing versioned
licence acceptance occurs. A print preview does not bypass that gate.

Every printed page containing restricted Province information includes:

> Contains information obtained under license from the Province of Nova Scotia
> which is provided without warranty or liability for errors or omissions.

It also includes a written or clickable link to the Province of Nova Scotia
Restricted Geographic Services License (NSPRD) and the existing property
boundary/not-a-survey limitation.

The restricted licence permits viewing the information in any medium and says
to contact the Information Provider for other uses. This feature produces a
rendered personal/research view. It does not offer raw geometry, a tile archive,
bulk extraction, or a general publication workflow. Public bulk distribution
or commercial printed products remain out of scope pending separate Province
confirmation.

### Open-data and third-party sources

Pages include only the attributions relevant to rendered or reported sources.
Open Government Licence – Nova Scotia information uses its required
acknowledgement and licence link. OpenStreetMap output retains OpenStreetMap
attribution. Software licensing remains separate from map-data licensing.

### Privacy

Browser-location markers, accuracy circles, coordinates, and location status
are excluded from `PrintSnapshot` and every print template. They are ephemeral
browser state and are not part of parcel evidence or map-share URLs.

The feature adds no owner names, user annotations, server upload, analytics
payload, or storage of generated documents.

## Component Boundaries

Implementation should use focused boundaries:

- a capture controller that freezes input identity, accepts only matching
  pending evidence, and seals the result;
- a pure snapshot builder that normalizes map, evidence, source, and licence
  state;
- pure extent and print-share-state derivation for each template;
- a print-preview controller for template choice, optional content, readiness,
  retry, and printing;
- one display-only print-map component that reuses the established layer
  ordering and layer adapters;
- separate research-summary, evidence-appendix, and field-sheet renderers;
- local QR generation with written-link fallback; and
- print-specific CSS isolated from the interactive layout.

The implementation may extract the existing map layer stack into a reusable
display component where necessary, but it must not broadly rewrite unrelated
map selection, querying, or inspector architecture.

No third-party dependency may be introduced without explicit approval. QR
generation must remain local; the implementation plan must identify the local
approach before code work begins.

## Accessibility

The preview must:

- open as a labelled modal or equivalent contained surface;
- move keyboard focus into the preview and restore it to **Print / export** on
  close;
- provide keyboard-operable template, checkbox, retry, cancel, and print
  controls;
- expose readiness and failure changes through an appropriate live region;
- keep page preview content available as structured text rather than only a
  visual image;
- maintain visible focus and sufficient interactive contrast; and
- respect reduced motion.

The printed document uses readable type, text labels alongside symbols, and
pattern/line distinctions that do not rely on colour.

## Testing and Verification

### Unit tests

- Opening preview freezes one capture token and the selected PID, map, layers,
  and evidence-request generation.
- Only pending evidence belonging to that capture may settle before the
  snapshot seals.
- The sealed snapshot is immutable.
- Every evidence state retains its semantic distinction.
- Research extent fits complete multipart parcel geometry with bounded padding.
- Field extent contains the complete frozen geographic bounds.
- Printed layer IDs and print-share URL remain identical.
- Aerial exclusion and inclusion update both the rendered layer set and receipt.
- Page splitting retains section headings and does not omit evidence.
- Scale calculation is labelled approximate and uses the print map's latitude
  and zoom.
- Applicable attribution is selected for every rendered/reported source.
- QR failure preserves the complete written URL.

### Component and integration tests

- **Print / export** appears only with a selected PID.
- Research is the initial template.
- Template switching changes orientation, extent rule, and available controls.
- Appendix starts on and aerial imagery starts off.
- Live-map changes and requests from another capture token cannot mutate an
  open preview.
- Readiness, valid empty, outside coverage, below-zoom, source error, tile
  error, retry, timeout, and deliberate incomplete-print states remain
  distinct.
- Browser-location state never reaches the print map or document.
- Cancel and print cancellation preserve the live map.
- Only the selected template is printable.
- Application chrome and inactive preview content are excluded by print CSS.
- Existing evidence-note and share-link behaviour remains unchanged.

### Manual browser and print checks

- Chrome and Safari on macOS.
- Safari and AirPrint preview on iPhone.
- Letter portrait research summary with and without appendix.
- Multi-page appendix with representative long evidence.
- Letter landscape field map.
- Save as PDF and reopening the saved document.
- Actual monochrome printer output.
- Optional aerial imagery.
- At least one failed evidence source and one failed map layer.
- QR scan and written-link verification.
- Keyboard navigation, focus restoration, reduced motion, and screen-reader
  naming.
- Minimum text size, hatching, line separation, page breaks, clipping,
  attribution legibility, and printer margins.

Run the complete web test, lint, and production-build gates after
implementation.

## Non-Goals

- Direct one-click PDF or PNG generation.
- A4 or other paper sizes.
- Colour-template controls.
- Printing without a selected parcel.
- Editing notes or drawing annotations on the map.
- User-location printing.
- Raw GIS, GeoJSON, tile, geometry, or tabular data export.
- Bulk print generation.
- Public publishing or commercial redistribution workflow.
- Native iOS implementation or offline printing.
- New evidence, risk scoring, legal conclusions, or source-completeness claims.

## Acceptance Criteria

1. A selected parcel exposes **Print / export** and opens an accessible preview
   without changing the live map.
2. Research output is Letter portrait, fits the complete selected parcel, and
   produces a summary plus an optional lossless evidence appendix.
3. Field output is one Letter landscape page and preserves the complete frozen
   live geographic bounds.
4. Both templates use one capture-and-seal path and an immutable snapshot, with
   a map-share receipt matching the printed PID, mode, position, events, and
   layers.
5. App-owned geometry remains distinguishable on a monochrome printer, while
   upstream rendered layers retain honest greyscale symbology and attribution.
6. Empty, outside-coverage, below-zoom, unavailable, timeout, and tile-error
   states remain distinct in preview and print.
7. Restricted Province services remain licence-gated and every applicable page
   carries the required attribution, disclaimer, and licence link.
8. Browser-location state and private/user-added information are absent.
9. Browser Print / Save as PDF works for both templates; direct file generation
   remains out of scope.
10. Automated tests, lint, production build, desktop browser checks, iPhone
    AirPrint preview, saved-PDF inspection, QR verification, and one physical
    monochrome print all pass before the feature is called accepted.
