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

    func load() throws -> [UserMapRecord] {
        guard fileManager.fileExists(atPath: libraryURL.path) else { return [] }
        let data = try Data(contentsOf: libraryURL)
        let library: UserMapLibrary
        do {
            library = try decoder.decode(UserMapLibrary.self, from: data)
        } catch {
            throw StoreRefusal.unreadable
        }
        guard library.isReadable else {
            throw StoreRefusal.fromALaterVersion(library.version)
        }
        return library.maps
    }

    func save(_ maps: [UserMapRecord]) throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try encoder.encode(UserMapLibrary(maps: maps))
        try data.write(to: libraryURL, options: .atomic)
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
    func sweepOrphanedPreviews(keeping maps: [UserMapRecord]) throws {
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
