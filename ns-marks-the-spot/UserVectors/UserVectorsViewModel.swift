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
    /// The last refusal from renaming, redrawing or deleting a layer, for the
    /// panel to show. Held rather than thrown past the user: work that failed
    /// silently reads as work the app kept.
    ///
    /// Imports report through `importNotices` instead — one selection can hold
    /// ten files, and a single slot would tell the user about the last of them
    /// and lose the rest.
    private(set) var lastRefusal: UserMapImportRefusal?

    /// What became of each file in the selection just imported.
    private(set) var importNotices: [UserImportNotice] = []

    private let store: UserVectorStore

    init(store: UserVectorStore = .shared) {
        self.store = store
    }

    /// Reads the library, then fills in geometry as it loads.
    ///
    /// The rows appear before their features do, for the same reason the raster
    /// panel's do: a user with a ten-thousand-feature layer should see it
    /// listed while it parses rather than face an empty panel.
    func load() async {
        let library: UserVectorLibrary
        do {
            library = try await store.load()
        } catch {
            // A library this build cannot read is left exactly as it is. The
            // rows stay empty rather than being replaced by an empty library
            // the next save would write over the user's layers.
            rows = []
            return
        }
        let hidden = Set(library.hiddenLayerIDs)
        rows = library.layers.map {
            Row(record: $0, isVisible: !hidden.contains($0.id), parsed: nil)
        }
        for record in library.layers {
            let parsed = try? await store.geometry(id: record.id)
            // Found again rather than remembered: the user can delete a layer,
            // or import another, while this loop is suspended reading a large
            // one, and an index taken before the await would then land on
            // somebody else's row.
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
            // One id for the file, shared by every layer it holds: a zipped
            // shapefile archive can carry several, and the archive is one file.
            let originalFileID = UUID().uuidString
            for layer in imported.layers {
                let record = UserVectorLayerRecord(
                    id: UUID().uuidString,
                    name: layer.name,
                    source: imported.source,
                    origin: .imported(filename: filename, importedAt: now),
                    createdAt: now,
                    colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
                    featureCount: layer.parsed.featureCount,
                    bbox: layer.parsed.bbox,
                    originalFileID: originalFileID
                )
                do {
                    _ = try await store.add(record, geometry: layer.parsed, original: data)
                } catch {
                    // The browser's promise, kept here: a device that cannot
                    // keep a layer never takes it away from the reader who just
                    // imported it. The layer is drawn and usable, it says
                    // plainly that it will not be here next time, and the rest
                    // of the archive still arrives — one full disk swallowing
                    // the nine layers after the one it stopped on is a file
                    // that reads as half-imported with nothing saying so.
                    note(
                        """
                        \(record.name) could not be saved to your device. It stays on the map \
                        until you close the app. Free some space and import it again to keep it.
                        """,
                        for: filename
                    )
                }
                rows.append(Row(record: record, isVisible: true, parsed: layer.parsed))
            }
            // The first layer only. Walking the map through every layer of an
            // archive in turn would just be motion.
            pendingFit = imported.layers.first?.parsed.bbox
        } catch {
            // One file's refusal never stops the next: a user who selected a
            // folder with one broken file in it should get the other nine
            // layers and be told which one did not come.
            //
            // Reading is all that reaches here now. Storing is caught beside
            // the layer it belongs to, above, because a layer that was read is
            // kept whether or not the device would take it.
            report(error.userMessage, for: filename)
        }
    }

    /// A box the map should come to, set by an import and cleared once it has.
    ///
    /// The browser flies to imported data on its own. Here the layer panel
    /// covers the map on a phone, so importing the parcel file for the property
    /// being researched produced no visible change at all: the user closed the
    /// panel onto the same view they left, with no way to tell a loaded layer
    /// from an empty one or from a file the app had quietly refused.
    private(set) var pendingFit: GeoBoundingBox?

    /// Takes the request, so a later toggle or reload cannot fire it again.
    func takePendingFit() -> GeoBoundingBox? {
        defer { pendingFit = nil }
        return pendingFit
    }

    /// Clears what the panel is saying, ready for a batch of imports.
    func beginImports() {
        importNotices = []
        pendingFit = nil
    }

    func clearNotices() {
        importNotices = []
    }

    /// Says that a file the picker offered could not be opened at all.
    func reportUnreadable(name: String) {
        report("This file could not be opened from where it is stored.", for: name)
    }

    /// Says that a file was past the size limit before anything read it.
    ///
    /// The message is passed in because the picker measures the file, and the
    /// limit it measured against depends on which pipeline the file was headed
    /// for.
    func reportTooLarge(name: String, message: String) {
        report(message, for: name)
    }

    /// Refusals name the file as the picker showed it, extension included.
    ///
    /// The rows are named by the stem, but a refusal produced no row: the only
    /// thing the reader can match it against is their own file list, where
    /// `lots.json` and `lots.geojson` are two different files and `lots` is
    /// neither.
    private func report(_ message: String, for filename: String) {
        importNotices.append(
            UserImportNotice(
                id: UUID().uuidString, name: filename, message: message, isRefusal: true
            )
        )
    }

    /// Says what happened to a file that did arrive.
    ///
    /// Kept apart from a refusal because the row is there: a reader told their
    /// import was refused goes looking for a file that is already on the map.
    private func note(_ message: String, for filename: String) {
        importNotices.append(
            UserImportNotice(
                id: UUID().uuidString, name: filename, message: message, isRefusal: false
            )
        )
    }

    /// Starts an empty layer for the user to draw into.
    ///
    /// Its own path rather than a side effect of drawing, because a user who
    /// has imported nothing still has something to draw on: the map. Returns
    /// the row so the caller can open the editor on it.
    @discardableResult
    func newDrawingLayer(name: String = "My drawing", now: Date = Date()) async -> Row? {
        let record = UserVectorLayerRecord(
            id: UUID().uuidString,
            name: name,
            source: .drawn,
            origin: .drawn(createdAt: now),
            createdAt: now,
            colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
            featureCount: 0,
            bbox: nil
        )
        let empty = ParsedVector(features: [], bbox: nil)
        do {
            _ = try await store.add(record, geometry: empty)
        } catch {
            lastRefusal = Self.storageRefusal(
                "This layer could not be saved to your device. Free some space and try again."
            )
            return nil
        }
        let row = Row(record: record, isVisible: true, parsed: empty)
        rows.append(row)
        return row
    }

    func setVisible(_ isVisible: Bool, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].isVisible = isVisible
        // Remembered on disk, but not waited for: a switch that stalled on the
        // filesystem would be a switch that did not move.
        Task { _ = try? await store.setVisible(isVisible, id: id) }
    }

    func rename(id: String, to name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, rows.contains(where: { $0.id == id }) else { return }
        do {
            _ = try await store.rename(id: id, to: trimmed)
        } catch {
            lastRefusal = Self.storageRefusal(
                "This name could not be saved to your device. Free some space and try again."
            )
            return
        }
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].record.name = trimmed
    }

    /// Replaces a layer's features with an edited set.
    ///
    /// Returns whether the edit reached the disk. The caller keeps its own copy
    /// until it does: the working copy is the only one that has the edit in it,
    /// and discarding it on a failed write is the shape data loss actually
    /// takes.
    @discardableResult
    func replaceGeometry(
        id: String, with parsed: ParsedVector, now: Date = Date()
    ) async -> Bool {
        let library: UserVectorLibrary
        do {
            library = try await store.replaceGeometry(id: id, with: parsed, now: now)
        } catch {
            lastRefusal = Self.storageRefusal(
                "This edit could not be saved to your device. Free some space and try again."
            )
            return false
        }
        // The record comes back from the store rather than being edited here,
        // so what the panel shows is what the library says.
        guard let index = rows.firstIndex(where: { $0.id == id }),
              let record = library.layers.first(where: { $0.id == id })
        else { return true }
        rows[index].record = record
        rows[index].parsed = parsed
        return true
    }

    func delete(id: String) async {
        guard let library = try? await store.delete(id: id) else { return }
        let kept = Set(library.layers.map(\.id))
        rows.removeAll { !kept.contains($0.id) }
    }

    /// The feature under a tap, among the layers currently drawn.
    ///
    /// Later layers win, because that is the order they are installed in and so
    /// the order they are drawn in: the answer is the one the user can see they
    /// are pointing at. Hidden layers are not consulted at all — a switched-off
    /// layer that still answered taps would be a layer the user cannot get rid
    /// of.
    func feature(
        at position: GeoJsonPosition, toleranceDegrees: Double
    ) -> UserVectorCalloutItem? {
        var found: UserVectorCalloutItem?
        for row in rows where row.isVisible {
            guard let parsed = row.parsed else { continue }
            if let feature = VectorEdit.feature(
                at: position, in: parsed, toleranceDegrees: toleranceDegrees
            ) {
                found = UserVectorCalloutItem(feature: feature, record: row.record)
            }
        }
        return found
    }

    /// The feature behind one of the map's annotation ids, which are
    /// layer-qualified: `<layer id>/<feature id>`.
    /// The file the user imported, exactly as they gave it.
    func originalFile(for id: String) async -> Data? {
        guard let fileID = rows.first(where: { $0.id == id })?.record.originalFileID else {
            return nil
        }
        return await store.original(fileID: fileID)
    }

    func feature(annotationID: String) -> UserVectorCalloutItem? {
        guard let separator = annotationID.firstIndex(of: "/") else { return nil }
        let layerID = String(annotationID[annotationID.startIndex..<separator])
        let featureID = String(annotationID[annotationID.index(after: separator)...])
        guard let row = rows.first(where: { $0.id == layerID }),
              let feature = row.parsed?.features.first(where: { $0.id == featureID })
        else { return nil }
        return UserVectorCalloutItem(feature: feature, record: row.record)
    }

    private static func storageRefusal(_ message: String) -> UserMapImportRefusal {
        // Said as its own thing rather than as a read failure: the file was
        // fine and the device could not keep it, and "this file cannot be read"
        // would send the user to re-export something that was never the problem.
        UserMapImportRefusal(code: .storageFailed, userMessage: message)
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
