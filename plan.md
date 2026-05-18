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
- [ ] Unit test targets — mock engine, mock tile server
- [ ] UI tests — slider interaction, map rendering
- [ ] App icon, launch screen, accessibility pass

## Future Considerations
- Google Maps SDK as alternative engine
- Additional historical map layers (non-Fletcher)
- User-submitted POIs
- iCloud sync for POI collections
