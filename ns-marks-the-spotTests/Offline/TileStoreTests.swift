import Foundation
import Testing
@testable import ns_marks_the_spot

struct TileStoreTests {
    @Test func roundTripAndSummary() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
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
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)

        try await store.store(Data([0x01]), z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: nil)
        try await store.store(Data([0x02]), z: 1, x: 1, y: 1, layerID: "ns-aerial", savedAreaID: nil)
        try await store.deleteLayer("fletcher")

        #expect(await store.tile(z: 1, x: 1, y: 1, layerID: "fletcher") == nil)
        #expect(await store.tile(z: 1, x: 1, y: 1, layerID: "ns-aerial") == Data([0x02]))
    }

    @Test func deleteSavedAreaKeepsViewedCacheTiles() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)

        try await store.store(Data([0x01]), z: 2, x: 2, y: 2, layerID: "fletcher", savedAreaID: "area-1")
        try await store.store(Data([0x02]), z: 2, x: 3, y: 3, layerID: "fletcher", savedAreaID: nil)
        try await store.deleteSavedArea("area-1")

        #expect(await store.tile(z: 2, x: 2, y: 2, layerID: "fletcher") == nil)
        #expect(await store.tile(z: 2, x: 3, y: 3, layerID: "fletcher") == Data([0x02]))
    }

    @Test func deleteSavedAreaPreservesOverlappingViewedCacheTile() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let data = Data([0x03])

        try await store.store(data, z: 4, x: 5, y: 6, layerID: "fletcher", savedAreaID: nil)
        try await store.store(data, z: 4, x: 5, y: 6, layerID: "fletcher", savedAreaID: "area-1")
        try await store.deleteSavedArea("area-1")

        let summary = await store.summary()

        #expect(await store.tile(z: 4, x: 5, y: 6, layerID: "fletcher") == data)
        #expect(summary.totalBytes == 1)
        #expect(summary.savedAreaBytes["area-1"] == nil)
    }

    @Test func tileCacheDoesNotMirrorViewedTilesIntoTileStore() async throws {
        let root = makeTemporaryRoot()
        let cacheRoot = makeTemporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: cacheRoot)
        }
        let store = TileStore(rootDirectory: root)
        let cache = TileCache(tileStore: store, diskRoot: cacheRoot)
        let data = Data([0x40, 0x41])

        cache.cacheTile(data, z: 8, x: 9, y: 10, layerName: "fletcher")

        let summary = await store.summary()

        #expect(await store.tile(z: 8, x: 9, y: 10, layerID: "fletcher") == nil)
        #expect(summary.totalBytes == 0)
        #expect(summary.layerBytes.isEmpty)
        #expect(summary.savedAreaBytes.isEmpty)
    }

    @Test func storeTileCleansUpNewTileWhenRecordWriteFails() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let recordDirectory = root
            .appendingPathComponent("records", isDirectory: true)
            .appendingPathComponent("fletcher", isDirectory: true)
            .appendingPathComponent("1", isDirectory: true)
            .appendingPathComponent("2", isDirectory: true)
            .appendingPathComponent("3.json", isDirectory: true)

        try FileManager.default.createDirectory(
            at: recordDirectory,
            withIntermediateDirectories: true
        )

        var didThrow = false
        do {
            try await store.store(Data([0x70]), z: 1, x: 2, y: 3, layerID: "fletcher", savedAreaID: nil)
        } catch {
            didThrow = true
        }

        #expect(didThrow)
        #expect(await store.tile(z: 1, x: 2, y: 3, layerID: "fletcher") == nil)
        #expect(await store.summary() == TileStoreSummary(totalBytes: 0, layerBytes: [:], savedAreaBytes: [:]))
    }

    @Test func staleGlobalGenerationMirrorDoesNotWriteTile() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let generation = TileStoreWriteGeneration()
        let staleGeneration = generation.snapshot(for: "fletcher")

        generation.advanceAll()

        try await store.store(
            Data([0x50]),
            z: 9,
            x: 10,
            y: 11,
            layerID: "fletcher",
            savedAreaID: nil,
            ifGenerationMatches: staleGeneration,
            generationTracker: generation
        )

        #expect(await store.tile(z: 9, x: 10, y: 11, layerID: "fletcher") == nil)
        #expect(await store.summary() == TileStoreSummary(totalBytes: 0, layerBytes: [:], savedAreaBytes: [:]))
    }

    @Test func staleLayerGenerationMirrorDoesNotWriteThatLayer() async throws {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        let generation = TileStoreWriteGeneration()
        let staleFletcherGeneration = generation.snapshot(for: "fletcher")
        let activeAerialGeneration = generation.snapshot(for: "ns-aerial")

        generation.advanceLayer("fletcher")

        try await store.store(
            Data([0x60]),
            z: 10,
            x: 11,
            y: 12,
            layerID: "fletcher",
            savedAreaID: nil,
            ifGenerationMatches: staleFletcherGeneration,
            generationTracker: generation
        )
        try await store.store(
            Data([0x61]),
            z: 10,
            x: 13,
            y: 14,
            layerID: "ns-aerial",
            savedAreaID: nil,
            ifGenerationMatches: activeAerialGeneration,
            generationTracker: generation
        )

        let summary = await store.summary()

        #expect(await store.tile(z: 10, x: 11, y: 12, layerID: "fletcher") == nil)
        #expect(await store.tile(z: 10, x: 13, y: 14, layerID: "ns-aerial") == Data([0x61]))
        #expect(summary.totalBytes == 1)
        #expect(summary.layerBytes["fletcher"] == nil)
        #expect(summary.layerBytes["ns-aerial"] == 1)
    }

    private func makeTemporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

}
