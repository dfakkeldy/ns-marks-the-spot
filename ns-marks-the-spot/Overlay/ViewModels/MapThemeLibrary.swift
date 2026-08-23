import Foundation
import MapCatalog
import NSDataServices
import Observation

/// The map setups on offer: the five the app ships, and the reader's own.
///
/// Separate from `OverlayViewModel` because it owns storage and nothing else —
/// what is saved, what could not be saved, and why. Which setup the map is
/// currently in is a question about the map, and stays there.
///
/// Saved setups never leave the device. A theme records which layers somebody
/// had open, which says something about what they were researching rather than
/// about any property, and there is nowhere for it to go.
@MainActor
@Observable
final class MapThemeLibrary {
    /// The reader's own themes, in the order they were saved.
    private(set) var custom: [MapTheme] = []

    /// What went wrong with the library, in a sentence for the panel.
    ///
    /// Held rather than thrown away because a failed save is silent otherwise:
    /// the reader names a setup, taps Save, and finds it gone at the next
    /// launch with nothing having said so.
    private(set) var notice: String?

    @ObservationIgnored private let storage: UserDefaultsCustomThemeStorage

    init(storage: UserDefaultsCustomThemeStorage = UserDefaultsCustomThemeStorage()) {
        self.storage = storage
        let library = storage.load()
        custom = library.themes
        notice = switch library.status {
        case .loaded: nil
        case .partial: library.warning
        case .unreadable:
            // The distinction matters to the reader: their saved setups were
            // not read, and saving now would write over whatever is there.
            (library.warning ?? CustomThemeStore.loadWarning)
                + " Saving a setup will replace the unreadable library."
        }
    }

    /// Every theme the picker offers.
    var all: [MapTheme] { MapTheme.builtIn + custom }

    func theme(_ id: String) -> MapTheme? { all.first { $0.id == id } }

    func clearNotice() { notice = nil }

    /// Saves the map's current setup under a name of the reader's choosing.
    /// Returns the saved theme, or `nil` when it could not be saved.
    @discardableResult
    func save(
        name: String,
        state: MapThemeState,
        preferredCategoryIDs: [LayerCategoryID]
    ) -> MapTheme? {
        do {
            let theme = try CustomThemeStore.make(
                name: name,
                state: state,
                preferredCategoryIDs: preferredCategoryIDs
            )
            return persist(custom + [theme]) ? theme : nil
        } catch {
            notice = error.message
            return nil
        }
    }

    @discardableResult
    func rename(_ id: String, to name: String) -> Bool {
        do {
            return persist(try CustomThemeStore.rename(custom, id: id, to: name))
        } catch {
            notice = error.message
            return false
        }
    }

    @discardableResult
    func update(
        _ id: String,
        to state: MapThemeState,
        preferredCategoryIDs: [LayerCategoryID]
    ) -> Bool {
        do {
            return persist(
                try CustomThemeStore.update(
                    custom,
                    id: id,
                    state: state,
                    preferredCategoryIDs: preferredCategoryIDs
                )
            )
        } catch {
            notice = error.message
            return false
        }
    }

    @discardableResult
    func duplicate(_ id: String) -> Bool {
        do {
            return persist(try CustomThemeStore.duplicate(custom, id: id))
        } catch {
            notice = error.message
            return false
        }
    }

    @discardableResult
    func delete(_ id: String) -> Bool {
        persist(CustomThemeStore.delete(custom, id: id))
    }

    /// Writes first, then keeps. A library held in memory that the device
    /// refused to store would survive until the app closed and no longer.
    private func persist(_ themes: [MapTheme]) -> Bool {
        if let failure = storage.save(themes) {
            notice = failure.message
            return false
        }
        custom = themes
        notice = nil
        return true
    }
}
