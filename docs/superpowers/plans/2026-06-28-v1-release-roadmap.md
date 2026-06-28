# V1 Release Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship NS Marks The Spot v1.0 as a field-ready Nova Scotia historical map explorer with persistent viewed-tile caching, Fletcher saved areas, NS Aerial support, data-source/license disclosure, and reliable release automation.

**Architecture:** Keep the existing SwiftUI-to-MapEngine boundary intact. Add a layer catalog, explicit tile storage, saved-area models, and download coordination around the current MapKit renderer rather than replacing the renderer. Implement the release in narrow, reviewable tasks that each adds tests before production behavior.

**Tech Stack:** Swift 5.0, SwiftUI, MapKit, UIKit interop via `UIViewRepresentable`, SwiftData for existing POI persistence, Swift Testing for unit tests, XCTest for UI tests, Fastlane for release automation.

## Global Constraints

- Platform: iOS app using SwiftUI, MapKit, SwiftData, and UIKit interop through `UIViewRepresentable`.
- Xcode observed locally: Xcode 26.6.
- Deployment target observed in the project: iOS 26.5.
- Swift language version observed in build settings: Swift 5.0.
- Do not introduce third-party frameworks.
- Preserve the MapEngine abstraction: SwiftUI views must not import MapKit directly.
- v1.0 saved-area downloads include Fletcher tiles only.
- NS Aerial and restricted Nova Scotia reference layers are online plus viewed-cache only in v1.0.
- NS Aerial source URL: `https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer`.
- Province attribution text: `Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.`
- Apple/MapKit basemap offline availability is not a v1.0 promise.
- Keep secrets such as `fastlane/api_key.json` out of source control.

---

## File Structure

Create these feature folders:

- `ns-marks-the-spot/Layers/`: layer catalog, source definitions, attribution, and offline policy.
- `ns-marks-the-spot/Offline/Models/`: tile coordinates, bounds, saved-area state.
- `ns-marks-the-spot/Offline/Services/`: persistent tile store, Fletcher tile planning, download manager.
- `ns-marks-the-spot/Offline/ViewModels/`: storage and saved-area UI state.
- `ns-marks-the-spot/Offline/Views/`: storage screen and saved-area controls.
- `ns-marks-the-spotTests/Layers/`: catalog and policy tests.
- `ns-marks-the-spotTests/Offline/`: tile store, planner, and download manager tests.

Modify these existing areas:

- `ns-marks-the-spot/App/AppContainer.swift`: stop hardcoding layers directly; install layers from `LayerCatalog`.
- `ns-marks-the-spot/MapEngine/Protocols/MapLayer.swift`: add a source case for ArcGIS map services used without dynamic layer JSON.
- `ns-marks-the-spot/MapEngine/Protocols/MapEngine.swift`: add a basemap option for NS Aerial if the first implementation models it as a selectable context layer.
- `ns-marks-the-spot/MapEngine/MapKit/MapKitTileLayer.swift`: carry catalog metadata into concrete layers.
- `ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift`: remove release debug rendering and route tile loading through the new store/fetcher behaviors.
- `ns-marks-the-spot/Services/TileCache.swift`: either wrap it with `TileStore` or evolve it to support metadata, size reporting, and scoped deletion.
- `ns-marks-the-spot/Services/TileFetcher.swift`: add ArcGIS map-service tile image fetching without dynamic layer JSON.
- `ns-marks-the-spot/Overlay/ViewModels/OverlayViewModel.swift`: expose catalog metadata and layer offline status to the layer sheet.
- `ns-marks-the-spot/Overlay/Views/MapContainerView.swift`: add entry points for storage, save-area mode, and license/info access.
- `ns-marks-the-spot/Overlay/Views/TransparencySliderView.swift`: show per-layer offline eligibility and include NS Aerial.
- `ns-marks-the-spot/Overlay/Views/InfoSheetView.swift`: add data-source/license content.
- `fastlane/Fastfile`: make release lanes executable.
- `plan.md` and `ARCHITECTURE.md`: update after the implementation lands.

The Xcode project uses filesystem-synchronized source groups for app and test folders, so new Swift files under these folders should be picked up automatically. If Xcode does not compile a newly added file, add it to the appropriate target through Xcode and include the generated project-file change in that task's commit.

---

### Task 1: Release Blockers And Test Resource Isolation

**Files:**
- Modify: `ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift`
- Modify: `ns-marks-the-spot.xcodeproj/project.pbxproj`
- Create: `ns-marks-the-spotTests/Fixtures/TestTileFactory.swift`
- Modify: `ns-marks-the-spotTests/ns_marks_the_spotTests.swift`

**Interfaces:**
- Produces: `TestTileFactory.pngData(color:label:) -> Data`
- Produces: release tile rendering with `OpacityTileOverlay.debugShowTileGrid == false`
- Produces: a test target that can run without copying the full 1.9 GB `Tiles` resource folder
- Consumes: existing `TileCache` tests

- [ ] **Step 1: Write the failing fixture and debug-grid tests**

Append these tests to `ns-marks-the-spotTests/ns_marks_the_spotTests.swift`:

```swift
// MARK: - Release readiness

struct ReleaseReadinessTests {
    @Test func tileDebugGridIsDisabledForReleaseReadiness() {
        #expect(OpacityTileOverlay.debugShowTileGrid == false)
    }
}
```

Create `ns-marks-the-spotTests/Fixtures/TestTileFactory.swift`:

```swift
import Foundation
import UIKit

enum TestTileFactory {
    static func pngData(
        color: UIColor = .systemBlue,
        label: String = "test"
    ) -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256))
        return renderer.pngData { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 18),
                .foregroundColor: UIColor.white
            ]
            label.draw(at: CGPoint(x: 16, y: 16), withAttributes: attributes)
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/ReleaseReadinessTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL because `OpacityTileOverlay.debugShowTileGrid` is currently `true`. If the command hangs before the test executes, continue with Step 4 and include the Xcode resource-copy fix in the same commit.

- [ ] **Step 3: Disable the tile debug grid**

In `ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift`, change:

```swift
static let debugShowTileGrid = true
```

to:

```swift
static let debugShowTileGrid = false
```

- [ ] **Step 4: Remove the full `Tiles` folder from the app target resource build**

In `ns-marks-the-spot.xcodeproj/project.pbxproj`, remove the `Tiles` resource build file from the app target resources phase:

```diff
-       CC5603312FBB70BC00918D5A /* Tiles in Resources */ = {isa = PBXBuildFile; fileRef = CC5603302FBB70BC00918D5A /* Tiles */; };
```

Remove this entry from `PBXResourcesBuildPhase` for the app target:

```diff
-               CC5603312FBB70BC00918D5A /* Tiles in Resources */,
```

Keep the `Tiles` file reference in the project navigator if desired; the goal is to stop copying the full directory into every build/test app.

- [ ] **Step 5: Run focused tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/ReleaseReadinessTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 6: Run simulator build**

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **` and no `CpResource ... /Tiles` line.

- [ ] **Step 7: Commit**

```bash
git add ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift \
  ns-marks-the-spot.xcodeproj/project.pbxproj \
  ns-marks-the-spotTests/Fixtures/TestTileFactory.swift \
  ns-marks-the-spotTests/ns_marks_the_spotTests.swift
git commit -m "fix: remove release tile debug grid"
```

---

### Task 2: Layer Catalog And Offline Policy

**Files:**
- Create: `ns-marks-the-spot/Layers/LayerCatalog.swift`
- Create: `ns-marks-the-spot/Layers/LayerDescriptor.swift`
- Create: `ns-marks-the-spot/Layers/LayerAttribution.swift`
- Create: `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift`

**Interfaces:**
- Produces: `enum LayerID: String, CaseIterable`
- Produces: `enum LayerRenderingRole: Equatable`
- Produces: `enum LayerOfflinePolicy: Equatable`
- Produces: `struct LayerAttribution: Equatable`
- Produces: `struct LayerDescriptor: Identifiable, Equatable`
- Produces: `enum LayerCatalog { static let all: [LayerDescriptor]; static func descriptor(for:) -> LayerDescriptor? }`
- Consumes: no production code from later tasks

- [ ] **Step 1: Write failing catalog tests**

Create `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

struct LayerCatalogTests {
    @Test func containsExpectedV1Layers() {
        let ids = Set(LayerCatalog.all.map(\.id))

        #expect(ids == [
            .fletcher,
            .nsAerial,
            .nsPropertyBoundaries,
            .crownLands,
            .floodRisk,
            .waterfalls
        ])
    }

    @Test func fletcherIsSavedAreaDownloadable() {
        let descriptor = LayerCatalog.descriptor(for: .fletcher)

        #expect(descriptor?.offlinePolicy == .savedAreaDownloadable)
        #expect(descriptor?.renderingRole == .overlay)
        #expect(descriptor?.defaultOpacity == 1.0)
    }

    @Test func nsAerialIsViewedCacheOnlyAndDualRole() {
        let descriptor = LayerCatalog.descriptor(for: .nsAerial)

        #expect(descriptor?.offlinePolicy == .viewedCacheOnly)
        #expect(descriptor?.renderingRole == .basemapAndOverlay)
        #expect(descriptor?.sourceURL?.absoluteString == "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer")
    }

    @Test func provinceAttributionIsIncluded() {
        let descriptor = LayerCatalog.descriptor(for: .nsAerial)

        #expect(descriptor?.attribution.provider == "Province of Nova Scotia")
        #expect(descriptor?.attribution.disclaimer.contains("without warranty or liability") == true)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/LayerCatalogTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing `LayerCatalog`, `LayerDescriptor`, and related symbols.

- [ ] **Step 3: Add layer attribution and descriptor types**

Create `ns-marks-the-spot/Layers/LayerAttribution.swift`:

```swift
import Foundation

