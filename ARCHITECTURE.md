# Architecture — NS Marks The Spot

## Overview
NS Marks The Spot is an open-source iOS map app that overlays georeferenced
historical maps of Nova Scotia (Fletcher maps, David Rumsey collection) on
modern maps. Users control overlay transparency with a slider. Secondary
features include custom vector layers for Points of Interest (POIs) like
waterfalls.

## Key Design Decisions

### Engine-Agnostic Facade
The app is built to swap map providers without rewriting UI code. Two
protocols form the boundary:

- **`MapEngine`** — defines map behavior (add/remove layers, set opacity,
  render view, and manage saved-area rectangle selection). Conforming types:
  `MapKitEngine`, `MockMapEngine`.
- **`MapLayer`** — defines an overlay layer (tile URL or vector source,
  opacity, visibility). Conforming types: `MapKitTileLayer`.

To swap MapKit for Google Maps, write a new `GoogleMapsEngine` that
conforms to `MapEngine`, then change one line in `AppContainer`. No SwiftUI
view imports MapKit directly.

### Layer Architecture
```
┌─────────────────────────────┐
│  SwiftUI Views              │  ← observes ViewModels, never imports MapKit
├─────────────────────────────┤
│  ViewModels (ObservableObject)│  ← holds @Published state, delegates to MapEngine
├─────────────────────────────┤
│  MapEngine Protocol          │  ← abstraction boundary
├─────────────────────────────┤
│  MapKitEngine                │  ← concrete implementation (UIViewRepresentable)
├─────────────────────────────┤
│  Services (TileFetcher, Cache)│  ← network & persistence
├─────────────────────────────┤
│  SwiftData (PointOfInterest) │  ← local POI storage
└─────────────────────────────┘
```

### Data Flow — Transparency Slider
1. User drags `TransparencySliderView` → writes to `OverlayViewModel.opacity`
   binding
2. `OverlayViewModel.updateOpacity(_:)` updates `@Published opacity` and
   calls `engine.setOpacity(for:to:)`
3. `MapKitEngine.setOpacity(for:to:)` finds the matching layer and sets
   `layer.opacity`
4. The `MKTileOverlay` renderer reads the updated opacity on the next
   draw cycle

### Dependency Injection
Manual DI via `AppContainer`. No third-party framework. The container owns
all long-lived services and injects them through initializers. Compile-time
safety — missing dependencies are compiler errors, not runtime crashes.

### Layer Catalog And Offline Storage
v1.0 centralizes map layer definitions in `LayerCatalog`. Each layer declares
its rendering role, source URL, attribution, cache key, zoom range, and offline
policy. SwiftUI views consume catalog metadata through view models while MapKit
rendering remains behind `MapEngine`.

Viewed tiles are persisted through `TileStore`. Fletcher tiles can also be
downloaded for rectangular saved areas through the `MapEngine` bounds-selection
flow added for v1.0. NS Aerial and restricted Nova Scotia reference layers are
viewed-cache only in v1.0.

### Folder Organization
Feature-grouped — each feature (MapEngine, Layers, Offline, Overlay, POI) is a
self-contained folder with its own protocols, implementations, and views.
Mocks are centralized at the top level.

## Dependencies
- **SwiftUI** — UI framework (OS)
- **MapKit** — map rendering (OS, behind protocol)
- **SwiftData** — POI persistence (OS)

No third-party dependencies.

## Online Web Companion

The `web/` React + Vite app is a separate online-only delivery surface. It does
not change the native app's offline contract or Swift `MapEngine` boundary.
Leaflet renders OpenStreetMap tiles, GeoJSON parcel highlights, and the web
catalog's Province MapServer layers in the browser.

### Web print/export boundary

The web print flow is capture-and-seal rather than a live projection of
`App` state. `App.tsx` owns the selected parcel, privacy-safe printable
viewport, enabled layer IDs and source metadata, event context, and
PID-plus-generation evidence request. Activating the inspector's
**Print / export** action creates a tokened `PrintCapture`. Matching evidence
may settle that capture only when its token, PID, and request generation still
agree; stale results cannot attach to a new selection. Losing the selected PID,
request generation, or Province licence closes the capture.

