import Foundation
import GeoCore
import MapCatalog
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
        let area = capeBretonArea(id: "area-1")

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
        let area = capeBretonArea(id: "area-2", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let failingCoordinate = try #require(coordinates.first)
        let successfulCoordinate = try #require(coordinates.dropFirst().first)
        let loader = StubTileLoader(failingCoordinates: [failingCoordinate])

        let progress = await manager.download(area: area, loader: loader)

        #expect(progress == TileDownloadProgress(
            total: coordinates.count,
            succeeded: coordinates.count - 1,
            failed: 1,
            failedCoordinates: [failingCoordinate]
        ))
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

    @Test func reportsIncrementalProgressAndFailedCoordinates() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = capeBretonArea(id: "area-progress", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let failingCoordinate = try #require(coordinates.first)
        let loader = StubTileLoader(failingCoordinates: [failingCoordinate])
        var snapshots: [TileDownloadProgress] = []

        let progress = await manager.download(area: area, loader: loader) { snapshot in
            snapshots.append(snapshot)
        }

        #expect(snapshots.count == coordinates.count)
        #expect(progress.failedCoordinates == [failingCoordinate])
        #expect(snapshots.last == progress)
    }

    @Test func canDownloadOnlyTargetedFailedCoordinates() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = capeBretonArea(id: "area-targeted", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let failedCoordinate = try #require(coordinates.dropFirst().first)
        let loader = StubTileLoader()

        let progress = await manager.download(
            area: area,
            loader: loader,
            targetCoordinates: [failedCoordinate]
        )
        let requests = await loader.requestedCoordinates()

        #expect(progress == TileDownloadProgress(total: 1, succeeded: 1, failed: 0))
        #expect(requests == [failedCoordinate])
    }

    @Test func cancellationStopsBeforeRemainingCoordinates() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = capeBretonArea(id: "area-cancel", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let loader = BlockingStubTileLoader()

        let task = Task {
            await manager.download(area: area, loader: loader)
        }
        await loader.waitForRequest()
        task.cancel()
        await loader.finish()

        let progress = await task.value

        #expect(progress.wasCancelled)
        #expect(progress.succeeded == 1)
        #expect(progress.failed == coordinates.count - 1)
        #expect(progress.failedCoordinates == Array(coordinates.dropFirst()))
    }

    @Test func skipsExistingViewedCacheTilesAndAssociatesThemWithSavedArea() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = capeBretonArea(id: "area-3", maxZoom: 11)
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

    @Test func skipsExistingSavedFletcherTile() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let manager = TileDownloadManager(tileStore: store)
        let area = capeBretonArea(id: "area-existing", maxZoom: 11)
        let coordinates = FletcherTilePlanner.coordinates(for: area.bounds, zoomRange: area.minZoom...area.maxZoom)
        let existingCoordinate = try #require(coordinates.first)
        let existingData = Data([0xFE, 0xED])
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

        #expect(progress == TileDownloadProgress(total: coordinates.count, succeeded: coordinates.count, failed: 0))
        #expect(!requests.contains(existingCoordinate))
        #expect(await store.tile(
            z: existingCoordinate.z,
            x: existingCoordinate.x,
            y: existingCoordinate.y,
            layerID: "fletcher"
        ) == existingData)
    }

    private func makeTemporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    /// A saved area over Fletcher sheet 1.
    ///
    /// It was Halifax, which is outside the survey. The planner now drops tiles
    /// no sheet covers, so a Halifax area plans nothing at all: the assertions
    /// below would have compared empty against empty, and the tests that wait
    /// for a request would have waited forever.
    ///
    /// Taken from the sheet table rather than transcribed, so a re-georeference
    /// moves the fixture with it. That is not circular — what is under test here
    /// is the downloader, and the extents have their own parity suite.
    private func capeBretonArea(
        id: String,
        maxZoom: Int = 10
    ) -> SavedOfflineArea {
        let sheet = FletcherSheets.sheet(1)!.bounds
        return SavedOfflineArea(
            id: id,
            name: "Sheet 1",
            bounds: MapBounds(
                minLatitude: sheet.south,
                minLongitude: sheet.west,
                maxLatitude: sheet.north,
                maxLongitude: sheet.east
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

private actor BlockingStubTileLoader: TileDataLoading {
    private var requestContinuation: CheckedContinuation<Void, Never>?
    private var dataContinuation: CheckedContinuation<Data, Never>?
    private var didReceiveRequest = false

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        didReceiveRequest = true
        requestContinuation?.resume()
        requestContinuation = nil

        return await withCheckedContinuation { continuation in
            dataContinuation = continuation
        }
    }

    func waitForRequest() async {
        guard !didReceiveRequest else { return }
        await withCheckedContinuation { continuation in
            requestContinuation = continuation
        }
    }

    func finish() {
        dataContinuation?.resume(returning: Data([0xCA]))
        dataContinuation = nil
    }
}
