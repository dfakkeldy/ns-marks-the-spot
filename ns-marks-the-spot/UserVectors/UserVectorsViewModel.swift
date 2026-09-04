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
    /// True when there is a library on this device that this build could not
    /// read, so nothing may be written over it. The file holds layers the
    /// reader still has; every write is refused with words that name the
    /// library rather than the disk, as `UserMapsViewModel` does for maps.
    private(set) var isLibrarySealed = false
    private(set) var sealedMessage: String?
    /// Why, when it is: a newer build's document waits for that build; a
    /// damaged one at this version can be set aside.
    enum SealedReason: Equatable {
        case laterVersion
        /// The document decoded as no library: damaged, and can be set aside.
        case unreadable
        /// The file could not be read at all — permissions, I/O. Not proof
        /// of damage, so nothing is offered to move aside; try again later.
        case storageError
    }
    /// True while a damaged library is being moved aside.
    private(set) var isSettingAside = false
    private(set) var sealedReason: SealedReason?
    /// Said once after a damaged library was set aside and a new one begun.
    private(set) var recoveryNotice: String?

    static let laterVersionMessage =
        "Your drawn layers were saved by a newer version of this app and cannot be opened "
        + "here. Nothing was deleted; update the app to see them. Until then, new layers, "
        + "marks and recordings cannot be saved."
    static let unreadableLibraryMessage =
        "Your drawn layers' library could not be read on this device. Nothing was deleted, "
        + "but until it is repaired new layers, marks and recordings cannot be saved."
    static let storageErrorMessage =
        "Your drawn layers couldn't be opened right now because of an error reading them. "
        + "Nothing was deleted; try again later."

    /// Counts library writes, so a load that was out while one landed does
    /// not put the rows back the way they were before it.
    @ObservationIgnored private var writeGeneration = 0

    func load() async {
        let generation = writeGeneration
        let library: UserVectorLibrary
        do {
            library = try await store.load()
            isLibrarySealed = false
            sealedMessage = nil
        } catch {
            // A library this build cannot read is left exactly as it is. The
            // rows stay empty rather than being replaced by an empty library
            // the next save would write over the user's layers — and the
            // panel says so, instead of an empty list and "free some space"
            // on every later write.
            rows = []
            seal(after: error)
            return
        }
        // A write landed while the library was being read: what was read is
        // already old. Read again rather than roll the rows back over it.
        if generation != writeGeneration {
            return await load()
        }
        isLibrarySealed = false
        sealedMessage = nil
        sealedReason = nil
        let hidden = Set(library.hiddenLayerIDs)
        rows = library.layers.map {
            Row(record: $0, isVisible: !hidden.contains($0.id), parsed: nil)
        }
        // A refusal the seal put up is over once the library has opened.
        if let refusal = lastRefusal,
           [Self.storageErrorMessage, Self.unreadableLibraryMessage, Self.laterVersionMessage]
               .contains(refusal.userMessage)
        {
            lastRefusal = nil
        }
        for record in library.layers {
            let before = writeGeneration
            let parsed = try? await store.geometry(id: record.id)
            // Found again rather than remembered: the user can delete a layer,
            // or import another, while this loop is suspended reading a large
            // one, and an index taken before the await would then land on
            // somebody else's row.
            guard let index = rows.firstIndex(where: { $0.id == record.id }) else { continue }
            // A write that landed while this row's geometry was being read
            // has already put the newer copy on the row; the older one read
            // here must not go back over it.
            if before != writeGeneration, rows[index].parsed != nil { continue }
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
        if isLibrarySealed {
            // Nothing is parsed or written: the file would be kept as a
            // session-only row and refused in the disk's words.
            let message = sealedMessage ?? Self.unreadableLibraryMessage
            report(message, for: filename)
            lastRefusal = Self.storageRefusal(message)
            return
        }
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
                    // One asset at a time through the source, never the whole
                    // archive inflated: a phone's memory is the bound, and the
                    // document was parsed once already by the import.
                    guard let source = try? KmzParse.AssetSource(data: data)
                    else { return [:] }
                    var results: [Int: KmzRelink.Result] = [:]
                    for (index, parsed) in parsedLayers.enumerated() {
                        results[index] = KmzRelink.relink(
                            parsed: parsed, assets: { source.read(named: $0) }
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
            // Sealed while the file was being parsed — the initial load landed
            // on a newer library meanwhile: refused now, in its words.
            if isLibrarySealed {
                let message = sealedMessage ?? Self.unreadableLibraryMessage
                report(message, for: filename)
                lastRefusal = Self.storageRefusal(message)
                return
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
                    writeGeneration += 1
                    _ = try await store.add(record, geometry: parsed, original: data)
                    if let relink {
                        // A photo whose bytes could not be written is a
                        // distinct fact about this device, counted rather
                        // than swallowed — a note claiming "attached" for
                        // bytes that never landed would be a false receipt.
                        var unstored = 0
                        for photo in relink.photos {
                            do {
                                writeGeneration += 1
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
                    if Self.isLibraryRefusal(error) {
                        // Not the disk: the library itself refused, because a
                        // newer build wrote it or it cannot be read. Sealed
                        // now, said in the library's words, and nothing of
                        // this file is kept as a session-only row that would
                        // vanish with the app.
                        seal(after: error)
                        let message = sealedMessage ?? Self.unreadableLibraryMessage
                        report(message, for: filename)
                        return
                    }
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
        guard !isLibrarySealed else {
            refuse("")
            return nil
        }
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
            writeGeneration += 1
            _ = try await store.add(record, geometry: empty)
        } catch {
            refuse(
                "This layer could not be saved to your device. Free some space and try again.",
                after: error
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
            writeGeneration += 1
            try await store.addPhoto(layerID: layerID, photoID: photoID, full: full, thumb: thumb)
            return true
        } catch {
            return false
        }
    }

    /// Keeps a photo file safe from the orphan sweep until a feature write
    /// references it, or the attachment gives it up.
    func reservePhotoID(_ id: String) async {
        await store.reservePhoto(id: id)
    }

    func releasePhotoID(_ id: String) async {
        await store.releasePhoto(id: id)
    }

    func deletePhotoFile(layerID: String, photoID: String) async {
        writeGeneration += 1
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
            refuse(
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
            writeGeneration += 1
            _ = try await store.add(record, geometry: parsed, original: Data(rawGpx.utf8))
        } catch {
            refuse(
                "This track could not be saved to your device. Free some space and try again.",
                after: error
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
        // Minted here rather than with the record below, because the photo
        // files are filed under the layer's id and they go down first — and
        // reserved, so a delete or a load running while up to 500 photos are
        // written cannot sweep the directory as an orphan.
        let layerID = UUID().uuidString
        await store.reserveLayer(id: layerID)
        defer { Task { await store.releaseLayer(id: layerID) } }
        var features: [GeoJsonFeature] = []
        var unstored = 0
        for (index, placement) in capped.enumerated() {
            let photoID = UUID().uuidString
            // The bytes before the descriptor that claims them, the way the
            // edit session's attach path already does it. Written the other
            // way round, a photo this device refused left its point claiming
            // it anyway: the callout drew a placeholder for bytes that were
            // never there, and a later KMZ export counted the same photo among
            // the ones it could not read — both contradicting the notice that
            // said the point had been kept without it.
            var didStore = true
            do {
                writeGeneration += 1
                try await store.addPhoto(
                    layerID: layerID,
                    photoID: photoID,
                    full: placement.processed.fullJpeg,
                    thumb: placement.processed.thumbJpeg
                )
            } catch {
                didStore = false
                unstored += 1
            }
            var properties: [String: JSONValue] = [
                CaptureSpec.createdAtKey: .string(CaptureTime.iso(now))
            ]
            if didStore {
                let descriptor = PhotoDescriptor(
                    id: photoID,
                    capturedAt: placement.capturedAt,
                    sourceName: placement.sourceName,
                    width: Double(placement.processed.width),
                    height: Double(placement.processed.height)
                )
                properties[CaptureSpec.photosKey] =
                    PhotoDescriptor.propertyValue(internalForm: [descriptor])
            }
            // The place, the moment and the file's name are the reader's own
            // confirmed claims about where they stood, and they outlive bytes
            // the device would not take.
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
        }
        let parsed = VectorEdit.recomputed(features)
        let record = UserVectorLayerRecord(
            id: layerID,
            name: name,
            source: .photos,
            origin: .photos(createdAt: now, count: parsed.featureCount),
            createdAt: now,
            colorHex: VectorStyle.nextLayerColor(existingCount: rows.count),
            featureCount: parsed.featureCount,
            bbox: parsed.bbox
        )
        do {
            writeGeneration += 1
            _ = try await store.add(record, geometry: parsed)
        } catch {
            refuse(
                "These points could not be saved to your device. Free some space and try again.",
                after: error
            )
            // Whatever photo files landed are under a layer id the library
            // will never carry. The reservation ends with this function, and
            // the store sweeps a photo directory no record claims on the next
            // load, where the other interrupted writes are collected too.
            return nil
        }
        if unstored > 0 {
            // Counted once rather than said once per photo: fifty copies of
            // one sentence is a panel the reader stops reading. It is a count
            // of photos that did not land and nothing more — `addPhoto` throws
            // whatever the file system threw, and no room, a protected file
            // while the device is locked and a permissions failure are not the
            // same thing, so this does not name a cause it cannot establish.
            reportExportShortfall(
                layerName: name,
                message: unstored == 1
                    ? "1 photo couldn't be stored on this device. Its point was kept without it."
                    : "\(unstored) photos couldn't be stored on this device. Their points were "
                        + "kept without them."
            )
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
            self?.writeGeneration += 1
            do {
                _ = try await store.setVisible(latest, id: id)
            } catch {
                // A superseded write always runs to completion — cancellation
                // is checked before the await and the store is not
                // cancellation-aware — so only the write that is still this
                // layer's current one is allowed to speak.
                guard !Task.isCancelled else { return }
                // A layer the library does not hold, for a row that never
                // claimed to be on the device: an import the device would not
                // take, whose notice already said it lives only in this
                // session. Nothing there wants a warning about a switch. A
                // STORED row answering the same way is a different thing —
                // the library has gone missing underneath a layer that was in
                // it — and that is said.
                if case UserVectorStore.StoreRefusal.noSuchLayer = error,
                   self?.rows.first(where: { $0.id == id })?.isStored == false {
                    return
                }
                // Only the library's own refusals, because `refuse` writes the
                // one shared slot that a mark and the editor read as the
                // reason THEIR write failed. A sealed library is the same
                // answer to all three; a full disk during a background
                // visibility write is not, and would arrive at the reader as
                // the reason a mark they just took was not kept.
                guard let error = error as? UserVectorStore.StoreRefusal,
                      error == .unreadable || Self.isFromALaterVersion(error)
                else { return }
                // The switch stays where the reader put it: the layer really
                // is drawn or not drawn as they asked. What did not happen is
                // the remembering, and a switch that quietly forgets itself by
                // the next launch reads as the app moving it back on its own.
                self?.refuse(
                    "That layer's visibility could not be saved, so it may come back the other "
                        + "way round next time you open the app.",
                    after: error
                )
            }
        }
    }

    /// The awaited form of switching a layer on, for the paths that report
    /// the switch as done: a mark or an edit into a hidden layer says the
    /// layer was switched on, and must not say so before the library has it.
    /// False when the library refused, with the reason in `lastRefusal`.
    func showLayer(id: String) async -> Bool {
        guard rows.contains(where: { $0.id == id }) else { return false }
        visibilityWrites[id]?.cancel()
        visibilityWrites[id] = nil
        do {
            writeGeneration += 1
            _ = try await store.setVisible(true, id: id)
            // Shown only once the library has it: a row switched on over a
            // failed write would be hidden again at the next launch, and the
            // panel's warning would already be gone.
            guard let index = rows.firstIndex(where: { $0.id == id }) else {
                // Deleted while the switch was being written: there is no
                // layer to have been shown, whatever the library now says,
                // and a success toast over it would be about nothing.
                refuse(
                    "The layer was deleted while it was being switched on."
                )
                return false
            }
            rows[index].isVisible = true
            return true
        } catch UserVectorStore.StoreRefusal.noSuchLayer {
            lastRefusal = Self.storageRefusal(
                "The layer was deleted while it was being switched on."
            )
            return false
        } catch {
            refuse(
                "The layer could not be switched on. It is still in your list; turn it on from Layers.",
                after: error
            )
            return false
        }
    }

    /// False when the library refused the name, with the reason in
    /// `lastRefusal`; the session keeps its panel up on that.
    @discardableResult
    func rename(id: String, to name: String) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, rows.contains(where: { $0.id == id }) else { return false }
        do {
            writeGeneration += 1
            _ = try await store.rename(id: id, to: trimmed)
        } catch {
            refuse(
                "This name could not be saved to your device. Free some space and try again.",
                after: error
            )
            return false
        }
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return false }
        rows[index].record.name = trimmed
        return true
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
            writeGeneration += 1
            library = try await store.replaceGeometry(id: id, with: parsed, now: now)
        } catch {
            refuse(
                "This edit could not be saved to your device. Free some space and try again.",
                after: error
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
        writeGeneration += 1
        let library: UserVectorLibrary
        do {
            library = try await store.delete(id: id)
        } catch {
            // Nothing on disk to refuse it: a layer that is only in memory is
            // deleted by forgetting it.
            if sessionOnly {
                rows.removeAll { $0.id == id }
                return
            }
            // The layer is still on the device and still in the list, and the
            // reader confirmed a destructive alert and watched the row stay
            // put. Said in the library's words when the library is what
            // refused: a document from a newer build is not a full disk, and
            // telling that reader to free space would have them clearing
            // photos over a file this build must not write to at any size.
            refuse(
                "This layer could not be removed from your device right now. It is still in "
                    + "your list; try again.",
                after: error
            )
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

    /// One card for a cluster that zooming cannot pull apart: several photos
    /// taken from one standing spot, in one of the reader's own layers. All
    /// the members' photos share the strip; opening only the first member
    /// left the others unreachable. Clusters never span layers, so one layer
    /// is where the card loads its bytes from.
    func callout(clusterMemberIDs ids: [String]) -> UserVectorCalloutItem? {
        var layerID: String?
        var featureIDs: [String] = []
        for id in ids {
            guard let separator = id.firstIndex(of: "/") else { continue }
            let layer = String(id[id.startIndex..<separator])
            if layerID == nil { layerID = layer }
            guard layer == layerID else { return nil }
            featureIDs.append(String(id[id.index(after: separator)...]))
        }
        guard let layerID, let row = rows.first(where: { $0.id == layerID }),
              let parsed = row.parsed
        else { return nil }
        let wanted = Set(featureIDs)
        let features = parsed.features.filter { $0.id.map(wanted.contains) == true }
        guard let first = features.first else { return nil }
        if features.count == 1 {
            return UserVectorCalloutItem(feature: first, record: row.record)
        }
        let photos = features.flatMap { PhotoDescriptor.read(from: $0.properties) }
        // Dated by the photos themselves when there are photos: a stored
        // point carries no `nsmts:capturedAt` of its own unless it was a GPS
        // mark, and a card about six photos counts the six.
        let detail =
            photos.isEmpty
            ? PhotoMapViewModel.clusterDateDetail(features)
            : PhotoMapViewModel.clusterDateDetail(dates: photos.compactMap(\.capturedAt), of: photos.count)
        // Counted as what they are: two points with four photos between
        // them are four photos across two points, not "2 photos".
        let title =
            if photos.isEmpty {
                "\(features.count) features here"
            } else if photos.count == features.count {
                "\(features.count) photos here"
            } else {
                "\(photos.count) photos across \(features.count) points"
            }
        return UserVectorCalloutItem(
            id: "\(layerID)/cluster:\(featureIDs.sorted().joined(separator: ","))",
            callout: VectorFeatureCallout(
                title: title,
                detail: detail,
                provenance: row.record.provenanceText
            ),
            layerName: row.record.name,
            layerID: layerID,
            photos: photos,
            memberFeatureIDs: featureIDs.sorted()
        )
    }

    /// A write that did not land, in the library's words when the library
    /// is sealed: a full disk was never the problem then.
    private func refuse(_ message: String, after error: (any Error)? = nil) {
        // A new failure outranks the notice that a library was set aside.
        recoveryNotice = nil
        // A refusal that is the library's, not the disk's, seals it now
        // rather than on the next launch: every later write then says why.
        if let error, Self.isLibraryRefusal(error) {
            seal(after: error)
        }
        lastRefusal = Self.storageRefusal(
            isLibrarySealed ? (sealedMessage ?? Self.unreadableLibraryMessage) : message
        )
    }

    /// A document written by a newer build, whatever version it names.
    private static func isFromALaterVersion(_ refusal: UserVectorStore.StoreRefusal) -> Bool {
        if case .fromALaterVersion = refusal { true } else { false }
    }

    private static func isLibraryRefusal(_ error: any Error) -> Bool {
        guard let refusal = error as? UserVectorStore.StoreRefusal else { return false }
        switch refusal {
        case .fromALaterVersion, .unreadable: return true
        default: return false
        }
    }

    private func seal(after error: any Error) {
        isLibrarySealed = true
        recoveryNotice = nil
        switch error as? UserVectorStore.StoreRefusal {
        case .fromALaterVersion?:
            sealedReason = .laterVersion
            sealedMessage = Self.laterVersionMessage
        case .unreadable?:
            sealedReason = .unreadable
            sealedMessage = Self.unreadableLibraryMessage
        default:
            // A raw read failure is not evidence of damage; nothing is
            // offered to move aside on its strength.
            sealedReason = .storageError
            sealedMessage = Self.storageErrorMessage
        }
        lastRefusal = Self.storageRefusal(sealedMessage ?? Self.unreadableLibraryMessage)
    }

    /// Moves a damaged library aside and starts a new one. Only for a
    /// document damaged at this build's own version; a newer build's is left
    /// for that build. Nothing is deleted.
    @discardableResult
    func setAsideDamagedLibrary() async -> Bool {
        guard sealedReason == .unreadable, !isSettingAside else { return false }
        isSettingAside = true
        defer { isSettingAside = false }
        let recovered: Bool
        do {
            writeGeneration += 1
            recovered = try await store.setAsideDamagedLibrary()
        } catch {
            recovered = false
        }
        guard recovered else {
            // Said, not swallowed: the reader tapped a button that did
            // nothing otherwise.
            lastRefusal = Self.storageRefusal(
                "The library couldn't be set aside. Nothing was changed; try again later."
            )
            return false
        }
        isLibrarySealed = false
        sealedMessage = nil
        sealedReason = nil
        lastRefusal = nil
        rows = []
        recoveryNotice =
            "Your drawn layers could not be read, so they were set aside and a new library "
            + "started. Nothing was deleted."
        await load()
        return true
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