struct LayerAttribution: Equatable {
    let provider: String
    let copyright: String?
    let disclaimer: String
    let licenseTitle: String?
    let licenseURL: URL?
}
```

Create `ns-marks-the-spot/Layers/LayerDescriptor.swift`:

```swift
import Foundation

enum LayerID: String, CaseIterable {
    case fletcher
    case nsAerial = "ns-aerial"
    case nsPropertyBoundaries = "nsprd"
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
}

enum LayerRenderingRole: Equatable {
    case basemap
    case overlay
    case basemapAndOverlay
}

enum LayerOfflinePolicy: Equatable {
    case savedAreaDownloadable
    case viewedCacheOnly
    case onlineOnly
}

enum LayerSourceKind: Equatable {
    case remoteXYZTemplate
    case arcGISMapService
    case arcGISDynamic
}

struct LayerDescriptor: Identifiable, Equatable {
    let id: LayerID
    let name: String
    let sourceKind: LayerSourceKind
    let sourceURL: URL?
    let defaultOpacity: CGFloat
    let defaultVisibility: Bool
    let minZoom: Int
    let maxZoom: Int
    let renderingRole: LayerRenderingRole
    let offlinePolicy: LayerOfflinePolicy
    let cacheKey: String
    let attribution: LayerAttribution
    let userCaveat: String?
}
```

- [ ] **Step 4: Add the catalog entries**

Create `ns-marks-the-spot/Layers/LayerCatalog.swift`:

```swift
import Foundation

enum LayerCatalog {
    private static let provinceDisclaimer = "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions."

    static let all: [LayerDescriptor] = [
        LayerDescriptor(
            id: .fletcher,
            name: "Fletcher",
            sourceKind: .remoteXYZTemplate,
            sourceURL: URL(string: "https://wmts.oldmapsonline.org/maps/9b86f069-b432-5e78-a4c9-306ee238e5fb/2023-06-13T14:40:41.945831Z/{z}/{x}/{y}.png?key=RV2bKmpCwqI5ztsYpNUu"),
            defaultOpacity: 1.0,
            defaultVisibility: true,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .savedAreaDownloadable,
            cacheKey: "fletcher",
            attribution: LayerAttribution(
                provider: "David Rumsey Map Collection",
                copyright: nil,
                disclaimer: "Historical maps are provided for reference and historical interest only.",
                licenseTitle: nil,
                licenseURL: nil
            ),
            userCaveat: "Historical map; not for navigation."
        ),
        LayerDescriptor(
            id: .nsAerial,
            name: "NS Aerial",
            sourceKind: .arcGISMapService,
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 14,
            renderingRole: .basemapAndOverlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "ns-aerial",
            attribution: provinceAttribution(copyright: "Service Nova Scotia"),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .nsPropertyBoundaries,
            name: "NS Property Boundaries",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "nsprd",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .crownLands,
            name: "Crown Lands",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "crown-lands",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .floodRisk,
            name: "Flood Risk Areas",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "flood-risk",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        ),
        LayerDescriptor(
            id: .waterfalls,
            name: "Waterfalls",
            sourceKind: .arcGISDynamic,
            sourceURL: URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer"),
            defaultOpacity: 0.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .viewedCacheOnly,
            cacheKey: "waterfalls",
            attribution: provinceAttribution(copyright: nil),
            userCaveat: "Viewed-cache only in v1.0."
        )
    ]

    static func descriptor(for id: LayerID) -> LayerDescriptor? {
        all.first { $0.id == id }
    }

    private static func provinceAttribution(copyright: String?) -> LayerAttribution {
        LayerAttribution(
            provider: "Province of Nova Scotia",
            copyright: copyright,
            disclaimer: provinceDisclaimer,
            licenseTitle: "Province of Nova Scotia Restricted Geographic Services License",
            licenseURL: nil
        )
    }
}
```

- [ ] **Step 5: Run catalog tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/LayerCatalogTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ns-marks-the-spot/Layers \
  ns-marks-the-spotTests/Layers
git commit -m "feat: add layer catalog"
```

---

### Task 3: Catalog-Backed Layer Installation And NS Aerial Source

**Files:**
- Modify: `ns-marks-the-spot/MapEngine/Protocols/MapLayer.swift`
- Modify: `ns-marks-the-spot/MapEngine/Protocols/MapEngine.swift`
- Modify: `ns-marks-the-spot/MapEngine/MapKit/MapKitTileLayer.swift`
- Modify: `ns-marks-the-spot/Services/TileFetcher.swift`
- Modify: `ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift`
- Modify: `ns-marks-the-spot/App/AppContainer.swift`
- Modify: `ns-marks-the-spot/Mocks/MockMapEngine.swift`
- Create: `ns-marks-the-spotTests/Layers/LayerInstallationTests.swift`

**Interfaces:**
- Consumes: `LayerCatalog.all`, `LayerDescriptor`
- Produces: `MapLayerType.arcgisMapService(URL, transparent: Bool)`
- Produces: `MapBaseType.nsAerial`
- Produces: `MapKitTileLayer.init(descriptor:type:)`
- Produces: `TileFetcher.fetchArcGISMapServiceTile(z:x:y:from:layerName:transparent:) async throws -> Data`
- Produces: app startup installs all catalog layers

- [ ] **Step 1: Write failing installation tests**

Create `ns-marks-the-spotTests/Layers/LayerInstallationTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerInstallationTests {
    @Test func appContainerInstallsCatalogLayers() {
        let container = AppContainer()
        let ids = container.mapEngine.layers.map(\.id)

        #expect(ids.contains("fletcher"))
        #expect(ids.contains("ns-aerial"))
        #expect(ids.contains("nsprd"))
        #expect(ids.contains("crown-lands"))
        #expect(ids.contains("flood-risk"))
        #expect(ids.contains("waterfalls"))
    }

    @Test func nsAerialLayerUsesArcGISMapServiceSource() {
        let container = AppContainer()
        let layer = container.mapEngine.layers.first { $0.id == "ns-aerial" }

        guard let layer else {
            Issue.record("NS Aerial layer was not installed")
            return
        }

        if case .arcgisMapService(let url, let transparent) = layer.type {
            #expect(url.absoluteString == "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer")
            #expect(transparent == false)
        } else {
            Issue.record("NS Aerial should use arcgisMapService")
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/LayerInstallationTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL because `arcgisMapService`, `.nsAerial`, and catalog-backed installation do not exist.

- [ ] **Step 3: Add ArcGIS map-service source and NS Aerial basemap enum**

In `ns-marks-the-spot/MapEngine/Protocols/MapLayer.swift`, replace `MapLayerType` with:

```swift
enum MapLayerType {
    case tile(URL)
    case arcgisMapService(URL, transparent: Bool)
    case arcgisDynamic(URL, dynamicLayers: String?, layerRestrictions: String?)
    case vector([String])
}
```

In `ns-marks-the-spot/MapEngine/Protocols/MapEngine.swift`, replace `MapBaseType` with:

```swift
enum MapBaseType: String, CaseIterable, Identifiable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    case nsAerial = "NS Aerial"

    var id: String { self.rawValue }
}
```

- [ ] **Step 4: Update cache identifiers and descriptor initializer**

In `ns-marks-the-spot/MapEngine/MapKit/MapKitTileLayer.swift`, update `cacheIdentifier` to handle the new case:

```swift
case .arcgisMapService(let url, let transparent):
    configString = "arcgisMapService|\(url.absoluteString)|\(transparent)"
