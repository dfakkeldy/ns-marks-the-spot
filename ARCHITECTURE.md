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
Leaflet renders OpenStreetMap tiles and GeoJSON parcel polygons in the browser.

Municipal notices and NSPRD have deliberately separate authority:

1. A municipality source module owns notice fields such as lien, location,
   arrears, redeemable status, event details, and PIDs.
2. `services/nsprd.ts` performs exact-PID ArcGIS Feature Layer queries for
   geometry and the NSPRD update field only.
3. The UI joins notice records to returned geometry by PID. One PID may have
   multiple polygons, so selection and map fitting operate across all matching
   features.
4. Province-licensed geometry is not requested until the user accepts the
   versioned licence gate. Required attribution and the not-a-survey caveat stay
   visible in the map footer.
5. Browser geolocation is handled locally and drawn directly on the map; there
   is no application server receiving a user's coordinates.

The public tax-sale dataset omits assessed-owner names and avoids describing a
listed property as available. Fletcher is intentionally disabled on the web
until web-use rights are clear; offline Fletcher use continues to belong to the
native app.
