import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OfflineAreasViewModelTests {
    @Test func estimateDraftSetsTileCountAndBytes() {
        let storeRoot = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: storeRoot) }
        let viewModel = OfflineAreasViewModel(
            tileStore: TileStore(rootDirectory: storeRoot),
            tileCache: TileCache(),
            savedAreaRepository: makeRepository(root: storeRoot)
        )
        let area = viewModel.estimateDraft(
            name: "Halifax",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 11
        )

        #expect(area.name == "Halifax")
        #expect(area.estimatedTileCount > 0)
        #expect(area.estimatedBytes == area.estimatedTileCount * 12_000)
        #expect(area.state == .estimating)
    }

    @Test func estimateDraftMarksOversizedAreasUnsavable() {
        let storeRoot = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: storeRoot) }
        let viewModel = OfflineAreasViewModel(
            tileStore: TileStore(rootDirectory: storeRoot),
            tileCache: TileCache(),
            savedAreaRepository: makeRepository(root: storeRoot)
        )
        let area = viewModel.estimateDraft(
            name: "Province",
            bounds: MapBounds(
                minLatitude: 43.0,
                minLongitude: -66.5,
                maxLatitude: 47.0,
                maxLongitude: -59.5
            ),
            minZoom: 10,
            maxZoom: 18
        )

        #expect(area.estimatedTileCount > viewModel.maximumSavedAreaTileCount)
        #expect(area.state == .failed)
    }

    @Test func refreshStorageSummaryAggregatesTileStoreAndTileCacheBytes() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }

        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot)
        )

        try await store.store(Data([0x01, 0x02]), z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: "area-1")
        try await store.store(Data([0x03, 0x04, 0x05]), z: 1, x: 2, y: 2, layerID: "ns-aerial", savedAreaID: nil)

        cache.cacheTile(Data([0x10, 0x11, 0x12, 0x13]), z: 2, x: 3, y: 4, layerName: "fletcher")
        cache.cacheTile(Data([0x20, 0x21, 0x22, 0x23, 0x24]), z: 2, x: 5, y: 6, layerName: "ns-aerial")

        #expect(await eventuallyCacheFileExists(root: cacheRoot, layerName: "fletcher", z: 2, x: 3, y: 4))
        #expect(await eventuallyCacheFileExists(root: cacheRoot, layerName: "ns-aerial", z: 2, x: 5, y: 6))

        await viewModel.refreshStorageSummary()

        #expect(viewModel.storageSummary.totalBytes == 14)
        #expect(viewModel.storageSummary.layerBytes["fletcher"] == 6)
        #expect(viewModel.storageSummary.layerBytes["ns-aerial"] == 8)
        #expect(viewModel.storageSummary.savedAreaBytes["area-1"] == 2)
    }

    @Test func deleteAllCachedTilesRefreshesSummary() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot)
        )
        let data = Data([0x01])

        try await store.store(data, z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: nil)
        cache.cacheTile(data, z: 1, x: 1, y: 1, layerName: "fletcher")
        #expect(await eventuallyCacheFileExists(root: cacheRoot, layerName: "fletcher", z: 1, x: 1, y: 1))
        #expect(cache.cachedTile(z: 1, x: 1, y: 1, layerName: "fletcher") == data)

        await viewModel.refreshStorageSummary()
        #expect(viewModel.storageSummary.totalBytes == 2)
        #expect(viewModel.storageSummary.layerBytes["fletcher"] == 2)

        await viewModel.deleteAllCachedTiles()
        let summary = await store.summary()

        #expect(viewModel.storageSummary.totalBytes == 0)
        #expect(viewModel.storageSummary.layerBytes.isEmpty)
        #expect(summary.totalBytes == 0)
        #expect(summary.layerBytes.isEmpty)
        #expect(cache.cachedTile(z: 1, x: 1, y: 1, layerName: "fletcher") == nil)
        #expect(!cacheFileExists(root: cacheRoot, layerName: "fletcher", z: 1, x: 1, y: 1))
    }

    @Test func deleteAllCachedTilesResetsCompleteSavedAreaForRedownload() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot)
        )
        let area = SavedOfflineArea(
            id: "complete-area",
            name: "Complete",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 10,
            estimatedTileCount: 1,
            estimatedBytes: 12_000,
            downloadedTileCount: 1,
            state: .complete
        )

        await viewModel.saveDraft(area)
        try await store.store(Data([0x01]), z: 10, x: 331, y: 369, layerID: "fletcher", savedAreaID: area.id)
        await viewModel.refreshStorageSummary()
        await viewModel.deleteAllCachedTiles()

        #expect(viewModel.savedAreas[0].state == .estimating)
        #expect(viewModel.savedAreas[0].downloadedTileCount == 0)
        #expect(viewModel.savedAreas[0].failedTileCount == 0)
        #expect(viewModel.savedAreas[0].actualBytes == 0)
    }

    @Test func immediateDeleteSkipsPendingTileStoreMirrors() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot)
        )

        for index in 0..<50 {
            cache.cacheTile(
                Data([UInt8(index)]),
                z: 4,
                x: index,
                y: index,
                layerName: "fletcher"
            )
        }

        await viewModel.deleteAllCachedTiles()

        for _ in 0..<20 {
            await Task.yield()
        }
        await viewModel.refreshStorageSummary()
        let summary = await store.summary()

        #expect(viewModel.storageSummary.totalBytes == 0)
        #expect(viewModel.storageSummary.layerBytes.isEmpty)
        #expect(summary.totalBytes == 0)
        #expect(summary.layerBytes.isEmpty)
        #expect(cache.cachedTile(z: 4, x: 0, y: 0, layerName: "fletcher") == nil)
    }

    @Test func saveDraftRefreshesBytesAndDeleteSavedAreaRemovesMembership() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot)
        )
        let area = SavedOfflineArea(
            id: "area-1",
            name: "Halifax Commons",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 12,
            estimatedTileCount: 24,
            estimatedBytes: 240_000,
            downloadedTileCount: 8,
            failedTileCount: 2,
            actualBytes: 999,
            state: .failed
        )

        await viewModel.saveDraft(area)
        try await store.store(Data([0x01, 0x02]), z: 5, x: 10, y: 12, layerID: "fletcher", savedAreaID: area.id)
        try await store.store(Data([0x03]), z: 5, x: 11, y: 12, layerID: "fletcher", savedAreaID: nil)

        await viewModel.refreshStorageSummary()

        #expect(viewModel.savedAreas.count == 1)
        #expect(viewModel.savedAreas[0].actualBytes == 2)
        #expect(viewModel.storageSummary.savedAreaBytes[area.id] == 2)

        await viewModel.deleteSavedArea(area)
        let summary = await store.summary()

        #expect(viewModel.savedAreas.isEmpty)
        #expect(summary.savedAreaBytes[area.id] == nil)
        #expect(await store.tile(z: 5, x: 10, y: 12, layerID: "fletcher") == nil)
        #expect(await store.tile(z: 5, x: 11, y: 12, layerID: "fletcher") == Data([0x03]))
    }

    @Test func saveDraftPersistsAndReloadsInNewViewModel() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let repository = makeRepository(root: storeRoot)
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let area = SavedOfflineArea(
            id: "area-persisted",
            name: "Reloaded Field",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 12,
            estimatedTileCount: 42,
            estimatedBytes: 504_000,
            state: .estimating
        )

        let firstViewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: repository
        )
        await firstViewModel.saveDraft(area)

        let reloadedViewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: repository
        )
        await reloadedViewModel.refreshStorageSummary()

        #expect(reloadedViewModel.savedAreas.count == 1)
        #expect(reloadedViewModel.savedAreas[0].id == area.id)
        #expect(reloadedViewModel.savedAreas[0].name == "Reloaded Field")
        #expect(reloadedViewModel.savedAreas[0].estimatedTileCount == 42)
    }

    @Test func saveDraftDoesNotMutateInMemoryStateWhenPersistenceFails() async throws {
        let storeRoot = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: storeRoot) }
        let badFileURL = storeRoot
            .appendingPathComponent("saved-area-records", isDirectory: true)
            .appendingPathComponent("saved-areas.json", isDirectory: true)
        try FileManager.default.createDirectory(at: badFileURL, withIntermediateDirectories: true)
        let viewModel = OfflineAreasViewModel(
            tileStore: TileStore(rootDirectory: storeRoot),
            tileCache: TileCache(),
            savedAreaRepository: SavedOfflineAreaRepository(fileURL: badFileURL)
        )
        let area = SavedOfflineArea(
            id: "unsaved",
            name: "Unsaved",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 10,
            estimatedTileCount: 1,
            estimatedBytes: 12_000,
            state: .estimating
        )

        let didSave = await viewModel.saveDraft(area)

        #expect(!didSave)
        #expect(viewModel.savedAreas.isEmpty)
        #expect(viewModel.storageErrorMessage == "Couldn't save Unsaved.")
    }

    @Test func staleDownloadingAreaRecoversAsFailedOnLoad() async throws {
        let storeRoot = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: storeRoot) }
        let repository = makeRepository(root: storeRoot)
        let interruptedArea = SavedOfflineArea(
            id: "interrupted",
            name: "Interrupted",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 10,
            estimatedTileCount: 4,
            estimatedBytes: 48_000,
            state: .downloading
        )
        try await repository.save([interruptedArea])
        let viewModel = OfflineAreasViewModel(
            tileStore: TileStore(rootDirectory: storeRoot),
            tileCache: TileCache(),
            savedAreaRepository: repository
        )

        await viewModel.refreshStorageSummary()

        #expect(viewModel.savedAreas[0].state == .failed)
        #expect(viewModel.savedAreas[0].failedTileCount > 0)
    }

    @Test func downloadAreaDownloadsNewSavedAreaAndPersistsResult() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }

        let repository = makeRepository(root: storeRoot)
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let loader = MockTileLoader(data: Data([0x44, 0x45]), failingCoordinates: [])
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: repository,
            tileDownloadManager: TileDownloadManager(tileStore: store),
            tileLoader: loader
        )
        let area = SavedOfflineArea(
            id: "area-download",
            name: "Download Ready",
            bounds: sampleBounds(),
            minZoom: 0,
            maxZoom: 0,
            estimatedTileCount: 1,
            estimatedBytes: 12_000,
            state: .estimating
        )

        await viewModel.saveDraft(area)
        await viewModel.downloadArea(area)

        #expect(viewModel.savedAreas.count == 1)
        #expect(viewModel.savedAreas[0].state == .complete)
        #expect(viewModel.savedAreas[0].downloadedTileCount == 1)
        #expect(viewModel.savedAreas[0].failedTileCount == 0)
        #expect(viewModel.storageSummary.savedAreaBytes[area.id] == 2)

        let reloadedViewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: repository
        )
        await reloadedViewModel.refreshStorageSummary()

        #expect(reloadedViewModel.savedAreas[0].state == .complete)
        #expect(reloadedViewModel.savedAreas[0].downloadedTileCount == 1)
        #expect(reloadedViewModel.savedAreas[0].actualBytes == 2)
    }

    @Test func deleteLayerCacheRefreshesSummaryAndKeepsOtherLayersAvailable() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot)
        )
        let hashedFletcher = "fletcher_\(String(repeating: "a", count: 64))"
        let fletcherData = Data([0x21, 0x22, 0x23])
        let aerialData = Data([0x31, 0x32])

        try await store.store(fletcherData, z: 7, x: 20, y: 21, layerID: hashedFletcher, savedAreaID: nil)
        try await store.store(aerialData, z: 7, x: 22, y: 23, layerID: "ns-aerial", savedAreaID: nil)
        cache.cacheTile(fletcherData, z: 7, x: 20, y: 21, layerName: hashedFletcher)
        cache.cacheTile(aerialData, z: 7, x: 22, y: 23, layerName: "ns-aerial")

        #expect(await eventuallyCacheFileExists(root: cacheRoot, layerName: hashedFletcher, z: 7, x: 20, y: 21))
        #expect(await eventuallyCacheFileExists(root: cacheRoot, layerName: "ns-aerial", z: 7, x: 22, y: 23))

        await viewModel.refreshStorageSummary()

        let fletcherSummary = viewModel.layerStorageSummaries.first { $0.id == hashedFletcher }
        #expect(fletcherSummary?.displayName == "Fletcher")
        #expect(fletcherSummary?.rawKey == hashedFletcher)
        #expect(viewModel.storageSummary.layerBytes[hashedFletcher] == fletcherData.count * 2)
        #expect(viewModel.storageSummary.layerBytes["ns-aerial"] == aerialData.count * 2)

        await viewModel.deleteLayerCache(hashedFletcher)
        let summary = await store.summary()

        #expect(viewModel.storageSummary.layerBytes[hashedFletcher] == nil)
        #expect(summary.layerBytes[hashedFletcher] == nil)
        #expect(summary.layerBytes["ns-aerial"] == aerialData.count)
        #expect(viewModel.storageSummary.layerBytes["ns-aerial"] == aerialData.count * 2)
        #expect(cache.cachedTile(z: 7, x: 20, y: 21, layerName: hashedFletcher) == nil)
        #expect(cache.cachedTile(z: 7, x: 22, y: 23, layerName: "ns-aerial") == aerialData)
    }

    @Test func retryFailedAreaDownloadsTilesAndRefreshesCounts() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }

        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let area = SavedOfflineArea(
            id: "area-2",
            name: "Citadel Hill",
            bounds: sampleBounds(),
            minZoom: 0,
            maxZoom: 2,
            estimatedTileCount: 0,
            estimatedBytes: 0,
            downloadedTileCount: 0,
            failedTileCount: 1,
            actualBytes: 0,
            state: .failed
        )
        let coordinates = FletcherTilePlanner.coordinates(
            for: area.bounds,
            zoomRange: area.minZoom...area.maxZoom
        )
        let failedCoordinate = try #require(coordinates.first)
        let loader = TrackingTileLoader(
            data: Data([0x7A, 0x7B]),
            failingCoordinates: []
        )
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot),
            tileDownloadManager: TileDownloadManager(tileStore: store),
            tileLoader: loader
        )
        var savedArea = area
        savedArea.estimatedTileCount = coordinates.count
        savedArea.estimatedBytes = coordinates.count * 12_000
        savedArea.downloadedTileCount = coordinates.count - 1
        savedArea.failedTileCoordinates = [failedCoordinate]

        await viewModel.saveDraft(savedArea)
        await viewModel.retryFailedArea(savedArea)
        let requests = await loader.requestedCoordinates()

        #expect(viewModel.savedAreas.count == 1)
        #expect(viewModel.savedAreas[0].state == .complete)
        #expect(viewModel.savedAreas[0].downloadedTileCount == coordinates.count)
        #expect(viewModel.savedAreas[0].failedTileCount == 0)
        #expect(viewModel.savedAreas[0].failedTileCoordinates?.isEmpty == true)
        #expect(requests == [failedCoordinate])
        #expect(viewModel.savedAreas[0].updatedAt >= savedArea.updatedAt)
    }

    @Test func downloadAreaPublishesIncrementalProgress() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let loader = PausingAfterFirstTileLoader(data: Data([0x33]))
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot),
            tileDownloadManager: TileDownloadManager(tileStore: store),
            tileLoader: loader
        )
        let area = SavedOfflineArea(
            id: "progress-area",
            name: "Progress",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 11,
            estimatedTileCount: FletcherTilePlanner.coordinates(for: sampleBounds(), zoomRange: 10...11).count,
            estimatedBytes: 12_000,
            state: .estimating
        )

        await viewModel.saveDraft(area)
        let downloadTask = Task {
            await viewModel.downloadArea(area)
        }
        await loader.waitForSecondRequest()

        #expect(viewModel.isStorageOperationInProgress)
        #expect(viewModel.savedAreas[0].downloadedTileCount >= 1)

        await loader.finishSecondRequest()
        await downloadTask.value
    }

    @Test func cancelActiveDownloadStopsAndMarksAreaRetryable() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let loader = BlockingTileLoader(data: Data([0x55]))
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot),
            tileDownloadManager: TileDownloadManager(tileStore: store),
            tileLoader: loader
        )
        let coordinates = FletcherTilePlanner.coordinates(for: sampleBounds(), zoomRange: 10...11)
        let area = SavedOfflineArea(
            id: "cancel-area",
            name: "Cancel",
            bounds: sampleBounds(),
            minZoom: 10,
            maxZoom: 11,
            estimatedTileCount: coordinates.count,
            estimatedBytes: coordinates.count * 12_000,
            state: .estimating
        )

        await viewModel.saveDraft(area)
        viewModel.startDownloadArea(area)
        await loader.waitForRequest()

        viewModel.cancelActiveDownload()
        await loader.finish()
        #expect(await eventuallyStorageOperationFinishes(viewModel))

        #expect(viewModel.savedAreas[0].state == .partial)
        #expect(viewModel.savedAreas[0].failedTileCount == coordinates.count - 1)
        #expect(viewModel.savedAreas[0].failedTileCoordinates?.count == coordinates.count - 1)
    }

    @Test func deleteAllCachedTilesIsRejectedDuringRetry() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }

        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(diskRoot: cacheRoot)
        let loader = BlockingTileLoader(data: Data([0x55]))
        let viewModel = OfflineAreasViewModel(
            tileStore: store,
            tileCache: cache,
            savedAreaRepository: makeRepository(root: storeRoot),
            tileDownloadManager: TileDownloadManager(tileStore: store),
            tileLoader: loader
        )
        let area = SavedOfflineArea(
            id: "area-busy",
            name: "Busy Area",
            bounds: MapBounds(
                minLatitude: -85,
                minLongitude: -180,
                maxLatitude: 85,
                maxLongitude: 180
            ),
            minZoom: 0,
            maxZoom: 0,
            estimatedTileCount: 1,
            estimatedBytes: 12_000,
            downloadedTileCount: 0,
            failedTileCount: 1,
            actualBytes: 0,
            state: .failed
        )

        await viewModel.saveDraft(area)
        let retryTask = Task {
            await viewModel.retryFailedArea(area)
        }
        await loader.waitForRequest()

        #expect(viewModel.isStorageOperationInProgress)

        await viewModel.deleteAllCachedTiles()

        #expect(viewModel.storageErrorMessage == "Please wait for the current offline operation to finish.")
        #expect(viewModel.isStorageOperationInProgress)

        await loader.finish()
        await retryTask.value

        #expect(viewModel.isStorageOperationInProgress == false)
        #expect(viewModel.savedAreas[0].state == .complete)
        #expect(viewModel.storageSummary.savedAreaBytes[area.id] == 1)
    }

    private func makeTemporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func makeRepository(root: URL) -> SavedOfflineAreaRepository {
        SavedOfflineAreaRepository(
            fileURL: root
                .appendingPathComponent("saved-area-records", isDirectory: true)
                .appendingPathComponent("saved-areas.json")
        )
    }

    private func eventuallyCacheFileExists(
        root: URL,
        layerName: String,
        z: Int,
        x: Int,
        y: Int
    ) async -> Bool {
        for _ in 0..<20 {
            if cacheFileExists(root: root, layerName: layerName, z: z, x: x, y: y) {
                return true
            }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return false
    }

    private func cacheFileExists(
        root: URL,
        layerName: String,
        z: Int,
        x: Int,
        y: Int
    ) -> Bool {
        let url = root
            .appendingPathComponent(layerName, isDirectory: true)
            .appendingPathComponent("\(z)", isDirectory: true)
            .appendingPathComponent("\(x)", isDirectory: true)
            .appendingPathComponent("\(y).png")
        return FileManager.default.fileExists(atPath: url.path)
    }

    private func eventuallyStorageOperationFinishes(_ viewModel: OfflineAreasViewModel) async -> Bool {
        for _ in 0..<50 {
            if !viewModel.isStorageOperationInProgress {
                return true
            }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return false
    }

    private func sampleBounds() -> MapBounds {
        MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )
    }
}

