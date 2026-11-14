import Foundation
import GeoCore
import Observation

@MainActor @Observable
final class DriveCataloguesViewModel {
    private(set) var catalogues: [DriveCatalogue] = []
    private(set) var ui: DriveUiState
    private(set) var error: String?
    private let store: DriveCatalogueStore
    private let uiStore: DriveUiStateStore
    private var generation = 0

    init(store: DriveCatalogueStore = .shared, uiStore: DriveUiStateStore = DriveUiStateStore()) {
        self.store = store
        self.uiStore = uiStore
        self.ui = uiStore.load()
    }
    var loaded: DriveCatalogue? { catalogues.first { $0.id == ui.loadedCatalogueID } }
    func load() async {
        let mark = generation
        do {
            let found = try await store.load()
            guard mark == generation else { return }
            catalogues = found
            if let id = ui.loadedCatalogueID, !found.contains(where: { $0.id == id }) {
                ui.loadedCatalogueID = nil
                uiStore.save(ui)
            }
            error = nil
        } catch { guard mark == generation else { return }; self.error = "Catalogues could not be opened. Nothing was changed." }
    }
    @discardableResult
    private func change(_ change: DriveCatalogueStore.Change) async -> Bool {
        generation += 1
        let mark = generation
        do {
            let updated = try await store.apply(change)
            if mark == generation { catalogues = updated; error = nil }
            return true
        } catch {
            let confirmed = try? await store.load()
            if mark == generation {
                if let confirmed { catalogues = confirmed }
                self.error = "Catalogues could not be saved. Please try again."
            }
            return false
        }
    }
    func create(name: String, sheetIDs: [String]) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let item = DriveCatalogue(name: trimmed, sheetIDs: sheetIDs)
        if await change(.create(item)) { select(item.id) }
    }
    func rename(_ id: String, to name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await change(.rename(id, trimmed))
    }
    func delete(_ id: String) async {
        if await change(.delete(id)), ui.loadedCatalogueID == id { select(nil) }
    }
    func add(_ ids: [String], to id: String) async { await change(.addSheets(id, ids)) }
    func beginSheetDeletion(_ id: String) {
        var pending = uiStore.pendingDeletions()
        pending.insert(id)
        uiStore.setPendingDeletions(pending)
    }
    func cancelSheetDeletion(_ id: String) {
        var pending = uiStore.pendingDeletions()
        pending.remove(id)
        uiStore.setPendingDeletions(pending)
    }
    func finishSheetDeletion(_ id: String) async {
        if await change(.removeSheetEverywhere(id)) { cancelSheetDeletion(id) }
    }
    func retryPendingDeletions(_ pendingAtLaunch: Set<String>, confirmedIDs: Set<String>) async {
        for id in pendingAtLaunch where !confirmedIDs.contains(id) { await finishSheetDeletion(id) }
    }
    var pendingDeletions: Set<String> { uiStore.pendingDeletions() }
    func remove(_ sheetID: String, from id: String) async { await change(.removeSheet(id, sheetID)) }
    func reorder(_ ids: [String], in id: String) async { await change(.reorder(id, ids)) }
    func setOpacity(_ value: Double, in id: String) async { await change(.opacity(id, value)) }
    func select(_ id: String?) {
        ui.loadedCatalogueID = id == ui.loadedCatalogueID ? nil : id
        uiStore.save(ui)
    }
    func setAuto(_ value: Bool) { ui.autoActivate = value; uiStore.save(ui) }
}
