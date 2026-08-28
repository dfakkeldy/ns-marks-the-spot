import Foundation

/// Which of the user's own maps are drawn, and how strongly.
///
/// Kept apart from the library the way the browser keeps it apart, and for the
/// same reason: switching a map off is not an edit to the map. The library
/// document is the maps themselves, written through a path that guards against
/// two imports racing and against a document this build cannot read, and an
/// opacity slider is continuous — dragging one would rewrite that document
/// dozens of times on the way from 100% to 40%.
///
/// The browser holds the same answer in `localStorage` under
/// `user-map-ui-state-v1`. Nothing is exchanged between the two; they are two
/// devices, each remembering what its own reader did.
@MainActor
struct UserMapDisplayStore {
    /// What a map is drawn at when it arrives, and when nothing is remembered
    /// about it. The browser's `DEFAULT_OPACITY`: a scan laid over the map at
    /// full strength hides the ground it is meant to be compared against.
    static let defaultOpacity = 0.7

    static let key = "user-map-display-v1"

    /// One map's row, as the reader last left it.
    struct Display: Codable, Equatable {
        var isVisible: Bool
        var opacity: Double
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// What the reader left, keyed by map id. Empty when there is nothing
    /// remembered, and when what is stored cannot be read — a map with no entry
    /// is not drawn, which is what the browser does with the same gap.
    func load() -> [String: Display] {
        guard let data = defaults.data(forKey: Self.key),
              let stored = try? JSONDecoder().decode([String: Display].self, from: data)
        else { return [:] }
        return stored
    }

    func save(_ state: [String: Display]) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
