import Foundation
import GeoCore
import Observation
import UIKit

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

    /// The feature the last commit added, for the map to halo while the reader
    /// can still connect the tap to the shape. A point that dropped to its
    /// resting marker the instant it was placed read as a point that had
    /// vanished. Cleared after `commitHighlightDuration`.
    private(set) var recentlyCommittedFeatureID: String?
    static let commitHighlightDuration: Duration = .milliseconds(2500)
    /// Overridable so a test can watch the halo come off without waiting.
    @ObservationIgnored var commitHighlightLifetime: Duration =
        VectorEditSession.commitHighlightDuration
    @ObservationIgnored private var commitHighlightTask: Task<Void, Never>?

    /// What the last tap snapped to, in words, for the panel.
    ///
    /// A snap that only ticked the haptic was a tap that seemed to do nothing
    /// when the snapped point landed where a mark already was.
    private(set) var snapNotice: String?
    static let snapNoticeDuration: Duration = .seconds(2)
    @ObservationIgnored private var snapNoticeTask: Task<Void, Never>?

    /// True from Done until the last write has landed or failed. Taps on the
    /// map are ignored meanwhile: a vertex placed while the save was in
    /// flight was cleared with the session when the write returned.
    private(set) var isEnding = false

    /// True from the moment the scene stops being active until it is active
    /// again. New operations and attachments are refused meanwhile, as they
    /// are once Done has begun: one accepted after the drain would be lost
    /// with the process. Closed synchronously by the container when the
    /// scene leaves `.active` — before any task the last tap started can
    /// run — and opened again only when the scene is back.
    private(set) var isSuspending = false

    func beginSuspension() {
        isSuspending = true
    }

    func endSuspension() {
        isSuspending = false
    }

    /// Whether anything was committed in this session, so `end()` knows if
    /// there is work a hidden layer would swallow.
    @ObservationIgnored private var editedThisSession = false

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

    /// Photos attached to a feature since the last successful write, by id:
    /// reserved in the store until a write carries their descriptors.
    @ObservationIgnored private var committedPhotoIDs: Set<String> = []

    /// A layer name typed but not written yet, and the timer that will write it.
    @ObservationIgnored private var pendingName: String?
    @ObservationIgnored private var renameTask: Task<Void, Never>?

    /// Session-scoped snap prefs. Not persisted; each edit session starts
    /// from the contract defaults (own features on, parcels off).
    var snapEnabled = true
    var snapOwnFeatures = true
    var snapParcels = false
    /// Which of the draft's vertices were placed by a parcel snap, in vertex
    /// order. Undo takes a vertex's flag with it: a line whose only snapped
    /// corner was undone has no coordinate from NSPRD and is not stamped as
    /// traced from it. Consumed at commit; a later drag away keeps the stamp.
    private(set) var draftVertexSnaps: [Bool] = []
    var draftSnappedToParcel: Bool { draftVertexSnaps.contains(true) }

    /// Photo attachments in flight: picked photos being loaded, re-encoded
    /// and written. Done waits for them, so a photo chosen a moment before
    /// Done lands in the layer rather than in a session that has closed.
    @ObservationIgnored private var attachments: [UUID: Task<Void, Never>] = [:]
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
        editedThisSession = false
        recentlyCommittedFeatureID = nil
        snapNotice = nil
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
        isEnding = true
        // A photo picked a moment before Done is still being written. Waited
        // for, not raced: the flush below writes only what has been
        // committed, and an attachment landing after it would patch a
        // session that no longer exists and leave its files orphaned.
        await drainAttachments()
        // A draft that is a shape already is kept, as Done keeps everything
        // else the session did. Only one too short to be a shape is dropped,
        // and the panel asks before calling this with one of those.
        settleDraft(droppingPartial: true)
        guard await flush() else {
            isEnding = false
            return false
        }
        // Photos attached this session whose descriptors the final copy no
        // longer carries — erased, and past any undo now that the session
        // is closing — give up their reservations here, at the one barrier
        // no interactive write can race, so the next write's sweep takes
        // the files rather than holding them for good.
        if let parsed {
            let referenced = Set(parsed.features.flatMap { PhotoDescriptor.read(from: $0.properties).map(\.id) })
            for id in committedPhotoIDs where !referenced.contains(id) {
                await viewModel.releasePhotoID(id)
            }
        }
        committedPhotoIDs = []
        if editedThisSession, let editingID, layerIsHidden {
            // The layer was switched off when editing began. Its new features
            // must not vanish the moment the panel closes; the panel said this
            // would happen while the session was open. Awaited, so "switched
            // on" is not said before the library has it: the features are
            // safe either way, and a failed switch keeps the panel up with
            // the reason — and a Show now that failed earlier is simply
            // tried again here, by the same path.
            guard await showLayer() else {
                isEnding = false
                return false
            }
            // Moves and attachments are refused while ending, so nothing
            // should have been committed during the switch; a write that
            // slipped in is written rather than lost with the session.
            guard await flush() else {
                isEnding = false
                return false
            }
        }
        editingID = nil
        record = nil
        parsed = nil
        draft = nil
        selectedFeatureID = nil
        erased = []
        conversionUndo = nil
        photoMessages = []
        photoLocationOffer = nil
        recentlyCommittedFeatureID = nil
        snapNotice = nil
        tool = .selecting
        isEnding = false
        return true
    }

    /// Whether the layer under edit is switched off in the layers panel.
    ///
    /// The map draws the session's copy regardless, so the reader sees what
    /// they draw; without this the panel had no way to say that Done would
    /// hide it again.
    var layerIsHidden: Bool {
        guard let editingID else { return false }
        return viewModel.rows.first { $0.id == editingID }?.isVisible == false
    }

    /// Switches the layer on, and says whether the library has it. A refusal
    /// is put where the panel shows refusals, so "Show now" that did nothing
    /// says why.
    @discardableResult
    func showLayer() async -> Bool {
        guard let editingID else { return false }
        // Done waits for this, so a failure cannot land on a closed panel.
        let operation = beginOperation()
        defer { if let operation { endOperation(operation) } }
        let shown = await viewModel.showLayer(id: editingID)
        if shown {
            // A retry that worked takes the earlier failure down with it —
            // its own; a geometry or a name still unsaved keeps its words.
            if unsaved == nil, pendingName == nil { storageError = nil }
            note("Layer switched on.")
        } else {
            storageError = viewModel.lastRefusal?.userMessage
                ?? "The layer could not be switched on. Turn it on from Layers."
        }
        return shown
    }

    // MARK: - Attachments

    /// Runs `work` as an attachment the session owns and Done waits for.
    /// Refused once Done has begun: there is no session for the photo to
    /// land in, and the picker is not reachable then anyway.
    func beginAttachment(_ work: @escaping @Sendable @MainActor () async -> Void) {
        guard isEditing, !isEnding, !isSuspending else { return }
        let id = UUID()
        attachments[id] = Task { [weak self] in
            await work()
            self?.attachments[id] = nil
        }
    }

    /// Whether a photo attachment is still being written.
    var hasAttachmentInFlight: Bool { !attachments.isEmpty }

    /// A longer operation the session must outlive: a mark being written and
    /// its layer switched on, a Show now in flight. Done waits for these as
    /// it waits for attachments, so an accepted mark is never reported
    /// against a session that has already closed, and a late failure is not
    /// set on a panel that has gone.
    @ObservationIgnored private var operations: Set<UUID> = []
    @ObservationIgnored private var operationWaiters: [CheckedContinuation<Void, Never>] = []

    /// Nil once Done has begun: work that registers late would slip past
    /// the drain, and a panel that has gone cannot show its failure.
    func beginOperation() -> UUID? {
        guard !isEnding, !isSuspending else { return nil }
        let id = UUID()
        operations.insert(id)
        return id
    }

    /// Show now, from the panel: the operation is registered synchronously,
    /// before any task starts, so a Done tapped a moment later waits for it.
    func requestShowLayer() {
        guard let operation = beginOperation() else { return }
        Task { [weak self] in
            await self?.showLayer()
            self?.endOperation(operation)
        }
    }

    /// The app is being put away: the draft settled if asked, every accepted
    /// attachment and operation finished, the geometry written, and a hidden
    /// layer that was edited switched on. Done's own sequence, without the
    /// closing, so iOS ending the process afterwards loses nothing.
    func prepareForSuspension(settlingDraft: Bool) async -> Bool {
        // Closed here too, for a caller that did not close it first; opened
        // again by the container when the scene is active, not by this
        // returning — the app is still away when it does.
        isSuspending = true
        if settlingDraft {
            settleDraft()
        }
        await drainAttachments()
        guard await flush() else { return false }
        if editedThisSession, layerIsHidden {
            // Through the same path as Show now, so a success here takes an
            // earlier failure's words down, and a failure leaves its own for
            // the reader to come back to.
            guard await showLayer() else { return false }
        }
        return true
    }

    func endOperation(_ id: UUID) {
        operations.remove(id)
        let waiters = operationWaiters
        operationWaiters = []
        for waiter in waiters { waiter.resume() }
    }

    var hasOperationInFlight: Bool { !operations.isEmpty }

    private func drainAttachments() async {
        while true {
            if let task = attachments.values.first {
                await task.value
                continue
            }
            if operations.isEmpty { return }
            await withCheckedContinuation { operationWaiters.append($0) }
        }
    }

    // MARK: - Drawing

    /// What became of the draft when the tool changed hands.
    enum DraftDisposition: Equatable {
        /// Nothing to keep: no draft, or one with no vertices.
        case cleared
        /// A shape already, and committed to the layer.
        case finished
        /// Vertices placed but too few for the shape. Left in place for the
        /// reader to decide about.
        case needsConfirmation
    }

    /// Settles the draft before the tool changes hands.
    ///
    /// A draft that is already a shape is committed: Done, a tool switch and
    /// the eraser all used to throw it away without a word, which is the most
    /// direct explanation of "the features I drew disappeared". An empty
    /// draft is nothing to keep. One with vertices but too few for its shape
    /// is left where it is and reported, so the panel can ask; with
    /// `droppingPartial` it is dropped instead, for the paths that have
    /// already asked or have nobody to ask.
    @discardableResult
    func settleDraft(droppingPartial: Bool = false) -> DraftDisposition {
        guard let current = draft, !current.vertices.isEmpty else {
            draft = nil
            return .cleared
        }
        if current.canFinish {
            // Not a confirmation: this is the session tidying up a finishable
            // draft on its way out, not a reader finishing a shape.
            finishDrawing(confirming: false)
            return .finished
        }
        if droppingPartial {
            discardDraft()
            return .cleared
        }
        return .needsConfirmation
    }

    /// The reader chose to throw a partial draft away.
    func discardDraft() {
        draft = nil
        draftVertexSnaps = []
    }

    func startDrawing(_ shape: VectorEditShape) {
        settleDraft(droppingPartial: true)
        selectedFeatureID = nil
        erased = []
        draftVertexSnaps = []
        tool = .drawing(shape)
        draft = VectorDraft(shape: shape)
    }

    /// Puts the tool down. A draft that is a shape is finished first: tapping
    /// the lit tool says "I'm done with this", not "throw it away".
    func cancelDrawing() {
        settleDraft(droppingPartial: true)
        draft = nil
        tool = .selecting
    }

    /// The part of one of the layer's own features that may be snapped to
    /// with this tool armed, or nil for none of it.
    ///
    /// With the Point tool up, the layer's points are not targets: a new point
    /// that snapped onto an existing one sat exactly on top of it, an
    /// invisible duplicate that read as a tap that did nothing. Lines and
    /// areas stay targets, so a culvert can still be put on a bend, and a
    /// collection keeps its lines and areas while losing its points. Every
    /// other tool keeps every target.
    static func snapTargetGeometry(_ geometry: GeoJsonGeometry, tool: Tool) -> GeoJsonGeometry? {
        guard tool == .drawing(.point) else { return geometry }
        switch geometry {
        case .point, .multiPoint:
            return nil
        case .collection(let children):
            let kept = children.compactMap { snapTargetGeometry($0, tool: tool) }
            return kept.isEmpty ? nil : .collection(kept)
        case .lineString, .multiLineString, .polygon, .multiPolygon:
            return geometry
        }
    }

    /// Says what a tap snapped to. Cleared after a moment; the next snap
    /// replaces it.
    func noteSnap(_ hit: SnapEngine.Hit) {
        note(
            Self.snapNoticeText(
                source: hit.source, kind: hit.kind, pointToolArmed: tool == .drawing(.point)
            )
        )
    }

    /// The eraser found nothing under the finger; said, so a tap on open
    /// ground is not a tap that did nothing.
    func noteEraseMiss() {
        note("No feature here.")
    }

    /// Counts notices, so the same words twice in a row are two events: the
    /// panel announces on this, not on the text, which SwiftUI would see as
    /// unchanged.
    private(set) var snapNoticeGeneration = 0

    /// A one-line answer to a tap, for the panel; cleared after a moment.
    private func note(_ text: String) {
        snapNotice = text
        snapNoticeGeneration += 1
        snapNoticeTask?.cancel()
        snapNoticeTask = Task { [weak self] in
            try? await Task.sleep(for: Self.snapNoticeDuration)
            guard !Task.isCancelled else { return }
            self?.snapNotice = nil
        }
    }

    /// With the Point tool armed, the layer's points are not targets, so a
    /// vertex hit is a corner of a line or area; with any other tool it may
    /// as well be a point feature, and "point" covers both in plain words.
    static func snapNoticeText(
        source: SnapEngine.Source, kind: SnapEngine.Kind, pointToolArmed: Bool = false
    ) -> String {
        switch (source, kind) {
        case (.parcel, _): "Snapped to a parcel boundary."
        case (.ownFeature, .vertex):
            pointToolArmed ? "Snapped to an existing corner." : "Snapped to an existing point."
        case (.ownFeature, .edge): "Snapped to an existing edge."
        }
    }

    /// A tap on the map. `parcelSnap` is recorded at event time, never by
    /// comparing the stored coordinate afterwards.
    /// Whether a pair of numbers is a place on Earth: finite and inside the
    /// WGS84 range. The last guard before a coordinate is written.
    static func isPlaceable(latitude: Double, longitude: Double) -> Bool {
        latitude.isFinite && longitude.isFinite && abs(latitude) <= 90 && abs(longitude) <= 180
    }

    func handleTap(latitude: Double, longitude: Double, parcelSnap: Bool = false) {
        guard isEditing, !isEnding, Self.isPlaceable(latitude: latitude, longitude: longitude) else { return }
        switch tool {
        case .drawing(let shape):
            // The first tap of a new shape lets go of the last one. The panel
            // shows the selected feature's name fields, and leaving the
            // previous feature selected while a new one is being placed puts a
            // name field for shape A under the vertices of shape B.
            if draft == nil {
                selectedFeatureID = nil
                draftVertexSnaps = []
            }
            var current = draft ?? VectorDraft(shape: shape)
            let position = GeoJsonPosition(lng: longitude, lat: latitude)
            if shape == .area, current.vertices.count >= 3, position == current.vertices.first {
                // Tapping the first corner again closes the area, as drawing
                // tools have always let a reader do; the closing position is
                // added by `geometry()`, not stored twice. Whether the tap
                // that closed it was a snap says nothing about how the first
                // corner was placed, so it records no provenance.
                draft = current
                finishDrawing()
                return
            }
            // A line may come back to an earlier corner — an out-and-back
            // track does — but not to the one just placed, which would be a
            // zero-length segment that counts towards a shape and draws
            // nothing. An area may not revisit any corner but its first,
            // which closes it above: a ring that touches itself is not the
            // area anyone meant. Most often this is a snap onto a corner
            // already placed.
            let repeats = shape == .line
                ? current.vertices.last == position
                : shape == .area && current.vertices.contains(position)
            if repeats {
                note("Already a corner here.")
                return
            }
            current.append(position)
            if shape == .point {
                draftVertexSnaps = [parcelSnap]
            } else {
                draftVertexSnaps.append(parcelSnap)
            }
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

    /// Arms the eraser. Each tap takes off the feature under the finger. A
    /// draft that is a shape is finished first, not erased by implication.
    func startErasing() {
        settleDraft(droppingPartial: true)
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
        // Said, where the panel's notices are said: an erase with no sound
        // and no dialog is otherwise a tap that did nothing, to VoiceOver.
        note("Feature deleted. Undo available.")
    }

    var erasedCount: Int { erased.count }

    /// Puts the last erased feature back, with its id, its text and its place
    /// in the drawing order.
    func undoLastErase() {
        guard let parsed, let last = erased.popLast() else { return }
        commit(VectorEdit.inserting(last.feature, at: last.index, in: parsed))
    }

    func undoLastVertex() {
        guard let draft, !draft.vertices.isEmpty else { return }
        self.draft?.removeLastVertex()
        if !draftVertexSnaps.isEmpty {
            draftVertexSnaps.removeLast()
        }
    }

    /// Commits the drawn shape, if it is one yet.
    /// Finishes the shape being drawn.
    ///
    /// `confirming` is whether a reader just asked for this. Every way of
    /// finishing arrives here — the panel's button, an area closed on its own
    /// first corner, a point finished the moment it is placed — but so does
    /// `settleDraft`, which runs when the app leaves the foreground or the
    /// session ends. A buzz and a spoken sentence there would answer a phone
    /// in a pocket for something nobody just did.
    func finishDrawing(confirming: Bool = true) {
        guard let parsed, let geometry = draft?.geometry() else { return }
        var properties: [String: JSONValue] = [
            CaptureSpec.createdAtKey: .string(CaptureTime.iso(Date()))
        ]
        if draftSnappedToParcel {
            properties[CaptureSpec.tracedKey] = .string(CaptureSpec.tracedParcelValue)
        }
        let edited = VectorEdit.adding(geometry, to: parsed, properties: properties)
        let shape = draft?.shape
        // Read before the draft is let go, for the sentence below: the corners
        // are what the reader placed, and after this line nothing holds them.
        let placedCorners = draft?.vertices.count ?? 0
        draft = nil
        draftVertexSnaps = []
        // The Point tool stays armed: someone marking six culverts along a
        // road marks them one after another, and reopening Point between each
        // is five taps that do nothing but restore the state the app just
        // left. A finished line or area puts its tool down, though: Finish is
        // an explicit end, and with the tool still up a tap near a corner of
        // the new shape placed a fresh vertex instead of selecting the shape
        // to drag it.
        //
        // Selected on commit, so the panel opens on the feature just drawn and
        // it can be named while the user still knows what it is. The next tap
        // on the map lets go of it again.
        if shape != .point {
            tool = .selecting
        }
        selectedFeatureID = edited.features.last?.id
        commit(edited)
        markRecentlyCommitted(edited.features.last?.id)
        // A tap rather than a success notification: the shape is on the map
        // and in the working copy, the write behind it is debounced, and
        // nothing here may promise the disk has it. A write that fails says so
        // in the panel's own words.
        if confirming {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
        // A line or an area is finished by a control away from the shape, and
        // read out it is otherwise a button that appeared to do nothing. A
        // point keeps whatever the snap said instead: that is the more
        // specific answer, and this would replace it a moment after it was
        // made.
        if confirming, let shape, shape != .point {
            note("\(shape == .area ? "Area" : "Line") finished with \(placedCorners) corners.")
        }
    }

    private func markRecentlyCommitted(_ id: String?) {
        recentlyCommittedFeatureID = id
        commitHighlightTask?.cancel()
        guard id != nil else { return }
        let lifetime = commitHighlightLifetime
        commitHighlightTask = Task { [weak self] in
            try? await Task.sleep(for: lifetime)
            guard !Task.isCancelled, self?.recentlyCommittedFeatureID == id else { return }
            self?.recentlyCommittedFeatureID = nil
        }
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
    /// layer, through the same write path as a drawn shape. False once Done
    /// has begun — the session is closing, and a mark written into it could
    /// land after the final flush and be lost — unless the mark holds an
    /// operation registered before Done began: Done is waiting for exactly
    /// that, and flushes after it, so the mark is committed through this
    /// session as the field-capture contract says.
    @discardableResult
    func appendMark(_ feature: GeoJsonFeature, holding operation: UUID? = nil) -> Bool {
        guard let parsed else { return false }
        let held = operation.map(operations.contains) ?? false
        guard !isEnding || held else { return false }
        selectedFeatureID = feature.id
        commit(VectorEdit.recomputed(parsed.features + [feature]))
        markRecentlyCommitted(feature.id)
        return true
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
    private(set) var photoMessages: [String] = [] {
        didSet {
            // Counted, so the same failure twice is two events to VoiceOver.
            if !photoMessages.isEmpty { photoMessageGeneration += 1 }
        }
    }
    private(set) var photoMessageGeneration = 0

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
        _ items: [(data: Data, sourceName: String?, capturedAt: String?)],
        to targetFeatureID: String? = nil,
        failedLoads: Int = 0
    ) async {
        // The feature the photos were picked for, named at the pick: the
        // selection can move to another feature while the library loads, and
        // evidence must not land on the wrong one.
        guard let layerID = editingID, let featureID = targetFeatureID ?? selectedFeatureID
        else { return }
        photoMessages = []
        if failedLoads > 0 {
            // A picker that closed on nothing was a picker that did nothing,
            // as far as the reader could tell.
            photoMessages.append(
                failedLoads == 1
                    ? "1 selected photo could not be loaded from your library."
                    : "\(failedLoads) selected photos could not be loaded from your library."
            )
        }
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
            // Reserved before it is written: the file lands ahead of the
            // feature that will reference it, and a debounced write of the
            // older working copy meanwhile would sweep it as an orphan. The
            // store lets the reservation go once a write references it.
            await viewModel.reservePhotoID(photoID)
            guard await viewModel.addPhotoFile(
                layerID: layerID, photoID: photoID,
                full: processed.fullJpeg, thumb: processed.thumbJpeg
            ) else {
                await viewModel.releasePhotoID(photoID)
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
            // Read again, after the waits: another attachment or a removal
            // may have changed the feature's photos meanwhile, and a stale
            // list written back would drop theirs. A feature deleted
            // meanwhile takes its new files with it, and says so.
            guard editingID == layerID, let latestParsed = self.parsed,
                  let current = latestParsed.features.first(where: { $0.id == featureID })
            else {
                await viewModel.deletePhotoFile(layerID: layerID, photoID: photoID)
                await viewModel.releasePhotoID(photoID)
                photoMessages.append("The feature was removed before this photo could be attached.")
                continue
            }
            let latest = PhotoDescriptor.read(from: current.properties)
            guard latest.count < PhotoDescriptor.maxPerFeature else {
                await viewModel.deletePhotoFile(layerID: layerID, photoID: photoID)
                await viewModel.releasePhotoID(photoID)
                photoMessages.append(
                    "This feature already has \(PhotoDescriptor.maxPerFeature) photos — the cap. Not added."
                )
                continue
            }
            updateFeatureProperties(
                featureID: featureID,
                patch: [
                    CaptureSpec.photosKey: PhotoDescriptor.propertyValue(
                        internalForm: latest + [descriptor]
                    )
                ]
            )
            committedPhotoIDs.insert(photoID)
            // The geotag offer, once, for a Point feature: shown with the
            // distance so "move my pin 3 km" is a decision, not a surprise.
            // Measured from where the point is now, after the waits, not
            // from where it was when the picker opened.
            if case .point(let position)? = current.geometry, let location = claims.location {
                offerPhotoLocation(
                    PhotoLocationOffer(
                        featureID: featureID,
                        position: GeoJsonPosition(lng: location.lng, lat: location.lat),
                        distanceM: Geodesy.pathDistanceMetres([
                            GeoPoint(lat: position.lat, lng: position.lng), location,
                        ])
                    )
                )
            }
        }
    }

    /// Removes a photo as an operation Done waits for: registered now, on
    /// the tap, before the first await, so a Done tap a moment later cannot
    /// close the session over the file delete.
    func requestRemovePhoto(featureID: String, photoID: String) {
        guard let operation = beginOperation() else { return }
        Task { [weak self] in
            await self?.removePhoto(featureID: featureID, photoID: photoID)
            self?.endOperation(operation)
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
        guard let offer = photoLocationOffer, parsed != nil else { return }
        photoLocationOffer = nil
        // Through the same path as a drag: the point now sits where the photo
        // says it was taken, not where the fix put it, so the fix's GPS claim
        // goes with the move — and so does any stored elevation, which was
        // measured where the point was, not where the photo puts it.
        moveVertex(
            featureID: offer.featureID, ring: 0, vertex: 0,
            latitude: offer.position.lat, longitude: offer.position.lng,
            carryingAltitude: false
        )
    }

    /// Puts a photo's location up for the reader to accept or wave away.
    func offerPhotoLocation(_ offer: PhotoLocationOffer) {
        photoLocationOffer = offer
    }

    func dismissPhotoLocationOffer() {
        photoLocationOffer = nil
    }

    /// Puts an offer up without a photo behind it, for a test of what
    /// accepting one does to the feature.
    func offerPhotoLocationForTesting(featureID: String, position: GeoJsonPosition) {
        photoLocationOffer = PhotoLocationOffer(featureID: featureID, position: position, distanceM: 0)
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

    /// The claim a GPS mark makes about itself, taken off a feature the reader
    /// has moved by hand.
    ///
    /// A dragged point is no longer where the fix put it, so "Marked from GPS
    /// on this device (±5 m)" would be a false statement about a position
    /// somebody chose. The keys go with the move; `nsmts:createdAt` and any
    /// name or photos stay, because those are still true.
    static let gpsProvenanceRemoval: [String: JSONValue?] = [
        CaptureSpec.capturedAtKey: nil,
        CaptureSpec.accuracyKey: nil,
        CaptureSpec.altitudeKey: nil,
    ]

    /// What a move came to, so the caller can say so: a handle snapped back
    /// onto the coordinate it already had is not a move, and a session that
    /// is closing takes none.
    enum MoveOutcome: Equatable, Sendable {
        case moved, unchanged, refused
    }

    /// Whether the feature's position is a GPS fix's. Only then does a hand
    /// move take the fix's claims, and its measured altitude, with it.
    ///
    /// The same test the callout applies before it says "Marked from GPS": a
    /// Point, a capture time that is a string, and an accuracy that is a
    /// finite number. Anything less — a photo point's capture date with no
    /// accuracy, an imported accuracy with no capture time, a null, a string
    /// where a number should be — is not a claim this app makes, so nothing
    /// is deleted from it on the strength of a key merely being present.
    static func isGpsMark(_ feature: GeoJsonFeature) -> Bool {
        VectorFeatureCallout.gpsAccuracy(of: feature) != nil
    }

    /// Whether the feature says a vertex of it was placed by a parcel snap.
    static func isTraced(_ feature: GeoJsonFeature) -> Bool {
        feature.properties[CaptureSpec.tracedKey]?.stringValue == CaptureSpec.tracedParcelValue
    }

    @discardableResult
    /// `carryingAltitude` is false for a caller that knows the new place says
    /// nothing about height — a photo's location — so an imported elevation
    /// is not carried to a spot it was never measured at.
    func moveVertex(
        featureID: String, ring: Int, vertex: Int, latitude: Double, longitude: Double,
        parcelSnap: Bool = false, carryingAltitude: Bool = true
    ) -> MoveOutcome {
        // Refused while Done is in progress: a move committed after the final
        // flush would be lost with the session.
        guard let before = self.parsed, !isEnding else { return .refused }
        guard Self.isPlaceable(latitude: latitude, longitude: longitude) else { return .unchanged }
        guard let feature = before.features.first(where: { $0.id == featureID }),
              let geometry = feature.geometry
        else { return .unchanged }
        let rings = VectorEdit.rings(of: geometry)
        guard rings.indices.contains(ring), rings[ring].indices.contains(vertex) else {
            // A vertex address the feature does not have: nothing to move.
            return .unchanged
        }
        let existing = rings[ring][vertex]
        let gpsMark = Self.isGpsMark(feature)
        let traced = Self.isTraced(feature)
        if existing.lat == latitude, existing.lng == longitude {
            // The same spot again is not a move, whatever altitude the fix had
            // recorded there: no GPS claim to take away. A snap onto a parcel
            // corner the vertex already sat on is still a snap, though, and
            // the trace it records is recorded — as metadata only.
            if parcelSnap, !traced {
                commit(
                    VectorEdit.updatingProperties(
                        featureID: featureID,
                        patch: [CaptureSpec.tracedKey: .string(CaptureSpec.tracedParcelValue)],
                        in: before
                    )
                )
            }
            return .unchanged
        }
        var parsed = VectorEdit.moving(
            featureID: featureID,
            ring: ring,
            vertex: vertex,
            // An imported elevation travels with its corner; a fix's altitude
            // does not, since the corner is no longer where the fix was, and
            // nor does either when the caller says the new place has no
            // height of its own.
            to: GeoJsonPosition(
                lng: longitude, lat: latitude,
                altitude: gpsMark || !carryingAltitude ? nil : existing.altitude
            ),
            in: before
        )
        guard parsed != before else { return .unchanged }
        if gpsMark {
            parsed = VectorEdit.updatingProperties(
                featureID: featureID, patch: Self.gpsProvenanceRemoval, in: parsed
            )
        } else if feature.properties[CaptureSpec.capturedAtKey] != nil {
            // A photo point's top-level capture time says when this position
            // was captured; moved by hand, the position no longer is. The
            // photo's own date stays on its descriptor.
            parsed = VectorEdit.updatingProperties(
                featureID: featureID, patch: [CaptureSpec.capturedAtKey: nil], in: parsed
            )
        }
        if !carryingAltitude, feature.properties[CaptureSpec.altitudeKey] != nil {
            // The stored altitude property goes with the geometry's third
            // coordinate: neither was measured where the photo puts the point.
            parsed = VectorEdit.updatingProperties(
                featureID: featureID, patch: [CaptureSpec.altitudeKey: nil], in: parsed
            )
        }
        if parcelSnap {
            parsed = VectorEdit.updatingProperties(
                featureID: featureID,
                patch: [CaptureSpec.tracedKey: .string(CaptureSpec.tracedParcelValue)],
                in: parsed
            )
        }
        // `nsmts:traced` stays through a move, by the field-capture contract:
        // it records that a parcel snap placed a vertex, at the time it did,
        // and carries the Province's attribution and the not-a-survey caveat.
        // The web keeps it too. Conservative over-labelling is acceptable;
        // silent under-labelling is not.
        commit(parsed)
        return .moved
    }

    /// Carries a whole feature by the distance its handle travelled.
    ///
    /// A shape drawn in the wrong place would otherwise have to be corrected a
    /// vertex at a time, which is slow and comes out a different shape.
    @discardableResult
    func moveFeature(featureID: String, latitudeDelta: Double, longitudeDelta: Double) -> MoveOutcome {
        guard let parsed, !isEnding else { return .refused }
        let feature = parsed.features.first { $0.id == featureID }
        let gpsMark = feature.map(Self.isGpsMark) ?? false
        let moved = VectorEdit.translating(
            featureID: featureID,
            byLatitude: latitudeDelta,
            longitude: longitudeDelta,
            in: parsed,
            keepingAltitude: !gpsMark
        )
        guard moved != parsed else { return .unchanged }
        // The GPS keys go with a moved GPS mark, and a photo point's capture
        // time with a moved photo point; `nsmts:traced` stays, as it does in
        // `moveVertex`.
        let stripped: ParsedVector
        if gpsMark {
            stripped = VectorEdit.updatingProperties(
                featureID: featureID, patch: Self.gpsProvenanceRemoval, in: moved
            )
        } else if feature?.properties[CaptureSpec.capturedAtKey] != nil {
            stripped = VectorEdit.updatingProperties(
                featureID: featureID, patch: [CaptureSpec.capturedAtKey: nil], in: moved
            )
        } else {
            stripped = moved
        }
        commit(stripped)
        return .moved
    }

    /// The snap under the crosshair changed between the frame and the tap:
    /// said, and nothing placed, rather than a coordinate the reader did not
    /// see.
    func notePlacementChanged() {
        note("Snapping changed under the crosshair. Aim again.")
    }

    /// The crosshair was on a parcel corner when the licence that made it a
    /// target was withdrawn: said as that, so the reader knows why a spot
    /// they were shown was not placed.
    func noteParcelSnapLicenceWithdrawn() {
        note("Parcel snapping is off until the Province's licence is accepted. Nothing placed.")
    }

    /// Says what a move from the panel came to, where the panel shows its
    /// notices and VoiceOver hears them: the button looks the same whether
    /// the corner moved, was already there, or could not be moved.
    /// `snapNote` is what the centre snapped to, when it did, said in the
    /// same breath as the move so the reader hears where the corner went.
    func announce(_ outcome: MoveOutcome, of what: String, snapNote: String? = nil) {
        // Where it went, said as where it went: a snap near the centre is
        // not the centre.
        switch (outcome, snapNote) {
        case (.moved, nil): note("\(what) moved to the map centre.")
        case (.moved, let snap?): note("\(what) moved to a snap target near the map centre. \(snap)")
        case (.unchanged, nil): note("\(what) is already at the map centre.")
        case (.unchanged, let snap?): note("\(what) is already on the snap target near the map centre. \(snap)")
        case (.refused, _): note("The session is closing; nothing was moved.")
        }
    }

    /// A handle let go while Done was already draining: said, since the
    /// spring-back alone reads as a drag that did nothing.
    func noteMoveRefused() {
        note("Saving; the handle can't be moved now.")
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

    /// The rename write that is out, if one is: a flush that finds one waits
    /// for it rather than treating its cancelled timer as a name written.
    @ObservationIgnored private var renameWrite: Task<Bool, Never>?

    /// Nothing pending is a success: there is no name that failed to save.
    /// The name stays pending until its write lands, so a Done that arrives
    /// while a rename is out waits for it, and a name that failed is tried
    /// again by the next flush — the next Done — rather than the session
    /// closing with the old name stored under a field showing the new one.
    private func writePendingName() async -> Bool {
        var ok = true
        if let inFlight = renameWrite {
            ok = await inFlight.value
        }
        while let name = pendingName {
            let write = Task { [weak self] () -> Bool in
                guard let self else { return false }
                return await self.renameLayer(name)
            }
            renameWrite = write
            ok = await write.value
            if renameWrite == write { renameWrite = nil }
            if ok, pendingName == name { pendingName = nil }
            if !ok { break }
        }
        return ok
    }

    @discardableResult
    func renameLayer(_ name: String) async -> Bool {
        guard let editingID else { return false }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        record?.name = trimmed
        if await viewModel.rename(id: editingID, to: trimmed) {
            // A rename is a change the panel promised would switch a hidden
            // layer on — once it is written.
            editedThisSession = true
            // Only a name failure is cleared by a name success; a geometry
            // write still pending keeps its own words up.
            if unsaved == nil { storageError = nil }
            return true
        }
        // The typed name stays on the record and in the field, with the
        // refusal under it: it is what the reader asked for, and the next
        // flush writes it.
        storageError = viewModel.lastRefusal?.userMessage
            ?? "This name could not be saved to your device."
        return false
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
        editedThisSession = true
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
        // Both are tried, whatever the first came to: a name that could not
        // be saved must not keep the geometry from being.
        let named = await writePendingName()
        persistTask?.cancel()
        persistTask = nil
        let written = await write()
        return named && written
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
            // A geometry success does not speak for a name still unsaved.
            if pendingName == nil { storageError = nil }
            record = viewModel.rows.first { $0.id == editingID }?.record ?? record
            guard revision == written else { continue }
            unsaved = nil
        }
        return true
    }
}
