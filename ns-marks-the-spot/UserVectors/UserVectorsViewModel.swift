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
        /// Whether the device took this layer, or it lives only in this
        /// session because the store refused it.
        ///
        /// The library is what the panel is reconciled against after a delete,
        /// and a layer the library never heard of would be swept out of the
        /// panel by somebody deleting an unrelated one.
        var isStored: Bool = true

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

    /// The one trailing visibility write per layer — see `setVisible`.
    @ObservationIgnored private var visibilityWrites: [String: Task<Void, Never>] = [:]

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
            // Detached: parsing a large GeoJSON or shapefile archive is CPU
            // work that has no business on the main actor. Carried across the
            // hop as a Result so the refusal keeps its type — the catch below
            // reads `userMessage` off it, which an erased `any Error` loses.
            let outcome = await Task.detached(
                priority: .userInitiated
            ) { () -> Result<VectorImport.Imported, UserMapImportRefusal> in
                do throws(UserMapImportRefusal) {
                    return .success(try VectorImport.read(data, filename: filename))
                } catch {
                    return .failure(error)
                }
            }.value
            let imported = try outcome.get()
            // A field-capture KMZ carries photo bytes beside its doc.kml.
            // They re-link here — through the standard pipeline, under fresh
            // ids — so an archive from either surface arrives with its
            // photos attached and its viewer img appendix stripped.
            var relinked: [Int: KmzRelink.Result] = [:]
            if imported.source == .kmz {
                let parsedLayers = imported.layers.map(\.parsed)
                relinked = await Task.detached(
                    priority: .userInitiated
                ) { () -> [Int: KmzRelink.Result] in
                    // The relink runs even when the archive holds no photo
                    // bytes: an archive whose files/ entries were stripped
                    // still needs its descriptors resolved (and counted as
                    // missing) and its viewer img appendix removed — silence
                    // here left them dangling.
                    guard let opened = try? KmzParse.parseWithAssets(data)
                    else { return [:] }
                    var results: [Int: KmzRelink.Result] = [:]
                    for (index, parsed) in parsedLayers.enumerated() {
                        results[index] = KmzRelink.relink(
                            parsed: parsed, assets: opened.assets
                        ) { bytes in
                            let processed = try PhotoPipeline.process(bytes)
                            return KmzRelink.ProcessedPhoto(
                                fullJpeg: processed.fullJpeg,
                                thumbJpeg: processed.thumbJpeg,
                                width: processed.width,
                                height: processed.height
                            )
                        }
                    }
                    return results
                }.value
            }
            // One id for the file, shared by every layer it holds: a zipped
            // shapefile archive can carry several, and the archive is one file.
            let originalFileID = UUID().uuidString
            for (index, layer) in imported.layers.enumerated() {
                let relink = relinked[index]
                let parsed = relink?.parsed ?? layer.parsed
                let record = UserVectorLayerRecord(
                    id: UUID().uuidString,
                    name: layer.name,
                    source: imported.source,
                    origin: .imported(filename: filename, importedAt: now),
                    createdAt: now,
                    colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
                    featureCount: parsed.featureCount,
                    bbox: parsed.bbox,
                    originalFileID: originalFileID
                )
                var isStored = true
                do {
                    _ = try await store.add(record, geometry: parsed, original: data)
                    if let relink {
                        // A photo whose bytes could not be written is a
                        // distinct fact about this device, counted rather
                        // than swallowed — a note claiming "attached" for
                        // bytes that never landed would be a false receipt.
                        var unstored = 0
                        for photo in relink.photos {
                            do {
                                try await store.addPhoto(
                                    layerID: record.id,
                                    photoID: photo.id,
                                    full: photo.processed.fullJpeg,
                                    thumb: photo.processed.thumbJpeg
                                )
                            } catch {
                                unstored += 1
                            }
                        }
                        // What became of the archive's photos — attached,
                        // missing, undecodable, and capped stay distinct.
                        var parts: [String] = []
                        if let text = relink.noteText {
                            parts.append(text)
                        }
                        if unstored > 0 {
                            parts.append(
                                "\(unstored) photo\(unstored == 1 ? "" : "s") couldn't be "
                                    + "stored on this device."
                            )
                        }
                        if !parts.isEmpty {
                            note(parts.joined(separator: " "), for: filename)
                        }
                    }
                } catch {
                    isStored = false
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
                rows.append(
                    Row(
                        record: record, isVisible: true, parsed: parsed,
                        isStored: isStored
                    )
                )
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

    /// Says that an export completed but could not carry everything — the
    /// KMZ writer's "N photos couldn't be read and were left out". A
    /// shortfall is not a refusal: the file exists and is consistent.
    func reportExportShortfall(layerName: String, message: String) {
        note(message, for: layerName)
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

    // MARK: - Photos

    /// The store's photo files, surfaced for the edit session and the
    /// callout. Bytes rather than images here: the view model stays
    /// UIKit-free, and the views decode where they display.
    func photoData(layerID: String, photoID: String, thumb: Bool) async -> Data? {
        await store.photoData(layerID: layerID, photoID: photoID, thumb: thumb)
    }

    func addPhotoFile(layerID: String, photoID: String, full: Data, thumb: Data) async -> Bool {
        do {
            try await store.addPhoto(layerID: layerID, photoID: photoID, full: full, thumb: thumb)
            return true
        } catch {
            return false
        }
    }

    func deletePhotoFile(layerID: String, photoID: String) async {
        await store.deletePhoto(layerID: layerID, photoID: photoID)
    }

    func photoCount(layerID: String) async -> Int {
        await store.photoCount(layerID: layerID)
    }

    /// The "Field notes" destination for mark-my-location when no edit
    /// session is open: found if it exists, created once if not, recreated if
    /// the user deleted it. Matched by the pinned name among drawn layers so
    /// an imported file that happens to be called "Field notes" is never
    /// silently written into.
    func fieldNotesRow(now: Date = Date()) async -> Row? {
        if let row = rows.first(where: {
            $0.record.name == CaptureSpec.fieldNotesLayerName && $0.record.source == .drawn
        }) {
            return row
        }
        return await newDrawingLayer(name: CaptureSpec.fieldNotesLayerName, now: now)
    }

    /// The row with its geometry loaded, reading the store directly when the
    /// launch load has not reached it yet. Nil when the layer is gone or its
    /// geometry cannot be read — a write path that treated "not loaded yet"
    /// as "empty" would persist an empty collection over the stored one.
    func loadedRow(id: String) async -> Row? {
        guard let row = rows.first(where: { $0.id == id }) else { return nil }
        if row.parsed != nil { return row }
        guard let parsed = try? await store.geometry(id: id) else {
            // Said, rather than returned as a bare nil: the callers turn nil
            // into "Edit does nothing" and "the mark was not saved", and a
            // read that failed silently reads as a device that lost the
            // layer. The words name the actual failure.
            lastRefusal = Self.storageRefusal(
                "This layer's stored features could not be read on this device."
            )
            return nil
        }
        // Found again rather than remembered: the row set can change across
        // the await, exactly as in load().
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return nil }
        rows[index].parsed = parsed
        return rows[index]
    }

    /// Appends one feature to a layer through the store's write path.
    /// The mark path: the feature id was assigned by the builder, and the
    /// modified date moves so a layer that gained GPS marks honestly shows
    /// its edited date. Refuses rather than guesses when the layer's stored
    /// geometry cannot be read.
    @discardableResult
    func appendFeature(_ feature: GeoJsonFeature, to id: String, now: Date = Date()) async
        -> Bool
    {
        guard let existing = await loadedRow(id: id)?.parsed else { return false }
        let appended = VectorEdit.recomputed(existing.features + [feature])
        return await replaceGeometry(id: id, with: appended, now: now)
    }

    /// Saves a finished recording as a new layer: the processed line as
    /// geometry, the raw GPX as the layer's original file, origin
    /// `recorded`. Returns nil when nothing drawable survived the filter or
    /// the device would not keep the layer.
    @discardableResult
    func addRecordedLayer(
        _ result: TrackRecording.StopResult,
        name: String,
        simplifyToleranceM: Double,
        now: Date = Date()
    ) async -> Row? {
        guard let feature = TrackFeature.buildRecordedTrackFeature(
            result, name: name, simplifyToleranceM: simplifyToleranceM
        ) else { return nil }
        let parsed = VectorEdit.recomputed([feature])
        let rawGpx = TrackGpx.rawGpx(name: name, rawSegments: result.rawSegments)
        let record = UserVectorLayerRecord(
            id: UUID().uuidString,
            name: name,
            source: .recorded,
            origin: .recorded(startedAt: result.startedAt, endedAt: result.endedAt),
            createdAt: now,
            colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
            featureCount: parsed.featureCount,
            bbox: parsed.bbox,
            originalFileID: UUID().uuidString
        )
        do {
            _ = try await store.add(record, geometry: parsed, original: Data(rawGpx.utf8))
        } catch {
            lastRefusal = Self.storageRefusal(
                "This track could not be saved to your device. Free some space and try again."
            )
            return nil
        }
        let row = Row(record: record, isVisible: true, parsed: parsed)
        rows.append(row)
        return row
    }

    /// One geotagged photo the user confirmed for bulk placement.
    struct PhotoPlacement: Sendable {
        var gps: GeoPoint
        var capturedAt: String?
        var sourceName: String?
        var processed: PhotoPipeline.Processed
    }

    /// Builds one `photos` layer from confirmed EXIF positions. Photos that
    /// failed to decode or to store are reported distinctly and never kept.
    @discardableResult
    func addPhotosLayer(
        name: String = "From your photos",
        placements: [PhotoPlacement],
        now: Date = Date()
    ) async -> Row? {
        let capped = Array(placements.prefix(PhotoDescriptor.maxPerLayer))
        guard !capped.isEmpty else { return nil }
        var features: [GeoJsonFeature] = []
        var stored: [(id: String, processed: PhotoPipeline.Processed)] = []
        for (index, placement) in capped.enumerated() {
            let photoID = UUID().uuidString
            let descriptor = PhotoDescriptor(
                id: photoID,
                capturedAt: placement.capturedAt,
                sourceName: placement.sourceName,
                width: Double(placement.processed.width),
                height: Double(placement.processed.height)
            )
            var properties: [String: JSONValue] = [
                CaptureSpec.createdAtKey: .string(CaptureTime.iso(now)),
                CaptureSpec.photosKey: PhotoDescriptor.propertyValue(internalForm: [descriptor]),
            ]
            if let capturedAt = placement.capturedAt {
                properties[CaptureSpec.capturedAtKey] = .string(capturedAt)
            }
            if let sourceName = placement.sourceName, !sourceName.isEmpty {
                properties["name"] = .string(
                    URL(fileURLWithPath: sourceName).deletingPathExtension().lastPathComponent
                )
            }
            features.append(
                GeoJsonFeature(
                    id: "photo-\(index + 1)",
                    geometry: .point(
                        GeoJsonPosition(lng: placement.gps.lng, lat: placement.gps.lat)
                    ),
                    properties: properties
                )
            )
            stored.append((photoID, placement.processed))
        }
        let parsed = VectorEdit.recomputed(features)
        let record = UserVectorLayerRecord(
            id: UUID().uuidString,
            name: name,
            source: .photos,
            origin: .photos(createdAt: now, count: parsed.featureCount),
            createdAt: now,
            colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
            featureCount: parsed.featureCount,
            bbox: parsed.bbox
        )
        do {
            _ = try await store.add(record, geometry: parsed)
        } catch {
            lastRefusal = Self.storageRefusal(
                "These points could not be saved to your device. Free some space and try again."
            )
            return nil
        }
        for item in stored {
            do {
                try await store.addPhoto(
                    layerID: record.id,
                    photoID: item.id,
                    full: item.processed.fullJpeg,
                    thumb: item.processed.thumbJpeg
                )
            } catch {
                reportExportShortfall(
                    layerName: name,
                    message: "A photo could not be stored on this device. The point was kept without it."
                )
            }
        }
        let row = Row(record: record, isVisible: true, parsed: parsed)
        rows.append(row)
        pendingFit = parsed.bbox
        return row
    }

    func setVisible(_ isVisible: Bool, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].isVisible = isVisible
        // Remembered on disk, but not waited for: a switch that stalled on the
        // filesystem would be a switch that did not move.
        //
        // One trailing write per layer, and the write reads the row's current
        // value rather than capturing the delta: two unstructured tasks have
        // no ordering between them, and the older one landing last would
        // resurrect at next launch a layer the user had switched off.
        visibilityWrites[id]?.cancel()
        visibilityWrites[id] = Task { [weak self, store] in
            guard !Task.isCancelled,
                  let latest = self?.rows.first(where: { $0.id == id })?.isVisible
            else { return }
            _ = try? await store.setVisible(latest, id: id)
        }
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

    /// Removes a layer, and reconciles the panel with what the library says.
    ///
    /// Reconciled rather than trusted, because a delete that reached the disk
    /// is the moment to find out that something else went with it. Layers the
    /// device never took are exempt: they are not in the library and never
    /// were, so checking them against it would take every one of them off the
    /// map the first time the user deleted anything at all.
    func delete(id: String) async {
        let sessionOnly = rows.first { $0.id == id }?.isStored == false
        guard let library = try? await store.delete(id: id) else {
            // Nothing on disk to refuse it: a layer that is only in memory is
            // deleted by forgetting it.
            if sessionOnly { rows.removeAll { $0.id == id } }
            return
        }
        let kept = Set(library.layers.map(\.id))
        rows.removeAll { !kept.contains($0.id) && $0.isStored }
        if sessionOnly { rows.removeAll { $0.id == id } }
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
