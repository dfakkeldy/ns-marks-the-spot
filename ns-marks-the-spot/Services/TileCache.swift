import Foundation

struct TileCacheDiskSummary: Equatable {
    let totalBytes: Int
    let layerBytes: [String: Int]
}

enum TileCacheStoragePolicy {
    case memoryAndDisk
    case memoryOnly
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
///   disk writes and in-flight disk reads when all cached tiles are cleared or a
///   single layer is deleted.
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
    private struct DiskEntry {
        let url: URL
        let key: String
        let bytes: Int
        let lastModified: Date
    }

    private static let defaultMaxDiskBytes = 256 * 1024 * 1024

    private let memoryCache = NSCache<NSString, NSData>()
    private let diskQueue = DispatchQueue(label: "dev.dfakkeldy.ns-marks-the-spot.tilecache")
    private let fileManager = FileManager.default
    private let diskRoot: URL
    private let maxDiskBytes: Int?
    private let stateLock = NSLock()
    private let writeGeneration = TileStoreWriteGeneration()
    private let keyIndex = TileCacheKeyIndex()

    init(
        tileStore: TileStore? = nil,
        diskRoot: URL? = nil,
        maxDiskBytes: Int? = TileCache.defaultMaxDiskBytes
    ) {
        _ = tileStore
        self.maxDiskBytes = maxDiskBytes
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

    func cacheTile(
        _ data: Data,
        z: Int,
        x: Int,
        y: Int,
        layerName: String,
        storagePolicy: TileCacheStoragePolicy = .memoryAndDisk
    ) {
        let key = cacheKey(z: z, x: x, y: y, layerName: layerName)

        stateLock.lock()
        let generation = currentGeneration(for: layerName)

        keyIndex.insert(key, for: layerName)
        memoryCache.setObject(data as NSData, forKey: key as NSString)
        stateLock.unlock()

        guard storagePolicy == .memoryAndDisk else { return }

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
            self.enforceDiskLimit()
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
        prepareLayerClear(named: layerName)

        try await clearDiskStorage(at: diskRoot.appendingPathComponent(layerName, isDirectory: true))

        finishLayerClear(named: layerName)
    }

    func clearAllCachedTiles() async throws {
        prepareClearAll()

        try await clearDiskStorage(at: diskRoot)

        finishClearAll()
    }

    private func prepareLayerClear(named layerName: String) {
        stateLock.lock()
        bumpGeneration(for: layerName)
        evictMemoryCache(for: layerName)
        stateLock.unlock()
    }

    private func finishLayerClear(named layerName: String) {
        stateLock.lock()
        evictMemoryCache(for: layerName)
        stateLock.unlock()
    }

    private func prepareClearAll() {
        stateLock.lock()
        bumpGeneration()
        memoryCache.removeAllObjects()
        keyIndex.removeAll()
        stateLock.unlock()
    }

    private func finishClearAll() {
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

    private func enforceDiskLimit() {
        guard let maxDiskBytes, maxDiskBytes > 0 else { return }
        guard var totalBytesAndEntries = diskEntries(), totalBytesAndEntries.totalBytes > maxDiskBytes else {
            return
        }

        for entry in totalBytesAndEntries.entries.sorted(by: { $0.lastModified < $1.lastModified }) {
            try? fileManager.removeItem(at: entry.url)
            stateLock.lock()
            memoryCache.removeObject(forKey: entry.key as NSString)
            stateLock.unlock()

            totalBytesAndEntries.totalBytes -= entry.bytes
            if totalBytesAndEntries.totalBytes <= maxDiskBytes {
                break
            }
        }
    }

    private func diskEntries() -> (totalBytes: Int, entries: [DiskEntry])? {
        guard fileManager.fileExists(atPath: diskRoot.path) else {
            return (0, [])
        }

        guard let enumerator = fileManager.enumerator(
            at: diskRoot,
            includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }

        var totalBytes = 0
        var entries: [DiskEntry] = []

        for case let fileURL as URL in enumerator {
            let values = try? fileURL.resourceValues(
                forKeys: [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
            )
            guard values?.isRegularFile == true,
                  let key = cacheKey(forDiskURL: fileURL) else {
                continue
            }

            let bytes = values?.fileSize ?? 0
            totalBytes += bytes
            entries.append(
                DiskEntry(
                    url: fileURL,
                    key: key,
                    bytes: bytes,
                    lastModified: values?.contentModificationDate ?? .distantPast
                )
            )
        }

        return (totalBytes, entries)
    }

    private func cacheKey(forDiskURL url: URL) -> String? {
        let rootPath = diskRoot.standardizedFileURL.path
        let filePath = url.standardizedFileURL.path
        guard filePath.hasPrefix(rootPath + "/"),
              filePath.hasSuffix(".png") else {
            return nil
        }

        let relativeStart = filePath.index(filePath.startIndex, offsetBy: rootPath.count + 1)
        let withoutExtension = filePath[..<filePath.index(filePath.endIndex, offsetBy: -4)]
        return String(withoutExtension[relativeStart...])
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
