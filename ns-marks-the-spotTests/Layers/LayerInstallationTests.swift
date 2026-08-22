import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerInstallationTests {
    @Test func appContainerInstallsEveryRasterLayer() {
        let container = AppContainer(licenceStorage: InMemoryProvinceLicenceStorage())
        let ids = container.mapController.layers.map(\.id)

        // Fletcher is deliberately absent from this expectation: it installs
        // only when a tile host is configured, and the tests below drive both
        // branches of that with an explicit base URL.
        let expected = NativeLayerTraits.installOrder
            .filter { $0 != .fletcher }
            .map(\.rawValue)

        #expect(ids.filter { $0 != LayerID.fletcher.rawValue } == expected)
        #expect(expected.count > 15, "the unification is what makes this list long")
    }

    @Test func installedLayersAreNotFilteredByLicence() {
        // A fresh install has answered nothing, and the restricted layers still
        // get installed. They draw nothing — `OpacityTileOverlay` asks
        // `TileRequestFactory` for a cleared request before every tile — but
        // they have a row, which is the only route to the licence sheet.
        // Filtering here would remove the row, leaving nothing to accept for.
        let container = AppContainer(licenceStorage: InMemoryProvinceLicenceStorage(initial: .unknown))
        let ids = Set(container.mapController.layers.map(\.id))

        #expect(container.licenceStore.needsDecision)
        #expect(ids.contains(LayerID.nsAerial.rawValue))
        #expect(ids.contains(LayerID.nsprd.rawValue))
        #expect(ids.contains(LayerID.crownLands.rawValue))
    }

    @Test func restrictedLayersStartHidden() throws {
        let container = AppContainer(licenceStorage: InMemoryProvinceLicenceStorage())

        for layer in container.mapController.layers {
            let id = try #require(LayerID(rawValue: layer.id))
            let descriptor = try #require(LayerCatalog.descriptor(for: id))
            guard descriptor.requiresProvinceClearance else { continue }
            #expect(
                layer.isVisible == false,
                "\(layer.id) is restricted and must not be on before the licence is answered"
            )
        }
    }

    @Test("A returning licensed user opens on the layers the browser opens on")
    func anAcceptedLicenceOpensTheWebDefaults() {
        let container = AppContainer(
            licenceStorage: InMemoryProvinceLicenceStorage(initial: .accepted)
        )
        let on = Set(container.mapController.layers.filter(\.isVisible).map(\.id))
        let installed = Set(container.mapController.layers.map(\.id))
        let webDefaults = Set(
            LayerCatalog.all.filter(\.webDefaultVisible).map(\.id.rawValue)
        ).intersection(installed)

        #expect(webDefaults.count == 4, "aerial, parcels, water and roads")
        #expect(on == webDefaults)
        // The app keeps no per-layer memory between launches. Left to the
        // catalogue's native default this user would switch all four back on
        // every cold start, which the browser has never asked of them.
        #expect(on.contains(LayerID.nsprd.rawValue))
        #expect(container.mapController.baseMapType == .nsAerial)
    }

    @Test("An unanswered licence opens on the native default alone")
    func anUnansweredLicenceOpensOnNothingRestricted() {
        let container = AppContainer(
            licenceStorage: InMemoryProvinceLicenceStorage(initial: .unknown)
        )
        let on = Set(container.mapController.layers.filter(\.isVisible).map(\.id))

        #expect(on.isSubset(of: Set(LayerCatalog.nativeDefaultVisibleIDs.map(\.rawValue))))
        #expect(container.mapController.baseMapType == .standard)
    }

    @Test("Withheld clearance narrows the opening set to the native default")
    func launchVisibilityReadsClearance() {
        #expect(
            AppContainer.launchVisibleIDs(clearance: .none)
                == LayerCatalog.nativeDefaultVisibleIDs
        )

        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        store.accept()
        let accepted = AppContainer.launchVisibleIDs(clearance: store.clearance)
        #expect(accepted.isSuperset(of: [.nsAerial, .nsprd, .waterFeatures, .roads]))
        #expect(accepted.contains(.fletcher), "the app's own sheet stays on either way")
    }

    @Test func exportLayersCarryTheirCatalogIdRatherThanAnAddress() throws {
        let container = AppContainer(licenceStorage: InMemoryProvinceLicenceStorage())
        let nsAerial = try #require(
            container.mapController.layers.first { $0.id == LayerID.nsAerial.rawValue }
        )

        // The id, not the URL. Carrying the endpoint here would put a
        // ready-made address in a value nothing had cleared; the factory builds
        // it per tile, after checking the licence.
        guard case .catalogExport(let id) = nsAerial.configuration.source else {
            Issue.record("NS Aerial should be a catalog export")
            return
        }
        #expect(id == .nsAerial)
    }

    @Test func layersInstallInAscendingZOrder() {
        let container = AppContainer(licenceStorage: InMemoryProvinceLicenceStorage())
        let zIndexes = container.mapController.layers
            .compactMap { LayerID(rawValue: $0.id) }
            .compactMap { OverlayZIndex.tileZIndex(for: $0) }

        // MapKit has no z-index: install order is draw order. Sorted here means
        // the map stacks the way the web does.
        #expect(zIndexes == zIndexes.sorted())
        #expect(zIndexes.count == container.mapController.layers.count)
    }

    @Test func zoomRangeFollowsTheSourceRatherThanAFixedFloor() throws {
        let container = AppContainer(licenceStorage: InMemoryProvinceLicenceStorage())

        for layer in container.mapController.layers {
            let id = try #require(LayerID(rawValue: layer.id))
            let descriptor = try #require(LayerCatalog.descriptor(for: id))
            #expect(layer.configuration.minZoom == descriptor.minZoom)
            // `maxNativeZoom` where the source publishes one: above it MapKit
            // upsamples the last real tile instead of requesting a level that
            // does not exist.
            #expect(layer.configuration.maxZoom == (descriptor.maxNativeZoom ?? descriptor.maxZoom))
        }

        // The layers the old hardcoded z12 floor silently refused. Named
        // individually because "follows the descriptor" would still hold if the
        // catalog itself acquired a floor.
        let waterfalls = try #require(LayerCatalog.descriptor(for: .waterfalls))
        let placeNames = try #require(LayerCatalog.descriptor(for: .placeNames))
        #expect(waterfalls.minZoom < 12)
        #expect(placeNames.minZoom < 12)
    }

    @Test func installsFletcherAgainstAConfiguredTileHost() throws {
        // Driven from an explicit base URL rather than the ambient build
        // setting: `FLETCHER_TILE_BASE_URL` is unset in CI and in a plain
        // clone, so a test that read the configuration would exercise the
        // absent case forever and pass with this branch deleted outright.
        let base = try #require(URL(string: "https://tiles.example.test/fletcher"))
        let descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        let layer = try #require(
            AppContainer.makeLayer(from: descriptor, fletcherBaseURL: base),
            "a configured host must install the layer"
        )

        // The per-sheet source specifically. Read as a plain XYZ template the
        // same base URL expands to `/{z}/{x}/{y}.png` with no sheet segment,
        // which is a 404 for every tile — and the source case is the only thing
        // that says which of the two this is.
        guard case .fletcherSheets(let source) = layer.configuration.source else {
            Issue.record("Fletcher should use the per-sheet source, not a tile template")
            return
        }
        #expect(source == base)
        #expect(layer.id == "fletcher")
        // The survey opens partly transparent so the modern base map reads
        // through it; it is a historical overlay, not a replacement base map.
        #expect(layer.opacity == CGFloat(try #require(descriptor.opacity)))
    }

    @Test func leavesFletcherOutWhenNoTileHostIsConfigured() throws {
        // The sheets are rendered from the Rumsey scans by our own pipeline and
        // read from an HTTPS host set at build time. Until that build is hosted
        // there is nothing to point at, so nothing is installed — the panel
        // still shows the row, disabled, because it reads the catalog.
        let descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        #expect(AppContainer.makeLayer(from: descriptor, fletcherBaseURL: nil) == nil)
    }

    @Test func refusesATileHostPointedAtTheRetiredSource() {
        // The rights boundary, driven with an actual retired host rather than
        // observed on whatever this checkout happens to be configured with. The
        // David Rumsey permission in `docs/FLETCHER_GEOREFERENCING.md` does not
        // cover OldMapsOnline-derived tiles, so this is not a degraded build —
        // it is a build that must not make the request at all.
        #expect(FletcherHost.normalizedBuildSetting("https://www.oldmapsonline.org/tiles") == nil)
        #expect(FletcherHost.normalizedBuildSetting("https://cdn.OldMapsOnline.ORG/f") == nil)

        // And it does not refuse everything, which is the other half: a guard
        // that rejected every host would pass the two checks above while
        // silently uninstalling the layer on a legitimate build.
        #expect(
            FletcherHost.normalizedBuildSetting("  https://tiles.example.test/fletcher  ")
                == "https://tiles.example.test/fletcher"
        )
        // Unsubstituted build settings and placeholders are "not configured",
        // not values to parse.
        #expect(FletcherHost.normalizedBuildSetting("$(FLETCHER_TILE_BASE_URL)") == nil)
        #expect(FletcherHost.normalizedBuildSetting("<your-host-here>") == nil)
        #expect(FletcherHost.normalizedBuildSetting("   ") == nil)
    }

    @Test func fletcherLayerUsesSourceAwareCacheIdentifier() throws {
        let descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        // Built from an explicit base rather than the build setting, which is
        // nil until the build is hosted: the property under test is that the
        // identifier follows the source, and that holds either way.
        let base = try #require(URL(string: "https://tiles.example.test/fletcher"))
        let configuration = TileLayerConfiguration(
            descriptor: descriptor, source: .fletcherSheets(baseURL: base)
        )

        #expect(configuration.cacheIdentifier.hasPrefix("\(descriptor.id.rawValue)_"))
        #expect(configuration.cacheIdentifier != descriptor.id.rawValue)

        // A different host is a different cache: tiles rendered by one build
        // must never be served for another.
        let elsewhere = try #require(URL(string: "https://other.example.test/fletcher"))
        let moved = TileLayerConfiguration(
            descriptor: descriptor, source: .fletcherSheets(baseURL: elsewhere)
        )
        #expect(moved.cacheIdentifier != configuration.cacheIdentifier)

        // And so is the same URL read as a plain XYZ template, since the two
        // sources expand it to entirely different addresses.
        let asTemplate = TileLayerConfiguration(descriptor: descriptor, source: .tile(base))
        #expect(asTemplate.cacheIdentifier != configuration.cacheIdentifier)
    }

    @Test func exportLayerCacheIdentifierFollowsTheExportItself() throws {
        // Two layers hitting the same NSTDB MapServer with different
        // `dynamicLayers` payloads. Keying the cache on the id alone would be
        // enough to keep these apart, but not enough to keep a restyled build
        // from serving the previous build's pixels at the same (z, x, y).
        let waterfalls = try #require(LayerCatalog.descriptor(for: .waterfalls))
        let waterFeatures = try #require(LayerCatalog.descriptor(for: .waterFeatures))
        #expect(waterfalls.serviceURL == waterFeatures.serviceURL)

        let first = TileLayerConfiguration(
            descriptor: waterfalls, source: .catalogExport(.waterfalls)
        )
        let second = TileLayerConfiguration(
            descriptor: waterFeatures, source: .catalogExport(.waterFeatures)
        )
        #expect(first.cacheIdentifier != second.cacheIdentifier)
    }
}
