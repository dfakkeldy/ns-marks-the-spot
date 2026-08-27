import Foundation
import GeoCore
import ImageIO
import UniformTypeIdentifiers

/// Where the user's own maps live on this device.
///
/// Two kinds of thing, kept apart on purpose: one small JSON document holding
/// every record, rewritten whole whenever anything changes, and one preview
/// image per record, written once and never rewritten. A library that carried
/// its pixels would have to rewrite tens of megabytes every time an opacity
/// slider moved.
///
/// Nothing here leaves the device. A user's scan is often the only copy of a
/// sheet they were given, and the georeferencing they worked out by hand is
/// their research — neither is uploaded, and no part of this store has a
/// network path.
actor UserMapStore {
    /// The one store this process uses.
    ///
    /// Shared for the same reason `UserVectorStore.shared` is: the actor's
    /// serialization is only worth anything if every writer goes through the
    /// same actor. Two scenes on an iPad, each with its own store, would do
    /// whole-document read-modify-write over the same `library.json` and drop
    /// each other's records last-writer-wins.
    static let shared = UserMapStore()

    /// Why the library could not be read or written.
    enum StoreRefusal: Error, Equatable {
        /// A document written by a newer build. Refused rather than read, and
        /// deliberately not overwritten.
        case fromALaterVersion(Int)
        /// The document is there and is not a library.
        case unreadable
        case previewMissing(String)
        case previewUnwritable
    }

    private let directory: URL
    private let fileManager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    /// The version of a library this build refused to read, once it has seen
    /// one, until a load succeeds.
    ///
    /// Kept here rather than only in the view model because the view model's
    /// copy cannot be checked at the moment of the write. Its `load` learns of
    /// a later version across an await, and an import that began before that
    /// await passes its own check while the answer is still in flight, then
    /// resumes and writes. Both calls arrive here, and an actor runs them in
    /// order, so the read that refused always lands before the write that
    /// followed it.
    private var refusedVersion: Int?

    init(directory: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        if let directory {
            self.directory = directory
        } else {
            let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            )[0]
            self.directory = applicationSupport.appendingPathComponent(
                "UserMaps", isDirectory: true
            )
        }
        encoder.outputFormatting = [.sortedKeys]
    }

    private var libraryURL: URL {
        directory.appendingPathComponent("library.json")
    }

    private func previewURL(for id: String) -> URL {
        // The id is ours — a UUID string — and never a name the user typed, so
        // it cannot walk out of this directory. Checked anyway, because the
        // day someone lets a filename in through here is the day this comment
        // stops being true.
        precondition(!id.contains("/") && !id.contains(".."), "a record id is not a path")
        return directory.appendingPathComponent("\(id).png")
    }

    /// Just the format number, read on its own before anything else.
    ///
    /// A newer build is free to change what a record looks like, and then this
    /// build's decode of the whole document fails on the records rather than on
    /// the version. Read in that order the two cases are indistinguishable, and
    /// they call for opposite things: a later version's document must be left
    /// exactly as it is, while a damaged one must not lock the user out for
    /// good. The version is the one field that is promised never to move.
    private struct LibraryStamp: Decodable {
        var version: Int
    }

    func load() throws -> [UserMapRecord] {
        guard fileManager.fileExists(atPath: libraryURL.path) else { return [] }
        let data = try Data(contentsOf: libraryURL)
        guard let stamp = try? decoder.decode(LibraryStamp.self, from: data) else {
            throw StoreRefusal.unreadable
        }
        // Below the first version is not a document from the future, it is a
        // document with a nonsense version in it — a zero, a negative number,
        // a field some other writer put there. Reading the two the same way
        // seals the library for good over what is only damage.
        guard stamp.version >= 1 else { throw StoreRefusal.unreadable }
        guard stamp.version <= UserMapLibrary.currentVersion else {
            refusedVersion = stamp.version
            throw StoreRefusal.fromALaterVersion(stamp.version)
        }
        let library: UserMapLibrary
        do {
            library = try decoder.decode(UserMapLibrary.self, from: data)
        } catch {
            throw StoreRefusal.unreadable
        }
        refusedVersion = nil
        return library.maps
    }

    func save(_ maps: [UserMapRecord]) throws {
        if let refusedVersion { throw StoreRefusal.fromALaterVersion(refusedVersion) }
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try encoder.encode(UserMapLibrary(maps: maps))
        try data.write(to: libraryURL, options: .atomic)
    }

    /// Moves a library this build cannot decode out of the way, with the
    /// pixels that belong to it, so a new one can be started.
    ///
    /// Moved, never deleted. The document is the only record of where the user
    /// placed every sheet by hand, which can be hours of their work, and the
    /// previews beside it are the only copy of the pixels: this app does not
    /// keep the file they imported. A folder that is still on the device is one
    /// a later build or a support answer can recover.
    ///
    /// The whole folder rather than the one file, because the previews left
    /// behind would belong to no record any more, and the next successful load
    /// sweeps exactly those away. Set aside together they stay a library.
    ///
    /// Only for a document whose own version says this build should have been
    /// able to read it. Moving a later version's library aside would hide the
    /// maps the newer build is holding.
    ///
    /// Answers whether the damaged library is out of the way, which a call that
    /// found nothing left to move has achieved just as much as one that moved
    /// it. Two loads can read the same damaged document before either recovers
    /// from it, and reporting the second one's missing source as a failure
    /// would seal a library that had just been successfully replaced.
    @discardableResult
    func setAsideDamagedLibrary() throws -> Bool {
        guard fileManager.fileExists(atPath: directory.path) else { return true }
        let parent = directory.deletingLastPathComponent()
        let stem = "\(directory.lastPathComponent)-damaged"
        var destination = parent.appendingPathComponent(stem, isDirectory: true)
        var attempt = 2
        while fileManager.fileExists(atPath: destination.path), attempt < 100 {
            destination = parent.appendingPathComponent(
                "\(stem)-\(attempt)", isDirectory: true
            )
            attempt += 1
        }
        try fileManager.moveItem(at: directory, to: destination)
        return true
    }

    /// Stores a preview beside the library, as PNG.
    ///
    /// PNG rather than JPEG: a scanned map is line work and text, which is
    /// what JPEG is worst at — and a user reading a lot number off a sheet is
    /// exactly the case where an artefact becomes a wrong answer rather than a
    /// blurry one.
    func writePreview(_ image: CGImage, id: String) throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = previewURL(for: id)
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL, UTType.png.identifier as CFString, 1, nil
        ) else { throw StoreRefusal.previewUnwritable }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw StoreRefusal.previewUnwritable
        }
    }

    func preview(id: String) throws -> CGImage {
        let url = previewURL(for: id)
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { throw StoreRefusal.previewMissing(id) }
        return image
    }

    /// Removes a map and its pixels together.
    ///
    /// The record goes first. A preview left behind is wasted space that the
    /// next sweep can find; a record left pointing at a deleted preview is a
    /// row in the panel that can never draw.
    func delete(id: String, from maps: [UserMapRecord]) throws -> [UserMapRecord] {
        let remaining = maps.filter { $0.id != id }
        try save(remaining)
        try? fileManager.removeItem(at: previewURL(for: id))
        return remaining
    }

    /// Deletes preview files no record claims.
    ///
    /// Reachable state, not a theoretical one: a delete interrupted between
    /// the two steps above, or a save that failed after its preview was
    /// written. Without this the orphans are invisible and permanent.
    func sweepOrphanedPreviews() throws {
        // The document is read here rather than passed in. A caller's list is
        // whatever it read some time ago, and a save can land in between: an
        // import that finished while a reload was in flight is in the file and
        // not in the reload's copy, and sweeping against that copy deletes the
        // pixels of a map the library still lists. Read inside the actor, the
        // list is the one the last write left.
        //
        // A document that will not read sweeps nothing. Previews are the only
        // copy of the pixels, and "no records" and "no readable records" are
        // not the same statement.
        guard let maps = try? load() else { return }
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ) else { return }
        let kept = Set(maps.map(\.id))
        for file in files where file.pathExtension == "png" {
            if !kept.contains(file.deletingPathExtension().lastPathComponent) {
                try? fileManager.removeItem(at: file)
            }
        }
    }
}
