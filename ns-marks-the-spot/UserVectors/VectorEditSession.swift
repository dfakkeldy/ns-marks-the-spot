import Foundation
import GeoCore
import Observation

/// One open editing session on one of the user's layers.
///
/// Kept apart from `UserVectorsViewModel` so the list stays narrow: editing is
/// a mode the rest of the app does not need to know about, and the panel that
/// lists layers should not gain a member for every drawing tool.
///
/// The session holds its own working copy. The map draws that copy rather than
/// the stored one, so a shape follows the user's finger instead of waiting for
/// a write to finish.
@MainActor
@Observable
final class VectorEditSession {
    /// What a map tap currently means.
    enum Tool: Equatable {
        case drawing(VectorEditShape)
        /// Tapping selects a feature to name, move or delete.
        case selecting
        /// Tapping takes the feature under the finger off the layer.
        case erasing
    }

    private(set) var editingID: String?
    private(set) var record: UserVectorLayerRecord?
    private(set) var parsed: ParsedVector?
    private(set) var draft: VectorDraft?
    private(set) var selectedFeatureID: String?
    var tool: Tool = .selecting

    /// What this erase run took off, oldest first, each with the place it
    /// came from.
    ///
    /// Empty unless the eraser is up. This is what stands in for the
    /// per-feature confirmation the eraser replaces: an alert per feature is
    /// the thing a delete mode exists to avoid, so the safety moves to the
    /// other side of the action and every erase can be taken back while the
    /// mode that made it is still on.
    ///
    /// The features rather than snapshots of the whole layer: a run over a
    /// ten-thousand-feature layer would otherwise hold a copy of it per tap.
    private(set) var erased: [(index: Int, feature: GeoJsonFeature)] = []

    /// Why the last write did not land. Held rather than thrown: a failed save
    /// must never interrupt drawing, so the edit stays on screen and the user
    /// is told that keeping it is what failed.
    private(set) var storageError: String?

    /// Matches the georeferencer's marker-drag debounce, for the same reason:
    /// a drag changes the geometry on every touch move, and writing each one
    /// would put a file write on the main thread dozens of times a second.
    static let persistDelay = Duration.milliseconds(400)

    private let viewModel: UserVectorsViewModel
    private let persistDelay: Duration
    @ObservationIgnored private var persistTask: Task<Void, Never>?
    /// The edit that has not reached the disk yet, if there is one.
    ///
    /// Tracked rather than inferred from `parsed`, because "there is geometry
    /// here" and "the geometry here differs from the stored copy" are different
    /// questions. Without it, closing a session the user only looked at would
    /// rewrite the file and advance the revision, and closing one the timer had
    /// already saved would do it a second time — two modified dates and two
    /// revisions for one edit.
    @ObservationIgnored private var unsaved: ParsedVector?

    /// Counts commits, so a write that lands late can tell whether what it
    /// wrote is still the newest thing the user has done.
    @ObservationIgnored private var revision = 0

    /// A layer name typed but not written yet, and the timer that will write it.
    @ObservationIgnored private var pendingName: String?
    @ObservationIgnored private var renameTask: Task<Void, Never>?

    /// Session-scoped snap prefs. Not persisted; each edit session starts
    /// from the contract defaults (own features on, parcels off).
    var snapEnabled = true
    var snapOwnFeatures = true
    var snapParcels = false
    /// True once any vertex of the in-progress draft snapped to a parcel.
    /// Consumed at commit; a later drag away keeps the stamp.
    var draftSnappedToParcel = false
    /// Why parcel snapping is not mounting rings, when it is not.
    var parcelSnapNote: String?
    /// Viewport parcel rings currently armed for snapping.
    var parcelSnapTargets: [SnapEngine.Target] = []
    var parcelSnapRings: [[[GeoJsonPosition]]] = []

    init(viewModel: UserVectorsViewModel, persistDelay: Duration = VectorEditSession.persistDelay) {
        self.viewModel = viewModel
        self.persistDelay = persistDelay
    }

    var isEditing: Bool { editingID != nil }

    func begin(_ row: UserVectorsViewModel.Row) {
        // A layer that has stored features but no loaded geometry must not be
        // edited from an empty working copy: the first commit would persist
        // that emptiness over the stored file. Callers load geometry first;
        // this is the belt.
        guard row.parsed != nil || row.record.featureCount == 0 else { return }
        storageError = nil
        selectedFeatureID = nil
        draft = nil
        erased = []
        conversionUndo = nil
        photoMessages = []
        photoLocationOffer = nil
        tool = .selecting
        editingID = row.id
        record = row.record
        // An empty working copy rather than nothing, so a layer whose geometry
        // is still loading can be drawn on rather than silently swallowing the
        // first taps.
        parsed = row.parsed ?? ParsedVector(features: [], bbox: nil)
    }