```

Add this convenience initializer:

```swift
convenience init(descriptor: LayerDescriptor, type: MapLayerType) {
    self.init(
        id: descriptor.id.rawValue,
        name: descriptor.name,
        type: type,
        minZoom: descriptor.minZoom,
        maxZoom: descriptor.maxZoom
    )
    self.opacity = descriptor.defaultOpacity
    self.isVisible = descriptor.defaultVisibility
}
```

- [ ] **Step 5: Add map-service fetcher**

In `ns-marks-the-spot/Services/TileFetcher.swift`, add:

```swift
func fetchArcGISMapServiceTile(
    z: Int,
    x: Int,
    y: Int,
    from serverURL: URL,
    layerName: String,
    transparent: Bool
) async throws -> Data {
    let bbox = tileToBBOX(z: z, x: x, y: y)
    var components = URLComponents(
        url: serverURL.appendingPathComponent("export"),
        resolvingAgainstBaseURL: false
    )!
    components.queryItems = [
        URLQueryItem(name: "bbox", value: "\(bbox.minX),\(bbox.minY),\(bbox.maxX),\(bbox.maxY)"),
        URLQueryItem(name: "bboxSR", value: "3857"),
        URLQueryItem(name: "imageSR", value: "3857"),
        URLQueryItem(name: "size", value: "256,256"),
        URLQueryItem(name: "format", value: "png32"),
        URLQueryItem(name: "transparent", value: transparent ? "true" : "false"),
        URLQueryItem(name: "f", value: "image")
    ]

    guard let url = components.url else {
        throw URLError(.badURL)
    }

    let (data, _) = try await URLSession.shared.data(from: url)
    tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
    return data
}
```

- [ ] **Step 6: Route overlay loading through the new source**

In `ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift`, add this branch before the existing `.arcgisDynamic` branch:

```swift
if let tileFetcher,
   let layer = mapLayer,
   case .arcgisMapService(let serverURL, let transparent) = layer.type
{
    Task {
        do {
            let data = try await tileFetcher.fetchArcGISMapServiceTile(
                z: path.z,
                x: path.x,
                y: path.y,
                from: serverURL,
                layerName: cacheKey,
                transparent: transparent
            )
            result(data, nil)
        } catch {
            result(generatePlaceholderTile(path: path), nil)
        }
    }
    return
}
```

- [ ] **Step 7: Install layers from the catalog**

In `ns-marks-the-spot/App/AppContainer.swift`, keep the service setup, then replace the hardcoded layer construction with:

```swift
for descriptor in LayerCatalog.all {
    guard let layer = makeLayer(from: descriptor) else { continue }
    engine.addLayer(layer)
}
```

Add this private helper inside `AppContainer`:

```swift
private func makeLayer(from descriptor: LayerDescriptor) -> MapKitTileLayer? {
    switch descriptor.id {
    case .fletcher:
        guard let url = descriptor.sourceURL else { return nil }
        return MapKitTileLayer(
            descriptor: descriptor,
            type: .tile(url)
        )
    case .nsAerial:
        guard let url = descriptor.sourceURL else { return nil }
        return MapKitTileLayer(
            descriptor: descriptor,
            type: .arcgisMapService(url, transparent: false)
        )
    case .nsPropertyBoundaries:
        guard let url = descriptor.sourceURL else { return nil }
        return MapKitTileLayer(
            descriptor: descriptor,
            type: .arcgisDynamic(
                url,
                dynamicLayers: """
                [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"showLabels":false}}]
                """,
                layerRestrictions: nil
            )
        )
    case .crownLands:
        guard let url = descriptor.sourceURL else { return nil }
        return MapKitTileLayer(
            descriptor: descriptor,
            type: .arcgisDynamic(
                url,
                dynamicLayers: """
                [{"id":0,"source":{"type":"mapLayer","mapLayerId":0},"drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSFS","style":"esriSFSSolid","color":[46,180,46,128],"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[0,100,0,255],"width":2}}},"labelingInfo":[]}]
                """,
                layerRestrictions: nil
            )
        )
    case .floodRisk:
        guard let url = descriptor.sourceURL else { return nil }
        return MapKitTileLayer(
            descriptor: descriptor,
            type: .arcgisDynamic(url, dynamicLayers: nil, layerRestrictions: "show:24,25,26")
        )
    case .waterfalls:
        guard let url = descriptor.sourceURL else { return nil }
        return MapKitTileLayer(
            descriptor: descriptor,
            type: .arcgisDynamic(
                url,
                dynamicLayers: """
                [{"id":1,"source":{"type":"mapLayer","mapLayerId":1},"definitionExpression":"FEAT_DESC = 'Falls -  On a single line river point'","drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriSMS","style":"esriSMSCircle","color":[0,120,255,255],"size":8,"outline":{"type":"esriSLS","style":"esriSLSSolid","color":[255,255,255,255],"width":1.5}}},"showLabels":true,"labelingInfo":[{"labelExpression":"[ZVALUE]","labelPlacement":"esriServerPointLabelPlacementAboveRight","symbol":{"type":"esriTS","color":[0,120,255,255],"font":{"size":10,"family":"Arial","weight":"bold"}},"minScale":50000}]}}]
                """,
                layerRestrictions: nil
            )
        )
    }
}
```

- [ ] **Step 8: Update MapKitEngine base-map handling**

In `MapKitEngine.updateMapType()`, add:

```swift
case .nsAerial:
    mapView.mapType = .standard
```

The NS Aerial visual context is supplied by the catalog layer; selecting this basemap style in later UI tasks should turn the NS Aerial layer visible while using a standard MapKit base underneath.

- [ ] **Step 9: Run installation tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/LayerInstallationTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add ns-marks-the-spot/App/AppContainer.swift \
  ns-marks-the-spot/MapEngine/Protocols/MapLayer.swift \
  ns-marks-the-spot/MapEngine/Protocols/MapEngine.swift \
  ns-marks-the-spot/MapEngine/MapKit/MapKitTileLayer.swift \
  ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift \
  ns-marks-the-spot/MapEngine/MapKit/MapKitEngine.swift \
  ns-marks-the-spot/Services/TileFetcher.swift \
  ns-marks-the-spot/Mocks/MockMapEngine.swift \
  ns-marks-the-spotTests/Layers/LayerInstallationTests.swift
git commit -m "feat: install layers from catalog"
```

---

### Task 4: Persistent TileStore With Size Reporting And Deletion

**Files:**
- Create: `ns-marks-the-spot/Offline/Models/TileCoordinate.swift`
- Create: `ns-marks-the-spot/Offline/Services/TileStore.swift`
- Modify: `ns-marks-the-spot/Services/TileCache.swift`
- Modify: `ns-marks-the-spot/Services/TileFetcher.swift`
- Modify: `ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift`
- Create: `ns-marks-the-spotTests/Offline/TileStoreTests.swift`

**Interfaces:**
- Produces: `struct TileCoordinate: Hashable, Codable`
- Produces: `struct TileStoreSummary: Equatable`
- Produces: `actor TileStore`
- Produces: `TileStore.tile(z:x:y:layerID:) async -> Data?`
- Produces: `TileStore.store(_:z:x:y:layerID:savedAreaID:) async throws`
- Produces: `TileStore.summary() async -> TileStoreSummary`
- Produces: `TileStore.deleteAll() async throws`
- Produces: `TileStore.deleteLayer(_:) async throws`
- Produces: `TileStore.deleteSavedArea(_:) async throws`
- Consumes: `LayerID.rawValue` cache keys

- [ ] **Step 1: Write failing TileStore tests**

Create `ns-marks-the-spotTests/Offline/TileStoreTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

struct TileStoreTests {
    @Test func roundTripAndSummary() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = TileStore(rootDirectory: root)
        let data = Data([0x10, 0x20, 0x30])

        try await store.store(data, z: 12, x: 1351, y: 1462, layerID: "fletcher", savedAreaID: "area-1")

        let retrieved = await store.tile(z: 12, x: 1351, y: 1462, layerID: "fletcher")
        let summary = await store.summary()

        #expect(retrieved == data)
        #expect(summary.totalBytes == 3)
        #expect(summary.layerBytes["fletcher"] == 3)
        #expect(summary.savedAreaBytes["area-1"] == 3)
    }

    @Test func deleteLayerRemovesOnlyThatLayer() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = TileStore(rootDirectory: root)

        try await store.store(Data([0x01]), z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: nil)
        try await store.store(Data([0x02]), z: 1, x: 1, y: 1, layerID: "ns-aerial", savedAreaID: nil)
        try await store.deleteLayer("fletcher")

        #expect(await store.tile(z: 1, x: 1, y: 1, layerID: "fletcher") == nil)
        #expect(await store.tile(z: 1, x: 1, y: 1, layerID: "ns-aerial") == Data([0x02]))
    }

    @Test func deleteSavedAreaKeepsViewedCacheTiles() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = TileStore(rootDirectory: root)

        try await store.store(Data([0x01]), z: 2, x: 2, y: 2, layerID: "fletcher", savedAreaID: "area-1")
        try await store.store(Data([0x02]), z: 2, x: 3, y: 3, layerID: "fletcher", savedAreaID: nil)
        try await store.deleteSavedArea("area-1")

        #expect(await store.tile(z: 2, x: 2, y: 2, layerID: "fletcher") == nil)
        #expect(await store.tile(z: 2, x: 3, y: 3, layerID: "fletcher") == Data([0x02]))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/TileStoreTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing `TileStore` and `TileStoreSummary`.

- [ ] **Step 3: Add tile coordinate and store types**

Create `ns-marks-the-spot/Offline/Models/TileCoordinate.swift`:

```swift
import Foundation

struct TileCoordinate: Hashable, Codable {
    let z: Int
    let x: Int
    let y: Int
}
```

Create `ns-marks-the-spot/Offline/Services/TileStore.swift`:

```swift
import Foundation

struct TileStoreSummary: Equatable {
    let totalBytes: Int
    let layerBytes: [String: Int]
    let savedAreaBytes: [String: Int]
}

