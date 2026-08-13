import Foundation
import GeoCore
import MapCatalog

/// Clears the tile cache once, on the first launch after the Fletcher source
/// changes.
///
/// This is a rights obligation before it is a housekeeping one. Every Fletcher
/// tile cached by an earlier build came from OldMapsOnline, and the David
/// Rumsey permission recorded in `docs/FLETCHER_GEOREFERENCING.md` explicitly
/// does not extend to OldMapsOnline-derived tiles, warps, bounds or metadata.
/// Those bytes have to go, not merely stop being read.
///
/// It clears everything rather than the Fletcher entries alone. The cache is
/// keyed by a hash of each layer's source configuration, so the old Fletcher
/// identifier cannot be recomputed once the source has changed — there is
/// nothing precise left to aim at. Everything else in the cache is a Province
/// or ArcGIS tile that re-fetches on next view, so the cost is one cold pan;
/// the alternative is leaving tiles behind because their key is unrecoverable.
///
/// Saved offline areas lose their Fletcher tiles too, and that is deliberate
/// despite the cost. `TileStore` keys them by layer ID, which has stayed
/// `"fletcher"` across the source change, so every one of those tiles is an
/// OldMapsOnline tile the app would go on serving — and would prefer over a
/// fresh fetch, since a stored tile short-circuits the download. "The user
/// downloaded it" does not put it inside the permission.
///
/// What survives is the user's actual work: the areas themselves, with their
/// names, bounds and zoom ranges. `OfflineAreasViewModel.applyingStorageSummary`
/// already reconciles an area whose bytes have gone to zero back into
/// `.estimating`, so they reappear as re-downloadable rather than as complete
/// areas that draw nothing.
nonisolated enum FletcherSourceMigration {
    /// Bumped when the Fletcher source changes in a way that invalidates cached
    /// tiles. The stored value is the revision that was last migrated to, so a
    /// future re-render is a one-line change here rather than a new flag.
    static let storageKey = "ns-marks-the-spot:fletcher-source-migration:v1"

    /// Runs the sweep if this install has not already done it for this revision.
    ///
    /// Fire-and-forget at launch; `run` is the awaitable form the tests use.
    ///
    /// It takes no `defaults` because `UserDefaults` is not `Sendable`, and the
    /// closure handed to `Task.detached` is a `sending` parameter: capturing an
    /// instance the calling task can still reach is exactly the race the
    /// compiler refuses. `run`'s default argument is evaluated inside the task
    /// instead, so the standard domain is obtained there and never crosses an
    /// isolation boundary. Tests await `run` directly and pass their own domain,
    /// which is why this overload does not need the seam.
    static func runIfNeeded(tileCache: TileCache, tileStore: TileStore) {
        guard isNeeded() else { return }
        Task.detached(priority: .utility) {
            await run(tileCache: tileCache, tileStore: tileStore)
        }
    }

    static func isNeeded(defaults: UserDefaults = .standard) -> Bool {
        defaults.string(forKey: storageKey) != FletcherSheets.tileRevision
    }

    /// Clears the cache, and records the revision only if the clear succeeded.
    ///
    /// Ordering was the other way round at first, to stop a crash mid-sweep
    /// re-wiping a cache the user had just rebuilt. That trade is wrong here:
    /// the tiles being swept are the ones the Rumsey permission does not cover,
    /// so a failed sweep that marks itself done leaves them on disk for good.
    /// Retrying an already-clean sweep costs a cold pan; not retrying costs an
    /// obligation. Returns whether the sweep is now recorded as done.
    @discardableResult
    static func run(
        tileCache: TileCache,
        tileStore: TileStore,
        defaults: UserDefaults = .standard
    ) async -> Bool {
        await run(defaults: defaults) {
            try await tileCache.clearAllCachedTiles()
            try await tileStore.deleteLayer(LayerID.fletcher.rawValue)
        }
    }

    /// The ordering and bookkeeping, with the sweep itself supplied.
    ///
    /// The seam exists so a test can make the sweep fail on demand. Without it
    /// the failure branch is only reachable by contriving a broken filesystem,
    /// and a test that cannot reliably reach it ends up accepting either
    /// outcome — which is no test of the ordering at all.
    @discardableResult
    static func run(
        defaults: UserDefaults = .standard,
        sweep: () async throws -> Void
    ) async -> Bool {
        let target = FletcherSheets.tileRevision
        guard defaults.string(forKey: storageKey) != target else { return true }

        do {
            try await sweep()
        } catch {
            // Left unrecorded on purpose, so the next launch tries again.
            return false
        }

        defaults.set(target, forKey: storageKey)
        return true
    }
}
