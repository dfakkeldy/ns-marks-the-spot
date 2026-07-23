# Web map portfolio polish — design

**Date:** 2026-07-23
**Status:** Approved (user approved scope and order C → A → B on 2026-07-23; defaults are not contracts and may change)
**Scope:** `web/` React app only. No native-app changes. No new runtime dependencies.

## Goal

The web map is the maintainer's public portfolio piece. The data-integrity
engineering (source receipts, fail-closed outcomes, licence boundaries) is
already strong; the presentation undersells it. This design improves the first
impression, cartographic credibility, and self-narration of the app without
weakening any licence, disclaimer, or provenance behavior.

Three bundles, implemented in order:

- **C — Portfolio framing:** the app explains itself and unfurls well when shared.
- **A — Cartographic polish:** the map looks professional at every zoom, not
  just parcel zoom.
- **B — Information architecture:** the rail and parcel sheet present rigor as
  hierarchy instead of volume.

## Bundle C — Portfolio framing

### About panel

A new "About this map" dialog, reachable from the header (text link beside the
brand) and the footer. Reuses the existing licence-dialog visual pattern
(`.licence-dialog` styles) so no new modal plumbing is invented. Content, in
order:

1. **What this is** — one short paragraph: georeferenced Nova Scotia parcel and
   tax-sale screening map; open source; online companion to the iPhone app.
2. **How it treats data** — three or four bullets stating the method: official
   notices pinned by SHA-256 receipt; unknown outcomes stay unknown
   (fail-closed); empty results are distinguished from source failures;
   assessed-owner names are never ingested; browser location never leaves the
   browser.
3. **Who made it** — the maintainer has made maps for 20 years, mostly for
   forestry; this app is where that practice meets modern web engineering.
   Links: GitHub repository, feedback email. No credentials are claimed.
4. Dismiss button ("Close").

The dialog is plain informational UI: no analytics, no external requests.

### Social/share metadata

`web/index.html` gains static Open Graph and Twitter tags:

- `og:title` — "NS Marks The Spot — Nova Scotia parcel & tax-sale map"
- `og:description` — reuse/refine the existing meta description.
- `og:type` — `website`
- `og:image` / `twitter:image` — `social-card.png` (relative path; see below)
- `twitter:card` — `summary_large_image`

The `<title>` becomes "NS Marks The Spot — Nova Scotia parcel & tax-sale map"
(the current "— Online" suffix describes the repo's split, not the product, and
does nothing for a stranger reading a link preview).

**Social card:** a 1200×630 static PNG in `web/public/`, generated once from a
checked-in SVG source (`marketing/social-card.svg` authored in the app's
palette: chart-ink background, Fraunces wordmark, one-line descriptor,
paper-peach pin motif). Generation is a manual, documented step — not a build
step. Rasterize with `qlmanage -t -s 1200`; if that renders poorly, fall back
to a browser-canvas export. The canonical deploy origin is not recorded in this
repository, so the tag ships with a relative URL (several major scrapers
resolve it; the rest ignore it harmlessly) and `web/README.md` documents that
the deploying site should rewrite it to an absolute URL. No guessing at
origins.

### Header copy

"iPhone beta not open yet" reads as an apology. Replace the pair with:

- Status text: "iPhone app in development"
- Button (unchanged mailto): "Get launch updates"

The bottom-of-rail beta card keeps its fuller explanation but adopts the same
affirmative voice.

## Bundle A — Cartographic polish

### Zoom-gated overview composition

Problem observed: at overview zooms the NS Aerial export returns blank tiles
outside imagery coverage, producing a hard-edged patchwork over the ocean, and
the Province transportation export draws oversized route shields. The fix is
composition, not symbology (Province exports cannot be restyled client-side):

- **Modern map (OSM) defaults ON.** It is the overview basemap.
- **NS Aerial:** `minZoom` rises 0 → 10. The existing zoom-gating mechanic
  (Property Boundaries' "Zoom to 14+ to load" row state) is reused verbatim.
- **Roads, trails & culverts:** `minZoom` 7 → 10. OSM carries roads at
  overview; the Province layer takes over where its 1:10k detail is legible.
- **Water features:** `minZoom` 7 → 10, same rationale.
- Waterfalls (point layer, 90 features) keeps `minZoom` 7 — points read fine
  at overview and the fit-to-falls behavior is a feature.
- All layer-row metadata text (zoom ranges, caveats) updates to match.

Result: initial view (fit to tax-sale parcels, ~z8–9) is clean OSM + parcel
markers; zooming toward a parcel brings in aerial, boundaries, Province roads
and water exactly where they are legible. Layer states in the rail already
explain "Zoom to N+ to load" so nothing appears broken.

### Tax-sale overview markers

At the initial fit the 40 advertised parcels are sub-pixel polygons —
invisible. New app-drawn `L.circleMarker`s at each listed parcel's
representative point (centroid of the largest polygon ring), shown only while
`zoom < 12`, hidden when polygon fills take over (zoom ≥ 12). Style: mode
colour (survey-red for current notices, the historical purple for historical
mode), white stroke, radius ~7. ~47 markers maximum, so no clustering library
is needed (no new dependencies). Clicking a marker selects the parcel exactly
like clicking its polygon. Markers respect the existing event-layer toggles
and the redemption filter.

### Cartographic furniture

- **Scale bar:** Leaflet's built-in `L.control.scale` (metric + imperial —
  forestry readers use both), bottom-left, restyled via CSS to the app palette.
