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

## Future Considerations
- Google Maps SDK as alternative engine
- iCloud sync for POI collections
