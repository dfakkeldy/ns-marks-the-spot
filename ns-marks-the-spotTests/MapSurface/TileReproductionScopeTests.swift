import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

@Suite("Pixel export permissions are independent of viewing/cache clearance")
struct TileReproductionScopeTests {
    @Test(arguments: [TileLayerSource.catalogExport(.nsprd), .fletcherSheets(baseURL: URL(string: "https://example.invalid")!)])
    func retainedPixelsCannotLeaveThroughAnAliasedExportAPI(_ source: TileLayerSource) async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = TileCache(diskRoot: root)
        let pixels = TestTileFactory.pngData()
        cache.cacheTile(pixels, z: 12, x: 1351, y: 1452, layerName: "aliased")
        let configuration = TileLayerConfiguration(id: "aliased", name: "Renamed", source: source, cacheIdentifier: "aliased")
        let clearance = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage(initial: .accepted)).clearance
        let overlay = OpacityTileOverlay(configuration: configuration, tileCache: cache, clearanceBox: LicenceClearanceBox(clearance))
        let path = MKTileOverlayPath(x: 1351, y: 1452, z: 12, contentScaleFactor: 1)

        // Accepted viewing, including a previously cached free Fletcher tile, remains available.
        #expect(try await overlay.loadTile(at: path) == pixels)
        await #expect(throws: LayerUse.Refusal.self) { try await overlay.exportTile(at: path) }
        let provider = PrintMapCompositor.provider(overlays: ["aliased": overlay])
        await #expect(throws: LayerUse.Refusal.self) { try await provider(configuration, path) }
        #expect(cache.cachedTile(z: 12, x: 1351, y: 1452, layerName: "aliased") == pixels)
    }

    @Test(arguments: [TileLayerSource.catalogExport(.nsprd), .fletcherSheets(baseURL: URL(string: "https://example.invalid")!)])
    func aliasedSourcesCannotReachDirectComposition(_ source: TileLayerSource) async throws {
        let configuration = TileLayerConfiguration(id: "aliased", name: "Renamed", source: source, cacheIdentifier: "aliased")
        try await assertCompositionRefused(layers: [.init(configuration: configuration, opacity: 1, isVisible: true)])
    }

    @Test func retainedRestrictedFeaturesAndMarkersCannotReachDirectComposition() async throws {
        let style = VectorFeatureStyle(strokeHex: "#166534", lineWidth: 1.5)
        let shape = FeatureShape(id: "retained", layer: .zoningInverness,
                                 geometry: .point(.init(lat: 46.12, lng: -61.27)),
                                 style: style, title: "Retained", subtitle: nil)
        let marker = FeatureMarker(id: "retained", layer: .waterfalls,
                                   latitude: 46.12, longitude: -61.27,
                                   style: style, title: "Retained", subtitle: nil)
        try await assertCompositionRefused(features: [shape])
        try await assertCompositionRefused(markers: [marker])
    }

    private func assertCompositionRefused(layers: [MapLayerState] = [], features: [FeatureShape] = [], markers: [FeatureMarker] = []) async throws {
        await #expect(throws: LayerUse.Refusal.self) {
            try await PrintMapCompositor.compose(
                bounds: .init(south: 46.10, west: -61.30, north: 46.14, east: -61.24),
                widthPx: 100, heightPx: 100, baseMap: .standard, layers: layers, parcels: [],
                features: features, markers: markers, lineScale: 1,
                tileProvider: { _, _ in Issue.record("Restricted input reached tile provider"); throw URLError(.unsupportedURL) },
                renderProvider: { _, _, _, _ in Issue.record("Restricted input reached render provider"); throw URLError(.unsupportedURL) },
                baseMapProvider: { _, _, _, _ in Issue.record("Restricted input reached base map provider"); throw URLError(.unsupportedURL) })
        }
    }
}
