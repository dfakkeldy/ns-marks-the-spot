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

        static func == (lhs: Row, rhs: Row) -> Bool {
            lhs.record == rhs.record && lhs.isVisible == rhs.isVisible
                && lhs.opacity == rhs.opacity && lhs.preview === rhs.preview
        }
    }

    private(set) var rows: [Row] = []
    /// The last refusal, for the panel to show. Held rather than thrown past
    /// the user: an import that failed silently reads as a file that vanished.
    private(set) var lastRefusal: UserMapImportRefusal?

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

    func importMap(data: Data, name: String) async {
        lastRefusal = nil
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
        } catch let refusal as UserMapImportRefusal {
            lastRefusal = refusal
        } catch {
            // Writing failed rather than reading: the file was fine and the
            // device could not keep it. Said as its own thing, because "your
            // map is corrupt" would send the user to re-export a file that
            // was never the problem.
            lastRefusal = UserMapImportRefusal(
                code: .storageFailed,
                userMessage: """
                    This map could not be saved to your device. Free some \
                    space and import it again.
                    """
            )
        }
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

    /// The overlays MapKit should be holding, in panel order.
    ///
    /// A hidden row is left out entirely rather than installed at zero alpha.
    /// A user's scan is already decoded and resident; an invisible overlay
    /// would still be walked and clipped on every draw for no pixels at all.
    var overlays: [UserMapOverlay] {
        rows.compactMap { row in
            guard row.isVisible, let preview = row.preview else { return nil }
            return UserMapOverlay(record: row.record, image: preview, alpha: row.opacity)
        }
    }
}
