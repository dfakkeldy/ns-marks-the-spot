import Foundation
import MapCatalog
import Testing

@testable import ns_marks_the_spot

/// The one-time cache clear that retires the OldMapsOnline-derived tiles.
///
/// This is a rights obligation, not housekeeping: the David Rumsey permission
/// recorded in `docs/FLETCHER_GEOREFERENCING.md` does not cover
/// OldMapsOnline-derived tiles, so an upgrading install has to stop holding
/// them. Which makes "were the bytes actually deleted" the assertion worth
/// making — the flag in `UserDefaults` is bookkeeping about the sweep, not
/// evidence that it happened.
@Suite("Fletcher source migration")
struct FletcherSourceMigrationTests {
    /// A defaults domain and a cache directory of their own per test.
    ///
    /// The cache directory matters as much as the domain: `TileCache()` on its
    /// default path is one shared directory, and a sweep from this suite would
    /// otherwise delete tiles out from under whatever else is running.
    private func isolated(_ name: String) throws -> (UserDefaults, TileCache, TileStore, URL) {
        let suite = "FletcherSourceMigrationTests.\(name)"
        UserDefaults().removePersistentDomain(forName: suite)
        let defaults = try #require(UserDefaults(suiteName: suite))

        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("FletcherMigration-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let store = TileStore(
            rootDirectory: root.appendingPathComponent("store", isDirectory: true)
        )
        return (defaults, TileCache(diskRoot: root.appendingPathComponent("cache", isDirectory: true)), store, root)
    }

    private func seedTile(_ cache: TileCache, layerName: String) {
        cache.cacheTile(Data([0x89, 0x50, 0x4E, 0x47]), z: 12, x: 1, y: 2, layerName: layerName)
    }

    @Test func clearsCachedTilesOnAFreshInstall() async throws {
        let (defaults, cache, store, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        seedTile(cache, layerName: "fletcher_sheet-1")
        seedTile(cache, layerName: "ns-aerial")
        // `diskSummary` runs on the same serial queue the writes are enqueued
        // on, so awaiting it is the barrier that makes "the bytes were on disk"
        // a fact rather than a race.
        let before = await cache.diskSummary()
        #expect(before.totalBytes > 0)
        #expect(cache.cachedTile(z: 12, x: 1, y: 2, layerName: "fletcher_sheet-1") != nil)

        await FletcherSourceMigration.run(tileCache: cache, tileStore: store, defaults: defaults)

        // The Fletcher entry is the obligation; the other one goes with it
        // because the old cache identifier is a hash of a source configuration
        // that no longer exists, so there is nothing precise left to aim at.
        let after = await cache.diskSummary()
        #expect(after.totalBytes == 0)
        #expect(cache.cachedTile(z: 12, x: 1, y: 2, layerName: "fletcher_sheet-1") == nil)
        #expect(cache.cachedTile(z: 12, x: 1, y: 2, layerName: "ns-aerial") == nil)
        #expect(
            defaults.string(forKey: FletcherSourceMigration.storageKey)
                == FletcherSheets.tileRevision
        )
    }

    @Test func leavesTilesAloneOnASecondLaunch() async throws {
        let (defaults, cache, store, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        await FletcherSourceMigration.run(tileCache: cache, tileStore: store, defaults: defaults)
        // Cached *after* the sweep, standing in for everything the user
        // re-downloads by using the app. A migration that ran twice would take
        // this with it.
        seedTile(cache, layerName: "fletcher_sheet-1")

        await FletcherSourceMigration.run(tileCache: cache, tileStore: store, defaults: defaults)

        #expect(cache.cachedTile(z: 12, x: 1, y: 2, layerName: "fletcher_sheet-1") != nil)
        #expect(FletcherSourceMigration.isNeeded(defaults: defaults) == false)
    }

    @Test func runsAgainWhenTheRevisionChanges() async throws {
        let (defaults, cache, store, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        defaults.set("fletcher-some-earlier-build", forKey: FletcherSourceMigration.storageKey)
        seedTile(cache, layerName: "fletcher_sheet-1")
        #expect(FletcherSourceMigration.isNeeded(defaults: defaults))

        await FletcherSourceMigration.run(tileCache: cache, tileStore: store, defaults: defaults)

        // A re-render moves every sheet to a new address, so the previous
        // build's tiles are unreachable rather than stale — and still occupying
        // the user's disk.
        #expect(cache.cachedTile(z: 12, x: 1, y: 2, layerName: "fletcher_sheet-1") == nil)
        #expect(
            defaults.string(forKey: FletcherSourceMigration.storageKey)
                == FletcherSheets.tileRevision
        )
    }

    @Test func recordsNothingUntilTheSweepSucceeds() async throws {
        let (defaults, _, _, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        // A sweep that fails outright, rather than a contrived filesystem that
        // may or may not fail. Ordering is the whole point: recording first
        // would mark the obligation discharged while the tiles it covers are
        // still on disk, and no later launch would ever try again.
        struct SweepFailed: Error {}
        let recorded = await FletcherSourceMigration.run(defaults: defaults) {
            throw SweepFailed()
        }

        #expect(recorded == false)
        #expect(defaults.string(forKey: FletcherSourceMigration.storageKey) == nil)
        #expect(FletcherSourceMigration.isNeeded(defaults: defaults))
    }

    @Test func retriesOnTheNextLaunchAfterAFailedSweep() async throws {
        let (defaults, _, _, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        struct SweepFailed: Error {}
        _ = await FletcherSourceMigration.run(defaults: defaults) { throw SweepFailed() }

        // The second attempt must actually run the sweep. A guard that treated
        // "already attempted" as "already done" would skip it silently.
        var ran = false
        let recorded = await FletcherSourceMigration.run(defaults: defaults) { ran = true }

        #expect(ran)
        #expect(recorded)
        #expect(FletcherSourceMigration.isNeeded(defaults: defaults) == false)
    }

    @Test func clearsFletcherTilesOutOfSavedOfflineAreas() async throws {
        let (defaults, cache, store, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        // Saved areas are the case the first version of this migration missed.
        // They are keyed by layer ID, which did not change across the source
        // switch, so these are OldMapsOnline tiles the downloader would go on
        // preferring over a fresh fetch.
        try await store.store(
            Data([0x89, 0x50, 0x4E, 0x47]),
            z: 12, x: 1, y: 2,
            layerID: "fletcher",
            savedAreaID: "area-1"
        )
        #expect(await store.tile(z: 12, x: 1, y: 2, layerID: "fletcher") != nil)

        await FletcherSourceMigration.run(tileCache: cache, tileStore: store, defaults: defaults)

        #expect(await store.tile(z: 12, x: 1, y: 2, layerID: "fletcher") == nil)
    }

    @Test func keysOffTheSharedRevisionRatherThanACopy() async throws {
        let (defaults, cache, store, root) = try isolated(#function)
        defer { try? FileManager.default.removeItem(at: root) }

        // The stored value is the tile revision itself, so a re-render is a
        // one-line change in the package and not a new migration flag here.
        await FletcherSourceMigration.run(tileCache: cache, tileStore: store, defaults: defaults)
        let stored = defaults.string(forKey: FletcherSourceMigration.storageKey)
        #expect(stored == FletcherSheets.tileRevision)
        #expect(stored?.hasPrefix("fletcher-direct-rumsey-") == true)
    }
}