`services/printSnapshot.ts` owns the capture/readiness/seal domain. Research
waits for all evidence states or converts only still-pending states to
“Source unavailable at export time” after the bounded timeout; field output
does not wait for research evidence. Sealing deep-clones and deep-freezes a
template-specific `PrintSnapshot`, so later application, map, or source changes
cannot mutate an open document. Research bounds derive from the complete
selected parcel geometry. Field bounds preserve the complete frozen live
viewport. `ParcelInspector.tsx` owns only the action and capability UI;
`PrintPreview.tsx` owns template options, snapshot sealing, attempt-scoped map
readiness, local QR settlement, retry/incomplete-print consent, focus trapping,
and the call to `window.print()`.

`components/print/PrintMap.tsx` reuses `MapCanvas` in a display-only Leaflet
print mode. The map fits explicit bounds, disables interaction and location UI,
tracks readiness for the requested layers, and reports the resolved printed
position. OpenStreetMap and ArcGIS tiles remain ordinary browser-rendered image
layers; the application does not read them into a canvas or generate PDF/PNG
bytes. CSS applies monochrome tile treatment and app-owned parcel
line/weight/hatch styles. The browser's Print / Save as PDF facility is the only
document renderer.

The exact receipt is derived only after the print map resolves. It uses the
existing map-share format with the captured PID, mode and event IDs, the
actually rendered layer IDs, and the derived print position. Browser-location
movement is suppressed from the printable viewport, and print mode never
receives or renders the location marker or its raw coordinates.
`services/printQr.ts` converts that same receipt URL to SVG locally with
`qrcode@1.5.4`; no remote QR or screenshot service receives it. The complete
written URL remains present when QR generation fails.

Document ownership is split by output concern:

- `PrintResearchDocument` owns the portrait summary and optional evidence
  appendix;
- `PrintFieldDocument` owns the single-page landscape field sheet;
- `PrintEvidenceAppendix` owns source-state wording without collapsing empty,
  coverage, error, or timeout states;
- `printRenderedLayers.ts` limits source material to actually rendered layers;
  and
- `printEvidenceAttribution.ts` adds Nova Scotia open-data and PVSC evidence
  attribution independently from restricted Province layer attribution and
  OpenStreetMap attribution.

The boundary exports a rendered personal/research view only. It does not expose
raw geometry, tiles, owner names, private notes, uploads, browser location, or
a public/commercial bulk-print API.

`web/src/layers/layerCatalog.ts` is the web parity contract. It mirrors the
native catalog order, URLs, Province licence requirement, and rendering
restrictions. Web-specific display ranges may extend where the live service
supports them: the map zooms through level 23 while aerial imagery safely
overzooms its last useful native level instead of disappearing, and
turning on Waterfalls first fits the map to the 90-fall discovery extent.
`ArcGISExportTileLayer` converts Leaflet tile
coordinates to Web Mercator bounds and requests direct PNG tiles from each
MapServer's `export` operation. This matches the native app's service model
without sharing its offline cache policy.

The catalog also appends a separately identified web-only Province layer for
NSTDB buildings. It starts off, renders only from zoom 13, and sits above
property boundaries but below the road overlay. This keeps the native parity
list honest while reusing the same MapServer export adapter and selected-parcel
visual authority.

The collapsed web-only Topography group uses the same adapter for the NSTDB
Landforms contour renderer. Labelled 5 m LiDAR-derived contours start off and
render from zoom 13 beneath NSPRD boundaries. The group describes them as
terrain screening only; it does not derive parcel slope, grade, drainage,
stability, access, flood exposure, or buildability.

The same catalog also owns a separate web-only `resourceLayerCatalog`. These
open-data overlays do not change native-layer parity and do not depend on the
restricted-services acceptance gate. NovaROC exploration licences and mineral
leases use the existing MapServer export adapter. Mineral occurrences and
abandoned mine openings use `services/arcGISFeatureOverlay.ts`, which queries
only the visible WGS84 envelope, pages full ArcGIS responses, cancels stale
requests after map movement, and deduplicates returned records. Occurrences
begin at zoom 8; the denser mine-opening inventory waits until zoom 11. Each
feature service reports loading, visible-record count, zoom, and failure state
independently.

`MineralProximityParcelLayer` is the only derived resource renderer. It asks
`mineralProximity.ts` for occurrence points around the viewport and submits the
coordinates to NSPRD in multipoint batches of at most 500. The service pages at
2,000 parcel features, caps each batch at ten pages, deduplicates by PID, and
does not persist classifications. The component is rendered below the existing
selected/current/historical parcel GeoJSON so selection styling remains the
visual authority. Inspector proximity is queried independently from the exact
selected parcel and never inferred from the viewport layer.