- **Position readout:** a small mono readout beside the scale bar:
  `Z 14 · 46.21350, -61.09130` (5-decimal lat/lon of map centre), updating on
  `moveend`/`zoomend`. Clicking copies `lat, lon` to the clipboard and shows
  the existing toast ("Coordinates copied"). Hidden on the narrow mobile
  breakpoint where it would collide with the mobile chrome.

### Toast auto-dismiss

The "PID … selected." toast currently persists until replaced. All transient
toasts gain a ~6 s auto-dismiss (timer cleared on unmount/replacement).
Error-state messages inside panels are unaffected.

## Bundle B — Information architecture

### Layer rail disclosures

Each layer row's metadata block (source date, scale, coverage, zoom) moves
into a native `<details>` disclosure labelled "Source & scale", collapsed by
default — the same pattern the rail already uses for "Browse properties". The
always-visible part of a row becomes: name, subtitle/caveat, toggle, and the
live status line (Off / Ready · N loaded / Zoom to N+ to load). Rail scroll
length drops by roughly two-thirds; every fact stays one click away. No
metadata is deleted.

### Parcel sheet typographic hierarchy

Content is untouched; weight changes:

- **Key/value rows:** keys stay as-is; values render in Inter (proportional),
  left-aligned when they are prose (municipality, official location, event),
  right-aligned mono only for identifiers and figures (PID, AAN, lien,
  amounts, dates, area). Implemented as a value-variant class, not a rewrite
  of the row markup.
- **Section footnotes:** source lines, licence acknowledgements, and method
  caveats inside each section adopt a `.section-footnote` style (~0.72rem,
  muted ink). **Nothing moves behind a disclosure** — attribution text
  required by the OGL-NS, PVSC, and Service NS licences stays permanently
  visible, just correctly weighted relative to the evidence it annotates.
- Warning call-outs (e.g. "not proof of ownership…") keep their tinted boxes
  but drop to the footnote size.

### Mechanical component extraction

`App.tsx` (3,145 lines) already contains well-bounded internal components.
Move, without behavior change:

- `ParcelInspector` and its detail subcomponents (`AssessmentDetails`,
  `FloodHazardDetails`, `CivicAddressDetails`, `MappedContextDetails`,
  `ParcelResourceDetails`, `HistoricalOutcomeDetails`, `MappedFeatureList`)
  → `components/ParcelInspector.tsx`
- `LayerToggle`, `ResourceLayerToggle`, `HydroPilotLayerToggle`,
  `FloodHazardLayerToggle`, `LayerMetadata`, `layerRuntimeLabel`, legends
  → `components/LayerRows.tsx`

Props stay identical; `App.test.tsx` continues to exercise everything through
`App`. If a move turns out to be non-mechanical (hidden closure state), it is
skipped and noted rather than forced.

## Error handling

No new failure modes are introduced: the About dialog and social tags are
static; markers derive from data already loaded for the polygon layers; the
scale bar and readout are pure map-state views. The readout's clipboard copy
uses the existing clipboard helper and its failure toast. Zoom-gating reuses
the existing per-layer status reporting, so a gated layer reports "Zoom to N+
to load" exactly as Property Boundaries does today.

## Testing

The existing vitest suite is the gate (`npm test`, `npm run lint`,
`npm run build`). Per bundle:

- **C:** extend `indexHtml.test.ts` (OG/Twitter tags, title); App tests for the
  About dialog (opens, lists method bullets, closes) and header copy.
- **A:** update App tests pinning default layer composition (Modern map now
  on); new tests for marker visibility by zoom, marker click → selection,
  toast auto-dismiss (fake timers), and catalog `minZoom` values; MapCanvas
  test for scale-control presence and readout updates.
- **B:** update selectors that assumed always-visible metadata (now inside
  `<details>`); snapshot-free assertions on the footnote class application;
  extraction verified by the unchanged App suite passing.

Documentation: `README.md` and `web/README.md` default-composition and layer
descriptions update in the same PR (the READMEs document behavior; behavior
changes). `docs/property-context-data-candidates.md` is unaffected.

## Out of scope

- Fletcher layer enablement (rights still pending), any new data layers.
- Restyling Province-rendered symbology (impossible client-side).
- Marker clustering libraries or any new runtime dependency.
- Full App.tsx decomposition beyond the two mechanical moves.
- Deployment/OG absolute-origin wiring (documented for the deploying site).
