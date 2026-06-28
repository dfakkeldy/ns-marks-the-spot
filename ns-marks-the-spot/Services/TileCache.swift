import Foundation

struct TileCacheDiskSummary: Equatable {
    let totalBytes: Int
    let layerBytes: [String: Int]
}

private final class TileCacheKeyIndex: @unchecked Sendable {
    private let lock = NSLock()
    private var keysByLayer: [String: Set<String>] = [:]

    func insert(_ key: String, for layerName: String) {
        lock.lock()
        keysByLayer[layerName, default: []].insert(key)
        lock.unlock()
    }

    func removeLayer(_ layerName: String) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return Array(keysByLayer.removeValue(forKey: layerName) ?? [])
    }

    func removeAll() {
        lock.lock()
        keysByLayer.removeAll()
        lock.unlock()
    }
}

/// Thread-safe tile cache shared across the main actor (UI) and MapKit's
/// off-main tile-loading queue, which may invoke it concurrently.
///
/// `@unchecked Sendable` is justified because the type holds no unsynchronized
/// Swift-managed mutable state:
/// - `memoryCache` (`NSCache`) synchronizes its own reads and writes.
/// - `fileManager` (`FileManager`) is thread-safe for the operations used here.
/// - `diskQueue` serializes all disk *writes*.
/// - `stateLock` makes generation checks, memory-cache mutations, and
///   layer key tracking atomic relative to cache clears.
/// - `writeGeneration` synchronizes the cache generation used to invalidate queued
///   disk writes, pending TileStore mirror tasks, and in-flight disk reads when
///   all cached tiles are cleared or a single layer is deleted.
/// - `keyIndex` tracks per-layer memory keys behind a lock so layer-scoped
///   eviction can avoid clearing unrelated hot entries.
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
    private let writeGeneration = TileStoreWriteGeneration()
    private let keyIndex = TileCacheKeyIndex()

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

        stateLock.lock()
        if let memoryData = memoryCache.object(forKey: key as NSString) {
            stateLock.unlock()
            return memoryData as Data
        }

        let generation = currentGeneration(for: layerName)
        stateLock.unlock()

        let diskURL = diskURLFor(key: key)
        guard fileManager.fileExists(atPath: diskURL.path) else { return nil }

        guard let diskData = try? Data(contentsOf: diskURL) else { return nil }

        stateLock.lock()
        defer { stateLock.unlock() }

        let currentGeneration = currentGeneration(for: layerName)
        guard generation.globalValue == currentGeneration.globalValue,
              generation.layerID == currentGeneration.layerID,
              generation.layerValue == currentGeneration.layerValue else {
            return nil
        }

        keyIndex.insert(key, for: layerName)
        memoryCache.setObject(diskData as NSData, forKey: key as NSString)
        return diskData
    }

    func cacheTile(_ data: Data, z: Int, x: Int, y: Int, layerName: String) {
        let key = cacheKey(z: z, x: x, y: y, layerName: layerName)

        stateLock.lock()
        let generation = currentGeneration(for: layerName)

        keyIndex.insert(key, for: layerName)
        memoryCache.setObject(data as NSData, forKey: key as NSString)
        stateLock.unlock()

        if let tileStore {
            Task { [weak self, data] in
                guard let self else { return }
                try? await tileStore.store(
                    data,
                    z: z,
                    x: x,
                    y: y,
                    layerID: layerName,
                    savedAreaID: nil,
                    ifGenerationMatches: generation,
                    generationTracker: self.writeGeneration
                )
            }
        }

        let url = diskURLFor(key: key)
        diskQueue.async { [weak self] in
            guard let self else { return }
            let currentGeneration = self.currentGeneration(for: layerName)
            guard generation.globalValue == currentGeneration.globalValue,
                  generation.layerID == currentGeneration.layerID,
                  generation.layerValue == currentGeneration.layerValue else {
                return
            }
            let dir = url.deletingLastPathComponent()
            try? self.fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }

    func clearDiskCache() async {
        try? await clearDiskStorage(at: diskRoot)
    }

    func diskSummary() async -> TileCacheDiskSummary {
        await withCheckedContinuation { continuation in
            diskQueue.async { [diskRoot] in
                let fileManager = FileManager.default
                guard fileManager.fileExists(atPath: diskRoot.path) else {
                    continuation.resume(returning: TileCacheDiskSummary(totalBytes: 0, layerBytes: [:]))
                    return
                }

                let rootComponentCount = diskRoot.pathComponents.count
                guard let enumerator = fileManager.enumerator(
                    at: diskRoot,
                    includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey],
                    options: [.skipsHiddenFiles]
                ) else {
                    continuation.resume(returning: TileCacheDiskSummary(totalBytes: 0, layerBytes: [:]))
                    return
                }

                var totalBytes = 0
                var layerBytes: [String: Int] = [:]

                for case let fileURL as URL in enumerator {
                    let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    guard values?.isRegularFile == true else { continue }

                    let bytes = values?.fileSize ?? 0
                    totalBytes += bytes

                    let components = fileURL.pathComponents
                    guard components.count > rootComponentCount else { continue }
                    let layerName = components[rootComponentCount]
                    layerBytes[layerName, default: 0] += bytes
                }

                continuation.resume(
                    returning: TileCacheDiskSummary(totalBytes: totalBytes, layerBytes: layerBytes)
                )
            }
        }
    }

    func clearLayer(named layerName: String) async throws {
        stateLock.lock()
        bumpGeneration(for: layerName)
        evictMemoryCache(for: layerName)
        stateLock.unlock()

        try await clearDiskStorage(at: diskRoot.appendingPathComponent(layerName, isDirectory: true))

        stateLock.lock()
        evictMemoryCache(for: layerName)
        stateLock.unlock()
    }

    func clearAllCachedTiles() async throws {
        stateLock.lock()
        bumpGeneration()
        memoryCache.removeAllObjects()
        keyIndex.removeAll()
        stateLock.unlock()

        try await clearDiskStorage(at: diskRoot)

        stateLock.lock()
        memoryCache.removeAllObjects()
        keyIndex.removeAll()
        stateLock.unlock()
    }

    private func cacheKey(z: Int, x: Int, y: Int, layerName: String) -> String {
        "\(layerName)/\(z)/\(x)/\(y)"
    }

    private func diskURLFor(key: String) -> URL {
        diskRoot.appendingPathComponent("\(key).png")
    }

    private func clearDiskStorage(at url: URL) async throws {
        try await withCheckedThrowingContinuation { continuation in
            diskQueue.async {
                let fileManager = FileManager.default

                guard fileManager.fileExists(atPath: url.path) else {
                    continuation.resume()
                    return
                }

                do {
                    try fileManager.removeItem(at: url)
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func evictMemoryCache(for layerName: String) {
        for key in keyIndex.removeLayer(layerName) {
            memoryCache.removeObject(forKey: key as NSString)
        }
    }

    private func currentGeneration(for layerName: String) -> TileStoreGenerationSnapshot {
        writeGeneration.snapshot(for: layerName)
    }

    private func bumpGeneration() {
        writeGeneration.advanceAll()
    }

    private func bumpGeneration(for layerName: String) {
        writeGeneration.advanceLayer(layerName)
    }
}
