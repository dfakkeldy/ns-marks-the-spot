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
/// Every mutation re-reads the document inside the actor and writes back what
/// it read plus the one change. Taking a snapshot from a caller and writing it
/// whole would mean an import that started before an edit finished could put
/// the edited layer back the way it was, or drop it — the caller's snapshot is
/// always older than the disk by however long its own `await` took.
///
/// Nothing here leaves the device. An imported survey, and anything the user
/// draws over it, is their own research; no part of this store has a network
/// path.
actor UserVectorStore {
    /// The one store this process uses.
    ///
    /// Shared rather than one per view, because the serialization above is only
    /// worth anything if every writer goes through the same actor. Two scenes
    /// on an iPad, each with its own store, would race on the same file.
    static let shared = UserVectorStore()

    /// Why the library could not be read or written.
    enum StoreRefusal: Error, Equatable {
        /// A document written by a newer build. Refused rather than read, and
        /// deliberately not overwritten.
        case fromALaterVersion(Int)
        /// The document is there and is not a library.
        case unreadable
        /// A record with no geometry file, or one that will not parse.
        case geometryMissing(String)
        /// The layer this operation names is not in the library any more.
        case noSuchLayer(String)
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

    private func originalURL(for id: String) -> URL {
        precondition(!id.contains("/") && !id.contains(".."), "a record id is not a path")
        return directory.appendingPathComponent("\(id).original")
    }

    private func geometryURL(for id: String) -> URL {
        // The id is ours — a UUID string — and never a name the user typed, so
        // it cannot walk out of this directory. Checked anyway, because the day
        // someone lets a layer name in through here is the day this comment
        // stops being true.
        precondition(!id.contains("/") && !id.contains(".."), "a record id is not a path")
        return directory.appendingPathComponent("\(id).geojson")
    }

    /// The library as it is on disk right now, and the orphans swept.
    ///
    /// The sweep runs here and only here, on a document this build understood:
    /// after an unreadable or later-version library the records are unknown, and
    /// deleting every geometry file "no record claims" would delete them all.
    func load() throws -> UserVectorLibrary {
        let library = try read()
        try? sweepOrphanedGeometry(keeping: library.layers)
        return library
    }

    /// Just the format number, read on its own before anything else — the
    /// hardening `UserMapStore` gained, ported so the twin stores agree.
    ///
    /// A newer build is free to change what a record looks like, and then this
    /// build's decode of the whole document fails on the records rather than
    /// on the version. Read in that order the two cases are indistinguishable,
    /// and they call for opposite things: a later version's document must be
    /// left exactly as it is, while a damaged one must not lock the user out
    /// for good. The version is the one field that is promised never to move.
    private struct LibraryStamp: Decodable {
        var version: Int
    }

    /// Reads without sweeping. Every mutation starts here, so what it writes
    /// back is the document as it actually is rather than as its caller last
    /// saw it.
    private func read() throws -> UserVectorLibrary {
        guard fileManager.fileExists(atPath: libraryURL.path) else {
            return UserVectorLibrary(layers: [])
        }
        let data = try Data(contentsOf: libraryURL)
        guard let stamp = try? decoder.decode(LibraryStamp.self, from: data) else {
            throw StoreRefusal.unreadable
        }
        // Below the first version is not a document from the future, it is a
        // document with a nonsense version in it. Reading the two the same way
        // would seal the library for good over what is only damage.
        guard stamp.version >= 1 else { throw StoreRefusal.unreadable }
        guard stamp.version <= UserVectorLibrary.currentVersion else {
            throw StoreRefusal.fromALaterVersion(stamp.version)
        }
        let library: UserVectorLibrary
        do {
            library = try decoder.decode(UserVectorLibrary.self, from: data)
        } catch {
            throw StoreRefusal.unreadable
        }
        return library
    }

    private func write(_ library: UserVectorLibrary) throws {
        // Stamped with this build's version, not the one the document was
        // read with. Every mutation re-reads and writes back, so without the
        // stamp a library created at version 1 stays version 1 forever even
        // once it holds records only version 2 defines — and an old build
        // that then opens it decodes garbage instead of refusing cleanly.
        var stamped = library
        stamped.version = UserVectorLibrary.currentVersion
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try encoder.encode(stamped)
        try data.write(to: libraryURL, options: .atomic)
    }

    /// Adds a layer, geometry first.
    ///
    /// Geometry first because the failure that leaves a record pointing at a
    /// file that is not there is the one the panel cannot recover from; the
    /// other way round leaves an orphan the next sweep collects.
    func add(
        _ record: UserVectorLayerRecord,
        geometry: ParsedVector,
        original: Data? = nil
    ) throws -> UserVectorLibrary {
        try writeGeometry(geometry, id: record.id)
        if let original, let originalFileID = record.originalFileID {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            // Written once per file, not once per layer: several layers out of
            // one archive share the copy, and writing it again for each would
            // store the same shapefile zip three times.
            let url = originalURL(for: originalFileID)
            if !fileManager.fileExists(atPath: url.path) {
                try original.write(to: url, options: .atomic)
            }
        }
        var library = try read()
        library.layers.append(record)
        try write(library)
        return library
    }

    /// Replaces a layer's features and advances its revision in one operation.
    ///
    /// One operation because the two are one fact. Writing the geometry and
    /// then failing to record the revision would leave the new shape on disk
    /// under a record that still describes the old one — a layer whose feature
    /// count, extent and modified date all disagree with what it draws.
    func replaceGeometry(
        id: String, with parsed: ParsedVector, now: Date
    ) throws -> UserVectorLibrary {
        var library = try read()
        guard let index = library.layers.firstIndex(where: { $0.id == id }) else {
            throw StoreRefusal.noSuchLayer(id)
        }
        try writeGeometry(parsed, id: id)
        library.layers[index].revision += 1
        library.layers[index].modifiedAt = now
        library.layers[index].featureCount = parsed.featureCount
        library.layers[index].bbox = parsed.bbox
        try write(library)
        return library
    }

    func rename(id: String, to name: String) throws -> UserVectorLibrary {
        var library = try read()
        guard let index = library.layers.firstIndex(where: { $0.id == id }) else {
            throw StoreRefusal.noSuchLayer(id)
        }
        library.layers[index].name = name
        try write(library)
        return library
    }

    func setVisible(_ isVisible: Bool, id: String) throws -> UserVectorLibrary {
        var library = try read()
        var hidden = Set(library.hiddenLayerIDs)
        if isVisible {
            hidden.remove(id)
        } else {
            hidden.insert(id)
        }
        library.hiddenLayerIDs = hidden.sorted()
        try write(library)
        return library
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

    /// The bytes the user imported, if this build still has them.
    ///
    /// Nil rather than an error: a library written before originals were kept
    /// has none, and a layer that came from no file never had one.
    func original(fileID: String) -> Data? {
        try? Data(contentsOf: originalURL(for: fileID))
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
    func delete(id: String) throws -> UserVectorLibrary {
        var library = try read()
        library.layers.removeAll { $0.id == id }
        library.hiddenLayerIDs.removeAll { $0 == id }
        try write(library)
        try? fileManager.removeItem(at: geometryURL(for: id))
        // The original stays until the last layer sharing it is gone, which the
        // sweep decides on the next load.
        try? sweepOrphanedGeometry(keeping: library.layers)
        return library
    }

    /// Deletes geometry files no record claims.
    ///
    /// Reachable state, not a theoretical one: a delete interrupted between the
    /// two steps above, or an add whose library write failed after its geometry
    /// was written. Without this the orphans are invisible and permanent.
    func sweepOrphanedGeometry(keeping layers: [UserVectorLayerRecord]) throws {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ) else { return }
        let keptGeometry = Set(layers.map(\.id))
        // Originals are shared, so one is orphaned only when the last layer
        // that came out of it is gone.
        let keptOriginals = Set(layers.compactMap(\.originalFileID))
        for file in files {
            let name = file.deletingPathExtension().lastPathComponent
            switch file.pathExtension {
            case "geojson":
                if !keptGeometry.contains(name) { try? fileManager.removeItem(at: file) }
            case "original":
                if !keptOriginals.contains(name) { try? fileManager.removeItem(at: file) }
            default:
                break
            }
        }
    }
}
