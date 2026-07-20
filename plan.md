# Development Plan — NS Marks The Spot

## Completed
- [x] Repository setup and CLAUDE.md
- [x] Project scaffold — Xcode project, folder structure, core protocols
- [x] Architecture documentation
- [x] MapKit-backed `MapEngine` implementation via `UIViewRepresentable`
- [x] Fletcher overlay rendering and opacity controls
- [x] Layer catalog for Fletcher, NS Aerial, and provincial reference layers
- [x] Viewed-tile persistence with `TileCache` and `TileStore`
- [x] Offline storage reporting and cache deletion UI
- [x] Saved offline area models, estimation, and Fletcher download pipeline
- [x] Map rectangle selection wired through `MapEngine` for saved-area drafting
- [x] Data Sources & Licenses disclosure with Province attribution
- [x] Fastlane metadata automation and release-prep verification
- [x] Unit and UI test targets in place for v1.0

## v1.0 Milestones

### Map Experience
- [x] Engine-agnostic map boundary preserved for future renderer swaps
- [x] NS Aerial available as a selectable basemap-style context layer
- [x] Layer sheet shows per-layer offline policy

### Offline
- [x] Viewed historical tiles persist until manual deletion
- [x] Fletcher saved areas use rectangular bounds captured from the map
- [x] Saved-area downloads record estimate, success, and failure counts
- [x] NS Aerial and restricted provincial layers remain viewed-cache only in v1.0

### Release Readiness
- [x] App icon asset catalog uses rasterized PNG deliverables
- [x] App Review notes document optional location access and offline limits
- [x] Local Fastlane metadata lint passes without network credentials

## Deferred For v1.1
- [ ] Bulk offline downloads for NS Aerial imagery
- [ ] Bulk offline downloads for restricted Nova Scotia reference layers where licensing permits
- [ ] Additional historical map collections beyond Fletcher
- [ ] User-submitted POIs and syncing improvements

## Online Companion

- [x] React + Vite map shell with a responsive desktop/mobile layout
- [x] Versioned Province licence acceptance before NSPRD geometry loads
- [x] Exact PID search against the live NSPRD Feature Layer
- [x] Civic-address search through the authoritative Civic Address File with NSPRD parcel resolution
- [x] Tap-to-identify any visible NSPRD parcel boundary and open the shared parcel sheet
- [x] Browser-local current location display
- [x] Native catalog parity for NS Aerial, Property Boundaries, Crown Lands, Flood Risk Areas, and Waterfalls
- [x] Native ArcGIS sublayer restrictions, symbology, zoom floors, and Province licence gate on the web
- [x] Complete Province water and transportation overlays with legible official cartography, trails, and close-range culverts
- [x] Collapsed, default-off Geology & Resources group with live mineral occurrences, NovaROC tenure, and zoom-bounded abandoned mine openings
- [x] Default-off Inverness hydro terrain-potential pilot with official watershed area, NSHN mapped drop/route length, area-scaled streams, relative potential colour, raw-metric popups, and reproducible source receipt
- [x] Viewport-paged feature queries with independent loading, zoom, count, failure, source, and screening-caveat states
- [x] Statewide NSPRD boundary visibility from zoom 7 and an opaque close-zoom selected-parcel fill
- [x] Approximate NSPRD acreage, exact road/water intersections, and explicitly labelled adjacent/civic-address roads in the selected-parcel sheet
- [x] Authoritative Civic Address File lookup with paginated bounding-box queries and exact parcel containment
- [x] Independent civic-address loading, empty, failure, attribution, and stale-selection cancellation states
- [x] Locally calculated Plus Codes with opt-in Google Maps directions for mapped civic points
- [x] Parcel-first defaults: modern/aerial off, boundaries/water/roads on, and one-time tax-sale bounds fit
- [x] Unavailable Fletcher control placed last in the web layer list
- [x] Privacy-minimized Inverness County August 11, 2026 tax-sale layer
- [x] Official-source link, withdrawal/redemption warning, and title-search caveat
- [x] Offline-use handoff to the native iPhone app
- [x] Default-off, owner-free historical tax-sale outcomes for two fully reconciled Halifax events
- [x] Historical municipality/year/outcome filters, source-linked infocards, validation, and match/source ledgers
- [ ] Enable Fletcher on the web after web-use rights are clear
- [ ] Add municipality importers only from current official notices
- [ ] Add a well-log layer only after its dated coordinates, source-purpose wording, and precision warnings are reconciled
- [ ] Add separate Karst Risk and Known Karst Occurrences layers from DP ME 494 only with 2019 currentness, source-scale, completeness, and non-survey caveats
- [ ] Add a selected-parcel Property context summary, starting with karst and coastal hazards; use the researched source order and caveats in `docs/property-context-data-candidates.md`

## Future Considerations
- Google Maps SDK as alternative engine
- iCloud sync for POI collections
