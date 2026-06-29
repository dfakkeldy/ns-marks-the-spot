import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct TileDownloadManagerTests {
    @Test func downloadsFletcherTilesIntoStore() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let loader = StubTileLoader()
        let area = halifaxArea(id: "area-1")

        let progress = await manager.download(area: area, loader: loader)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let firstCoordinate = try #require(coordinates.first)

        #expect(progress == TileDownloadProgress(total: coordinates.count, succeeded: coordinates.count, failed: 0))
        #expect(await store.tile(
            z: firstCoordinate.z,
            x: firstCoordinate.x,
            y: firstCoordinate.y,
            layerID: "fletcher"
        ) == Data([0xAA]))
    }

    @Test func reportsFailuresWithoutDiscardingSuccesses() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = halifaxArea(id: "area-2", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let failingCoordinate = try #require(coordinates.first)
        let successfulCoordinate = try #require(coordinates.dropFirst().first)
        let loader = StubTileLoader(failingCoordinates: [failingCoordinate])

        let progress = await manager.download(area: area, loader: loader)

        #expect(progress == TileDownloadProgress(total: coordinates.count, succeeded: coordinates.count - 1, failed: 1))
        #expect(await store.tile(
            z: successfulCoordinate.z,
            x: successfulCoordinate.x,
            y: successfulCoordinate.y,
            layerID: "fletcher"
        ) == Data([0xAA]))
        #expect(await store.tile(
            z: failingCoordinate.z,
            x: failingCoordinate.x,
            y: failingCoordinate.y,
            layerID: "fletcher"
        ) == nil)
    }

    @Test func skipsExistingViewedCacheTilesAndAssociatesThemWithSavedArea() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = halifaxArea(id: "area-3", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let existingCoordinate = try #require(coordinates.first)
        let existingData = Data([0xBB, 0xBC])
        let loader = StubTileLoader()

        try await store.store(
            existingData,
            z: existingCoordinate.z,
            x: existingCoordinate.x,
            y: existingCoordinate.y,
            layerID: "fletcher",
            savedAreaID: nil
        )

        let progress = await manager.download(area: area, loader: loader)
        let requests = await loader.requestedCoordinates()
        let summary = await store.summary()

        #expect(progress == TileDownloadProgress(total: coordinates.count, succeeded: coordinates.count, failed: 0))
        #expect(!requests.contains(existingCoordinate))
        #expect(await store.tile(
            z: existingCoordinate.z,
            x: existingCoordinate.x,
            y: existingCoordinate.y,
            layerID: "fletcher"
        ) == existingData)
        #expect(summary.savedAreaBytes[area.id] == existingData.count + coordinates.dropFirst().count)
    }

    @Test func skipsViewedFletcherTileCachedWithCatalogLayerIdentifier() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        let templateURL = try #require(descriptor.sourceURL)
        let catalogLayer = MapKitTileLayer(descriptor: descriptor, type: .tile(templateURL))
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = halifaxArea(id: "area-catalog-key", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let existingCoordinate = try #require(coordinates.first)
        let existingData = Data([0xFE, 0xED])
        let loader = StubTileLoader()

        #expect(catalogLayer.cacheIdentifier == descriptor.cacheKey)

        try await store.store(
            existingData,
            z: existingCoordinate.z,
            x: existingCoordinate.x,
            y: existingCoordinate.y,
            layerID: catalogLayer.cacheIdentifier,
            savedAreaID: nil
        )

        let progress = await manager.download(area: area, loader: loader)
        let requests = await loader.requestedCoordinates()

        #expect(progress == TileDownloadProgress(total: coordinates.count, succeeded: coordinates.count, failed: 0))
        #expect(!requests.contains(existingCoordinate))
        #expect(await store.tile(
            z: existingCoordinate.z,
            x: existingCoordinate.x,
            y: existingCoordinate.y,
            layerID: descriptor.cacheKey
        ) == existingData)
    }

    private func makeTemporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func halifaxArea(
        id: String,
        maxZoom: Int = 10
    ) -> SavedOfflineArea {
        SavedOfflineArea(
            id: id,
            name: "Halifax",
            bounds: MapBounds(
                minLatitude: 44.64,
                minLongitude: -63.58,
                maxLatitude: 44.66,
                maxLongitude: -63.56
            ),
            minZoom: 10,
            maxZoom: maxZoom
        )
    }
}

private actor StubTileLoader: TileDataLoading {
    private let failingCoordinates: [TileCoordinate]
    private var requests: [TileCoordinate] = []

    init(failingCoordinates: [TileCoordinate] = []) {
        self.failingCoordinates = failingCoordinates
    }

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        requests.append(coordinate)

        if failingCoordinates.contains(where: { isSameCoordinate($0, coordinate) }) {
            throw URLError(.cannotLoadFromNetwork)
        }

        #expect(layerID == "fletcher")
        return Data([0xAA])
    }

    func requestedCoordinates() -> [TileCoordinate] {
        requests
    }

    private func isSameCoordinate(_ lhs: TileCoordinate, _ rhs: TileCoordinate) -> Bool {
        lhs.z == rhs.z && lhs.x == rhs.x && lhs.y == rhs.y
    }
}
