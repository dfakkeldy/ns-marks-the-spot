import CoreGraphics
import Foundation
import GeoCore
import Observation

/// One row of the user's own maps in the layer panel, and what it draws.
@MainActor
@Observable
final class UserMapsViewModel {
    /// A map the user brought in, as the panel sees it.
    struct Row: Identifiable, Equatable {
        var record: UserMapRecord
        var isVisible: Bool
        var opacity: CGFloat
        /// Nil while the preview is still being read off disk, and after a
        /// preview that has gone missing. A row with no pixels still appears:
        /// it is the user's map, and a row that vanished would look like the
        /// app had thrown it away.
        var preview: CGImage?

        var id: String { record.id }
        /// The user has to place it before it can draw.
        var needsGeoreferencing: Bool { record.needsGeoreferencing }
        /// A PDF that offered more than one frame and is still waiting to be
        /// told which one it is. Placing it by hand answers the question too,
        /// which is why this stops asking once the sheet is placed.
        var needsFrameSelection: Bool {
            record.pdf?.needsFrameSelection == true && record.needsGeoreferencing
        }
        /// The frames the file offered, for the chooser.
        var frames: [PdfMapRegistration.Candidate] { record.pdf?.candidates ?? [] }

        static func == (lhs: Row, rhs: Row) -> Bool {
            lhs.record == rhs.record && lhs.isVisible == rhs.isVisible
                && lhs.opacity == rhs.opacity && lhs.preview === rhs.preview
        }
    }

    /// Something the panel has to say about a file the user just chose.
    ///
    /// One list for refusals and for what an import quietly decided, because
    /// with several files at once they are the same question — *what happened
    /// to the file I picked?* — and a refusal shown alone would leave the other
    /// four files' outcomes to be guessed from the rows.
    struct ImportNotice: Identifiable, Equatable {
        var id: String
        /// The file's name. Carried even for a single import: without it a
        /// message about "this PDF" belongs to whichever of five files the
        /// reader assumes.
        var name: String
        var message: String
        /// A refused file, as against one that imported with something to say.
        var isRefusal: Bool
    }

    private(set) var rows: [Row] = []
    /// What the last batch of imports came to, for the panel to show. Held
    /// rather than thrown past the user: an import that failed silently reads
    /// as a file that vanished.
    private(set) var notices: [ImportNotice] = []

    private let store: UserMapStore

    init(store: UserMapStore = UserMapStore()) {
        self.store = store
    }

    /// Reads the library, then fills in previews as they load.
    ///
    /// The rows appear before their pixels do. A user with a large scan should
    /// see their map listed while it decodes rather than an empty panel that
    /// fills in all at once, which is indistinguishable from an app that lost
    /// their maps.
    func load() async {
        let records: [UserMapRecord]
        do {
            records = try await store.load()
        } catch {
            // A library this build cannot read is left exactly as it is. The
            // rows stay empty rather than being replaced by an empty library
            // the next save would write over the user's maps.
            rows = []
            return
        }
        rows = records.map {
            Row(record: $0, isVisible: true, opacity: 1, preview: nil)
        }
        for record in records {
            let preview = try? await store.preview(id: record.id)
            guard let index = rows.firstIndex(where: { $0.id == record.id }) else { continue }
            rows[index].preview = preview
        }
    }

    /// Imports several chosen files, one after another.
    ///
    /// Sequential, and one file's refusal never stops the rest: a user who
    /// selected a folder of scans with one broken file in it should get the
    /// other nine maps and be told which one did not come.
    func importMaps(_ files: [(data: Data, name: String)]) async {
        notices = []
        for file in files {
            await importMap(data: file.data, name: file.name, clearingNotices: false)
        }
    }

    func importMap(data: Data, name: String) async {
        await importMap(data: data, name: name, clearingNotices: true)
    }

    private func importMap(data: Data, name: String, clearingNotices: Bool) async {
        if clearingNotices { notices = [] }
        let id = UUID().uuidString
        do {
            let imported = try UserMapImporter.import(data: data, id: id, name: name)
            try await store.writePreview(imported.preview, id: id)
            let records = rows.map(\.record) + [imported.record]
            try await store.save(records)
            rows.append(
                Row(
                    record: imported.record, isVisible: true, opacity: 1,
                    preview: imported.preview
                )
            )
            // A PDF is the one import whose result does not show what the app
            // did: which page came, whether the file placed it, and whether it
            // offered more than one frame. Said out loud, or the user reads a
            // hand-placeable cover sheet as the whole atlas.
            if let note = imported.record.pdf?.note {
                notices.append(
                    ImportNotice(id: id, name: name, message: note, isRefusal: false)
                )
            }
        } catch let refusal as UserMapImportRefusal {
            notices.append(
                ImportNotice(
                    id: id, name: name, message: refusal.userMessage, isRefusal: true
                )
            )
        } catch {
            // Writing failed rather than reading: the file was fine and the
            // device could not keep it. Said as its own thing, because "your
            // map is corrupt" would send the user to re-export a file that
            // was never the problem.
            notices.append(
                ImportNotice(
                    id: id,
                    name: name,
                    message: """
                        This map could not be saved to your device. Free some \
                        space and import it again.
                        """,
                    isRefusal: true
                )
            )
        }
    }

    /// Records which of a PDF's frames the user says the sheet is.
    ///
    /// The chosen frame's own control points, not a guess: each candidate was
    /// read from the file and describes its own ground. Nothing is redrawn from
    /// the page — only which part of it is claimed to cover which ground.
    func selectFrame(id: String, candidateID: String) async {
        guard let index = rows.firstIndex(where: { $0.id == id }),
              let metadata = rows[index].record.pdf,
              let candidate = metadata.candidates.first(where: { $0.id == candidateID })
        else { return }
        rows[index].record.sourceRect = candidate.sourceRect
        rows[index].record.placement = .controlPoints(
            UserMapImporter.controlPoints(of: candidate), method: .affine
        )
        rows[index].record.pdf = PdfImportMetadata(
            pageCount: metadata.pageCount,
            registration: .embedded(
                frameID: candidate.id,
                label: candidate.label,
                candidates: metadata.candidates
            )
        )
        try? await store.save(rows.map(\.record))
    }

    func setVisible(_ isVisible: Bool, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].isVisible = isVisible
    }

    func setOpacity(_ opacity: CGFloat, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].opacity = opacity
    }

    /// Saves a placement the user worked out in the georeferencer.
    func place(id: String, controlPoints: [SessionControlPoint], method: GeoreferenceMethod) async {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].record.placement = .controlPoints(controlPoints, method: method)
        try? await store.save(rows.map(\.record))
    }

    func delete(id: String) async {
        guard let remaining = try? await store.delete(id: id, from: rows.map(\.record)) else {
            return
        }
        let kept = Set(remaining.map(\.id))
        rows.removeAll { !kept.contains($0.id) }
    }

    /// What the map should be drawing, in panel order.
    ///
    /// A hidden row is left out entirely rather than passed at zero alpha. A
    /// user's scan is already decoded and resident; an invisible overlay would
    /// still be walked and clipped on every draw for no pixels at all.
    ///
    /// Values, not overlays: the map state is diffed before anything is
    /// rebuilt, and building an overlay here would mean solving a mesh on
    /// every read of this property.
    var drapes: [UserMapDrape] {
        rows.compactMap { row in
            guard row.isVisible, let preview = row.preview else { return nil }
            return UserMapDrape(record: row.record, image: preview, alpha: row.opacity)
        }
    }
}
