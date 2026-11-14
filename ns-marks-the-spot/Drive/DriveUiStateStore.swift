import Foundation

struct DriveUiState: Codable, Equatable {
    var loadedCatalogueID: String? = nil
    var autoActivate = true
    var showCoverage = true
}

@MainActor
struct DriveUiStateStore {
    static let key = "drive-ui-state-v1"
    private static let pendingKey = "drive-pending-sheet-deletions-v1"
    private static let committedKey = "drive-committed-sheet-deletions-v1"
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func load() -> DriveUiState {
        guard let data = defaults.data(forKey: Self.key), let value = try? JSONDecoder().decode(DriveUiState.self, from: data) else { return DriveUiState() }
        return value
    }
    func save(_ value: DriveUiState) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: Self.key)
    }
    func pendingDeletions() -> Set<String> { Set(defaults.stringArray(forKey: Self.pendingKey) ?? []) }
    func setPendingDeletions(_ ids: Set<String>) { defaults.set(Array(ids).sorted(), forKey: Self.pendingKey) }
    func committedDeletions() -> Set<String> { Set(defaults.stringArray(forKey: Self.committedKey) ?? []) }
    func setCommittedDeletions(_ ids: Set<String>) { defaults.set(Array(ids).sorted(), forKey: Self.committedKey) }
}
