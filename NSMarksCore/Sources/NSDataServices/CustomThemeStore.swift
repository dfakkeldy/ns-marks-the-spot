import Foundation
import MapCatalog

/// The reader's own saved map setups, and how they survive a relaunch.
///
/// A port of the web's `themeStorage.ts`, down to the stored key names, so the
/// two surfaces describe a saved setup the same way and a library exported from
/// one could be read by the other.
///
/// Saved setups stay on the device. A theme records which layers somebody had
/// open, which is a fact about how they were researching rather than about any
/// property, and nothing here sends it anywhere.
public enum CustomThemeStore {
    /// The web's `localStorage` key, reused as the defaults key.
    public static let storageKey = "ns-marks-the-spot:custom-themes"

    static let customDescription = "A custom map theme."
    public static let loadWarning = "Your custom-theme library could not be loaded."
    public static let saveWarning = "Your custom themes could not be saved on this device."

    /// What came back off the device.
    ///
    /// `partial` and `unreadable` are kept apart because they mean different
    /// things to the reader: one library lost a theme, the other lost the lot.
    /// Neither is reported as an empty library, which would read as never
    /// having saved anything.
    public struct Library: Sendable, Equatable {
        public enum Status: String, Sendable, Equatable {
            case loaded
            case partial
            case unreadable
        }

        public var themes: [MapTheme]
        public var status: Status
        public var warning: String?

        public init(themes: [MapTheme], status: Status, warning: String?) {
            self.themes = themes
            self.status = status
            self.warning = warning
        }
    }

    public enum Failure: Error, Equatable {
        case nameRequired
        case identifierRequired
        case notCustom
        case duplicateIdentifier(String)
        case notFound(String)
        /// The first thing `MapTheme.validate` objected to.
        case invalid(String)
        case notSaved

        /// What to put in front of the reader.
        public var message: String {
            switch self {
            case .nameRequired: "A theme needs a name."
            case .identifierRequired: "A theme needs an identifier."
            case .notCustom: "Only your own themes can be saved on this device."
            case .duplicateIdentifier: "That theme already exists."
            case .notFound: "That theme is no longer saved."
            case .invalid(let reason): "That setup cannot be saved: \(reason)."
            case .notSaved: CustomThemeStore.saveWarning
            }
        }
    }
}

extension CustomThemeStore {
    /// One saved theme in the stored document, in the web's field names.
    private struct StoredTheme: Codable {
        var id: String
        var name: String
        var layerIDs: [String]
        var opacityOverrides: [String: Double]
        var preferredCategoryIDs: [String]
        var taxSaleEnabled: Bool
        var mode: String

        enum CodingKeys: String, CodingKey {
            case id
            case name
            case layerIDs = "layerIds"
            case opacityOverrides
            case preferredCategoryIDs = "preferredCategoryIds"
            case taxSaleEnabled
            case mode = "mapMode"
        }
    }

    private struct StoredLibrary: Codable {
        var version: Int
        var themes: [StoredTheme]
    }

