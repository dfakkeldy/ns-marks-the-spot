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
    /// as data loss.
    func end() async {
        await flush()
        editingID = nil
        record = nil
        parsed = nil
        draft = nil
        selectedFeatureID = nil
        tool = .selecting
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

    private func flush() async {
        persistTask?.cancel()
        persistTask = nil
        await write()
    }

    private func write() async {
        guard let editingID, let parsed else { return }
        await viewModel.replaceGeometry(id: editingID, with: parsed)
        // The view model reports its own storage refusals; surfaced here so the
        // editing panel says it rather than the layer list the user cannot see
        // while editing.
        storageError = viewModel.lastRefusal?.userMessage
    }
}
