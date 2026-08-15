import Foundation
import GeoCore

/// Where the user's own vector layers live on this device.
///
/// The same shape as `UserMapStore`, for the same reason: one small JSON
/// document holding every record, rewritten whole whenever anything changes,
/// and one geometry file per layer, written only when that layer's features
/// change. A library that carried its geometry would rewrite ten thousand
/// features every time a visibility switch moved.
///
/// Nothing here leaves the device. An imported survey, and anything the user
/// draws over it, is their own research; no part of this store has a network
/// path.
actor UserVectorStore {
    /// Why the library could not be read or written.
    enum StoreRefusal: Error, Equatable {
        /// A document written by a newer build. Refused rather than read, and
        /// deliberately not overwritten.
        case fromALaterVersion(Int)
        /// The document is there and is not a library.
        case unreadable
        /// A record with no geometry file, or one that will not parse.
        case geometryMissing(String)
    }

    private let directory: URL
    private let fileManager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(directory: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        if let directory {
            self.directory = directory
        } else {
            let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            )[0]
            self.directory = applicationSupport.appendingPathComponent(
                "UserVectors", isDirectory: true
            )
        }
        encoder.outputFormatting = [.sortedKeys]
    }

    private var libraryURL: URL {
        directory.appendingPathComponent("library.json")
    }

    private func geometryURL(for id: String) -> URL {
        // The id is ours — a UUID string — and never a name the user typed, so
        // it cannot walk out of this directory. Checked anyway, because the day
        // someone lets a layer name in through here is the day this comment
        // stops being true.
        precondition(!id.contains("/") && !id.contains(".."), "a record id is not a path")
        return directory.appendingPathComponent("\(id).geojson")
    }

    func load() throws -> [UserVectorLayerRecord] {
        guard fileManager.fileExists(atPath: libraryURL.path) else { return [] }
        let data = try Data(contentsOf: libraryURL)
        let library: UserVectorLibrary
        do {
            library = try decoder.decode(UserVectorLibrary.self, from: data)
        } catch {
            throw StoreRefusal.unreadable
        }
        guard library.isReadable else {
            throw StoreRefusal.fromALaterVersion(library.version)
        }
        return library.layers
    }

    func save(_ layers: [UserVectorLayerRecord]) throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try encoder.encode(UserVectorLibrary(layers: layers))
        try data.write(to: libraryURL, options: .atomic)
    }

    /// Stores a layer's features, as GeoJSON.
    ///
    /// GeoJSON rather than a private encoding because it is already the
    /// canonical in-app format, and because a user whose device is failing can
    /// pull these files out of a backup and open them in anything.
    func writeGeometry(_ parsed: ParsedVector, id: String) throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try VectorExport.geoJson(parsed).write(to: geometryURL(for: id), options: .atomic)
    }

    func geometry(id: String) throws -> ParsedVector {
        guard let data = try? Data(contentsOf: geometryURL(for: id)),
              let parsed = try? UserVectorParse.parseGeoJson(data)
        else { throw StoreRefusal.geometryMissing(id) }
        return parsed
    }

    /// Removes a layer and its geometry together.
    ///
    /// The record goes first. A geometry file left behind is wasted space the
    /// next sweep can find; a record left pointing at a deleted file is a row
    /// in the panel that can never draw.
    func delete(
        id: String, from layers: [UserVectorLayerRecord]
    ) throws -> [UserVectorLayerRecord] {
        let remaining = layers.filter { $0.id != id }
        try save(remaining)
        try? fileManager.removeItem(at: geometryURL(for: id))
        return remaining
    }

    /// Deletes geometry files no record claims.
    ///
    /// Reachable state, not a theoretical one: a delete interrupted between the
    /// two steps above, or a save that failed after its geometry was written.
    /// Without this the orphans are invisible and permanent.
    func sweepOrphanedGeometry(keeping layers: [UserVectorLayerRecord]) throws {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ) else { return }
        let kept = Set(layers.map(\.id))
        for file in files where file.pathExtension == "geojson" {
            if !kept.contains(file.deletingPathExtension().lastPathComponent) {
                try? fileManager.removeItem(at: file)
            }
        }
    }
}
