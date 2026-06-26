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
  render view). Conforming types: `MapKitEngine`, `MockMapEngine`.
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

### Concurrency & Isolation (Swift 6)
The app builds in **Swift 6 language mode** with complete data-race checking.
The module defaults to main-actor isolation
(`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), so the UI, view models, the
`MapEngine`, and `MapKitTileLayer`'s display state are `@MainActor` by default —
no annotations required.

The one path that must run **off** the main actor is MapKit's tile loading:
`MKTileOverlay.loadTile(at:result:)` is invoked on a background queue. It is
carved out explicitly:

- **`OpacityTileOverlay`** is `nonisolated` (matching `MKTileOverlay`). It
  captures the immutable tile config (`layerName`, `cacheIdentifier`,
  `layerType`) as `let`s at init, so `loadTile` never touches main-actor state.
  `mapLayer`/`renderer` are `@MainActor` and used only by the renderer.
- **`MapLayer`** is a `@MainActor` protocol whose immutable metadata
  (`id`/`name`/`type`/zoom/`cacheIdentifier`) is `nonisolated`, while mutable
  display state (`opacity`/`isVisible`) stays main-actor-isolated.
- **`TileCache`** is `nonisolated` + `@unchecked Sendable` — thread-safe via
  `NSCache` and a serial disk queue, callable from any context.
- Pure value types (`MapAnnotation`, `MapLayerType`) are `Sendable`.

Two deliberate escape hatches, each documented at its use site:
- `TileCache: @unchecked Sendable` — `NSCache`/`FileManager` are thread-safe but
  not SDK-`Sendable`.
- `nonisolated(unsafe) let deliver = result` in `loadTile` — bridges MapKit's
  one-shot, non-`Sendable` ObjC completion handler into a `Task` (a race-free
  handoff the region checker cannot prove through the ObjC bridge).

### Folder Organization
Feature-grouped — each feature (MapEngine, Overlay, POI) is a self-contained
folder with its own protocols, implementations, and views. Mocks are
centralized at the top level.

## Dependencies
- **SwiftUI** — UI framework (OS)
- **MapKit** — map rendering (OS, behind protocol)
- **SwiftData** — POI persistence (OS)

No third-party dependencies.
