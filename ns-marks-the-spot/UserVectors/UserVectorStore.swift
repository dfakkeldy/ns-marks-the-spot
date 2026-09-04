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

    // MARK: - Photos

    /// Photo bytes live as plain files under the store directory:
    /// `photos/<layerID>/<photoID>.jpg` plus `<photoID>.thumb.jpg`. Files
    /// rather than rows because the bytes are already their own format, and
    /// a user whose device is failing can pull them out of a backup and open
    /// them in anything — the same reasoning as the GeoJSON geometry files.
    /// The feature's `nsmts:photos` descriptors are the only authority on
    /// attachment; these files are just the bytes they point at.
    private func photosDirectory(for layerID: String) -> URL {
        precondition(
            !layerID.contains("/") && !layerID.contains(".."), "a record id is not a path"
        )
        return directory
            .appendingPathComponent("photos", isDirectory: true)
            .appendingPathComponent(layerID, isDirectory: true)
    }

    private func photoURL(layerID: String, photoID: String, thumb: Bool) -> URL {
        precondition(
            !photoID.contains("/") && !photoID.contains(".."), "a photo id is not a path"
        )
        return photosDirectory(for: layerID)
            .appendingPathComponent("\(photoID)\(thumb ? ".thumb" : "").jpg")
    }

    /// Both renditions in one call, full first: a thumb without its full
    /// image is a preview of nothing, while the sweep collects the other
    /// order's leftovers.
    func addPhoto(layerID: String, photoID: String, full: Data, thumb: Data) throws {
        try fileManager.createDirectory(
            at: photosDirectory(for: layerID), withIntermediateDirectories: true
        )
        do {
            try full.write(
                to: photoURL(layerID: layerID, photoID: photoID, thumb: false), options: .atomic
            )
            try thumb.write(
                to: photoURL(layerID: layerID, photoID: photoID, thumb: true), options: .atomic
            )
        } catch {
            // Nothing half-written survives a throw. A disk that fills between
            // the two writes leaves a full-size JPEG no descriptor will ever
            // name, and the only sweep that collects a stray file inside a
            // claimed layer's directory runs from `replaceGeometry` — so those
            // bytes would sit there until the reader happened to edit that
            // layer, which may be never. The caller is told the photo did not
            // land, and after this that is the whole truth.
            deletePhoto(layerID: layerID, photoID: photoID)
            throw error
        }
    }

    func photoData(layerID: String, photoID: String, thumb: Bool) -> Data? {
        try? Data(contentsOf: photoURL(layerID: layerID, photoID: photoID, thumb: thumb))
    }

    func deletePhoto(layerID: String, photoID: String) {
        try? fileManager.removeItem(
            at: photoURL(layerID: layerID, photoID: photoID, thumb: false)
        )
        try? fileManager.removeItem(
            at: photoURL(layerID: layerID, photoID: photoID, thumb: true)
        )
    }

    /// How many photos the layer holds on disk — the per-layer cap's
    /// denominator. Thumbs are the same photo, not a second one.
    func photoCount(layerID: String) -> Int {
        guard let files = try? fileManager.contentsOfDirectory(
            at: photosDirectory(for: layerID), includingPropertiesForKeys: nil
        ) else { return 0 }
        return files.filter {
            $0.pathExtension == "jpg" && !$0.lastPathComponent.hasSuffix(".thumb.jpg")
        }.count
    }

    /// Deletes photo files no descriptor in the layer's geometry references.
    ///
    /// Reachable state: a photo attached and then removed by an edit that
    /// only patched the descriptor, or a re-link interrupted between file
    /// writes and the library write. Run beside every geometry replace, so
    /// the files always converge on what the features claim.
    /// Photo files written ahead of the feature that will reference them.
    /// The sweep keeps them until a write references them, so a write of an
    /// older working copy cannot take a photo that is still being attached.
    private var reservedPhotoIDs: Set<String> = []

    func reservePhoto(id: String) {
        reservedPhotoIDs.insert(id)
    }

    func releasePhoto(id: String) {
        reservedPhotoIDs.remove(id)
    }

    /// Layers whose photo files are being written before the library holds a
    /// record for them. `sweepOrphanedGeometry` removes a photo directory that
    /// no record claims — which is right for a delete interrupted halfway, and
    /// wrong for an import still in flight: a bulk placement writes up to 500
    /// photos before its `add`, and any `delete` or `load` in that window would
    /// otherwise take the directory out from underneath it and leave the
    /// geometry pointing at bytes that are gone.
    private var reservedLayerIDs: Set<String> = []

    func reserveLayer(id: String) {
        reservedLayerIDs.insert(id)
    }

    func releaseLayer(id: String) {
        reservedLayerIDs.remove(id)
    }

    private func sweepOrphanedPhotos(layerID: String, keeping parsed: ParsedVector) {
        guard let files = try? fileManager.contentsOfDirectory(
            at: photosDirectory(for: layerID), includingPropertiesForKeys: nil
        ) else { return }
        var referenced = Set<String>()
        for feature in parsed.features {
            for descriptor in PhotoDescriptor.read(from: feature.properties) {
                referenced.insert(descriptor.id)
            }
        }
        // Referenced now, so no longer in need of a reservation.
        reservedPhotoIDs.subtract(referenced)
        for file in files where file.pathExtension == "jpg" {
            var name = file.deletingPathExtension().lastPathComponent
            if name.hasSuffix(".thumb") {
                name = String(name.dropLast(".thumb".count))
            }
            if !referenced.contains(name), !reservedPhotoIDs.contains(name) {
                try? fileManager.removeItem(at: file)
            }
        }
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
        // The library first: a document this build cannot read refuses here,
        // before a geometry file and an original are written beside it for
        // nothing.
        var library = try read()
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
        library.layers.append(record)
        try write(library)
        return library
    }

    /// Moves a library this build should have been able to read out of the
    /// way, so a new one can start. Never for a later version's document,
    /// which a newer build is coming back for; only for one that is damaged
    /// at this build's own version. Nothing is deleted: the directory moves
    /// whole, geometry and photos with it, to a `-damaged` sibling.
    ///
    /// Answers whether the damaged library is out of the way, which a call
    /// that found nothing left to move has achieved as much as one that
    /// moved it.
    @discardableResult
    func setAsideDamagedLibrary() throws -> Bool {
        guard fileManager.fileExists(atPath: directory.path) else { return true }
        // Read again first: only a document that decodes as no library is
        // moved. One that reads now, or one a newer build wrote, stays.
        do {
            _ = try read()
            return false
        } catch StoreRefusal.unreadable {
            // The case this exists for.
        } catch {
            return false
        }
        let parent = directory.deletingLastPathComponent()
        let stem = "\(directory.lastPathComponent)-damaged"
        var destination = parent.appendingPathComponent(stem, isDirectory: true)
        if fileManager.fileExists(atPath: destination.path) {
            // Genuinely unique, not the last of a numbered run.
            destination = parent.appendingPathComponent(
                "\(stem)-\(UUID().uuidString)", isDirectory: true
            )
        }
        try fileManager.moveItem(at: directory, to: destination)
        return true
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
        // The features just written are the only authority on attachment;
        // photo files nothing references any more go with the edit.
        sweepOrphanedPhotos(layerID: id, keeping: parsed)
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
        // A layer that is not there cannot be shown or hidden: a switch that
        // succeeded against a deleted layer let the app report a mark as
        // saved in it.
        guard library.layers.contains(where: { $0.id == id }) else {
            throw StoreRefusal.noSuchLayer(id)
        }
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

    /// The layer's features as stored.
    ///
    /// Read with the import parser, but allowing an empty collection: this
    /// store writes one for every new drawing layer and whenever the last
    /// feature is erased, and refusing it on the way back made such a layer
    /// unreadable after relaunch — Edit did nothing, and a mark into Field
    /// notes failed with a message about GPS.
    func geometry(id: String) throws -> ParsedVector {
        guard let data = try? Data(contentsOf: geometryURL(for: id)),
              let parsed = try? UserVectorParse.parseGeoJson(data, allowingEmpty: true)
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
        // The layer's photos go with it; they belong to no other layer.
        try? fileManager.removeItem(at: photosDirectory(for: id))
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
        // Whole photo directories for layers no record claims — the delete
        // interrupted between the library write and the directory removal.
        if let photoDirectories = try? fileManager.contentsOfDirectory(
            at: directory.appendingPathComponent("photos", isDirectory: true),
            includingPropertiesForKeys: nil
        ) {
            for layerDirectory in photoDirectories
            where !keptGeometry.contains(layerDirectory.lastPathComponent)
                && !reservedLayerIDs.contains(layerDirectory.lastPathComponent) {
                try? fileManager.removeItem(at: layerDirectory)
            }
        }
    }
}
