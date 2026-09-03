import Foundation

nonisolated struct TileStoreSummary: Equatable, Sendable {
    let totalBytes: Int
    let layerBytes: [String: Int]
    let savedAreaBytes: [String: Int]
}

nonisolated struct TileStoreGenerationSnapshot: Sendable {
    let globalValue: Int
    let layerID: String
    let layerValue: Int
}

nonisolated final class TileStoreWriteGeneration: @unchecked Sendable {
    private let lock = NSLock()
    private var globalValue = 0
    private var layerValues: [String: Int] = [:]

    func snapshot(for layerID: String) -> TileStoreGenerationSnapshot {
        lock.lock()
        defer { lock.unlock() }
        return TileStoreGenerationSnapshot(
            globalValue: globalValue,
            layerID: layerID,
            layerValue: layerValues[layerID, default: 0]
        )
    }

    func advanceAll() {
        lock.lock()
        globalValue += 1
        lock.unlock()
    }

    func advanceLayer(_ layerID: String) {
        lock.lock()
        layerValues[layerID, default: 0] += 1
        lock.unlock()
    }

    func matches(_ snapshot: TileStoreGenerationSnapshot) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return globalValue == snapshot.globalValue
            && layerValues[snapshot.layerID, default: 0] == snapshot.layerValue
    }
}