    /// Builds a custom theme, refusing anything that would not draw.
    ///
    /// The same gate the web applies before writing: a theme whose layers do
    /// not exist, or whose backgrounds hide one another, is not saved and said
    /// so — rather than saved and found broken the next time it is picked.
    public static func make(
        id: String = UUID().uuidString,
        name: String,
        state: MapThemeState,
        preferredCategoryIDs: [LayerCategoryID]
    ) throws(Failure) -> MapTheme {
        guard !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw .identifierRequired
        }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw .nameRequired }

        let theme = MapTheme(
            id: id,
            kind: .custom,
            name: trimmed,
            description: customDescription,
            state: state,
            preferredCategoryIDs: preferredCategoryIDs
        )
        if let error = MapTheme.validate(theme).first { throw .invalid(error) }
        return theme
    }

    public static func rename(
        _ themes: [MapTheme],
        id: String,
        to name: String
    ) throws(Failure) -> [MapTheme] {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw .nameRequired }
        guard let index = themes.firstIndex(where: { $0.id == id }) else {
            throw .notFound(id)
        }
        guard themes[index].kind == .custom else { throw .notCustom }

        var updated = themes
        updated[index].name = trimmed
        return updated
    }

    public static func update(
        _ themes: [MapTheme],
        id: String,
        state: MapThemeState,
        preferredCategoryIDs: [LayerCategoryID]
    ) throws(Failure) -> [MapTheme] {
        guard let index = themes.firstIndex(where: { $0.id == id }) else {
            throw .notFound(id)
        }
        guard themes[index].kind == .custom else { throw .notCustom }

        var updated = themes
        updated[index] = try make(
            id: id,
            name: themes[index].name,
            state: state,
            preferredCategoryIDs: preferredCategoryIDs
        )
        return updated
    }

    public static func duplicate(
        _ themes: [MapTheme],
        id: String,
        duplicateID: String = UUID().uuidString
    ) throws(Failure) -> [MapTheme] {
        guard !themes.contains(where: { $0.id == duplicateID }) else {
            throw .duplicateIdentifier(duplicateID)
        }
        guard let theme = themes.first(where: { $0.id == id }) else {
            throw .notFound(id)
        }
        guard theme.kind == .custom else { throw .notCustom }

        return themes + [
            try make(
                id: duplicateID,
                name: theme.name,
                state: theme.state,
                preferredCategoryIDs: theme.preferredCategoryIDs
            )
        ]
    }

    public static func delete(_ themes: [MapTheme], id: String) -> [MapTheme] {
        themes.filter { $0.id != id }
    }

    /// The document to write, or why these themes are not writable.
    public static func data(for themes: [MapTheme]) throws(Failure) -> Data {
        var seen: Set<String> = []
        for theme in themes {
            guard theme.kind == .custom else { throw .notCustom }
            guard !seen.contains(theme.id) else {
                throw .duplicateIdentifier(theme.id)
            }
            seen.insert(theme.id)
            if let error = MapTheme.validate(theme).first { throw .invalid(error) }
        }

        let document = StoredLibrary(
            version: 1,
            themes: themes.map { theme in
                StoredTheme(
                    id: theme.id,
                    name: theme.name,
                    layerIDs: theme.state.layerIDs,
                    opacityOverrides: theme.state.opacityOverrides,
                    preferredCategoryIDs: theme.preferredCategoryIDs.map(\.rawValue),
                    taxSaleEnabled: theme.state.taxSaleEnabled,
                    mode: theme.state.mode.rawValue
                )
            }
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(document) else { throw .notSaved }
        return data
    }

    /// Reads the document, keeping every theme it can still vouch for.
    ///
    /// One unreadable entry loses that entry rather than the library. A reader
    /// who saved six setups and lost one to a field this build no longer knows
    /// should be told about the one, not handed an empty picker.
    ///
    /// Unknown layer and category IDs are dropped the way a shared link's are:
    /// this build cannot draw them, and keeping them would make a theme that
    /// claims layers it does not show. Each drop is named in the warning.
    /// Reads whatever the device is holding under the key, whether or not it
    /// is the document this build writes.
    ///
    /// A key holding something that is not `Data` — a string, a dictionary
    /// some earlier build left — is an unreadable library rather than an empty
    /// one. `UserDefaults.data(forKey:)` answers `nil` to both, and taking
    /// that for "nothing saved yet" would write over a library the reader was
    /// never told had failed to load.
    public static func read(object: Any?) -> Library {
        guard let object else { return read(nil) }
        guard let data = object as? Data else {
            return Library(themes: [], status: .unreadable, warning: loadWarning)
        }
        return read(data)
    }

    public static func read(_ data: Data?) -> Library {
        guard let data else {
            return Library(themes: [], status: .loaded, warning: nil)
        }
        // `strictNumber` rather than `as? Int`, for the reason it exists: a
        // JSON `true` bridges to an `NSNumber` that answers 1, so the plain
        // cast would let `"version": true` through the v1 gate. The web reads
        // this field as `value.version !== 1`, which a boolean does not pass.
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              strictNumber(root["version"]) == 1,
              let entries = root["themes"] as? [Any]
        else {
            return Library(themes: [], status: .unreadable, warning: loadWarning)
        }

        var warnings: [String] = []
        var seen: Set<String> = []
        var themes: [MapTheme] = []
        for entry in entries {
            if let theme = parse(entry, seen: &seen, warnings: &warnings) {
                themes.append(theme)
            }
        }

        guard !warnings.isEmpty else {
            return Library(themes: themes, status: .loaded, warning: nil)
        }
        return Library(
            themes: themes,
            status: .partial,
            warning: "Some saved custom-theme details could not be restored: "
                + warnings.joined(separator: "; ") + "."
        )
    }

    private static func parse(
        _ entry: Any,
        seen: inout Set<String>,
        warnings: inout [String]
    ) -> MapTheme? {
        guard let object = entry as? [String: Any] else {
            warnings.append("an invalid theme entry")
            return nil
        }
        guard let id = object["id"] as? String,
              !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            warnings.append("a theme without a valid ID")
            return nil
        }
        guard !seen.contains(id) else {
            warnings.append("duplicate ID: \(id)")
            return nil
        }
        guard let name = object["name"] as? String,
              !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            warnings.append("theme \(id) without a valid name")
            return nil
        }
        guard let storedLayerIDs = object["layerIds"] as? [Any],
              let storedCategoryIDs = object["preferredCategoryIds"] as? [Any],
              let storedOverrides = object["opacityOverrides"] as? [String: Any],
              let taxSaleEnabled = strictBool(object["taxSaleEnabled"]),
              let rawMode = object["mapMode"] as? String,
              let mode = MapShareState.Mode(rawValue: rawMode)
        else {
            warnings.append("theme \(id)")
            return nil
        }

        var layerIDs: [String] = []
        for value in storedLayerIDs {
            guard let layerID = value as? String,
                  MapTheme.themeableLayerIDs.contains(layerID)
            else {
                warnings.append("layer ID: \(value)")
                continue
            }
            if layerIDs.contains(layerID) {
                warnings.append("duplicate layer ID: \(layerID)")
            } else {
                layerIDs.append(layerID)
            }
        }

        var categoryIDs: [LayerCategoryID] = []
        for value in storedCategoryIDs {
            guard let raw = value as? String,
                  let categoryID = LayerCategoryID(rawValue: raw)
            else {
                warnings.append("category ID: \(value)")
                continue
            }
            if categoryIDs.contains(categoryID) {
                warnings.append("duplicate category ID: \(categoryID.rawValue)")
            } else {
                categoryIDs.append(categoryID)
            }
        }

        var overrides: [String: Double] = [:]
        for layerID in storedOverrides.keys.sorted() {
            guard MapTheme.themeableLayerIDs.contains(layerID) else {
                warnings.append("opacity layer ID: \(layerID)")
                continue
            }
            guard let opacity = strictNumber(storedOverrides[layerID]),
                  opacity.isFinite, opacity >= 0, opacity <= 1
            else {
                warnings.append("invalid opacity: \(layerID)")
                continue
            }
            overrides[layerID] = opacity
        }

        do {
            let theme = try make(
                id: id,
                name: name,
                state: MapThemeState(
                    layerIDs: layerIDs,
                    opacityOverrides: overrides,
                    taxSaleEnabled: taxSaleEnabled,
                    mode: mode
                ),
                preferredCategoryIDs: categoryIDs
            )
            seen.insert(id)
            return theme
        } catch {
            warnings.append("theme \(id)")
            return nil
        }
    }

    /// A JSON `true`, and nothing that merely looks like one.
    ///
    /// Foundation's number bridging does not separate the two: a stored `1`
    /// reads as `true` through `as? Bool`. A library written by hand, or by a
    /// version of this app that does not exist yet, should be told its value is
    /// wrong rather than have a setting invented for it. The browser's reader
    /// checks `typeof` for the same reason.
    private static func strictBool(_ value: Any?) -> Bool? {
        guard let value, CFGetTypeID(value as CFTypeRef) == CFBooleanGetTypeID() else {
            return nil
        }
        return value as? Bool
    }

    /// A JSON number, and not a boolean: `true as? Double` is `1.0`, which
    /// would turn a nonsense opacity into a fully drawn layer.
    private static func strictNumber(_ value: Any?) -> Double? {
        guard let value, CFGetTypeID(value as CFTypeRef) != CFBooleanGetTypeID() else {
            return nil
        }
        return value as? Double
    }
}