private struct MockTileLoader: TileDataLoading {
    let data: Data
    let failingCoordinates: Set<TileCoordinate>

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        if failingCoordinates.contains(coordinate) {
            throw URLError(.cannotLoadFromNetwork)
        }
        return data
    }
}

private actor TrackingTileLoader: TileDataLoading {
    let data: Data
    let failingCoordinates: Set<TileCoordinate>
    private var requests: [TileCoordinate] = []

    init(data: Data, failingCoordinates: Set<TileCoordinate>) {
        self.data = data
        self.failingCoordinates = failingCoordinates
    }

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        requests.append(coordinate)
        if failingCoordinates.contains(coordinate) {
            throw URLError(.cannotLoadFromNetwork)
        }
        return data
    }

    func requestedCoordinates() -> [TileCoordinate] {
        requests
    }
}

private actor PausingAfterFirstTileLoader: TileDataLoading {
    let data: Data
    private var requestCount = 0
    private var secondRequestContinuation: CheckedContinuation<Void, Never>?
    private var secondDataContinuation: CheckedContinuation<Data, Never>?
    private var didReceiveSecondRequest = false

    init(data: Data) {
        self.data = data
    }

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        requestCount += 1
        guard requestCount > 1 else {
            return data
        }

        didReceiveSecondRequest = true
        secondRequestContinuation?.resume()
        secondRequestContinuation = nil

        return await withCheckedContinuation { continuation in
            secondDataContinuation = continuation
        }
    }

    func waitForSecondRequest() async {
        guard !didReceiveSecondRequest else { return }
        await withCheckedContinuation { continuation in
            secondRequestContinuation = continuation
        }
    }

    func finishSecondRequest() {
        secondDataContinuation?.resume(returning: data)
        secondDataContinuation = nil
    }
}

private actor BlockingTileLoader: TileDataLoading {
    private let data: Data
    private var requestContinuation: CheckedContinuation<Void, Never>?
    private var dataContinuation: CheckedContinuation<Data, Never>?
    private var didReceiveRequest = false

    init(data: Data) {
        self.data = data
    }

    func data(for coordinate: TileCoordinate, layerID: String) async throws -> Data {
        return await withCheckedContinuation { continuation in
            dataContinuation = continuation
            didReceiveRequest = true
            requestContinuation?.resume()
            requestContinuation = nil
        }
    }

    func waitForRequest() async {
        guard !didReceiveRequest else { return }
        await withCheckedContinuation { continuation in
            requestContinuation = continuation
        }
    }

    func finish() {
        dataContinuation?.resume(returning: data)
        dataContinuation = nil
    }
}