actor TileStore {
    private struct TileRecord: Codable {
        let coordinate: TileCoordinate
        let layerID: String
        var viewedCache: Bool
        var savedAreaIDs: Set<String>
    }

    private let rootDirectory: URL
    private let fileManager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(
        rootDirectory: URL? = nil,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        if let rootDirectory {
            self.rootDirectory = rootDirectory
        } else {
            // Application Support, not Caches: everything in this store is a
            // saved offline area — the tiles the user asked the app to keep for
            // use with no signal. iOS may purge Caches under disk pressure,
            // which deleted a saved area exactly when it was needed. Excluded
            // from backup because the bytes are re-downloadable, just not from
            // a field with no connectivity.
            let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            var root = support.appendingPathComponent("TileStore", isDirectory: true)

            // One-time migration from the old purgeable home. A same-volume
            // move is a rename, so this is cheap even for a full store; if a
            // partial new store already exists the old one is left untouched
            // rather than merged over it.
            let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            let legacyRoot = caches.appendingPathComponent("TileStore", isDirectory: true)
            if fileManager.fileExists(atPath: legacyRoot.path),
               !fileManager.fileExists(atPath: root.path) {
                try? fileManager.createDirectory(
                    at: support, withIntermediateDirectories: true
                )
                try? fileManager.moveItem(at: legacyRoot, to: root)
            }

            self.rootDirectory = root
        }
        Self.ensureRoot(self.rootDirectory, fileManager)
    }

    /// Creates the store's root if it is not there, and marks it excluded from
    /// backup.
    ///
    /// Called at init and again before any write that would otherwise create
    /// the root as a side effect. The exclusion lives on this one directory,
    /// so a root that is missing when a tile is stored — creation failed once,
    /// or something removed it since — comes back through
    /// `createDirectory(withIntermediateDirectories:)` with default attributes
    /// and takes every saved area after it into iCloud and device backups. The
    /// check is a stat on a directory that almost always exists, not a syscall
    /// per tile.
    ///
    /// Static and nonisolated so `init` can call it: an actor's initializer is
    /// not on the actor yet, and this touches nothing the actor owns.
    private nonisolated static func ensureRoot(_ root: URL, _ fileManager: FileManager) {
        guard !fileManager.fileExists(atPath: root.path) else {
            return
        }
        try? fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        var directory = root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? directory.setResourceValues(values)
    }

    func tile(z: Int, x: Int, y: Int, layerID: String) async -> Data? {
        try? Data(contentsOf: tileURL(z: z, x: x, y: y, layerID: layerID))
    }

    func store(
        _ data: Data,
        z: Int,
        x: Int,
        y: Int,
        layerID: String,
        savedAreaID: String?
    ) async throws {
        try storeTile(data, z: z, x: x, y: y, layerID: layerID, savedAreaID: savedAreaID)
    }

    func store(
        _ data: Data,
        z: Int,
        x: Int,
        y: Int,
        layerID: String,
        savedAreaID: String?,
        ifGenerationMatches snapshot: TileStoreGenerationSnapshot,
        generationTracker: TileStoreWriteGeneration
    ) async throws {
        guard generationTracker.matches(snapshot) else { return }
        try storeTile(data, z: z, x: x, y: y, layerID: layerID, savedAreaID: savedAreaID)
    }

    private func storeTile(
        _ data: Data,
        z: Int,
        x: Int,
        y: Int,
        layerID: String,
        savedAreaID: String?
    ) throws {
        let coordinate = TileCoordinate(z: z, x: x, y: y)
        let tileURL = tileURL(for: coordinate, layerID: layerID)
        let recordURL = recordURL(for: coordinate, layerID: layerID)

        // Before the directories below, which would otherwise bring the root
        // back without its exclusion.
        Self.ensureRoot(rootDirectory, fileManager)
        try fileManager.createDirectory(
            at: tileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try fileManager.createDirectory(
            at: recordURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let hadExistingTile = fileManager.fileExists(atPath: tileURL.path)
        try data.write(to: tileURL, options: .atomic)

        var record = readRecord(at: recordURL) ?? TileRecord(
            coordinate: coordinate,
            layerID: layerID,
            viewedCache: false,
            savedAreaIDs: []
        )

        if let savedAreaID {
            record.savedAreaIDs.insert(savedAreaID)
        } else {
            record.viewedCache = true
        }

        do {
            try writeRecord(record, to: recordURL)
        } catch {
            if !hadExistingTile {
                try? removeIfExists(tileURL)
            }
            throw error
        }
    }

    func summary() async -> TileStoreSummary {
        var totalBytes = 0
        var layerBytes: [String: Int] = [:]
        var savedAreaBytes: [String: Int] = [:]

        // A large area holds up to 100,000 records, and this actor also serves
        // the live map's tile reads. Yielding periodically lets those reads
        // interleave instead of queueing behind the whole walk.
        var visited = 0
        for recordURL in recordFiles() {
            visited += 1
            if visited.isMultiple(of: 512) { await Task.yield() }
            guard let record = readRecord(at: recordURL) else { continue }
            let tileURL = tileURL(for: record.coordinate, layerID: record.layerID)
            guard fileManager.fileExists(atPath: tileURL.path) else { continue }

            let bytes = fileSize(tileURL)
            totalBytes += bytes
            layerBytes[record.layerID, default: 0] += bytes

            for savedAreaID in record.savedAreaIDs {
                savedAreaBytes[savedAreaID, default: 0] += bytes
            }
        }

        return TileStoreSummary(
            totalBytes: totalBytes,
            layerBytes: layerBytes,
            savedAreaBytes: savedAreaBytes
        )
    }

    func deleteAll() async throws {
        // Empty the root rather than remove it. The root directory is what
        // carries `isExcludedFromBackup`, applied in `init`; delete it and the
        // next `storeTile` brings it back through
        // `createDirectory(withIntermediateDirectories:)` with default
        // attributes, so every area downloaded after "Delete Cached Tiles"
        // would ride along into iCloud and device backups until the next
        // launch re-applies the exclusion. Re-applying it per tile instead is
        // a syscall on each of up to 100,000 writes.
        // Records first. A record says which saved areas a tile belongs to,
        // and it is the authority: if removing the bytes succeeded and this
        // failed, a later download of the same coordinate would read the stale
        // record and count the new tile into an area whose tiles are gone.
        // Losing the record and keeping the bytes is the cheaper way round —
        // the bytes are then unreferenced and the next summary or clear takes
        // them.
        try removeIfExists(rootDirectory
            .appendingPathComponent("records", isDirectory: true))
        try removeIfExists(rootDirectory
            .appendingPathComponent("tiles", isDirectory: true))
    }

    func deleteLayer(_ layerID: String) async throws {
        let layerPath = pathComponent(for: layerID)
        try removeIfExists(rootDirectory
            .appendingPathComponent("tiles", isDirectory: true)
            .appendingPathComponent(layerPath, isDirectory: true))
        try removeIfExists(rootDirectory
            .appendingPathComponent("records", isDirectory: true)
            .appendingPathComponent(layerPath, isDirectory: true))
    }

    func deleteSavedArea(_ savedAreaID: String) async throws {
        // Same cooperative walk as `summary()`, for the same reason.
        var visited = 0
        for recordURL in recordFiles() {
            visited += 1
            if visited.isMultiple(of: 512) { await Task.yield() }
            guard var record = readRecord(at: recordURL),
                  record.savedAreaIDs.contains(savedAreaID) else { continue }

            record.savedAreaIDs.remove(savedAreaID)
            let tileURL = tileURL(for: record.coordinate, layerID: record.layerID)

            if record.viewedCache || !record.savedAreaIDs.isEmpty {
                try writeRecord(record, to: recordURL)
            } else {
                try removeIfExists(tileURL)
                try removeIfExists(recordURL)
            }
        }
    }

    private func tileURL(z: Int, x: Int, y: Int, layerID: String) -> URL {
        tileURL(for: TileCoordinate(z: z, x: x, y: y), layerID: layerID)
    }

    private func tileURL(for coordinate: TileCoordinate, layerID: String) -> URL {
        rootDirectory
            .appendingPathComponent("tiles", isDirectory: true)
            .appendingPathComponent(pathComponent(for: layerID), isDirectory: true)
            .appendingPathComponent("\(coordinate.z)", isDirectory: true)
            .appendingPathComponent("\(coordinate.x)", isDirectory: true)
            .appendingPathComponent("\(coordinate.y).png")
    }

    private func recordURL(for coordinate: TileCoordinate, layerID: String) -> URL {
        rootDirectory
            .appendingPathComponent("records", isDirectory: true)
            .appendingPathComponent(pathComponent(for: layerID), isDirectory: true)
            .appendingPathComponent("\(coordinate.z)", isDirectory: true)
            .appendingPathComponent("\(coordinate.x)", isDirectory: true)
            .appendingPathComponent("\(coordinate.y).json")
    }

    private func recordFiles() -> [URL] {
        files(
            under: rootDirectory.appendingPathComponent("records", isDirectory: true),
            pathExtension: "json"
        )
    }

    private func files(under directory: URL, pathExtension: String) -> [URL] {
        guard let enumerator = fileManager.enumerator(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        return enumerator
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == pathExtension }
    }

    private func readRecord(at url: URL) -> TileRecord? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(TileRecord.self, from: data)
    }

    private func writeRecord(_ record: TileRecord, to url: URL) throws {
        let data = try encoder.encode(record)
        try data.write(to: url, options: .atomic)
    }

    private func fileSize(_ url: URL) -> Int {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        return values?.fileSize ?? 0
    }

    private func removeIfExists(_ url: URL) throws {
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }

    private func pathComponent(for value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}