actor TileStore {
    private let rootDirectory: URL
    private let fileManager: FileManager

    init(
        rootDirectory: URL? = nil,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        if let rootDirectory {
            self.rootDirectory = rootDirectory
        } else {
            self.rootDirectory = fileManager
                .urls(for: .cachesDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("TileStore", isDirectory: true)
        }
    }

    func tile(z: Int, x: Int, y: Int, layerID: String) -> Data? {
        try? Data(contentsOf: tileURL(z: z, x: x, y: y, layerID: layerID))
    }

    func store(
        _ data: Data,
        z: Int,
        x: Int,
        y: Int,
        layerID: String,
        savedAreaID: String?
    ) throws {
        let tileURL = tileURL(z: z, x: x, y: y, layerID: layerID)
        try fileManager.createDirectory(
            at: tileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: tileURL, options: .atomic)

        if let savedAreaID {
            let markerURL = markerURL(savedAreaID: savedAreaID, layerID: layerID, z: z, x: x, y: y)
            try fileManager.createDirectory(
                at: markerURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try tileURL.path(percentEncoded: false).data(using: .utf8)?.write(to: markerURL, options: .atomic)
        }
    }

    func summary() -> TileStoreSummary {
        var totalBytes = 0
        var layerBytes: [String: Int] = [:]
        var savedAreaBytes: [String: Int] = [:]

        for fileURL in tileFiles() {
            let bytes = fileSize(fileURL)
            totalBytes += bytes
            let layerID = layerIDForTileURL(fileURL)
            layerBytes[layerID, default: 0] += bytes
        }

        for markerURL in markerFiles() {
            guard let tilePath = try? String(contentsOf: markerURL),
                  fileManager.fileExists(atPath: tilePath) else { continue }
            let areaID = savedAreaIDForMarkerURL(markerURL)
            savedAreaBytes[areaID, default: 0] += fileSize(URL(fileURLWithPath: tilePath))
        }

        return TileStoreSummary(
            totalBytes: totalBytes,
            layerBytes: layerBytes,
            savedAreaBytes: savedAreaBytes
        )
    }

    func deleteAll() throws {
        try? fileManager.removeItem(at: rootDirectory)
    }

    func deleteLayer(_ layerID: String) throws {
        try? fileManager.removeItem(at: rootDirectory.appendingPathComponent("tiles/\(layerID)", isDirectory: true))
        try? fileManager.removeItem(at: rootDirectory.appendingPathComponent("markers").appendingPathComponent(layerID, isDirectory: true))
    }

    func deleteSavedArea(_ savedAreaID: String) throws {
        for markerURL in markerFiles().filter({ $0.pathComponents.contains(savedAreaID) }) {
            if let tilePath = try? String(contentsOf: markerURL) {
                try? fileManager.removeItem(atPath: tilePath)
            }
            try? fileManager.removeItem(at: markerURL)
        }
    }

    private func tileURL(z: Int, x: Int, y: Int, layerID: String) -> URL {
        rootDirectory
            .appendingPathComponent("tiles", isDirectory: true)
            .appendingPathComponent(layerID, isDirectory: true)
            .appendingPathComponent("\(z)", isDirectory: true)
            .appendingPathComponent("\(x)", isDirectory: true)
            .appendingPathComponent("\(y).png")
    }

    private func markerURL(savedAreaID: String, layerID: String, z: Int, x: Int, y: Int) -> URL {
        rootDirectory
            .appendingPathComponent("markers", isDirectory: true)
            .appendingPathComponent(layerID, isDirectory: true)
            .appendingPathComponent(savedAreaID, isDirectory: true)
            .appendingPathComponent("\(z)-\(x)-\(y).txt")
    }

    private func tileFiles() -> [URL] {
        files(under: rootDirectory.appendingPathComponent("tiles", isDirectory: true), extension: "png")
    }

    private func markerFiles() -> [URL] {
        files(under: rootDirectory.appendingPathComponent("markers", isDirectory: true), extension: "txt")
    }

    private func files(under directory: URL, extension pathExtension: String) -> [URL] {
        guard let enumerator = fileManager.enumerator(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == pathExtension }
    }

    private func fileSize(_ url: URL) -> Int {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        return values?.fileSize ?? 0
    }

    private func layerIDForTileURL(_ url: URL) -> String {
        let components = url.pathComponents
        guard let tilesIndex = components.firstIndex(of: "tiles"),
              components.count > tilesIndex + 1 else {
            return "unknown"
        }
        return components[tilesIndex + 1]
    }

    private func savedAreaIDForMarkerURL(_ url: URL) -> String {
        let components = url.pathComponents
        guard let markersIndex = components.firstIndex(of: "markers"),
              components.count > markersIndex + 2 else {
            return "unknown"
        }
        return components[markersIndex + 2]
    }
}
```

- [ ] **Step 4: Run TileStore tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/TileStoreTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 5: Wire TileStore into existing cache path**

Add `let tileStore: TileStore` to `AppContainer`, initialize it before `TileCache`, and pass it to the cache/fetcher after constructors are updated:

```swift
let store = TileStore()
self.tileStore = store

let cache = TileCache(tileStore: store)
self.tileCache = cache

let fetcher = TileFetcher(tileCache: cache)
self.tileFetcher = fetcher
```

Update `TileCache` initializer and methods so existing synchronous callers still work:

```swift
private let tileStore: TileStore?

init(tileStore: TileStore? = nil) {
    self.tileStore = tileStore
}
```

Keep current disk behavior in place for synchronous map rendering. In `cacheTile`, after writing to the existing cache path, also persist to `TileStore`:

```swift
Task {
    try? await tileStore?.store(data, z: z, x: x, y: y, layerID: layerName, savedAreaID: nil)
}
```

- [ ] **Step 6: Run existing cache tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/TileCacheTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ns-marks-the-spot/Offline \
  ns-marks-the-spot/Services/TileCache.swift \
  ns-marks-the-spot/Services/TileFetcher.swift \
  ns-marks-the-spot/MapEngine/MapKit/OpacityTileOverlay.swift \
  ns-marks-the-spot/App/AppContainer.swift \
  ns-marks-the-spotTests/Offline/TileStoreTests.swift
git commit -m "feat: add persistent tile store"
```

---

### Task 5: Saved Area Model And Fletcher Tile Planning

**Files:**
- Create: `ns-marks-the-spot/Offline/Models/MapBounds.swift`
- Create: `ns-marks-the-spot/Offline/Models/SavedOfflineArea.swift`
- Create: `ns-marks-the-spot/Offline/Services/FletcherTilePlanner.swift`
- Create: `ns-marks-the-spotTests/Offline/FletcherTilePlannerTests.swift`

**Interfaces:**
- Produces: `struct MapBounds: Equatable, Codable`
- Produces: `enum SavedOfflineAreaState: String, Codable, Equatable`
- Produces: `struct SavedOfflineArea: Identifiable, Codable, Equatable`
- Produces: `struct TileEstimate: Equatable`
- Produces: `enum FletcherTilePlanner { static func coordinates(for:zoomRange:) -> [TileCoordinate]; static func estimate(bounds:zoomRange:averageTileBytes:) -> TileEstimate }`
- Consumes: `TileCoordinate`

- [ ] **Step 1: Write failing planner tests**

Create `ns-marks-the-spotTests/Offline/FletcherTilePlannerTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

struct FletcherTilePlannerTests {
    @Test func computesExpectedWebMercatorTileForHalifaxAtZoomTen() {
        let bounds = MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )

        let coordinates = FletcherTilePlanner.coordinates(for: bounds, zoomRange: 10...10)

        #expect(coordinates.contains(TileCoordinate(z: 10, x: 331, y: 369)))
    }

    @Test func clampsPolarLatitudesToFiniteTileCoordinates() {
        let bounds = MapBounds(
            minLatitude: 89.0,
            minLongitude: -63.58,
            maxLatitude: 91.0,
            maxLongitude: -63.56
        )

        let coordinates = FletcherTilePlanner.coordinates(for: bounds, zoomRange: 3...3)

        #expect(!coordinates.isEmpty)
        #expect(coordinates.allSatisfy { coordinate in
            coordinate.z == 3 &&
                (0..<8).contains(coordinate.x) &&
                (0..<8).contains(coordinate.y)
        })
    }

    @Test func estimateUsesTileCountAndAverageBytes() {
        let bounds = MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )

        let estimate = FletcherTilePlanner.estimate(
            bounds: bounds,
            zoomRange: 10...11,
            averageTileBytes: 12_000
        )

        #expect(estimate.tileCount == FletcherTilePlanner.coordinates(for: bounds, zoomRange: 10...11).count)
        #expect(estimate.estimatedBytes == estimate.tileCount * 12_000)
    }

    @Test func normalizesInvertedBounds() {
        let bounds = MapBounds(
            minLatitude: 45.0,
            minLongitude: -63.0,
            maxLatitude: 44.0,
            maxLongitude: -64.0
        )

        #expect(bounds.normalized.minLatitude == 44.0)
        #expect(bounds.normalized.minLongitude == -64.0)
        #expect(bounds.normalized.maxLatitude == 45.0)
        #expect(bounds.normalized.maxLongitude == -63.0)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/FletcherTilePlannerTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing saved-area and planner types.

- [ ] **Step 3: Add bounds and saved-area models**

Create `ns-marks-the-spot/Offline/Models/MapBounds.swift`:

```swift
import Foundation

struct MapBounds: Equatable, Codable {
    let minLatitude: Double
    let minLongitude: Double
    let maxLatitude: Double
    let maxLongitude: Double

    var normalized: MapBounds {
        MapBounds(
            minLatitude: min(minLatitude, maxLatitude),
            minLongitude: min(minLongitude, maxLongitude),
            maxLatitude: max(minLatitude, maxLatitude),
            maxLongitude: max(minLongitude, maxLongitude)
        )
    }
}
```

Create `ns-marks-the-spot/Offline/Models/SavedOfflineArea.swift`:

```swift
import Foundation

enum SavedOfflineAreaState: String, Codable, Equatable {
    case draft
    case estimating
    case queued
    case downloading
    case complete
    case partial
    case failed
    case deleted
}

struct SavedOfflineArea: Identifiable, Codable, Equatable {
    let id: String
    var name: String
    var bounds: MapBounds
    var minZoom: Int
    var maxZoom: Int
    var createdAt: Date
    var updatedAt: Date
    var estimatedTileCount: Int
    var estimatedBytes: Int
    var downloadedTileCount: Int
    var failedTileCount: Int
    var actualBytes: Int
    var state: SavedOfflineAreaState

    init(
        id: String = UUID().uuidString,
        name: String,
        bounds: MapBounds,
        minZoom: Int,
        maxZoom: Int,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        estimatedTileCount: Int = 0,
        estimatedBytes: Int = 0,
        downloadedTileCount: Int = 0,
        failedTileCount: Int = 0,
        actualBytes: Int = 0,
        state: SavedOfflineAreaState = .draft
    ) {
        self.id = id
        self.name = name
        self.bounds = bounds
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.estimatedTileCount = estimatedTileCount
        self.estimatedBytes = estimatedBytes
        self.downloadedTileCount = downloadedTileCount
        self.failedTileCount = failedTileCount
        self.actualBytes = actualBytes
        self.state = state
    }
}
```

- [ ] **Step 4: Add the Fletcher tile planner**

Create `ns-marks-the-spot/Offline/Services/FletcherTilePlanner.swift`:

```swift
import Foundation

struct TileEstimate: Equatable {
    let tileCount: Int
    let estimatedBytes: Int
}

enum FletcherTilePlanner {
    private static let maxWebMercatorLatitude = 85.05112878

    static func coordinates(for bounds: MapBounds, zoomRange: ClosedRange<Int>) -> [TileCoordinate] {
        let normalized = bounds.normalized
        var coordinates: [TileCoordinate] = []

        for zoom in zoomRange {
            let northWest = tileXY(latitude: normalized.maxLatitude, longitude: normalized.minLongitude, zoom: zoom)
            let southEast = tileXY(latitude: normalized.minLatitude, longitude: normalized.maxLongitude, zoom: zoom)

            for x in northWest.x...southEast.x {
                for y in northWest.y...southEast.y {
                    coordinates.append(TileCoordinate(z: zoom, x: x, y: y))
                }
            }
        }

        return Array(Set(coordinates)).sorted {
            if $0.z != $1.z { return $0.z < $1.z }
            if $0.x != $1.x { return $0.x < $1.x }
            return $0.y < $1.y
        }
    }

    static func estimate(
        bounds: MapBounds,
        zoomRange: ClosedRange<Int>,
        averageTileBytes: Int
    ) -> TileEstimate {
        let count = coordinates(for: bounds, zoomRange: zoomRange).count
        return TileEstimate(tileCount: count, estimatedBytes: count * averageTileBytes)
    }

    private static func tileXY(latitude: Double, longitude: Double, zoom: Int) -> (x: Int, y: Int) {
        let clampedLatitude = min(max(latitude, -maxWebMercatorLatitude), maxWebMercatorLatitude)
        let latitudeRadians = clampedLatitude * .pi / 180
        let tilesAtZoom = pow(2.0, Double(zoom))
        let x = Int(floor((longitude + 180.0) / 360.0 * tilesAtZoom))
        let y = Int(floor((1.0 - log(tan(latitudeRadians) + 1.0 / cos(latitudeRadians)) / .pi) / 2.0 * tilesAtZoom))
        let clampedMax = Int(tilesAtZoom) - 1
        return (
            min(max(x, 0), clampedMax),
            min(max(y, 0), clampedMax)
        )
    }
}
```

- [ ] **Step 5: Run planner tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/FletcherTilePlannerTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ns-marks-the-spot/Offline/Models \
  ns-marks-the-spot/Offline/Services/FletcherTilePlanner.swift \
  ns-marks-the-spotTests/Offline/FletcherTilePlannerTests.swift
git commit -m "feat: add saved area tile planner"
```

---

### Task 6: Fletcher Tile Download Manager

**Files:**
- Create: `ns-marks-the-spot/Offline/Services/TileDownloadManager.swift`
- Create: `ns-marks-the-spotTests/Offline/TileDownloadManagerTests.swift`

**Interfaces:**
- Consumes: `TileStore`, `TileCoordinate`, `SavedOfflineArea`, `FletcherTilePlanner`
- Produces: `struct TileDownloadProgress: Equatable`
- Produces: `protocol TileDataLoading`
- Produces: `final class TileDownloadManager`
- Produces: `download(area:loader:) async -> TileDownloadProgress`

- [ ] **Step 1: Write failing download-manager tests**

Create `ns-marks-the-spotTests/Offline/TileDownloadManagerTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

struct TileDownloadManagerTests {
    @Test func downloadsFletcherTilesIntoStore() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let loader = StubTileLoader()
        let area = SavedOfflineArea(
            id: "area-1",
            name: "Halifax",
            bounds: MapBounds(minLatitude: 44.64, minLongitude: -63.58, maxLatitude: 44.66, maxLongitude: -63.56),
            minZoom: 10,
            maxZoom: 10
        )

        let progress = await manager.download(area: area, loader: loader)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)

        #expect(progress.succeeded == coordinates.count)
        #expect(progress.failed == 0)
        #expect(await store.tile(z: coordinates[0].z, x: coordinates[0].x, y: coordinates[0].y, layerID: "fletcher") == Data([0xAA]))
    }

    @Test func reportsFailuresWithoutDiscardingSuccesses() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let loader = StubTileLoader(failingXValues: [331])
        let area = SavedOfflineArea(
            id: "area-2",
            name: "Halifax",
            bounds: MapBounds(minLatitude: 44.64, minLongitude: -63.58, maxLatitude: 44.66, maxLongitude: -63.56),
            minZoom: 10,
            maxZoom: 10
        )

        let progress = await manager.download(area: area, loader: loader)

        #expect(progress.failed > 0)
        #expect(progress.succeeded + progress.failed == progress.total)
    }
}

private struct StubTileLoader: TileDataLoading {
    var failingXValues: Set<Int> = []

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        if failingXValues.contains(coordinate.x) {
            throw URLError(.cannotLoadFromNetwork)
        }
        return Data([0xAA])
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/TileDownloadManagerTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing `TileDownloadManager`, `TileDataLoading`, and `TileDownloadProgress`.

- [ ] **Step 3: Add download manager**

Create `ns-marks-the-spot/Offline/Services/TileDownloadManager.swift`:

```swift
import Foundation

struct TileDownloadProgress: Equatable {
    let total: Int
    var succeeded: Int
    var failed: Int
}

protocol TileDataLoading {
    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data
}

final class TileDownloadManager {
    private let tileStore: TileStore

    init(tileStore: TileStore) {
        self.tileStore = tileStore
    }

    func download(
        area: SavedOfflineArea,
        loader: TileDataLoading
    ) async -> TileDownloadProgress {
        let coordinates = FletcherTilePlanner.coordinates(
            for: area.bounds,
            zoomRange: area.minZoom...area.maxZoom
        )
        var progress = TileDownloadProgress(total: coordinates.count, succeeded: 0, failed: 0)

        for coordinate in coordinates {
            if await tileStore.tile(z: coordinate.z, x: coordinate.x, y: coordinate.y, layerID: "fletcher") != nil {
                progress.succeeded += 1
                continue
            }

            do {
                let data = try await loader.data(for: coordinate, layerID: "fletcher")
                try await tileStore.store(
                    data,
                    z: coordinate.z,
                    x: coordinate.x,
                    y: coordinate.y,
                    layerID: "fletcher",
                    savedAreaID: area.id
                )
                progress.succeeded += 1
            } catch {
                progress.failed += 1
            }
        }

        return progress
    }
}
```

- [ ] **Step 4: Add production Fletcher loader adapter**

In `TileDownloadManager.swift`, add:

```swift
struct FletcherTileLoader: TileDataLoading {
    let tileFetcher: TileFetcher
    let templateURL: URL

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        try await tileFetcher.fetchTile(
            z: coordinate.z,
            x: coordinate.x,
            y: coordinate.y,
            from: templateURL,
            layerName: layerID
        )
    }
}
```

- [ ] **Step 5: Run download manager tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/TileDownloadManagerTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ns-marks-the-spot/Offline/Services/TileDownloadManager.swift \
  ns-marks-the-spotTests/Offline/TileDownloadManagerTests.swift
git commit -m "feat: add fletcher tile download manager"
```

---

### Task 7: Offline View Models And Storage Screen

**Files:**
- Create: `ns-marks-the-spot/Offline/ViewModels/OfflineAreasViewModel.swift`
- Create: `ns-marks-the-spot/Offline/Views/OfflineStorageView.swift`
- Modify: `ns-marks-the-spot/App/AppContainer.swift`
- Modify: `ns-marks-the-spot/Overlay/Views/MapContainerView.swift`
- Create: `ns-marks-the-spotTests/Offline/OfflineAreasViewModelTests.swift`

**Interfaces:**
- Consumes: `TileStore`, `TileDownloadManager`, `SavedOfflineArea`, `TileEstimate`
- Produces: `@MainActor final class OfflineAreasViewModel: ObservableObject`
- Produces: `func estimateDraft(name:bounds:minZoom:maxZoom:) -> SavedOfflineArea`
- Produces: `func refreshStorageSummary() async`
- Produces: `func deleteAllCachedTiles() async`
- Produces: `struct OfflineStorageView`

- [ ] **Step 1: Write failing view-model tests**

Create `ns-marks-the-spotTests/Offline/OfflineAreasViewModelTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OfflineAreasViewModelTests {
    @Test func estimateDraftSetsTileCountAndBytes() {
        let viewModel = OfflineAreasViewModel(tileStore: TileStore())
        let area = viewModel.estimateDraft(
            name: "Halifax",
            bounds: MapBounds(minLatitude: 44.64, minLongitude: -63.58, maxLatitude: 44.66, maxLongitude: -63.56),
            minZoom: 10,
            maxZoom: 11
        )

        #expect(area.name == "Halifax")
        #expect(area.estimatedTileCount > 0)
        #expect(area.estimatedBytes == area.estimatedTileCount * 12_000)
        #expect(area.state == .estimating)
    }

    @Test func deleteAllCachedTilesRefreshesSummary() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = TileStore(rootDirectory: root)
        try await store.store(Data([0x01]), z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: nil)
        let viewModel = OfflineAreasViewModel(tileStore: store)

        await viewModel.refreshStorageSummary()
        #expect(viewModel.storageSummary.totalBytes == 1)

        await viewModel.deleteAllCachedTiles()
        #expect(viewModel.storageSummary.totalBytes == 0)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/OfflineAreasViewModelTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing `OfflineAreasViewModel`.

- [ ] **Step 3: Add OfflineAreasViewModel**

Create `ns-marks-the-spot/Offline/ViewModels/OfflineAreasViewModel.swift`:

```swift
import Foundation

@MainActor
final class OfflineAreasViewModel: ObservableObject {
    @Published private(set) var savedAreas: [SavedOfflineArea] = []
    @Published private(set) var storageSummary = TileStoreSummary(
        totalBytes: 0,
        layerBytes: [:],
        savedAreaBytes: [:]
    )

    private let tileStore: TileStore
    private let averageTileBytes = 12_000

    init(tileStore: TileStore) {
        self.tileStore = tileStore
    }

    func estimateDraft(
        name: String,
        bounds: MapBounds,
        minZoom: Int,
        maxZoom: Int
    ) -> SavedOfflineArea {
        let estimate = FletcherTilePlanner.estimate(
            bounds: bounds,
            zoomRange: minZoom...maxZoom,
            averageTileBytes: averageTileBytes
        )
        return SavedOfflineArea(
            name: name,
            bounds: bounds,
            minZoom: minZoom,
            maxZoom: maxZoom,
            estimatedTileCount: estimate.tileCount,
            estimatedBytes: estimate.estimatedBytes,
            state: .estimating
        )
    }

    func refreshStorageSummary() async {
        storageSummary = await tileStore.summary()
    }

    func deleteAllCachedTiles() async {
        try? await tileStore.deleteAll()
        await refreshStorageSummary()
    }
}
```

- [ ] **Step 4: Add basic storage view**

Create `ns-marks-the-spot/Offline/Views/OfflineStorageView.swift`:

```swift
import SwiftUI

struct OfflineStorageView: View {
    @ObservedObject var viewModel: OfflineAreasViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Cache") {
                    LabeledContent("Total", value: ByteCountFormatter.string(
                        fromByteCount: Int64(viewModel.storageSummary.totalBytes),
                        countStyle: .file
                    ))

                    Button(role: .destructive) {
                        Task {
                            await viewModel.deleteAllCachedTiles()
                        }
                    } label: {
                        Label("Delete Cached Tiles", systemImage: "trash")
                    }
                }

                Section("Saved Areas") {
                    if viewModel.savedAreas.isEmpty {
                        Text("No saved areas")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.savedAreas) { area in
                            VStack(alignment: .leading) {
                                Text(area.name)
                                    .font(.headline)
                                Text("\(area.estimatedTileCount) tiles")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Offline Maps")
            .task {
                await viewModel.refreshStorageSummary()
            }
        }
    }
}
```

- [ ] **Step 5: Wire view model into AppContainer and map sheet entry**

In `AppContainer`, add:

```swift
let offlineAreasViewModel: OfflineAreasViewModel
```

After creating `TileStore`, initialize:

```swift
self.offlineAreasViewModel = OfflineAreasViewModel(tileStore: store)
```

Update `NSMarksTheSpotApp` and `MapContainerView` initializers to pass `offlineAreasViewModel`.

In `MapContainerView`, add:

```swift
@ObservedObject private var offlineVM: OfflineAreasViewModel
@State private var isOfflineStoragePresented = false
```

Add an icon button near the existing info button:

```swift
Button {
    isOfflineStoragePresented = true
} label: {
    Image(systemName: "externaldrive")
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(.blue)
        .frame(width: 44, height: 44)
        .background(.regularMaterial)
        .clipShape(Circle())
        .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
}
.accessibilityLabel("Offline Maps")
.sheet(isPresented: $isOfflineStoragePresented) {
    OfflineStorageView(viewModel: offlineVM)
}
```

- [ ] **Step 6: Run view-model tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/OfflineAreasViewModelTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 7: Build**

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 8: Commit**

```bash
git add ns-marks-the-spot/App \
  ns-marks-the-spot/Offline/ViewModels \
  ns-marks-the-spot/Offline/Views \
  ns-marks-the-spot/Overlay/Views/MapContainerView.swift \
  ns-marks-the-spotTests/Offline/OfflineAreasViewModelTests.swift
git commit -m "feat: add offline storage screen"
```

---

### Task 8: Layer Sheet Offline Status And NS Aerial Selection

**Files:**
- Modify: `ns-marks-the-spot/Overlay/ViewModels/OverlayViewModel.swift`
- Modify: `ns-marks-the-spot/Overlay/Views/TransparencySliderView.swift`
- Create: `ns-marks-the-spotTests/Layers/LayerStatusTests.swift`

**Interfaces:**
- Consumes: `LayerCatalog`
- Produces: `OverlayViewModel.offlineStatus(for:) -> String`
- Produces: `OverlayViewModel.setBaseMapType(_:)` makes NS Aerial visible when `.nsAerial` is selected

- [ ] **Step 1: Write failing status tests**

Create `ns-marks-the-spotTests/Layers/LayerStatusTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerStatusTests {
    @Test func fletcherStatusIsDownloadable() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "fletcher", name: "Fletcher", type: .tile(URL(fileURLWithPath: "/")))
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        #expect(viewModel.offlineStatus(for: "fletcher") == "Downloadable")
    }

    @Test func nsAerialStatusIsCachedWhenViewed() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(
            id: "ns-aerial",
            name: "NS Aerial",
            type: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
        )
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        #expect(viewModel.offlineStatus(for: "ns-aerial") == "Cached when viewed")
    }

    @Test func selectingNSAerialBaseMapTurnsLayerOn() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(
            id: "ns-aerial",
            name: "NS Aerial",
            type: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
        )
        layer.isVisible = false
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        viewModel.setBaseMapType(.nsAerial)

        #expect(layer.isVisible == true)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/LayerStatusTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing `offlineStatus(for:)` and no NS Aerial visibility behavior.