`hydroPilotLayerCatalog` is a third, separately controlled web catalog for the
default-off Inverness terrain-potential pilot. Its checked-in GeoJSON is
generated by `web/scripts/generateInvernessHydroPilot.mjs` from the open
Secondary Watersheds dataset and directed NSHN Spines/Wet Features. For every
named secondary watershed centred inside the municipal boundary, the generator
selects the longest connected route through official primary-flow segments,
preserves the published watershed area and source plan lengths, derives mapped
elevation range from source Z coordinates, and assigns a pilot-relative
quartile. Display geometry is simplified independently of those measurements.

`services/hydroPotential.ts` owns the shared calculation and symbology contract:
line weight is logarithmically scaled by watershed area, colour is the relative
terrain-potential class, and the screening value is
`ln(1 + area km²) × (drop metres / route kilometres)`. The raw inputs remain
visible in each Leaflet popup. The layer is share-link aware, fits to Inverness
only when first enabled, and is independent of the restricted Province-services
gate. It never exposes the score as flow, head, power, feasibility, rights, or
approval. NSHN `LEVELPRIOR` is treated only as a primary-flow selector, not as
Strahler stream order.

After licence acceptance, the default web composition leaves the opaque modern
map off, turns NS Aerial, NSPRD boundaries, complete Province water features,
and roads on, and fits the first loaded view once to the visible tax-sale
parcel geometries. Fletcher remains the final unavailable row in the layer list
until its web rights are clear. Geology & Resources is collapsed: its three
open source-backed overlays and its separately licence-gated derived parcel row
all start off. The Hydro terrain pilot is also collapsed and off by default.
The one-time fit does not compete with later selected-parcel fitting or user
navigation.

NS Aerial is an opaque context layer. NSPRD and Crown Lands use the native
dynamic renderers, Watersheds is restricted to layers 24–26 (these layers are
watershed context, not flood-risk mapping), and the
Waterfalls layer is restricted to hydrography points whose `FEAT_DESC` is the
Province's falls value. The Province publishes NSPRD with a 1:36,114 visibility
floor; the web catalog respects that close-detail scale at zoom 14 rather than
forcing authoritative outlines into regional views. Crown-land and flood detail
layers begin at zoom 12. Waterfall points remain visible at the province
overview scale so users can discover where to zoom in.

Tax-sale parcel polygons are separate client-side NSPRD query results. The
selected parcel remains translucent in the overview and becomes fully opaque at
zoom 15 and closer; other listed parcels retain their lighter fill so the close
selection remains unambiguous.

The complete Province hydrography and transportation MapServers are available
as separate overlays. Their official renderers retain road class, surface,
trail, bridge, rail, ferry, culvert, and water-feature distinctions; increased
export DPI makes line work legible without duplicating Province cartography.

Municipal notices and NSPRD have deliberately separate authority:

1. A municipality source module owns notice fields such as lien, location,
   arrears, redeemable status, event details, and PIDs.
2. `services/nsprd.ts` performs exact-PID and point-intersection ArcGIS Feature
   Layer queries for geometry, the NSPRD update field, and `SHAPE.AREA`. A map
   tap is eligible only while the visible NSPRD boundary layer is on.
3. The UI joins notice records to returned geometry by PID. One PID may have
   multiple polygons, so selection and map fitting operate across all matching
   features.
4. Province-licensed geometry and reference tiles are not requested until the
   user accepts the versioned licence gate. The exact required attribution and
   the not-a-survey caveat stay visible in the map footer after the gate closes.
5. Browser geolocation is handled locally and drawn directly on the map; there
   is no application server receiving a user's coordinates.

Current notices and historical records also have separate lifecycle authority.
Once an event is deliberately archived, its owner-free notice records can move
to historical mode before parcel-level results are published. The historical
event schema distinguishes `verified` results from
`awaiting-official-results`; only the former can carry a result URL, result
snapshot, result hash, winning bid, or specific outcome. Pending events link to
the municipality's checked results page and keep every outcome unknown.

`services/parcelContext.ts` sums the mapped area for every polygon belonging to
the selected PID and converts square metres to acres. It POSTs that exact parcel
geometry to each relevant Province road and water sublayer with
`esriSpatialRelIntersects`, then performs a separate 20-metre road proximity
query. Exact intersections win during deduplication; nearby roads are labelled
as adjacent rather than intersecting. When an in-parcel civic point names a road
that neither geometry query returned, the sheet includes that name with the
separate relationship “Named by civic address.” These three signals are map
context only and are never described as proof of frontage or legal access.
Empty results remain distinct from live-service failures.

