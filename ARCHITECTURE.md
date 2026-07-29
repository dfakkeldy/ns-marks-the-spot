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

The A.F. Church county maps (four Cape Breton Island sheets from the David
Rumsey collection) are catalogued in both the native and web catalogs but do
not render: no tiles have been produced for them. On the web they follow the
Fletcher precedent as disabled rows; on iOS they carry `sourceURL: nil` and
install no layer. See `docs/CHURCH_MAPS.md`.

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

`components/MeasureTool.tsx` renders the distance/area measure control inside
the Leaflet map. Geometry math lives in `services/geodesy.ts` (haversine
paths, spherical-excess areas on Leaflet's sphere). While a measurement is
active, `MapCanvas` suspends parcel identify/selection and double-click zoom;
a 250 ms deferred click in `ParcelIdentifyController` keeps double-tap zoom
from selecting parcels the rest of the time.

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
- `printSnapshot.ts` seals assessment and dependent PVSC dwelling evidence
  under the same selected-PID generation token so a late account response
  cannot cross parcel selections;
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

`environmentalHealthLayerCatalog` is a separately controlled web catalog of
provincial well-water and aquifer screens: arsenic (`h499ns`), uranium
(`h529ns`), and manganese (`h535ns`) relative-risk zones, plus surficial
aquifer extent (`h490ns`). All four reuse the MapServer export adapter and
render at `ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX`, above aerial imagery but below
contours, because the province classifies every bedrock unit and the result is
a wall-to-wall wash rather than a sparse overlay.

The `screening` discriminant separates the three `well-water-risk` layers from
the `aquifer-context` layer, which carries no risk rating at all. Each risk
layer publishes its `riskBands` using the province's own legend labels and
renderer colours — the ramps differ per service — and a `guidance` string
carrying the province's testing recommendation. Because these are raster tile
overlays with no popup, the layer control row is the only place a reader meets
that caveat, so the row renders the band legend and guidance together. A band
describes the rock beneath a parcel, never a measurement at it: the high band
means more than 15% of sampled wells in that unit exceeded the drinking-water
guideline (10 µg/L arsenic, 20 µg/L uranium, 120 µg/L manganese).

Licensing splits within the group. The uranium screen is published under the
Open Government Licence – Nova Scotia and needs no acceptance gate. Arsenic,
manganese, and surficial aquifers carry no open licence declaration — the
manganese service names a departmental user agreement — so they are treated as
restricted and gated. Unlike the flood-hazard group, this catalog is gated
before it reaches the map: `effectiveEnvironmentalHealthLayers` in `App.tsx`
clears restricted ids until the licence is accepted, so a crafted share URL
cannot render them.

Radon potential is deliberately absent. The province's only radon service
(`fletcher.../radon/radon_cache`) returns an empty 0x0 image from `export` and
serves tiles solely from a NAD83/MTM (wkid 2961) cache, which Leaflet cannot
consume without a reprojection dependency. Adding it requires either a working
Web Mercator service from the province or an approved proj4-based custom CRS.

`zoningLayerCatalog` is a separately controlled web catalog for municipal
zoning. Nova Scotia publishes no provincial zoning layer, so zoning is
necessarily per-municipality and each descriptor carries its own field mapping,
licence, and authoritative land use by-law link rather than assuming a shared
convention. The three Eastern District Planning Commission counties share one
schema on one ArcGIS Online organisation, so one adapter serves Inverness,
Victoria, and Richmond; Cumberland and Halifax each use their own field names.
`services/zoning.ts` normalizes the three ways municipalities encode a zone
name — code-prefixed, code-suffixed, and bare — so a popup never repeats the
code. `components/ZoningLayer.tsx` reuses the viewport-envelope query in
`services/arcGISFeatureOverlay.ts`, which is generic over geometry and takes the
ordering and identity fields explicitly because these services reject the
provincial `geo_id` convention outright. Because zoning attributes come from
third-party servers, the popup is built from DOM nodes assigned through
`textContent` rather than an interpolated HTML string, so markup injection is
impossible by construction. Zoning sits outside the Province licence gate
entirely and does not change native-layer parity. It does not establish
development permission, lot-specific rules, variances, or non-conforming rights,
and it is not the municipality's official copy.

Zoning layers whose publisher states no licence are marked
`redistribution: "live-query-only"` and are rendered straight from the
publisher's public endpoint; their geometry is never extracted into project
data. Only Halifax publishes an explicit open licence. Because coverage is
partial by nature, the group states that an area with no polygon is an area
this map has no data for, not an area where no zoning applies, and that towns
inside a county are separate zoning jurisdictions.

`wellLogLayerCatalog` is a separately controlled web catalog for the default-off
water well log overlay. It is a `feature-query` layer sourced from the DNRR
ArcGIS service published with DP ME 430, so it reuses
`services/arcGISFeatureOverlay.ts` rather than shipping the 125,517-record
inventory in the bundle. That shared fetcher gained optional `where`,
`orderByFields`, and `idField` parameters for it: the well service publishes no
`geo_id`, and ordering by a field a service does not have fails the whole query.
Its defaults are unchanged, so the mineral overlays keep their existing
behaviour.

`services/wellLogs.ts` owns the accuracy contract. `GEOREF_A` is the Province's
estimated location error in metres, and `classifyWellAccuracy` bands it exactly
as Appendix A of the Users Manual documents: surveyed to ±50 m, map-referenced
to ±800 m, sheet-referenced to ±1,500 m, and community centroid beyond that. A
zero estimate is treated as unknown, not as a precise location. Only the
surveyed band renders as a filled point; every coarser band is hollow and
dashed, and its popup leads with a sentence saying a well was reported nearby
rather than that one sits there. The accuracy filter is pushed into the service
`where` clause, so records the user has not asked for are never transferred. The
`ADDRESS` column can contain a well owner's civic address and is omitted from
`WELL_LOG_OUT_FIELDS`, which excludes it at the query instead of stripping it
downstream. The published `-9999` no-data marker is mapped to null rather than
displayed as a measurement, while small negative static levels are preserved as
genuine flowing-well readings. Well points get their own Leaflet pane above the
mineral proximity pane and below the established-parcel pane, so tax-sale
selection remains the visual authority. The layer never states water quality,
potability, yield reliability, or that a parcel has a usable supply.

`forestryLayerCatalog` is a separate, default-off web catalog for the Province's
Old Growth Forest Policy Layer. `services/oldGrowthPolicy.ts` queries the
official Socrata GeoJSON resource with `within_box`, orders every page by the
system `:id`, and stops with an error rather than presenting source or
pagination failure as an empty result. `components/OldGrowthPolicyLayer.tsx`
cancels stale viewport requests and preserves all three `old_growth` values:
confirmed old growth, restoration opportunity, and unknown. Its dedicated pane
sits between contours and NSPRD so policy context cannot cover parcel, water,
road, or selected-parcel evidence. External attributes enter DOM popups only
through `textContent`. The layer is Open Government Licence data and therefore
does not inherit the restricted Province-services acceptance gate; it does not
change native-layer parity.

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
parcel geometries. Fletcher remains the final row in the layer list. The web
layer uses 24 bounded per-sheet XYZ trees under an immutable revision,
preserving overlap provenance without last-write-wins flattening. It is
default-off and fails closed unless `VITE_FLETCHER_TILE_BASE_URL` names an
authorized HTTPS host; opacity, share state, print/evidence provenance, and
retry status use the normal web-layer contracts. This does not change native
URLs or native offline bundling. Geology & Resources is collapsed: its three
open source-backed overlays and its separately licence-gated derived parcel row
all start off. The Hydro terrain pilot is also collapsed and off by default.
Forestry is collapsed and its open old-growth policy overlay starts off.
Municipal zoning is collapsed and all five of its layers start off; it is not
licence-gated because its sources are municipal rather than provincial.
The Groundwater well-log group is also collapsed and off by default; when
switched on it starts on its surveyed-only accuracy filter.
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
listed property as available. Fletcher is available to a configured web build
only through the immutable direct-Rumsey package; builds without an authorized
tile host show an honest disabled state. The scoped permission does not by
itself clear native offline bundling, and this workflow does not change the
existing native layer.

Historical outcomes use a second, default-off client-side catalog in
`web/src/data/historicalTaxSales.json`. Municipal notice/result pairs are the
authority for event, outcome, and financial fields. Two NSPRD match methods are
supported: `exact-official-pid`, where the municipality publishes the PID, and
`deterministic-reconciliation`, where the municipality publishes only an
assessment account number and the PID is derived by matching that account's PVSC
open-data coordinate against the NSPRD parcel layer. The derived path never
guesses: an account that fails to resolve to exactly one PID is left unmatched
and out of the rendered layer. A normalized listing remains one record when it
covers several parcels, so listing-level amounts are never allocated by the UI.
Filters derive matched PID sets by municipality, year, and outcome without
altering the upcoming-notice layer.

The supported slice spans five municipalities and carries 20 events, 425
owner-free records, and 403 matched PIDs. Halifax Regional Municipality
contributes seven tender events
(March 8, 2022 through September 16, 2025) with 87 records and 93 exact official
PIDs. Victoria County, Cumberland County, and the two CBRM sales add
result-backed events whose receipts are pinned to municipal or archive captures.
Six Municipality of the District of Lunenburg tender events (March 1, 2021
through March 2, 2026) add 145 records whose PIDs are all derived by
deterministic reconciliation; Lunenburg publishes winning bids only in
per-property award documents, so selling prices are read from those documents
(never reconstructed from surplus, which drifts from the award by accrued
interest), the municipal surplus history serves only as an independent
cross-check, and listings whose award and surplus records disagree are held
outcome unknown. The infocard calculates comparisons in integer cents only when
the same CAD event publishes both an opening bid and a selling price. It presents
direct official notice and result links, source dates, match basis, multi-PID
warnings, and a dated-outcome limitation. Researched events that cannot yet be
reconciled fail-closed stay outside the matched layer; the complete ledger and
per-document SHA-256 snapshot hashes live beside the dataset.

Municipal events retain their source status, while the rendered lifecycle is
derived from the current time. An advertised event becomes “verify results”
after its scheduled start; the app does not manufacture a historical outcome.
Rendered event controls include the source retrieval date. Inverness listings
are generated from the owner-free book JSON snapshot, whose byte-for-byte
SHA-256 is pinned by the web test suite.

### User-loaded maps (`web/src/userMaps/`)

A self-contained feature folder: `parsers/` (magic-byte sniffing; geotiff.js
2.1.3 — pinned, the 3.x read API differs — decoding in a web worker with
OffscreenCanvas and a main-thread fallback, overview-aware, capped at 4096 px),
`transform/` (proj4 registry for NS CRSs plus WKT-citation best-effort,
pixel→WGS84, mesh building, and the two solvers — `affine.ts` and `tps.ts` —
over the shared point-cloud conditioning gate in `conditioning.ts`),
`allmaps/` (`annotation.ts`: a pure IIIF Georeference Annotation serializer,
no new dependency), `render/` (`WarpedRasterLayer`: a
device-pixel-ratio-aware canvas layer drawing through a projected triangle
mesh in `user-maps-pane`, z-160 — above aerial imagery, below all data
overlays), `store/` (IndexedDB; metadata and blobs in separate object stores;
save failures degrade to session-only maps), and `components/` (layer-list
rows + react-leaflet bridge). `App.tsx`/`MapCanvas.tsx` hold mounting points
only. Everything is client-side; nothing is uploaded.
The PR-2 georeferencer (`useGeoreferenceSession.ts`, `components/Georeference*`)
solves a least-squares affine from ground control points and drapes through the
same mesh renderer. Control points are stored as WGS84 for portability but
solved in Web Mercator **metres** — at Nova Scotia's latitude a degree of
longitude is ~0.69 of a degree of latitude on the ground, so a degree-space fit
would shear every map east-west. Pixel coordinates are always in the ORIGINAL
raster's pixel space, never the downsampled preview's, so changing the preview
cap never invalidates saved points. Accuracy is reported as per-point ground
metres (not Mercator metres, which over-report by 1/cos φ — 1.44x here, so the
figure is deliberately *not* the one QGIS shows for an EPSG:3857 target), and
the worst-fitting row is flagged only from five points up: four points fitting
three parameters leave a one-dimensional residual space (`I − H` has rank 1),
so raw, leave-one-out and studentized residuals rank identically — a
1104-trial sweep scored 24% correct against a 25% chance baseline at four
points, rising to 60% against a 20% baseline at five. A solve is refused
outright when the control points are too thin to determine a transform, when
any coordinate comes out non-finite, or when the solved transform squashes one
axis more than 50:1 — the last being what three map clicks down a meridian
produce, complete with zero-area drape and a perfect 0 m residual. GCP markers
get their own pane (`georeference-pane`, z-660: above every data overlay and
above Leaflet's marker and tooltip panes, below its popup pane at 700) so a
control point is never buried under a parcel line.

PR 3 adds a second solver beside the affine one. `transform/tps.ts` is a
hand-rolled thin-plate spline, pure and Leaflet-free, solving in the same Web
Mercator metres; `UserMapRecord.georef.method` (`"affine" | "tps"`) already
existed, so nothing migrates. Agreement between the solvers is one-directional
and true **by construction**, not by matched constants: `solveTps`'s
destination gate *is* a `solveAffine` call over the same inputs, so everything
affine refuses TPS refuses, while TPS additionally refuses coincident control
points and a singular interpolation matrix. An earlier revision matched two
hand-tuned thresholds on two different quantities instead and drifted — a
100:1-squashed drape was refused by one and accepted by the other. The
source-side gate is the shared `conditionRatio` in `transform/conditioning.ts`,
which rejects on a *ratio* rather than exact singularity, so thin clouds (five
points along a road) are refused rather than solved into a drape a 1 px nudge
moves 12 km.

The spline reaches the screen through the same `WarpedRasterLayer` mesh at a
**two-tier** density: `TPS_DRAG_GRID_SIZE = 16` while a control point is being
dragged, `TPS_GRID_SIZE = 64` once the pointer settles (affine stays at 1 — a
single cell represents it exactly). Both numbers are measured, and error is
**not** monotone in grid size, so no test may assert that denser is always
better. Accuracy under a spline needs a different statistic: an interpolating
spline passes through its control points exactly, so the fit residual is ~0 by
construction and carries no signal. `tpsResidualReport` reports **leave-one-out
prediction error** instead, capped at 50 points to stay inside half a frame.
That figure is a conservative upper bound — measured to overstate true warp
error by 1.8x (n=12) to 3.7x (n=4) and never to be optimistic — so the UI reads
"No worse than N m" rather than "RMS N m". The highlighted suspect row is
ranked separately, by the **affine** fit residual even under a spline, because
leave-one-out loses that job decisively (62.9% vs 46.8% at n=8, z = −18.3): an
outlier left in a refit is absorbed into the spline's shape and corrupts its
neighbours' scores. So the flagged row is often not the largest number in the
column, which is what its copy ("Disagrees most with the other points") already
claims. Finally, `allmaps/annotation.ts` serializes the control points as a
IIIF Georeference Annotation — plain JSON, no `@allmaps/*` dependency, with
`transformation` on the body FeatureCollection rather than the annotation root,
and a `urn:uuid:` target because the extension has no provision for a local
file with no IIIF service.