- [ ] **Step 3: Add offline status and NS Aerial basemap behavior**

In `OverlayViewModel`, add:

```swift
func offlineStatus(for layerId: String) -> String {
    guard let layerID = LayerID(rawValue: layerId),
          let descriptor = LayerCatalog.descriptor(for: layerID) else {
        return "Online"
    }

    switch descriptor.offlinePolicy {
    case .savedAreaDownloadable:
        return "Downloadable"
    case .viewedCacheOnly:
        return "Cached when viewed"
    case .onlineOnly:
        return "Online"
    }
}
```

Update `setBaseMapType(_:)`:

```swift
func setBaseMapType(_ type: MapBaseType) {
    engine.baseMapType = type
    if type == .nsAerial {
        engine.setVisible(for: LayerID.nsAerial.rawValue, to: true)
        engine.setOpacity(for: LayerID.nsAerial.rawValue, to: 1.0)
    }
    objectWillChange.send()
}
```

- [ ] **Step 4: Show status in layer rows**

In `TransparencySliderView`, below each layer name add:

```swift
Text(viewModel.offlineStatus(for: layer.id))
    .font(.caption2)
    .foregroundStyle(.secondary)
```

Keep it in the layer-name VStack so labels do not overlap the toggle.

- [ ] **Step 5: Run tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/LayerStatusTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 6: Build**

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 7: Commit**