`services/buildings.ts` independently reuses the exact selected NSPRD rings for
three NSTDB intersection counts: classified building points, unclassified
building points, and building polygons. The labelled polygon-callout layer is
not a fourth building source and is deliberately excluded to prevent duplicate
counts. The inspector preserves loading, returned zero, and source-error states
instead of converting an unavailable service into zero.

`services/civicAddresses.ts` owns the authoritative PID-to-civic-address lookup.
It is intentionally separate from `parcelContext.ts`: Civic Points use the Nova
Scotia Open Government Licence and have their own attribution, pagination, and
failure boundary, while road and water intersections come from restricted map
services.

The same civic service owns sidebar address discovery. It sends normalized user
text through Socrata's full-text `$q` index, returns bounded labelled Civic
Point candidates, and does not infer a PID from address text. Punctuation-folded
local relevance checks reject broad full-text false positives. When a compact
possessive initialism omits its periods, such as `dr's` for `D.R.'s`, the service
retries that official spelling only after the first response has no relevant
match. The same bounded retry maps `hwy` and a numbered `route` to the Civic
Address File's `Highway` spelling. Selecting a candidate sends its exact
coordinate to the NSPRD point-intersection query; the returned parcel geometry
then enters the same selected-PID, civic-containment, and inspector flow as PID
search or a map tap. Address search and map-point lookup have independent
cancellation controllers so stale requests cannot replace newer selection
state.

For a selected PID, the civic service reuses every Polygon or MultiPolygon part
already returned by NSPRD. It calculates one bounding box per part, requests
only address fields through Socrata `within_box` queries, follows stable
`$limit`/`$offset` pages ordered by `pntid`, and deduplicates by `pntid`. A final
client-side point-in-polygon test excludes bounding-box false positives and hole
interiors across all parts. Points exactly on exterior or interior-ring
boundaries count consistently as inside.

The service returns zero, one, or every unique mapped point inside the parcel;
it never substitutes a nearest point, municipal notice description, road label,
or interpolated address. Changing or closing the selected PID aborts that PID's
request. Civic loading, empty, and failure states remain independent of the
road/water state.

The parcel sheet links the official Civic Address File, displays `Contains
information licensed under the Open Government Licence – Nova Scotia`, and
explains that mapped physical-address points do not prove ownership, mailing
address, access, occupancy, or legal parcel status. This open-data attribution
is separate from the NSPRD restricted-services licence gate.

`services/googleMaps.ts` converts each authoritative civic-point coordinate to
a full 10-character Open Location Code (Plus Code) in the browser. The parcel
sheet presents that code as a universal Google Maps directions link whose exact
latitude/longitude destination comes from the same civic point. No Google API
key or geocoding request is required, and Google receives the destination only
after the user activates the external link.

The public tax-sale dataset omits assessed-owner names and avoids describing a
listed property as available. Fletcher is intentionally disabled on the web
until web-use rights are clear; offline Fletcher use continues to belong to the
native app.

Historical outcomes use a second, default-off client-side catalog in
`web/src/data/historicalTaxSales.json`. Municipal notice/result pairs are the
authority for event, outcome, and financial fields; exact official PIDs are the
only currently supported NSPRD match method. A normalized listing remains one
record when it covers several parcels, so listing-level amounts are never
allocated by the UI. Filters derive matched PID sets by municipality, year, and
outcome without altering the upcoming-notice layer.

The supported slice contains seven Halifax Regional Municipality tender events
from March 8, 2022 through September 16, 2025: 87 owner-free listing records,
93 exact PIDs, 82 sold outcomes, four official no-bid outcomes, and one official
`PENDING` row represented as outcome unknown. The infocard calculates
comparisons in integer cents only when the same CAD event publishes both an
opening bid and a selling price. It presents direct official notice and result
links, source dates, match basis, multi-PID warnings, and a dated-outcome
limitation. Researched CBRM events remain outside the matched layer until their
notice/result pairs can be reconciled fail-closed; the complete ledger and
snapshot hashes live beside the dataset.

Municipal events retain their source status, while the rendered lifecycle is
derived from the current time. An advertised event becomes “verify results”
after its scheduled start; the app does not manufacture a historical outcome.
Rendered event controls include the source retrieval date. Inverness listings
are generated from the owner-free book JSON snapshot, whose byte-for-byte
SHA-256 is pinned by the web test suite.
