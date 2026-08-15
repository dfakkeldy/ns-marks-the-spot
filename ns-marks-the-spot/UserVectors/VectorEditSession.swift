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
    }

    private(set) var editingID: String?
    private(set) var record: UserVectorLayerRecord?
    private(set) var parsed: ParsedVector?
    private(set) var draft: VectorDraft?
    private(set) var selectedFeatureID: String?
    var tool: Tool = .selecting

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

    init(viewModel: UserVectorsViewModel, persistDelay: Duration = VectorEditSession.persistDelay) {
        self.viewModel = viewModel
        self.persistDelay = persistDelay
    }

    var isEditing: Bool { editingID != nil }

    func begin(_ row: UserVectorsViewModel.Row) {
        storageError = nil
        selectedFeatureID = nil
        draft = nil
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
        tool = .selecting
        return true
    }

    // MARK: - Drawing

    func startDrawing(_ shape: VectorEditShape) {
        selectedFeatureID = nil
        tool = .drawing(shape)
        draft = VectorDraft(shape: shape)
    }

    func cancelDrawing() {
        draft = nil
        tool = .selecting
    }

    /// A tap on the map, in whatever the current tool means.
    func handleTap(latitude: Double, longitude: Double) {
        guard isEditing else { return }
        switch tool {
        case .drawing(let shape):
            var current = draft ?? VectorDraft(shape: shape)
            current.append(GeoJsonPosition(lng: longitude, lat: latitude))
            draft = current
            // A point is finished the moment it is placed. Asking the user to
            // confirm a single tap would be asking twice for one decision.
            if shape == .point {
                finishDrawing()
            }
        case .selecting:
            break
        }
    }

    func undoLastVertex() {
        draft?.removeLastVertex()
    }

    /// Commits the drawn shape, if it is one yet.
    func finishDrawing() {
        guard let parsed, let geometry = draft?.geometry() else { return }
        let edited = VectorEdit.adding(geometry, to: parsed)
        draft = nil
        tool = .selecting
        // Selected on commit, so the panel opens on the feature the user just
        // drew and they can name it while they still know what it is.
        selectedFeatureID = edited.features.last?.id
        commit(edited)
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

    func deleteSelectedFeature() {
        guard let parsed, let id = selectedFeatureID else { return }
        selectedFeatureID = nil
        commit(VectorEdit.removing(featureID: id, from: parsed))
    }

    func moveVertex(featureID: String, ring: Int, vertex: Int, latitude: Double, longitude: Double) {
        guard let parsed else { return }
        commit(
            VectorEdit.moving(
                featureID: featureID,
                ring: ring,
                vertex: vertex,
                to: GeoJsonPosition(lng: longitude, lat: latitude),
                in: parsed
            )
        )
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
        parsed = edited
        unsaved = edited
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
        persistTask?.cancel()
        persistTask = nil
        return await write()
    }

    @discardableResult
    private func write() async -> Bool {
        // Nothing pending is a success: there is no edit that failed to save.
        guard let editingID, let pending = unsaved else { return true }
        guard await viewModel.replaceGeometry(id: editingID, with: pending) else {
            // The view model reports its own storage refusals; surfaced here so
            // the editing panel says it rather than the layer list the user
            // cannot see while editing. The pending copy is kept, so the next
            // edit or the next Done tries again.
            storageError = viewModel.lastRefusal?.userMessage
            return false
        }
        unsaved = nil
        storageError = nil
        record = viewModel.rows.first { $0.id == editingID }?.record ?? record
        return true
    }
}
