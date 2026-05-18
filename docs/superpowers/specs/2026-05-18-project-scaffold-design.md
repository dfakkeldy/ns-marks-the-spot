# Project Scaffold Design — 2026-05-18

## Context
"NS Marks The Spot" is at day zero — repo initialized with only `.gitignore` and `CLAUDE.md`. No code, no Xcode project, none of the referenced architecture docs exist. This spec captures the first increment: project scaffold, core protocols, and documentation.

## Decisions

| Topic | Choice | Rationale |
|-------|--------|-----------|
| iOS target | 18.0 | Cleanest SwiftUI-MapKit interop; modern APIs |
| App lifecycle | SwiftUI `@main App` | Less boilerplate; no legacy scene delegate needed |
| Test targets | None for now | Add when there's code worth testing |
| Folder strategy | Feature-grouped (Approach A) | Supports Engine-Agnostic Facade by keeping abstraction with consumer |
| Dependency injection | Manual (`AppContainer`) | Compile-time safety over runtime environment objects |

## Folder Structure
```
ns-marks-the-spot/
├── App/
│   ├── NSMarksTheSpotApp.swift        ← @main entry point
│   └── AppContainer.swift             ← dependency injection
├── MapEngine/
│   ├── Protocols/
│   │   ├── MapEngine.swift
│   │   └── MapLayer.swift
│   └── MapKit/
│       ├── MapKitEngine.swift
│       └── MapKitTileLayer.swift
├── Overlay/
│   ├── ViewModels/
│   │   └── OverlayViewModel.swift
│   └── Views/
│       ├── MapContainerView.swift
│       └── TransparencySliderView.swift
├── POI/
│   ├── Models/
│   │   └── PointOfInterest.swift
│   └── ViewModels/
│       └── POIViewModel.swift
├── Services/
│   ├── TileFetcher.swift
│   └── TileCache.swift
├── Mocks/
│   ├── MockMapEngine.swift
│   └── MockTileServer.swift
└── Resources/
    └── Assets.xcassets
```

## Core Protocols

### MapLayer
```swift
protocol MapLayer: AnyObject, Identifiable {
    var id: String { get }
    var name: String { get }
    var type: MapLayerType { get }
    var opacity: CGFloat { get set }
    var isVisible: Bool { get set }
}
```
- `MapLayerType` enum with `.tile(URL)` and `.vector([String])` cases.
- `CGFloat` for opacity — platform-native, avoids casts at every call site.

### MapEngine
```swift
protocol MapEngine: AnyObject {
    var layers: [any MapLayer] { get }
    func addLayer(_ layer: any MapLayer)
    func removeLayer(by id: String)
    func setOpacity(for layerId: String, to value: CGFloat)
    func makeMapView() -> AnyView
}
```
- `AnyView` return type is pragmatic — opaque `some View` requires compile-time concrete type knowledge, which defeats protocol purpose.

### Dependency Injection
```swift
final class AppContainer {
    let mapEngine: any MapEngine
    init() { self.mapEngine = MapKitEngine() }
}
```
- Manual DI in `AppContainer` — no framework. Compile-time safety over `@EnvironmentObject`'s runtime crash-on-missing.

## Documentation to Create
1. **`ARCHITECTURE.md`** — engine-agnostic facade, layer architecture, data flow, dependency overview
2. **`plan.md`** — prioritized roadmap: scaffold → MapKit engine → tile overlay → slider → caching → POI → tests

## Implementation Scope
This spec covers:
- Creating the Xcode project with iOS 18 target
- Writing the folder structure and all stub files above
- Implementing `MapEngine`, `MapLayer` protocols
- Implementing `AppContainer` and `NSMarksTheSpotApp`
- Writing `ARCHITECTURE.md` and `plan.md`

This spec does NOT cover:
- Any MapKit UIViewRepresentable implementation
- Any concrete tile overlay or networking code
- Any POI SwiftData models
- Any UI beyond the scaffold