```bash
git add ns-marks-the-spot/Overlay/ViewModels/OverlayViewModel.swift \
  ns-marks-the-spot/Overlay/Views/TransparencySliderView.swift \
  ns-marks-the-spotTests/Layers/LayerStatusTests.swift
git commit -m "feat: show layer offline status"
```

---

### Task 9: Saved Area UI Entry And Draft Flow

**Files:**
- Create: `ns-marks-the-spot/Offline/Views/SaveAreaDraftView.swift`
- Modify: `ns-marks-the-spot/Offline/ViewModels/OfflineAreasViewModel.swift`
- Modify: `ns-marks-the-spot/Overlay/Views/MapContainerView.swift`
- Create: `ns-marks-the-spotUITests/OfflineFlowUITests.swift`

**Interfaces:**
- Consumes: `OfflineAreasViewModel.estimateDraft`
- Produces: visible "Save Area" entry point
- Produces: draft confirmation UI that estimates Fletcher tile count and bytes
- Produces: a UI test that confirms the screen is reachable

- [ ] **Step 1: Add UI test**

Create `ns-marks-the-spotUITests/OfflineFlowUITests.swift`:

```swift
import XCTest

final class OfflineFlowUITests: XCTestCase {
    @MainActor
    func testOfflineStorageAndSaveAreaEntryPointsExist() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        XCTAssertTrue(app.buttons["Offline Maps"].waitForExistence(timeout: 5))
        app.buttons["Offline Maps"].tap()

        XCTAssertTrue(app.navigationBars["Offline Maps"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Save Area"].exists)
    }
}
```

