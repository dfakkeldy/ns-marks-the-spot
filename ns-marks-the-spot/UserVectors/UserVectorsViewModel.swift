import Foundation
import GeoCore
import Observation

/// One row of the user's own vector layers in the layer panel, and what it
/// draws.
@MainActor
@Observable
final class UserVectorsViewModel {
    /// A layer the user brought in or drew, as the panel sees it.
    struct Row: Identifiable, Equatable {
        var record: UserVectorLayerRecord
        var isVisible: Bool
        /// Nil while the geometry is still being read off disk, and after a
        /// file that has gone missing. A row with no features still appears:
        /// it is the user's layer, and a row that vanished would look like the
        /// app had thrown it away.
        var parsed: ParsedVector?

        var id: String { record.id }
    }

    private(set) var rows: [Row] = []
    /// The last refusal, for the panel to show. Held rather than thrown past
    /// the user: an import that failed silently reads as a file that vanished.
    private(set) var lastRefusal: UserMapImportRefusal?

    private let store: UserVectorStore

    init(store: UserVectorStore = UserVectorStore()) {
        self.store = store
    }

    /// Reads the library, then fills in geometry as it loads.
    ///
    /// The rows appear before their features do, for the same reason the raster
    /// panel's do: a user with a ten-thousand-feature layer should see it
    /// listed while it parses rather than face an empty panel.
    func load() async {
        let records: [UserVectorLayerRecord]
        do {
            records = try await store.load()
        } catch {
            // A library this build cannot read is left exactly as it is. The
            // rows stay empty rather than being replaced by an empty library
            // the next save would write over the user's layers.
            rows = []
            return
        }
        rows = records.map { Row(record: $0, isVisible: true, parsed: nil) }
        for record in records {
            let parsed = try? await store.geometry(id: record.id)
            guard let index = rows.firstIndex(where: { $0.id == record.id }) else { continue }
            rows[index].parsed = parsed
        }
    }

    /// Imports one file, which may hold more than one layer.
    ///
    /// A zipped shapefile archive can carry several, and merging them would put
    /// unrelated feature sets under one name and one colour — a user who
    /// imported parcels and watercourses together would have no way to switch
    /// one off.
    func importFile(data: Data, filename: String, now: Date = Date()) async {
        lastRefusal = nil
        do {
            let imported = try VectorImport.read(data, filename: filename)
            for layer in imported.layers {
                let id = UUID().uuidString
                let record = UserVectorLayerRecord(
                    id: id,
                    name: layer.name,
                    source: imported.source,
                    origin: .imported(filename: filename, importedAt: now),
                    createdAt: now,
                    colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
                    featureCount: layer.parsed.featureCount,
                    bbox: layer.parsed.bbox
                )
                try await store.writeGeometry(layer.parsed, id: id)
                try await store.save(rows.map(\.record) + [record])
                rows.append(Row(record: record, isVisible: true, parsed: layer.parsed))
            }
        } catch let refusal as UserMapImportRefusal {
            lastRefusal = refusal
        } catch {
            // Writing failed rather than reading: the file was fine and the
            // device could not keep it. Said as its own thing, because "this
            // file cannot be read" would send the user to re-export something
            // that was never the problem.
            lastRefusal = UserMapImportRefusal(
                code: .storageFailed,
                userMessage: """
                    This layer could not be saved to your device. Free some \
                    space and import it again.
                    """
            )
        }
    }

    func setVisible(_ isVisible: Bool, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].isVisible = isVisible
    }

    func rename(id: String, to name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].record.name = trimmed
        try? await store.save(rows.map(\.record))
    }

    /// Replaces a layer's features with an edited set.
    ///
    /// The revision is bumped and the geometry rewritten together: the drawn
    /// layer keys off the revision, so a save that wrote the file without
    /// bumping it would leave the old shape on screen.
    func replaceGeometry(id: String, with parsed: ParsedVector, now: Date = Date()) async {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        do {
            try await store.writeGeometry(parsed, id: id)
        } catch {
            lastRefusal = UserMapImportRefusal(
                code: .storageFailed,
                userMessage: """
                    This edit could not be saved to your device. Free some \
                    space and try again.
                    """
            )
            return
        }
        rows[index].parsed = parsed
        rows[index].record.revision += 1
        rows[index].record.modifiedAt = now
        rows[index].record.featureCount = parsed.featureCount
        rows[index].record.bbox = parsed.bbox
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
    /// A hidden row is left out entirely rather than passed with an alpha of
    /// zero: an invisible overlay is still hit-tested and redrawn on every pan,
    /// and a layer switched off should cost nothing.
    var drawings: [UserVectorDrawing] {
        rows.compactMap { row in
            guard row.isVisible, let parsed = row.parsed else { return nil }
            return UserVectorDrawing(record: row.record, parsed: parsed)
        }
    }
}
