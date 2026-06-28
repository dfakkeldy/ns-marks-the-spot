import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OfflineAreasViewModelTests {
    @Test func estimateDraftSetsTileCountAndBytes() {
        let viewModel = OfflineAreasViewModel(tileStore: TileStore(), tileCache: TileCache())
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

    @Test func deleteAllCachedTilesRefreshesSummary() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(tileStore: store, diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(tileStore: store, tileCache: cache)
        let data = Data([0x01])

        try await store.store(data, z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: nil)
        cache.cacheTile(data, z: 1, x: 1, y: 1, layerName: "fletcher")
        #expect(await eventuallyCacheFileExists(root: cacheRoot, layerName: "fletcher", z: 1, x: 1, y: 1))
        #expect(cache.cachedTile(z: 1, x: 1, y: 1, layerName: "fletcher") == data)

        await viewModel.refreshStorageSummary()
        #expect(viewModel.storageSummary.totalBytes == 1)

        await viewModel.deleteAllCachedTiles()
        let summary = await store.summary()

        #expect(viewModel.storageSummary.totalBytes == 0)
        #expect(viewModel.storageSummary.layerBytes.isEmpty)
        #expect(summary.totalBytes == 0)
        #expect(summary.layerBytes.isEmpty)
        #expect(cache.cachedTile(z: 1, x: 1, y: 1, layerName: "fletcher") == nil)
        #expect(!cacheFileExists(root: cacheRoot, layerName: "fletcher", z: 1, x: 1, y: 1))
    }

    @Test func immediateDeleteSkipsPendingTileStoreMirrors() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(tileStore: store, diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(tileStore: store, tileCache: cache)

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
        let cache = TileCache(tileStore: store, diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(tileStore: store, tileCache: cache)
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

        viewModel.saveDraft(area)
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

    @Test func deleteLayerCacheRefreshesSummaryAndKeepsOtherLayersAvailable() async throws {
        let storeRoot = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: storeRoot)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: storeRoot)
        let cache = TileCache(tileStore: store, diskRoot: cacheRoot)
        let viewModel = OfflineAreasViewModel(tileStore: store, tileCache: cache)
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
        #expect(viewModel.storageSummary.layerBytes[hashedFletcher] == fletcherData.count)

        await viewModel.deleteLayerCache(hashedFletcher)
        let summary = await store.summary()

        #expect(viewModel.storageSummary.layerBytes[hashedFletcher] == nil)
        #expect(summary.layerBytes[hashedFletcher] == nil)
        #expect(summary.layerBytes["ns-aerial"] == aerialData.count)
        #expect(cache.cachedTile(z: 7, x: 20, y: 21, layerName: hashedFletcher) == nil)
        #expect(cache.cachedTile(z: 7, x: 22, y: 23, layerName: "ns-aerial") == aerialData)
    }

    @Test func retryFailedAreaQueuesWithoutChangingProgressCounts() {
        let viewModel = OfflineAreasViewModel(tileStore: TileStore(), tileCache: TileCache())
        let updatedAt = Date(timeIntervalSince1970: 100)
        let area = SavedOfflineArea(
            id: "area-2",
            name: "Citadel Hill",
            bounds: sampleBounds(),
            minZoom: 11,
            maxZoom: 13,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: updatedAt,
            estimatedTileCount: 40,
            estimatedBytes: 480_000,
            downloadedTileCount: 28,
            failedTileCount: 3,
            actualBytes: 4_096,
            state: .failed
        )

        viewModel.saveDraft(area)
        viewModel.retryFailedArea(area)

        #expect(viewModel.savedAreas.count == 1)
        #expect(viewModel.savedAreas[0].state == .queued)
        #expect(viewModel.savedAreas[0].downloadedTileCount == 28)
        #expect(viewModel.savedAreas[0].failedTileCount == 3)
        #expect(viewModel.savedAreas[0].updatedAt >= updatedAt)
    }

    private func makeTemporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
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

    private func sampleBounds() -> MapBounds {
        MapBounds(
            minLatitude: 44.64,
            minLongitude: -63.58,
            maxLatitude: 44.66,
            maxLongitude: -63.56
        )
    }
}