    /// Ends the session, writing anything still pending.
    ///
    /// Losing the tail of a session is the one moment the debounce would read
    /// as data loss — so an edit that could not be written keeps the session
    /// open, with the error on screen and the geometry still in hand. The one
    /// working copy of the user's shape is not discarded because a disk was
    /// full.
    @discardableResult
    func end() async -> Bool {
        guard await flush() else { return false }
        editingID = nil
        record = nil
        parsed = nil
        draft = nil
        selectedFeatureID = nil
        erased = []
        conversionUndo = nil
        photoMessages = []
        photoLocationOffer = nil
        tool = .selecting
        return true
    }

    // MARK: - Drawing

    func startDrawing(_ shape: VectorEditShape) {
        selectedFeatureID = nil
        erased = []
        draftSnappedToParcel = false
        tool = .drawing(shape)
        draft = VectorDraft(shape: shape)
    }

    func cancelDrawing() {
        draft = nil
        tool = .selecting
    }

    /// A tap on the map. `parcelSnap` is recorded at event time, never by
    /// comparing the stored coordinate afterwards.
    func handleTap(latitude: Double, longitude: Double, parcelSnap: Bool = false) {
        guard isEditing else { return }
        switch tool {
        case .drawing(let shape):
            // The first tap of a new shape lets go of the last one. The panel
            // shows the selected feature's name fields, and leaving the
            // previous feature selected while a new one is being placed puts a
            // name field for shape A under the vertices of shape B.
            if draft == nil {
                selectedFeatureID = nil
                draftSnappedToParcel = false
            }
            if parcelSnap { draftSnappedToParcel = true }
            var current = draft ?? VectorDraft(shape: shape)
            current.append(GeoJsonPosition(lng: longitude, lat: latitude))
            draft = current
            // A point is finished the moment it is placed. Asking the user to
            // confirm a single tap would be asking twice for one decision.
            if shape == .point {
                finishDrawing()
            }
        case .selecting, .erasing:
            // Both are answered by what is under the finger, which only the
            // map knows: the tolerance for "under" is a distance on screen,
            // and the session has no zoom to convert it with.
            break
        }
    }

    // MARK: - Erasing

    /// Arms the eraser. Each tap takes off the feature under the finger.
    func startErasing() {
        draft = nil
        selectedFeatureID = nil
        erased = []
        tool = .erasing
    }

    /// Puts the eraser down. What was erased stays erased.
    func stopErasing() {
        erased = []
        tool = .selecting
    }

    /// Takes one feature off, keeping it and its place in case of undo.
    func erase(featureID: String) {
        guard let parsed,
            let index = parsed.features.firstIndex(where: { $0.id == featureID })
        else { return }
        erased.append((index, parsed.features[index]))
        if selectedFeatureID == featureID { selectedFeatureID = nil }
        commit(VectorEdit.removing(featureID: featureID, from: parsed))
    }

    var erasedCount: Int { erased.count }

    /// Puts the last erased feature back, with its id, its text and its place
    /// in the drawing order.
    func undoLastErase() {
        guard let parsed, let last = erased.popLast() else { return }
        commit(VectorEdit.inserting(last.feature, at: last.index, in: parsed))
    }

    func undoLastVertex() {
        draft?.removeLastVertex()
    }

    /// Commits the drawn shape, if it is one yet.
    func finishDrawing() {
        guard let parsed, let geometry = draft?.geometry() else { return }
        var properties: [String: JSONValue] = [
            CaptureSpec.createdAtKey: .string(CaptureTime.iso(Date()))
        ]
        if draftSnappedToParcel {
            properties[CaptureSpec.tracedKey] = .string(CaptureSpec.tracedParcelValue)
        }
        let edited = VectorEdit.adding(geometry, to: parsed, properties: properties)
        draft = nil
        draftSnappedToParcel = false
        // The tool stays armed, as the browser's does: someone marking six
        // culverts along a road marks them one after another, and reopening
        // Point between each is five taps that do nothing but restore the
        // state the app just left. The tool button stays lit, and tapping it
        // again puts the tool down.
        //
        // Selected on commit, so the panel opens on the feature just drawn and
        // it can be named while the user still knows what it is. The next tap
        // on the map lets go of it again.
        selectedFeatureID = edited.features.last?.id
        commit(edited)
    }

