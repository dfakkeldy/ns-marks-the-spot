import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OfflineAreasViewModelTests {
    @Test func estimateDraftSetsTileCountAndBytes() {
        let viewModel = OfflineAreasViewModel(tileStore: TileStore(), tileCache: TileCache())
        let area = viewModel.estimateDraft(
            name: "Halifax",
            bounds: MapBounds(
                minLatitude: 44.64,
                minLongitude: -63.58,
                maxLatitude: 44.66,
                maxLongitude: -63.56
            ),
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
}