- [ ] **Step 2: Run UI test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotUITests/OfflineFlowUITests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL because the storage screen does not yet expose "Save Area".

- [ ] **Step 3: Add draft view**

Create `ns-marks-the-spot/Offline/Views/SaveAreaDraftView.swift`:

```swift
import SwiftUI

struct SaveAreaDraftView: View {
    @ObservedObject var viewModel: OfflineAreasViewModel
    @State private var areaName = "Saved Area"
    @State private var minZoom = 10
    @State private var maxZoom = 14
    @State private var draftArea: SavedOfflineArea?

    private let defaultBounds = MapBounds(
        minLatitude: 44.60,
        minLongitude: -63.65,
        maxLatitude: 44.70,
        maxLongitude: -63.50
    )

    var body: some View {
        Form {
            Section("Area") {
                TextField("Name", text: $areaName)
                Stepper("Minimum Zoom: \(minZoom)", value: $minZoom, in: 0...18)
                Stepper("Maximum Zoom: \(maxZoom)", value: $maxZoom, in: minZoom...18)
                Button("Estimate Fletcher Tiles") {
                    draftArea = viewModel.estimateDraft(
                        name: areaName,
                        bounds: defaultBounds,
                        minZoom: minZoom,
                        maxZoom: maxZoom
                    )
                }
            }

            if let draftArea {
                Section("Estimate") {
                    LabeledContent("Tiles", value: "\(draftArea.estimatedTileCount)")
                    LabeledContent("Size", value: ByteCountFormatter.string(
                        fromByteCount: Int64(draftArea.estimatedBytes),
                        countStyle: .file
                    ))
                    Text("v1.0 downloads Fletcher tiles for saved areas. NS Aerial and provincial reference layers are cached when viewed.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Save Area")
    }
}
```

This first pass uses a fixed draft rectangle so the storage and estimate flow can ship behind tests. The MapKit rectangle drawing/edit overlay is added in Task 10.

- [ ] **Step 4: Add Save Area navigation**

In `OfflineStorageView`, add this section before "Saved Areas":

```swift
Section("Field Prep") {
    NavigationLink {
        SaveAreaDraftView(viewModel: viewModel)
    } label: {
        Label("Save Area", systemImage: "square.dashed")
    }
}
```

- [ ] **Step 5: Run UI test**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotUITests/OfflineFlowUITests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ns-marks-the-spot/Offline/Views \
  ns-marks-the-spot/Offline/ViewModels/OfflineAreasViewModel.swift \
  ns-marks-the-spot/Overlay/Views/MapContainerView.swift \
  ns-marks-the-spotUITests/OfflineFlowUITests.swift
git commit -m "feat: add saved area draft flow"
```

---

### Task 10: Map Rectangle Draw And Edit Mode

**Files:**
- Modify: `ns-marks-the-spot/MapEngine/Protocols/MapEngine.swift`
- Modify: `ns-marks-the-spot/MapEngine/MapKit/MapKitEngine.swift`
- Modify: `ns-marks-the-spot/MapEngine/MapKit/MapKitMapView.swift`
- Modify: `ns-marks-the-spot/Mocks/MockMapEngine.swift`
- Modify: `ns-marks-the-spot/Overlay/Views/MapContainerView.swift`
- Modify: `ns-marks-the-spot/Offline/Views/SaveAreaDraftView.swift`
- Create: `ns-marks-the-spotTests/Offline/MapBoundsSelectionTests.swift`

**Interfaces:**
- Produces: `MapEngine.beginBoundsSelection(_:)`
- Produces: `MapEngine.endBoundsSelection()`
- Produces: `MapBounds` callback from MapKit rectangle selection
- Consumes: `SaveAreaDraftView` from Task 9

- [ ] **Step 1: Write bounds-selection tests against the mock engine**

Create `ns-marks-the-spotTests/Offline/MapBoundsSelectionTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct MapBoundsSelectionTests {
    @Test func mockEngineDeliversSelectedBounds() {
        let engine = MockMapEngine()
        var received: MapBounds?

        engine.beginBoundsSelection { bounds in
            received = bounds
        }
        engine.simulateBoundsSelection(MapBounds(
            minLatitude: 44.0,
            minLongitude: -64.0,
            maxLatitude: 45.0,
            maxLongitude: -63.0
        ))

        #expect(received?.normalized == MapBounds(
            minLatitude: 44.0,
            minLongitude: -64.0,
            maxLatitude: 45.0,
            maxLongitude: -63.0
        ))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/MapBoundsSelectionTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL with missing bounds-selection API.

- [ ] **Step 3: Add selection API to MapEngine**

In `MapEngine`, add:

```swift
func beginBoundsSelection(_ handler: @escaping (MapBounds) -> Void)
func endBoundsSelection()
```

In `MockMapEngine`, add:

```swift
private var boundsSelectionHandler: ((MapBounds) -> Void)?

func beginBoundsSelection(_ handler: @escaping (MapBounds) -> Void) {
    boundsSelectionHandler = handler
}

func endBoundsSelection() {
    boundsSelectionHandler = nil
}

func simulateBoundsSelection(_ bounds: MapBounds) {
    boundsSelectionHandler?(bounds)
}
```

- [ ] **Step 4: Add MapKit rectangle selection**

In `MapKitEngine`, add properties and methods:

```swift
var boundsSelectionHandler: ((MapBounds) -> Void)?
var isSelectingBounds = false
var selectionStartCoordinate: CLLocationCoordinate2D?
var selectionOverlay: MKPolygon?

func beginBoundsSelection(_ handler: @escaping (MapBounds) -> Void) {
    boundsSelectionHandler = handler
    isSelectingBounds = true
}

func endBoundsSelection() {
    boundsSelectionHandler = nil
    isSelectingBounds = false
    selectionStartCoordinate = nil
    if let selectionOverlay {
        mapView?.removeOverlay(selectionOverlay)
    }
    selectionOverlay = nil
}
```

In `MapKitMapView.makeUIView`, add a pan gesture recognizer that allows simultaneous map gestures only while selection is active:

```swift
let selectionPan = UIPanGestureRecognizer(
    target: context.coordinator,
    action: #selector(Coordinator.handleSelectionPan(_:))
)
selectionPan.name = "BoundsSelectionPan"
selectionPan.delegate = context.coordinator
mapView.addGestureRecognizer(selectionPan)
```

In `Coordinator`, conform to `UIGestureRecognizerDelegate` and implement:

```swift
func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
) -> Bool {
    false
}

func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    engine?.isSelectingBounds == true
}

@objc func handleSelectionPan(_ recognizer: UIPanGestureRecognizer) {
    guard let mapView = recognizer.view as? MKMapView,
          let engine else { return }

    let point = recognizer.location(in: mapView)
    let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

    switch recognizer.state {
    case .began:
        engine.selectionStartCoordinate = coordinate
    case .changed:
        guard let start = engine.selectionStartCoordinate else { return }
        engine.updateSelectionOverlay(from: start, to: coordinate)
    case .ended:
        guard let start = engine.selectionStartCoordinate else { return }
        let bounds = MapBounds(
            minLatitude: min(start.latitude, coordinate.latitude),
            minLongitude: min(start.longitude, coordinate.longitude),
            maxLatitude: max(start.latitude, coordinate.latitude),
            maxLongitude: max(start.longitude, coordinate.longitude)
        )
        engine.boundsSelectionHandler?(bounds)
        engine.endBoundsSelection()
    default:
        break
    }
}
```

Add `updateSelectionOverlay` to `MapKitEngine`:

```swift
func updateSelectionOverlay(from start: CLLocationCoordinate2D, to end: CLLocationCoordinate2D) {
    guard let mapView else { return }
    if let selectionOverlay {
        mapView.removeOverlay(selectionOverlay)
    }

    let coordinates = [
        CLLocationCoordinate2D(latitude: start.latitude, longitude: start.longitude),
        CLLocationCoordinate2D(latitude: start.latitude, longitude: end.longitude),
        CLLocationCoordinate2D(latitude: end.latitude, longitude: end.longitude),
        CLLocationCoordinate2D(latitude: end.latitude, longitude: start.longitude)
    ]
    let polygon = MKPolygon(coordinates: coordinates, count: coordinates.count)
    selectionOverlay = polygon
    mapView.addOverlay(polygon)
}
```

In `rendererFor overlay`, render selection polygons before tile overlays:

```swift
if let polygon = overlay as? MKPolygon {
    let renderer = MKPolygonRenderer(polygon: polygon)
    renderer.fillColor = UIColor.systemBlue.withAlphaComponent(0.15)
    renderer.strokeColor = UIColor.systemBlue
    renderer.lineWidth = 2
    return renderer
}
```

- [ ] **Step 5: Connect SaveAreaDraftView to selected bounds**

Replace the fixed bounds in `SaveAreaDraftView` with a `bounds: MapBounds` initializer:

```swift
let bounds: MapBounds
```

Use `bounds` in `estimateDraft`.

In `MapContainerView`, add state:

```swift
@State private var selectedSaveBounds: MapBounds?
@State private var isSaveAreaDraftPresented = false
```

Add a "Save Area" map button that starts selection:

```swift
Button {
    engine.beginBoundsSelection { bounds in
        selectedSaveBounds = bounds
        isSaveAreaDraftPresented = true
    }
} label: {
    Image(systemName: "square.dashed")
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(.blue)
        .frame(width: 44, height: 44)
        .background(.regularMaterial)
        .clipShape(Circle())
        .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
}
.accessibilityLabel("Save Area")
.sheet(isPresented: $isSaveAreaDraftPresented) {
    if let selectedSaveBounds {
        NavigationStack {
            SaveAreaDraftView(viewModel: offlineVM, bounds: selectedSaveBounds)
        }
    }
}
```