    // MARK: - Converting points

    /// The layer as it was before the last conversion, for the one-shot
    /// undo. Cleared by any later commit or by the session ending: an undo
    /// that reached back past newer edits would take those edits with it.
    private(set) var conversionUndo: ParsedVector?

    /// Whether the convert section is open, so the map can draw the
    /// connect-the-dots order before the user commits to it — the contract's
    /// safeguard against a surprising stored order.
    var isPreviewingConversion = false

    var convertPlanLine: ConversionPlan? {
        guard let parsed else { return nil }
        return VectorEdit.conversionPlan(for: parsed, shape: .line)
    }

    var convertPlanArea: ConversionPlan? {
        guard let parsed else { return nil }
        return VectorEdit.conversionPlan(for: parsed, shape: .area)
    }

    /// Connects the layer's points into a line or area through the session's
    /// single write path, remembering the pre-conversion collection for one
    /// undo.
    func convertPoints(shape: ConvertShape, keepSourcePoints: Bool) {
        guard let parsed,
              let result = VectorEdit.convertingPoints(
                  in: parsed, shape: shape, keepSourcePoints: keepSourcePoints
              )
        else { return }
        let before = parsed
        selectedFeatureID = result.feature.id
        commit(result.parsed)
        // After the commit: `commit` is also where every other edit clears
        // the undo, and the conversion's own commit must not clear its own.
        conversionUndo = before
    }

    /// Recommits the pre-conversion collection through the normal write
    /// path. One-shot: a second tap has nothing to reach for.
    func undoConversion() {
        guard let before = conversionUndo else { return }
        selectedFeatureID = nil
        commit(before)
        conversionUndo = nil
    }

    // MARK: - Marking

    /// A GPS mark taken while this session is open lands in the edited
    /// layer, through the same write path as a drawn shape.
    func appendMark(_ feature: GeoJsonFeature) {
        guard let parsed else { return }
        selectedFeatureID = feature.id
        commit(VectorEdit.recomputed(parsed.features + [feature]))
    }

    // MARK: - Features

    func select(featureID: String?) {
        selectedFeatureID = featureID
    }

    var selectedFeature: GeoJsonFeature? {
        guard let selectedFeatureID else { return nil }
        return parsed?.features.first { $0.id == selectedFeatureID }
    }

    func updateSelectedFeature(name: String?, description: String?) {
        guard let parsed, let id = selectedFeatureID else { return }
        commit(
            VectorEdit.updating(
                featureID: id, name: name, description: description, in: parsed
            )
        )
    }

    /// The freeform-attribute write path: a value sets the key, nil deletes
    /// it. Values typed in the app arrive as strings per the contract.
    func updateFeatureProperties(featureID: String, patch: [String: JSONValue?]) {
        guard let parsed else { return }
        commit(VectorEdit.updatingProperties(featureID: featureID, patch: patch, in: parsed))
    }

    // MARK: - Photos

    /// One attach's outcome, for the strip to show. Failures name the cap
    /// or the reason; quota, decode, and cap problems are distinct.
    private(set) var photoMessages: [String] = []

    /// The one narrow offer made at attach time: the photo's EXIF position,
    /// held only until the strip acts on or dismisses it. Never persisted —
    /// re-encoding strips the geotag from every stored byte, and the only
    /// location that survives is geometry the user confirms here.
    struct PhotoLocationOffer: Equatable {
        var featureID: String
        var position: GeoJsonPosition
        var distanceM: Double
    }
    private(set) var photoLocationOffer: PhotoLocationOffer?

