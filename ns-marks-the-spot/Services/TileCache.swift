import Foundation

/// Thread-safe tile cache shared across the main actor (UI) and MapKit's
/// off-main tile-loading queue, which may invoke it concurrently.
///
/// `@unchecked Sendable` is justified because the type holds no unsynchronized
/// Swift-managed mutable state:
/// - `memoryCache` (`NSCache`) synchronizes its own reads and writes.
/// - `fileManager` (`FileManager`) is thread-safe for the operations used here.
/// - `diskQueue` serializes all disk *writes*.
/// - `stateLock` synchronizes the cache generation used to invalidate queued
///   disk writes, pending TileStore mirror tasks, and in-flight disk reads when
///   all cached tiles are cleared.
///
/// Disk *reads* in `cachedTile` intentionally bypass `diskQueue` for latency.
/// This is safe because writes use `.atomic` — a concurrent reader sees either
/// the complete previous file or the complete new one, never a torn write — and
/// any read failure is tolerated via `try?`, degrading to a benign cache miss
/// and re-fetch. `NSCache`/`FileManager` aren't SDK-marked `Sendable`, so the
/// guarantee is asserted via `@unchecked`.
final class TileCache: @unchecked Sendable {
    private let memoryCache = NSCache<NSString, NSData>()
    private let diskQueue = DispatchQueue(label: "dev.dfakkeldy.ns-marks-the-spot.tilecache")
    private let fileManager = FileManager.default
    private let tileStore: TileStore?
    private let diskRoot: URL
    private let stateLock = NSLock()
    private var cacheGeneration = 0

    init(tileStore: TileStore? = nil, diskRoot: URL? = nil) {
        self.tileStore = tileStore
        if let diskRoot {
            self.diskRoot = diskRoot
        } else {
            let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
            self.diskRoot = caches.appendingPathComponent("Tiles", isDirectory: true)
        }
    }

    func cachedTile(z: Int, x: Int, y: Int, layerName: String) -> Data? {
        let key = cacheKey(z: z, x: x, y: y, layerName: layerName)

        if let memoryData = memoryCache.object(forKey: key as NSString) {
            return memoryData as Data
        }

        let diskURL = diskURLFor(key: key)
        guard fileManager.fileExists(atPath: diskURL.path) else { return nil }

        let generation = currentGeneration()
        guard let diskData = try? Data(contentsOf: diskURL) else { return nil }
        guard generation == currentGeneration() else { return nil }

        memoryCache.setObject(diskData as NSData, forKey: key as NSString)
        return diskData
    }

    func cacheTile(_ data: Data, z: Int, x: Int, y: Int, layerName: String) {
        let key = cacheKey(z: z, x: x, y: y, layerName: layerName)
        let generation = currentGeneration()

        memoryCache.setObject(data as NSData, forKey: key as NSString)

        if let tileStore {
            Task { [weak self, data] in
                guard let self else { return }
                guard generation == self.currentGeneration() else { return }
                try? await tileStore.store(
                    data,
                    z: z,
                    x: x,
                    y: y,
                    layerID: layerName,
                    savedAreaID: nil
                )
            }
        }

        let url = diskURLFor(key: key)
        diskQueue.async { [weak self] in
            guard let self else { return }
            guard generation == self.currentGeneration() else { return }
            let dir = url.deletingLastPathComponent()
            try? self.fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }

    func clearDiskCache() {
        clearDiskStorage()
    }

    func clearAllCachedTiles() {
        bumpGeneration()
        memoryCache.removeAllObjects()
        clearDiskStorage()
        memoryCache.removeAllObjects()
    }

    private func cacheKey(z: Int, x: Int, y: Int, layerName: String) -> String {
        "\(layerName)/\(z)/\(x)/\(y)"
    }

    private func diskURLFor(key: String) -> URL {
        diskRoot.appendingPathComponent("\(key).png")
    }

    private func clearDiskStorage() {
        diskQueue.sync { [fileManager, diskRoot] in
            try? fileManager.removeItem(at: diskRoot)
        }
    }

    private func currentGeneration() -> Int {
        stateLock.lock()
        defer { stateLock.unlock() }
        return cacheGeneration
    }

    private func bumpGeneration() {
        stateLock.lock()
        cacheGeneration += 1
        stateLock.unlock()
    }
}