/// The saved library on this device.
///
/// `UserDefaults` rather than a file, because this is the same small document
/// the browser keeps in `localStorage` and because nothing else needs to read
/// it. `@unchecked Sendable` for the reason `UserDefaultsProvinceLicenceStorage`
/// carries it: `UserDefaults` predates the annotation and is documented as
/// thread-safe, and this type touches one key.
public struct UserDefaultsCustomThemeStorage: @unchecked Sendable {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load() -> CustomThemeStore.Library {
        CustomThemeStore.read(object: defaults.object(forKey: CustomThemeStore.storageKey))
    }

    /// Writes the library, or says why it could not be written.
    ///
    /// Read back rather than assumed. `UserDefaults.set` returns nothing and
    /// reports nothing when the domain refuses the write — a managed or forced
    /// preference, a container the app can no longer reach — so without this
    /// the panel says a setup was saved and the next launch finds it gone.
    public func save(_ themes: [MapTheme]) -> CustomThemeStore.Failure? {
        do {
            let data = try CustomThemeStore.data(for: themes)
            defaults.set(data, forKey: CustomThemeStore.storageKey)
            guard defaults.data(forKey: CustomThemeStore.storageKey) == data else {
                return .notSaved
            }
            return nil
        } catch {
            return error
        }
    }
}
