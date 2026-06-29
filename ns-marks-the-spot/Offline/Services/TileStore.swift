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
            let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            self.rootDirectory = caches.appendingPathComponent("TileStore", isDirectory: true)
        }
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

        for recordURL in recordFiles() {
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
        guard fileManager.fileExists(atPath: rootDirectory.path) else { return }
        try fileManager.removeItem(at: rootDirectory)
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
        for recordURL in recordFiles() {
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
