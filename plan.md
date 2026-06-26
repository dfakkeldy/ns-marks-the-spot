# Development Plan — NS Marks The Spot

## Completed
- [x] Repository setup and CLAUDE.md
- [x] Project scaffold — Xcode project, folder structure, core protocols
- [x] ARCHITECTURE.md

## Upcoming

### Phase 1: Map Engine
- [x] MapKit engine implementation — `MKMapView` via `UIViewRepresentable`
- [x] Fletcher tile overlay — offline bundle loading with placeholder generation
- [x] Transparency slider wired to overlay opacity

### Phase 2: Offline & Performance
- [x] Tile caching — `TileCache` with disk + memory tiers
- [x] Tile fetching — `TileFetcher` with async/await and cache integration

### Phase 3: POI Layer
- [x] POI data model finalized — SwiftData schema with explicit UUID id
- [x] POI vector overlay rendering on map — MKMarkerAnnotationView via MapEngine protocol
- [x] POI detail sheet / interactions — half-sheet with category badge and coordinates

### Phase 4: Polish & Testing
- [x] Unit test targets — 12 tests across TileCache, ViewModel, models
- [x] UI tests — launch test framework in place (map-specific tests deferred)
- [x] Accessibility — VoiceOver labels on slider and map view

### Phase 5: Swift 6 Migration
- [x] Mark the data/value layer `Sendable` (`TileCache`, `MapAnnotation`, `MapLayerType`)
- [x] Make MapKit's off-main tile pipeline data-race safe (`nonisolated` `OpacityTileOverlay` + `TileCache`, `@MainActor` `MapLayer` with `nonisolated` metadata)
- [x] Adopt Swift 6 language mode — `SWIFT_VERSION = 6.0` on all targets, full suite green

## Future Considerations
- Google Maps SDK as alternative engine
- Additional historical map layers (non-Fletcher)
- User-submitted POIs
- iCloud sync for POI collections
