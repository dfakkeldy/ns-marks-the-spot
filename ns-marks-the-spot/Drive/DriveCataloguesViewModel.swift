import Foundation
import GeoCore
import Observation

@MainActor @Observable
final class DriveCataloguesViewModel {
    private(set) var catalogues: [DriveCatalogue] = []
    private(set) var ui: DriveUiState
    private(set) var error: String?
    private(set) var canEdit = false
    private let store: DriveCatalogueStore
    private let uiStore: DriveUiStateStore
    private var generation = 0
    private var pendingMutations = 0
    private var pendingError: String?
    private var opacityPreviews: [String: Double] = [:]

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
            canEdit = true
            if let id = ui.loadedCatalogueID, !found.contains(where: { $0.id == id }) {
                ui.loadedCatalogueID = nil
                uiStore.save(ui)
            }
            error = nil
        } catch DriveCatalogueStore.Refusal.unreadable {
            do {
                try await store.setAsideDamagedDocument()
                let found = try await store.load()
                guard mark == generation else { return }
                catalogues = found
                canEdit = true
                error = "The damaged catalogue file was set aside on this device. A new catalogue list has started."
            } catch {
                guard mark == generation else { return }
                canEdit = false
                self.error = "Catalogues could not be opened. The existing file was left on this device."
            }
        } catch DriveCatalogueStore.Refusal.newerVersion(_) {
            guard mark == generation else { return }
            canEdit = false
            self.error = "These catalogues were saved by a newer app. Update the app to use them."
        } catch {
            guard mark == generation else { return }
            canEdit = false
            self.error = "Catalogues could not be opened. The existing file was left on this device."
        }
    }
    @discardableResult
    private func change(_ change: DriveCatalogueStore.Change) async -> Bool {
        guard canEdit else { return false }
        generation += 1
        pendingMutations += 1
        let succeeded: Bool
        do {
            _ = try await store.apply(change)
            succeeded = true
        } catch {
            succeeded = false
            if let refusal = error as? DriveCatalogueStore.Refusal {
                canEdit = false
                switch refusal {
                case .newerVersion:
                    pendingError = "These catalogues were saved by a newer app. Update the app to use them."
                case .unreadable:
                    pendingError = "The catalogue file could not be read. Reopen the app to recover it."
                }
            } else {
                pendingError = "Catalogues could not be saved. Please try again."
            }
        }
        pendingMutations -= 1
        if pendingMutations == 0 {
            let mark = generation
            let confirmed = try? await store.load()
            if mark == generation && pendingMutations == 0 {
                if let confirmed { catalogues = confirmed }
                error = pendingError
                pendingError = nil
            }
        }
        return succeeded
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
        var committed = uiStore.committedDeletions()
        committed.remove(id)
        uiStore.setCommittedDeletions(committed)
    }
    func finishSheetDeletion(_ id: String) async {
        var committed = uiStore.committedDeletions()
        committed.insert(id)
        uiStore.setCommittedDeletions(committed)
        if await change(.removeSheetEverywhere(id)) { cancelSheetDeletion(id) }
    }
    func retryPendingDeletions(_ pendingAtLaunch: Set<String>, confirmedIDs: Set<String>) async {
        let committed = uiStore.committedDeletions()
        for id in pendingAtLaunch {
            if confirmedIDs.contains(id) { cancelSheetDeletion(id) }
            else if committed.contains(id) { await finishSheetDeletion(id) }
            else { error = "A sheet deletion could not be confirmed. Catalogue membership was kept; check the missing sheet." }
        }
    }
    var pendingDeletions: Set<String> { uiStore.pendingDeletions() }
    func remove(_ sheetID: String, from id: String) async { await change(.removeSheet(id, sheetID)) }
    func reorder(_ ids: [String], in id: String) async { await change(.reorder(id, ids)) }
    func move(_ sheetID: String, in id: String, by delta: Int) async { await change(.move(id, sheetID, delta)) }
    func opacity(for catalogue: DriveCatalogue) -> Double { opacityPreviews[catalogue.id] ?? catalogue.opacity }
    func previewOpacity(_ value: Double, in id: String) { opacityPreviews[id] = min(1, max(0, value)) }
    func saveOpacity(in id: String) async {
        guard let value = opacityPreviews[id] else { return }
        _ = await change(.opacity(id, value))
        if opacityPreviews[id] == value { opacityPreviews.removeValue(forKey: id) }
    }
    func select(_ id: String?) {
        ui.loadedCatalogueID = id == ui.loadedCatalogueID ? nil : id
        uiStore.save(ui)
    }
    func setAuto(_ value: Bool) { ui.autoActivate = value; uiStore.save(ui) }
    func reportNoSheets() { error = "No saved map sheets were imported. No catalogue was created." }
}
