# Development Plan — NS Marks The Spot

## Completed
- [x] Repository setup and CLAUDE.md
- [x] Project scaffold — Xcode project, folder structure, core protocols
- [x] ARCHITECTURE.md

## Upcoming

### Phase 1: Map Engine
- [ ] MapKit engine implementation — `MKMapView` via `UIViewRepresentable`
- [ ] Fletcher tile overlay — XYZ tile server integration, `MKTileOverlay`
- [ ] Transparency slider wired to overlay opacity

### Phase 2: Offline & Performance
- [ ] Tile caching — `TileCache` with disk + memory tiers
- [ ] Background tile fetching — `TileFetcher` with async/await

### Phase 3: POI Layer
- [ ] POI data model finalized — SwiftData schema
- [ ] POI vector overlay rendering on map
- [ ] POI detail sheet / interactions

### Phase 4: Polish & Testing
- [ ] Unit test targets — mock engine, mock tile server
- [ ] UI tests — slider interaction, map rendering
- [ ] App icon, launch screen, accessibility pass

## Future Considerations
- Google Maps SDK as alternative engine
- Additional historical map layers (non-Fletcher)
- User-submitted POIs
- iCloud sync for POI collections