    /// Attaches picked or captured photo bytes to the selected feature:
    /// pipeline re-encode (EXIF stripped), caps checked with messages that
    /// name them, files written through the store, descriptor patched
    /// through the session's write path.
    func attachPhotos(
        _ items: [(data: Data, sourceName: String?, capturedAt: String?)]
    ) async {
        guard let layerID = editingID, let featureID = selectedFeatureID else { return }
        photoMessages = []
        for item in items {
            guard let parsed,
                  let feature = parsed.features.first(where: { $0.id == featureID })
            else { return }
            let existing = PhotoDescriptor.read(from: feature.properties)
            if existing.count >= PhotoDescriptor.maxPerFeature {
                photoMessages.append(
                    "This feature already has \(PhotoDescriptor.maxPerFeature) photos — the cap. Not added."
                )
                continue
            }
            let layerCount = await viewModel.photoCount(layerID: layerID)
            if layerCount >= PhotoDescriptor.maxPerLayer {
                photoMessages.append(
                    "This layer already has \(PhotoDescriptor.maxPerLayer) photos — the cap. Not added."
                )
                continue
            }

            let bytes = item.data
            let outcome = await Task.detached(
                priority: .userInitiated
            ) { () -> Result<(PhotoPipeline.Processed, PhotoPipeline.CaptureClaims), PhotoPipeline.Refusal> in
                // Claims read before the re-encode that strips them.
                let claims = PhotoPipeline.captureClaims(bytes)
                do throws(PhotoPipeline.Refusal) {
                    return .success((try PhotoPipeline.process(bytes), claims))
                } catch {
                    return .failure(error)
                }
            }.value

            let processed: PhotoPipeline.Processed
            let claims: PhotoPipeline.CaptureClaims
            switch outcome {
            case .success(let value):
                (processed, claims) = value
            case .failure(let refusal):
                photoMessages.append(refusal.userMessage)
                continue
            }

            let photoID = UUID().uuidString
            guard await viewModel.addPhotoFile(
                layerID: layerID, photoID: photoID,
                full: processed.fullJpeg, thumb: processed.thumbJpeg
            ) else {
                photoMessages.append(
                    "This photo could not be saved to your device. Free some space and try again."
                )
                continue
            }
            let descriptor = PhotoDescriptor(
                id: photoID,
                // The photo's own claim (EXIF DateTimeOriginal) or the
                // caller's (the camera's capture moment); never invented.
                capturedAt: claims.capturedAt ?? item.capturedAt,
                sourceName: item.sourceName,
                width: Double(processed.width),
                height: Double(processed.height)
            )
            updateFeatureProperties(
                featureID: featureID,
                patch: [
                    CaptureSpec.photosKey: PhotoDescriptor.propertyValue(
                        internalForm: existing + [descriptor]
                    )
                ]
            )
            // The geotag offer, once, for a Point feature: shown with the
            // distance so "move my pin 3 km" is a decision, not a surprise.
            if case .point(let current)? = feature.geometry, let location = claims.location {
                photoLocationOffer = PhotoLocationOffer(
                    featureID: featureID,
                    position: GeoJsonPosition(lng: location.lng, lat: location.lat),
                    distanceM: Geodesy.pathDistanceMetres([
                        GeoPoint(lat: current.lat, lng: current.lng), location,
                    ])
                )
            }
        }
    }

    func removePhoto(featureID: String, photoID: String) async {
        guard let layerID = editingID, let parsed,
              let feature = parsed.features.first(where: { $0.id == featureID })
        else { return }
        let remaining = PhotoDescriptor.read(from: feature.properties)
            .filter { $0.id != photoID }
        updateFeatureProperties(
            featureID: featureID,
            patch: [
                CaptureSpec.photosKey: remaining.isEmpty
                    ? nil : PhotoDescriptor.propertyValue(internalForm: remaining)
            ]
        )
        if photoLocationOffer?.featureID == featureID {
            photoLocationOffer = nil
        }
        await viewModel.deletePhotoFile(layerID: layerID, photoID: photoID)
    }

    /// Accepts the attach-time geotag offer: the point moves to where the
    /// photo says it was taken.
    func acceptPhotoLocationOffer() {
        guard let offer = photoLocationOffer, let parsed else { return }
        photoLocationOffer = nil
        commit(
            VectorEdit.moving(
                featureID: offer.featureID, ring: 0, vertex: 0,
                to: offer.position, in: parsed
            )
        )
    }

    func dismissPhotoLocationOffer() {
        photoLocationOffer = nil
    }

    func clearPhotoMessages() {
        photoMessages = []
    }

    /// The bytes behind one of the edited layer's photos, for the strip and
    /// the lightbox.
    func photoData(photoID: String, thumb: Bool) async -> Data? {
        guard let editingID else { return nil }
        return await viewModel.photoData(layerID: editingID, photoID: photoID, thumb: thumb)
    }

    func deleteSelectedFeature() {
        guard let parsed, let id = selectedFeatureID else { return }
        selectedFeatureID = nil
        commit(VectorEdit.removing(featureID: id, from: parsed))
    }