- [ ] **Step 6: Run bounds tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/MapBoundsSelectionTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 7: Build**

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 8: Commit**

```bash
git add ns-marks-the-spot/MapEngine \
  ns-marks-the-spot/Mocks/MockMapEngine.swift \
  ns-marks-the-spot/Overlay/Views/MapContainerView.swift \
  ns-marks-the-spot/Offline/Views/SaveAreaDraftView.swift \
  ns-marks-the-spotTests/Offline/MapBoundsSelectionTests.swift
git commit -m "feat: add save area map selection"
```

---

### Task 11: Data Sources And License UI

**Files:**
- Modify: `ns-marks-the-spot/Overlay/Views/InfoSheetView.swift`
- Create: `ns-marks-the-spotTests/Layers/AttributionTests.swift`

**Interfaces:**
- Consumes: `LayerCatalog.all`
- Produces: a visible "Data Sources & Licenses" section
- Produces: Province attribution text visible in app

- [ ] **Step 1: Write attribution tests**

Create `ns-marks-the-spotTests/Layers/AttributionTests.swift`:

```swift
import Foundation
import Testing
@testable import ns_marks_the_spot

struct AttributionTests {
    @Test func everyProvinceLayerHasRestrictedLicenseText() {
        let provinceLayers = LayerCatalog.all.filter {
            $0.attribution.provider == "Province of Nova Scotia"
        }

        #expect(provinceLayers.isEmpty == false)
        for layer in provinceLayers {
            #expect(layer.attribution.disclaimer.contains("Contains information obtained under license from the Province of Nova Scotia"))
            #expect(layer.attribution.licenseTitle == "Province of Nova Scotia Restricted Geographic Services License")
        }
    }

    @Test func everyLayerHasUserVisibleAttribution() {
        for layer in LayerCatalog.all {
            #expect(layer.attribution.provider.isEmpty == false)
            #expect(layer.attribution.disclaimer.isEmpty == false)
        }
    }
}
```

- [ ] **Step 2: Run attribution tests**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ns-marks-the-spotTests/AttributionTests \
  CODE_SIGNING_ALLOWED=NO
```

Expected: PASS if Task 2 metadata is present.

- [ ] **Step 3: Add data source UI section**

In `InfoSheetView`, add this section after the Fletcher collection section:

```swift
VStack(alignment: .leading, spacing: 14) {
    Text("Data Sources & Licenses")
        .font(.headline)
        .foregroundStyle(.primary)

    ForEach(LayerCatalog.all) { layer in
        VStack(alignment: .leading, spacing: 4) {
            Text(layer.name)
                .font(.subheadline)
                .bold()
            Text(layer.attribution.provider)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(layer.attribution.disclaimer)
                .font(.caption)
                .foregroundStyle(.secondary)
            if let licenseTitle = layer.attribution.licenseTitle {
                Text(licenseTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
.padding(.horizontal, 20)
```

Ensure the Province attribution appears exactly:

```swift
Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.
```

- [ ] **Step 4: Build**

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add ns-marks-the-spot/Overlay/Views/InfoSheetView.swift \
  ns-marks-the-spotTests/Layers/AttributionTests.swift
git commit -m "feat: add data source license UI"
```

---

### Task 12: App Icon, Fastlane, Metadata, And Final Verification

**Files:**
- Modify: `ns-marks-the-spot/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Add: raster app icon PNGs under `ns-marks-the-spot/Assets.xcassets/AppIcon.appiconset/`
- Modify: `fastlane/Fastfile`
- Modify: `fastlane/Appfile`
- Modify: `fastlane/metadata/review_information/notes.txt`
- Modify: `fastlane/metadata/en-US/description.txt`
- Modify: `ARCHITECTURE.md`
- Modify: `plan.md`

**Interfaces:**
- Consumes: all implemented v1.0 features
- Produces: clean asset catalog build
- Produces: executable `fastlane ios beta`
- Produces: review notes that explain optional location and provincial data sources

- [ ] **Step 1: Convert app icon assets**

Replace SVG references in `AppIcon.appiconset/Contents.json` with PNG filenames. Generate valid 1024x1024 PNG app icons for universal, dark, and tinted slots. The final `Contents.json` entries must reference files ending in `.png`, for example:

```json
{
  "images" : [
    {
      "filename" : "AppIcon-Light.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "filename" : "AppIcon-Dark.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "filename" : "AppIcon-Tinted.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

- [ ] **Step 2: Verify asset warnings are gone**

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO 2>&1 | tee /tmp/ns-marks-build.log
rg "warning: The app icon set" /tmp/ns-marks-build.log
```

Expected: build succeeds and `rg` returns no matches.

- [ ] **Step 3: Enable Fastlane beta lane**

In `fastlane/Fastfile`, replace the commented beta lane with:

```ruby
desc "Upload a new beta build to TestFlight"
lane :beta do
  require_api_key!
  build_app(
    scheme: "ns-marks-the-spot",
    export_method: "app-store"
  )
  upload_to_testflight(
    api_key: @api_key,
    app_identifier: APP_IDENTIFIER,
    skip_waiting_for_build_processing: true
  )
end
```

Keep `fastlane/api_key.json` ignored and untracked.

- [ ] **Step 4: Update review notes**

Update `fastlane/metadata/review_information/notes.txt` to:

```text
NS Marks the Spot does not require a login. Location access is optional and used only to show the user's current position on the map.

The app displays historical Hugh Fletcher map overlays and Nova Scotia reference layers. Historical maps and provincial geographic layers are for reference only and are not navigation-grade. The app includes an in-app navigation disclaimer and a Data Sources & Licenses section.

Some provincial geographic services are provided under the Province of Nova Scotia Restricted Geographic Services License. The app includes the required attribution: "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions."

NS Aerial and restricted Nova Scotia reference layers are online services with viewed-tile caching only in version 1.0. Saved offline areas download Fletcher historical tiles only.
```

- [ ] **Step 5: Update app description if offline wording changed**

Ensure `fastlane/metadata/en-US/description.txt` contains this wording:

```text
Offline support saves viewed historical tiles and lets you prepare rectangular Fletcher map areas before field use. Nova Scotia aerial imagery and restricted provincial reference layers are available online and cached when viewed where possible.
```

- [ ] **Step 6: Run metadata lint**

Run:

```bash
bundle exec fastlane ios lint_metadata
```

Expected: `Local metadata checks passed.`

- [ ] **Step 7: Run final automated verification**

Run:

```bash
xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

Expected: `** TEST SUCCEEDED **`.

Run:

```bash
xcodebuild -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 8: Update docs**

Update `ARCHITECTURE.md` with:

```markdown
### Layer Catalog And Offline Storage

v1.0 centralizes map layer definitions in `LayerCatalog`. Each layer declares
its rendering role, source URL, attribution, cache key, zoom range, and offline
policy. SwiftUI views consume catalog metadata through view models while MapKit
rendering remains behind `MapEngine`.

Viewed tiles are persisted through `TileStore`. Fletcher tiles can also be
downloaded for rectangular saved areas. NS Aerial and restricted Nova Scotia
reference layers are viewed-cache only in v1.0.
```

Update `plan.md` with checked items for completed v1.0 milestones and add v1.1 deferred work for bulk NS Aerial/reference-layer downloads.

- [ ] **Step 9: Commit**

```bash
git add ns-marks-the-spot/Assets.xcassets/AppIcon.appiconset \
  fastlane/Fastfile \
  fastlane/Appfile \
  fastlane/metadata/review_information/notes.txt \
  fastlane/metadata/en-US/description.txt \
  ARCHITECTURE.md \
  plan.md
git commit -m "chore: prepare v1 release"
```

---

## Implementation Order

1. Task 1 unblocks reliable build/test loops and removes an obvious release blocker.
2. Task 2 creates catalog metadata used by every later task.
3. Task 3 installs catalog layers and adds NS Aerial.
4. Task 4 adds durable tile storage.
5. Task 5 defines saved areas and Fletcher tile estimation.
6. Task 6 downloads Fletcher saved areas.
7. Task 7 exposes offline storage.
8. Task 8 improves layer status and NS Aerial selection.
9. Task 9 adds the first save-area UI path.
10. Task 10 adds map rectangle drawing.
11. Task 11 adds license and source disclosure.
12. Task 12 completes release assets, automation, metadata, docs, and final verification.

## Final Acceptance Checklist

- [ ] Simulator build succeeds.
- [ ] Physical device build succeeds.
- [ ] Full test suite succeeds.
- [ ] App icon warnings are gone.
- [ ] Layer catalog contains all v1.0 layers.
- [ ] NS Aerial displays as basemap-style context and overlay.
- [ ] Viewed tiles persist until manual deletion.
- [ ] Storage screen reports and deletes cached tiles.
- [ ] Fletcher saved-area estimation works.
- [ ] Fletcher saved-area download records success and failure counts.
- [ ] NS Aerial and restricted provincial services are not bulk-downloaded by saved areas.
- [ ] Data Sources & Licenses section includes Province attribution text.
- [ ] Fastlane metadata lint passes.
- [ ] TestFlight beta lane is enabled.
- [ ] `ARCHITECTURE.md` and `plan.md` reflect the implemented v1.0 architecture.
