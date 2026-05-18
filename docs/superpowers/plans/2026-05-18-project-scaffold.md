# Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Xcode project, folder structure, core protocols, and documentation for NS Marks The Spot.

**Architecture:** Feature-grouped folder structure with `MapEngine`/`MapLayer` protocols as the engine-agnostic facade boundary. Manual DI via `AppContainer`. iOS 18 target, SwiftUI `@main App` lifecycle.

**Tech Stack:** Swift 6, SwiftUI, MapKit (bridged via protocols), SwiftData (stubbed)

---

### Task 1: Create Xcode project

**Files:**
- Create: `ns-marks-the-spot.xcodeproj/` (via Xcode)

This is a manual step — Xcode projects cannot be created from CLI.

- [ ] **Step 1: Open Xcode and create project**
  - File → New → Project
  - Template: iOS → App
  - Product Name: `ns-marks-the-spot`
  - Team: (your personal team)
  - Organization Identifier: `dev.dfakkeldy`
  - Interface: SwiftUI
  - Language: Swift
  - Storage: None (we'll add SwiftData inline)
  - Minimum Deployment: 18.0
  - Save to: the git repo root (`/Users/dfakkeldy/Developer/ns-marks-the-spot`)

- [ ] **Step 2: Verify project builds**

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Remove template files Xcode created that we'll replace**

Delete these template files from disk:
- `ns-marks-the-spot/ContentView.swift`
- `ns-marks-the-spot/ns_marks_the_spotApp.swift` (note: Xcode may use underscores)

```bash
rm -f ns-marks-the-spot/ContentView.swift ns-marks-the-spot/ns_marks_the_spotApp.swift
```

Remove their references from the Xcode project by selecting them in the Project Navigator and choosing "Move to Trash" (not "Remove Reference" — we want to delete them).

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot.xcodeproj/ ns-marks-the-spot/
git commit -m "$(cat <<'EOF'
chore: create Xcode project with iOS 18 target

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create folder structure

**Files:**
- Create: all directories

- [ ] **Step 1: Create all feature directories**

```bash
mkdir -p ns-marks-the-spot/App \
         ns-marks-the-spot/MapEngine/Protocols \
         ns-marks-the-spot/MapEngine/MapKit \
         ns-marks-the-spot/Overlay/ViewModels \
         ns-marks-the-spot/Overlay/Views \
         ns-marks-the-spot/POI/Models \
         ns-marks-the-spot/POI/ViewModels \
         ns-marks-the-spot/Services \
         ns-marks-the-spot/Mocks
```

- [ ] **Step 2: Verify directory structure**

```bash
find ns-marks-the-spot -type d | sort
```
Expected: All 13 directories listed (including existing ones).

- [ ] **Step 3: Add folder groups to Xcode project**
  - In Xcode Project Navigator, right-click the `ns-marks-the-spot` group
  - Select "New Group" for each feature folder: App, MapEngine, Overlay, POI, Services, Mocks
  - Within MapEngine: create Protocol and MapKit subgroups
  - Within Overlay: create ViewModels and Views subgroups
  - Within POI: create Models and ViewModels subgroups
  - Match the disk layout exactly

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot/
git commit -m "$(cat <<'EOF'
chore: create feature-grouped folder structure

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Write core protocols

**Files:**
- Create: `ns-marks-the-spot/MapEngine/Protocols/MapLayer.swift`
- Create: `ns-marks-the-spot/MapEngine/Protocols/MapEngine.swift`

- [ ] **Step 1: Write MapLayer.swift**

```swift
import Foundation

enum MapLayerType {
    case tile(URL)
    case vector([String])
}

protocol MapLayer: AnyObject, Identifiable {
    var id: String { get }
    var name: String { get }
    var type: MapLayerType { get }
    var opacity: CGFloat { get set }
    var isVisible: Bool { get set }
}
```

- [ ] **Step 2: Write MapEngine.swift**

```swift
import SwiftUI

protocol MapEngine: AnyObject {
    var layers: [any MapLayer] { get }

    func addLayer(_ layer: any MapLayer)
    func removeLayer(by id: String)
    func setOpacity(for layerId: String, to value: CGFloat)

    /// Returns a SwiftUI view wrapping the native map implementation.
    func makeMapView() -> AnyView
}
```

- [ ] **Step 3: Add both files to the Xcode project**
  - Drag `MapLayer.swift` and `MapEngine.swift` from Finder into the `Protocols` group in Xcode
  - Ensure "Copy items if needed" is unchecked (they're already in the right place)
  - Ensure the `ns-marks-the-spot` target is checked

- [ ] **Step 4: Verify the project compiles**

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add ns-marks-the-spot/MapEngine/Protocols/
git commit -m "$(cat <<'EOF'
feat: add MapEngine and MapLayer protocols

Defines the engine-agnostic facade boundary. MapEngine wraps native
map functionality behind a protocol; MapLayer represents overlays
as tile or vector sources with opacity control.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Write MapKit stubs

**Files:**
- Create: `ns-marks-the-spot/MapEngine/MapKit/MapKitEngine.swift`
- Create: `ns-marks-the-spot/MapEngine/MapKit/MapKitTileLayer.swift`

- [ ] **Step 1: Write MapKitTileLayer.swift**

```swift
import Foundation

final class MapKitTileLayer: MapLayer {
    let id: String
    let name: String
    let type: MapLayerType
    var opacity: CGFloat = 1.0
    var isVisible: Bool = true

    init(id: String, name: String, tileURL: URL) {
        self.id = id
        self.name = name
        self.type = .tile(tileURL)
    }
}
```

- [ ] **Step 2: Write MapKitEngine.swift**

```swift
import SwiftUI

final class MapKitEngine: MapEngine {
    private(set) var layers: [any MapLayer] = []

    func addLayer(_ layer: any MapLayer) {
        layers.append(layer)
    }

    func removeLayer(by id: String) {
        layers.removeAll { $0.id == id }
    }

    func setOpacity(for layerId: String, to value: CGFloat) {
        guard let layer = layers.first(where: { $0.id == layerId }) else { return }
        layer.opacity = min(max(value, 0), 1)
    }

    func makeMapView() -> AnyView {
        AnyView(
            Text("Map placeholder")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.blue.opacity(0.1))
        )
    }
}
```

- [ ] **Step 3: Add files to Xcode and verify build**

Drag into `MapEngine/MapKit` group, then:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot/MapEngine/MapKit/
git commit -m "$(cat <<'EOF'
feat: add MapKitEngine and MapKitTileLayer stubs

Minimal MapEngine implementation with placeholder map view and
tile layer conformance. Will be replaced with MKMapView +
MKTileOverlay in the next increment.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Write App layer

**Files:**
- Create: `ns-marks-the-spot/App/AppContainer.swift`
- Create: `ns-marks-the-spot/App/NSMarksTheSpotApp.swift`

- [ ] **Step 1: Write AppContainer.swift**

```swift
final class AppContainer {
    let mapEngine: any MapEngine

    init() {
        self.mapEngine = MapKitEngine()
    }
}
```

- [ ] **Step 2: Write NSMarksTheSpotApp.swift**

```swift
import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer()

    var body: some Scene {
        WindowGroup {
            MapContainerView(engine: container.mapEngine)
        }
    }
}
```

Note: This will not compile yet — `MapContainerView` doesn't exist. That's created in Task 6.

- [ ] **Step 3: Add files to Xcode**

Drag both into the `App` group in Xcode.

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot/App/
git commit -m "$(cat <<'EOF'
feat: add App entry point and DI container

Manual dependency injection via AppContainer — compile-time safety
over @EnvironmentObject. SwiftUI @main App lifecycle with
WindowGroup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Write Overlay stubs

**Files:**
- Create: `ns-marks-the-spot/Overlay/ViewModels/OverlayViewModel.swift`
- Create: `ns-marks-the-spot/Overlay/Views/TransparencySliderView.swift`
- Create: `ns-marks-the-spot/Overlay/Views/MapContainerView.swift`

- [ ] **Step 1: Write OverlayViewModel.swift**

```swift
import SwiftUI

@MainActor
final class OverlayViewModel: ObservableObject {
    @Published var opacity: CGFloat = 0.5
    var selectedLayerId: String?

    private let engine: any MapEngine

    init(engine: any MapEngine) {
        self.engine = engine
    }

    func updateOpacity(_ newValue: CGFloat) {
        opacity = newValue
        if let layerId = selectedLayerId {
            engine.setOpacity(for: layerId, to: newValue)
        }
    }
}
```

- [ ] **Step 2: Write TransparencySliderView.swift**

```swift
import SwiftUI

struct TransparencySliderView: View {
    @ObservedObject var viewModel: OverlayViewModel

    var body: some View {
        HStack {
            Text("Opacity")
                .font(.caption)
            Slider(value: Binding(
                get: { viewModel.opacity },
                set: { viewModel.updateOpacity($0) }
            ), in: 0...1)
            Text("\(Int(viewModel.opacity * 100))%")
                .font(.caption)
                .monospacedDigit()
        }
        .padding()
        .background(.thinMaterial)
        .cornerRadius(12)
        .padding()
    }
}
```

- [ ] **Step 3: Write MapContainerView.swift**

```swift
import SwiftUI

struct MapContainerView: View {
    let engine: any MapEngine
    @StateObject private var viewModel: OverlayViewModel

    init(engine: any MapEngine) {
        self.engine = engine
        _viewModel = StateObject(wrappedValue: OverlayViewModel(engine: engine))
    }

    var body: some View {
        ZStack {
            engine.makeMapView()
                .ignoresSafeArea()

            VStack {
                Spacer()
                TransparencySliderView(viewModel: viewModel)
            }
        }
    }
}
```

- [ ] **Step 4: Add files to Xcode and verify the project builds**

Drag files into their respective groups, then:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add ns-marks-the-spot/Overlay/
git commit -m "$(cat <<'EOF'
feat: add overlay transparency UI stubs

OverlayViewModel manages opacity state and delegates to MapEngine.
TransparencySliderView renders a material-backed slider overlay.
MapContainerView composes the map view and slider in a ZStack.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Write POI stubs

**Files:**
- Create: `ns-marks-the-spot/POI/Models/PointOfInterest.swift`
- Create: `ns-marks-the-spot/POI/ViewModels/POIViewModel.swift`

- [ ] **Step 1: Write PointOfInterest.swift**

```swift
import Foundation
import SwiftData

@Model
final class PointOfInterest {
    var name: String
    var latitude: Double
    var longitude: Double
    var category: String

    init(name: String, latitude: Double, longitude: Double, category: String) {
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.category = category
    }
}
```

- [ ] **Step 2: Write POIViewModel.swift**

```swift
import Foundation

@MainActor
final class POIViewModel: ObservableObject {
    @Published var points: [PointOfInterest] = []

    func loadMockData() {
        points = [
            PointOfInterest(
                name: "Example Waterfall",
                latitude: 44.6488,
                longitude: -63.5752,
                category: "waterfall"
            )
        ]
    }
}
```

- [ ] **Step 3: Add files to Xcode and verify build**

Drag into their groups, then:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot/POI/
git commit -m "$(cat <<'EOF'
feat: add POI SwiftData model and ViewModel stubs

PointOfInterest @Model with name, lat/lon, and category. POIViewModel
with mock data for Halifax waterfront area.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Write Service stubs

**Files:**
- Create: `ns-marks-the-spot/Services/TileFetcher.swift`
- Create: `ns-marks-the-spot/Services/TileCache.swift`

- [ ] **Step 1: Write TileFetcher.swift**

```swift
import Foundation

final class TileFetcher {
    func fetchTile(z: Int, x: Int, y: Int, from baseURL: URL) async throws -> Data {
        let url = baseURL
            .appendingPathComponent("\(z)")
            .appendingPathComponent("\(x)")
            .appendingPathComponent("\(y).jpg")
        let (data, _) = try await URLSession.shared.data(from: url)
        return data
    }
}
```

- [ ] **Step 2: Write TileCache.swift**

```swift
import Foundation

final class TileCache {
    private let cache = NSCache<NSString, NSData>()

    func cachedTile(z: Int, x: Int, y: Int) -> Data? {
        let key = "\(z)/\(x)/\(y)" as NSString
        return cache.object(forKey: key) as Data?
    }

    func cacheTile(_ data: Data, z: Int, x: Int, y: Int) {
        let key = "\(z)/\(x)/\(y)" as NSString
        cache.setObject(data as NSData, forKey: key)
    }

    func clearCache() {
        cache.removeAllObjects()
    }
}
```

- [ ] **Step 3: Add files to Xcode and verify build**

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot/Services/
git commit -m "$(cat <<'EOF'
feat: add TileFetcher and TileCache service stubs

TileFetcher builds XYZ tile URLs and fetches via URLSession.
TileCache wraps NSCache with string-keyed tile lookup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Write Mock stubs

**Files:**
- Create: `ns-marks-the-spot/Mocks/MockMapEngine.swift`
- Create: `ns-marks-the-spot/Mocks/MockTileServer.swift`

- [ ] **Step 1: Write MockMapEngine.swift**

```swift
import SwiftUI

final class MockMapEngine: MapEngine {
    private(set) var layers: [any MapLayer] = []

    func addLayer(_ layer: any MapLayer) {
        layers.append(layer)
    }

    func removeLayer(by id: String) {
        layers.removeAll { $0.id == id }
    }

    func setOpacity(for layerId: String, to value: CGFloat) {
        guard let layer = layers.first(where: { $0.id == layerId }) else { return }
        layer.opacity = min(max(value, 0), 1)
    }

    func makeMapView() -> AnyView {
        AnyView(
            Text("Mock Map")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.gray.opacity(0.2))
        )
    }
}
```

- [ ] **Step 2: Write MockTileServer.swift**

```swift
import Foundation

final class MockTileServer {
    func mockTileData(z: Int, x: Int, y: Int) -> Data {
        // Returns empty data for now — will return real mock tiles
        // when test targets are added
        Data()
    }
}
```

- [ ] **Step 3: Add files to Xcode and verify build**

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add ns-marks-the-spot/Mocks/
git commit -m "$(cat <<'EOF'
feat: add MockMapEngine and MockTileServer stubs

Mock implementations for development without network or MapKit
dependencies. Will power unit tests when test targets are added.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Write ARCHITECTURE.md

**Files:**
- Create: `ARCHITECTURE.md`

- [ ] **Step 1: Write ARCHITECTURE.md**

```markdown
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

### Folder Organization
Feature-grouped — each feature (MapEngine, Overlay, POI) is a self-contained
folder with its own protocols, implementations, and views. Mocks are
centralized at the top level.

## Dependencies
- **SwiftUI** — UI framework (OS)
- **MapKit** — map rendering (OS, behind protocol)
- **SwiftData** — POI persistence (OS)

No third-party dependencies.
```

- [ ] **Step 2: Verify file content**

```bash
wc -l ARCHITECTURE.md
```
Expected: ~70 lines

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
docs: add ARCHITECTURE.md

Documents engine-agnostic facade, layer architecture, data flow for
the transparency slider, DI approach, and folder organization.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Write plan.md

**Files:**
- Create: `plan.md`

- [ ] **Step 1: Write plan.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add plan.md
git commit -m "$(cat <<'EOF'
docs: add development plan (plan.md)

Prioritized roadmap in four phases: map engine → caching →
POI layer → testing. Tracks completed items and future
considerations.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Final verification

- [ ] **Step 1: Clean build from scratch**

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 16' clean build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 2: Verify all files are tracked**

```bash
git status
```
Expected: `nothing to commit, working tree clean`

- [ ] **Step 3: Final review of commit history**

```bash
git log --oneline
```
Expected: ~12 commits from project creation through docs, all following Conventional Commits format.