    func moveVertex(
        featureID: String, ring: Int, vertex: Int, latitude: Double, longitude: Double,
        parcelSnap: Bool = false
    ) {
        guard var parsed else { return }
        parsed = VectorEdit.moving(
            featureID: featureID,
            ring: ring,
            vertex: vertex,
            to: GeoJsonPosition(lng: longitude, lat: latitude),
            in: parsed
        )
        if parcelSnap {
            parsed = VectorEdit.updatingProperties(
                featureID: featureID,
                patch: [CaptureSpec.tracedKey: .string(CaptureSpec.tracedParcelValue)],
                in: parsed
            )
        }
        commit(parsed)
    }

    /// Carries a whole feature by the distance its handle travelled.
    ///
    /// A shape drawn in the wrong place would otherwise have to be corrected a
    /// vertex at a time, which is slow and comes out a different shape.
    func moveFeature(featureID: String, latitudeDelta: Double, longitudeDelta: Double) {
        guard let parsed else { return }
        commit(
            VectorEdit.translating(
                featureID: featureID,
                byLatitude: latitudeDelta,
                longitude: longitudeDelta,
                in: parsed
            )
        )
    }

    /// Takes the layer name as it is typed, and writes it once typing stops.
    ///
    /// Debounced like the geometry, and for the same reason the geometry is:
    /// the browser commits every keystroke into its session and lets one
    /// delayed write reach storage. Writing per keystroke here would be a
    /// library document per character, and because each write is its own task
    /// two of them could land out of order and leave "parce" saved over
    /// "parcel".
    ///
    /// A cleared field schedules nothing and cancels nothing: the layer has to
    /// be called something, so what gets written is the last name the user
    /// actually typed.
    func setLayerName(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != record?.name else { return }
        pendingName = trimmed
        record?.name = trimmed
        renameTask?.cancel()
        renameTask = Task { [weak self] in
            try? await Task.sleep(for: self?.persistDelay ?? .milliseconds(400))
            guard !Task.isCancelled else { return }
            await self?.writePendingName()
        }
    }

    private func writePendingName() async {
        guard let name = pendingName else { return }
        pendingName = nil
        await renameLayer(name)
    }

    func renameLayer(_ name: String) async {
        guard let editingID else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        record?.name = trimmed
        await viewModel.rename(id: editingID, to: trimmed)
    }

    // MARK: - Writing

    /// The single write path: hold the new geometry, then schedule the save.
    private func commit(_ edited: ParsedVector) {
        // Any commit invalidates the conversion undo — reaching back past a
        // newer edit would take that edit with it. `convertPoints` re-arms it
        // immediately after its own commit.
        conversionUndo = nil
        parsed = edited
        unsaved = edited
        revision += 1
        record?.featureCount = edited.featureCount
        record?.bbox = edited.bbox
        schedulePersist()
    }

    private func schedulePersist() {
        persistTask?.cancel()
        let delay = persistDelay
        persistTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.write()
        }
    }

    /// Writes whatever is pending now, rather than when the timer says.
    ///
    /// Called when the session ends and when the app is going away: a debounce
    /// that outlives the thing it was debouncing writes nothing at all, because
    /// the scheduled task is holding the session weakly and the session is
    /// gone.
    @discardableResult
    func flush() async -> Bool {
        renameTask?.cancel()
        renameTask = nil
        await writePendingName()
        persistTask?.cancel()
        persistTask = nil
        return await write()
    }

    /// Writes what is pending, and anything committed while that was in
    /// flight.
    ///
    /// The loop is the point. A write suspends on storage, and the main actor
    /// is free during the suspension, so the user can commit again before it
    /// returns — an undo landing on top of the erase being written is exactly
    /// that. Clearing the pending copy unconditionally would drop the newer
    /// edit on the floor: the timer that would have written it was cancelled
    /// by the commit that made it, and its replacement finds nothing pending.
    /// So the pending copy is cleared only if nothing arrived meanwhile, and
    /// the newer edit is written on the next turn.
    @discardableResult
    private func write() async -> Bool {
        // Nothing pending is a success: there is no edit that failed to save.
        guard let editingID else { return true }
        while let pending = unsaved {
            let written = revision
            guard await viewModel.replaceGeometry(id: editingID, with: pending) else {
                // The view model reports its own storage refusals; surfaced here
                // so the editing panel says it rather than the layer list the
                // user cannot see while editing. The pending copy is kept, so
                // the next edit or the next Done tries again.
                storageError = viewModel.lastRefusal?.userMessage
                return false
            }
            storageError = nil
            record = viewModel.rows.first { $0.id == editingID }?.record ?? record
            guard revision == written else { continue }
            unsaved = nil
        }
        return true
    }
}
