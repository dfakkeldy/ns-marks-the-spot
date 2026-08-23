import GeoCore
import SwiftUI
import UniformTypeIdentifiers

/// Something the panel has to say about a file the user brought in.
///
/// One list for refusals, for what an import quietly decided, and for work the
/// device would not keep, because with several files at once they are the same
/// question — *what happened to the file I just gave you?* — and a refusal
/// shown alone would leave the other four files' outcomes to be guessed from
/// the rows.
struct UserImportNotice: Identifiable, Equatable {
    var id: String
    /// The file's name. Carried even for a single import: without it a message
    /// about "this PDF" belongs to whichever of five files the reader assumes.
    var name: String
    var message: String
    /// Something that did not happen, as against something that happened with
    /// a remark attached.
    var isRefusal: Bool
}

/// One selection, both pipelines.
///
/// The browser has a single drop zone that routes files by their content, so a
/// user can drag a folder of scans and shapefiles in together. The panel has an
/// Import button in each of its two sections, which is the shape a file picker
/// takes on a phone — but either button now accepts any of the file types and
/// sends each file where its bytes say it belongs. A reader should not have to
/// know which of their six files this app calls a map and which it calls data.
@MainActor
enum UserFileImport {
    /// What either Import button offers.
    ///
    /// `.data` as well as the named types: the router reads the bytes, and a
    /// GeoJSON exported as `.txt` or a KML the system does not recognise would
    /// otherwise be unpickable rather than refused with a reason.
    static let contentTypes: [UTType] = [.tiff, .png, .jpeg, .pdf, .json, .xml, .zip, .data]

    /// What reading one chosen file produced.
    ///
    /// `tooLarge` carries the pipeline rather than the bytes: the file was
    /// measured and never read, and the pipeline is all the panel needs to put
    /// the refusal in the section the user was looking at.
    enum ReadOutcome: Sendable {
        case bytes(Data)
        case tooLarge(ImportRouting.Pipeline)
        case unreadable
    }

    /// Measures a chosen file, then reads it if it is within the limit.
    ///
    /// Measured first, because `Data(contentsOf:)` on a 2 GB file allocates 2
    /// GB before any limit gets a chance to refuse it, and the system ends the
    /// app for that — taking the rest of the selection with it, unreported.
    /// The browser has always checked `File.size` before calling
    /// `arrayBuffer()`; this is the same order.
    ///
    /// The first 4 KB routes the refusal. Both sniffers read a prefix and
    /// nothing else — `UserMapImport.sniff` compares magic bytes and
    /// `VectorImport.sniff` reads `prefix(4096)` — so a head this size gives
    /// the same answer the whole file would.
    ///
    /// `nonisolated`, and called from a detached task, so a 400 MB scan is read
    /// off the main thread. Read under the scope rather than referenced: the
    /// scope ends when this returns, and a record holding a URL into another
    /// app's container would be a map that worked until the user moved the
    /// file.
    nonisolated static func read(_ url: URL) -> ReadOutcome {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let handle = try? FileHandle(forReadingFrom: url) else { return .unreadable }
        let head = (try? handle.read(upToCount: 4096)) ?? Data()
        try? handle.close()
        let pipeline = ImportRouting.pipeline(for: head)
        let limit = switch pipeline {
        case .raster: UserMapImport.hardLimitBytes
        case .vector: VectorImport.hardLimitBytes
        }
        // A size the provider will not state is not a size worth guessing at.
        // The pipelines measure the bytes they were handed anyway, so an
        // unmeasurable file is read and refused there rather than here.
        if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > limit {
            return .tooLarge(pipeline)
        }
        guard let data = try? Data(contentsOf: url) else { return .unreadable }
        return .bytes(data)
    }

    /// Reads each chosen file, under the security scope the picker hands over,
    /// and imports it before reading the next.
    ///
    /// One at a time, rather than reading the selection and then importing it.
    /// A map file runs to hundreds of megabytes and the picker will hand over
    /// as many as the user selects; holding the whole selection as `Data` is a
    /// gigabyte resident before the first sheet is decoded, and the system ends
    /// the app for it while every file was inside the size limit on its own.
    static func load(
        _ urls: [URL], maps: UserMapsViewModel?, vectors: UserVectorsViewModel?
    ) async {
        // Both sides, every batch: whichever pipeline gets nothing this time
        // still clears its stale messages, so what the panel says is always
        // about the files just chosen.
        maps?.beginImports()
        vectors?.beginImports()
        for url in urls {
            let filename = url.lastPathComponent
            let name = url.deletingPathExtension().lastPathComponent
            let data: Data
            let outcome = await Task.detached(operation: { Self.read(url) }).value
            switch outcome {
            case .bytes(let read):
                data = read
            case .tooLarge(let pipeline):
                // Named here rather than left to the pipeline, because the
                // pipeline never sees this file: it was measured and put down.
                switch pipeline {
                case .raster:
                    maps?.reportTooLarge(name: filename, message: UserMapImport.tooLargeMessage)
                        ?? vectors?.reportTooLarge(
                            name: filename, message: UserMapImport.tooLargeMessage
                        )
                case .vector:
                    vectors?.reportTooLarge(name: filename, message: VectorImport.tooLargeMessage)
                        ?? maps?.reportTooLarge(
                            name: filename, message: VectorImport.tooLargeMessage
                        )
                }
                continue
            case .unreadable:
                // The picker handed this over and the sandbox would not open
                // it. Rare, and said out loud anyway: a file that silently did
                // not arrive is a user counting their rows and wondering which
                // of the ten they lost.
                maps?.reportUnreadable(name: filename) ?? vectors?.reportUnreadable(name: filename)
                continue
            }
            switch ImportRouting.pipeline(for: data) {
            case .raster:
                if let maps {
                    await maps.importMap(data: data, name: name, filename: filename)
                } else {
                    // No map section on this panel. Sent to the other pipeline
                    // rather than dropped, because a file that refuses a file
                    // out loud is better than one that swallows it.
                    await vectors?.importFile(data: data, filename: filename)
                }
            case .vector:
                if let vectors {
                    await vectors.importFile(data: data, filename: filename)
                } else {
                    await maps?.importMap(data: data, name: name, filename: filename)
                }
            }
        }
    }
}
