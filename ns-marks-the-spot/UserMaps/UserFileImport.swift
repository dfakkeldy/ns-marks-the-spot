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

    /// Reads each chosen file into memory, under the security scope the picker
    /// hands over, and imports it before reading the next.
    ///
    /// Read rather than referenced: the scope ends when this returns, and a
    /// record holding a URL into another app's container would be a map that
    /// worked until the user moved the file.
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
            let name = url.deletingPathExtension().lastPathComponent
            let scoped = url.startAccessingSecurityScopedResource()
            let data = try? Data(contentsOf: url)
            if scoped { url.stopAccessingSecurityScopedResource() }
            guard let data else {
                // The picker handed this over and the sandbox would not open
                // it. Rare, and said out loud anyway: a file that silently did
                // not arrive is a user counting their rows and wondering which
                // of the ten they lost.
                maps?.reportUnreadable(name: name) ?? vectors?.reportUnreadable(name: name)
                continue
            }
            switch ImportRouting.pipeline(for: data) {
            case .raster:
                if let maps {
                    await maps.importMap(data: data, name: name)
                } else {
                    // No map section on this panel. Sent to the other pipeline
                    // rather than dropped, because a file that refuses a file
                    // out loud is better than one that swallows it.
                    await vectors?.importFile(data: data, filename: url.lastPathComponent)
                }
            case .vector:
                if let vectors {
                    await vectors.importFile(data: data, filename: url.lastPathComponent)
                } else {
                    await maps?.importMap(data: data, name: name)
                }
            }
        }
    }
}
