import Foundation
import GeoCore
import MapCatalog
import Observation

/// Bundled terms that include the NSPRD acceptance disclaimer and boundary caveat.
///
/// This presence check closes the decision sheet if those required statements
/// are missing or reworded. The shipped document's remaining supplied wording
/// is pinned separately by the document regression; this is not a licence grant.
public struct ProvinceLicenceDocument: Sendable {
    public let text: String

    public init?(text: String?) {
        guard let text else { return nil }
        let normalized = Self.normalize(text)
        guard Self.requiredStatements.allSatisfy({ normalized.contains(Self.normalize($0)) })
        else { return nil }
        self.text = text
    }

    private static func normalize(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    // Supplied official NSPRD v1 PDF, SHA-256
    // 39b41573e53b14b142b4d7082bd76fa68de708d646475a1b0288a54bbb7ba20d.
    // Preserve the source wording, including "size or a property".
    private static let requiredStatements = [
        "The Province of Nova Scotia makes no representations, expressed or implied, as to the accuracy, completeness and timeliness of the information, maps and other data, including PID numbers or property boundaries, which are displayed in this map that is presented in this application.",
        "The map is provided on the understanding that it is not guaranteed to be correct or complete or current, is subject to change, and conclusions drawn or decisions made, based on an interpretation of the data, are the responsibility of the user.",
        "By continuing to use this application, you agree to the terms of this disclaimer.",
        "Property boundaries shown on maps are obtained from the provincial land registration system. They are not based upon survey and are subject to change. They are not conclusive evidence of the location or size or a property. You cannot rely on them to determine boundaries or legal descriptions of properties.",
    ]
}

/// Whether the user has accepted the Province of Nova Scotia's data licence.
///
/// `declined` exists only in memory, for the session in which the user said no.
/// It is never written to storage — see `ProvinceLicenceStorage`.
public enum ProvinceLicenceState: String, Sendable, Codable, CaseIterable {
    /// Never asked, or acceptance revoked.
    case unknown
    case accepted
    case declined
}

/// The right to request Province-restricted layers.
///
/// There is no public initialiser. The only way to obtain a value that permits
/// restricted layers is to read one off a `ProvinceLicenceStore` whose state is
/// `.accepted`, which in turn happens only after the user accepts. Call sites
/// therefore cannot fabricate permission, only pass along permission they were
/// given.
public struct ProvinceLicenceClearance: Sendable, Equatable {
    /// Whether Province-restricted services may be contacted.
    public let allowsRestrictedLayers: Bool

    init(allowsRestrictedLayers: Bool) {
        self.allowsRestrictedLayers = allowsRestrictedLayers
    }

    /// A clearance that permits nothing restricted.
    ///
    /// This is the value a fresh install starts from, and the value to reach
    /// for in any code path that is unsure what the user has agreed to.
    public static let none = ProvinceLicenceClearance(allowsRestrictedLayers: false)

    /// Whether this layer may be shown and requested.
    public func allows(_ layer: LayerDescriptor) -> Bool {
        allowsRestrictedLayers || !layer.requiresProvinceClearance
    }

    /// Whether this layer may be shown and requested.
    ///
    /// An id with no descriptor is refused rather than allowed: an unknown
    /// layer is exactly the case where we cannot know whether it is restricted.
    public func allows(_ id: LayerID) -> Bool {
        guard let layer = LayerCatalog.descriptor(for: id) else { return false }
        return allows(layer)
    }

    /// The subset of `ids` that may be installed on the map.
    ///
    /// The overlay-install path and the tile-request path both answer the
    /// question through this one type, so they cannot come to different
    /// conclusions about the same layer.
    public func permitted<S: Sequence<LayerID>>(from ids: S) -> Set<LayerID> {
        Set(ids.filter(allows))
    }
}

/// Where the acceptance flag lives across launches.
public protocol ProvinceLicenceStorage: Sendable {
    func loadState() -> ProvinceLicenceState
    func save(_ state: ProvinceLicenceState)
}

/// The shipping storage: one `UserDefaults` key holding one literal string.
///
/// Only acceptance is persisted. A declined or revoked licence removes the key
/// rather than writing `"declined"`, so every non-accepted history — never
/// asked, said no, said no after saying yes, key corrupted by anything at all —
/// converges on the same state, and that state is the closed one. There is no
/// stored value that could be misread as permission except the exact string the
/// acceptance flow writes.
///
/// `@unchecked Sendable` because `UserDefaults` predates the annotation; it is
/// documented as thread-safe, and this type only ever reads and writes one
/// string key.
public struct UserDefaultsProvinceLicenceStorage: ProvinceLicenceStorage, @unchecked Sendable {
    /// Preserved as a record of the earlier, incomplete app disclosure.
    /// Loading or revoking current clearance never removes this legacy record.
    public static let legacyStorageKey = "ns-marks-the-spot:province-license:v1"
    /// An app disclosure revision; the supplied Province licence remains NSPRD v1.0.
    public static let storageKey = "ns-marks-the-spot:province-license:nsprd-v1:disclosure-v2"
    public static let acceptedValue = "accepted"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func loadState() -> ProvinceLicenceState {
        defaults.string(forKey: Self.storageKey) == Self.acceptedValue ? .accepted : .unknown
    }

    public func save(_ state: ProvinceLicenceState) {
        switch state {
        case .accepted:
            defaults.set(Self.acceptedValue, forKey: Self.storageKey)
        case .unknown, .declined:
            defaults.removeObject(forKey: Self.storageKey)
        }
    }
}

/// In-memory storage, for tests and previews.
public final class InMemoryProvinceLicenceStorage: ProvinceLicenceStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: ProvinceLicenceState

    public init(initial: ProvinceLicenceState = .unknown) {
        // Mirrors the real store: only acceptance can survive construction.
        stored = initial == .accepted ? .accepted : .unknown
    }

    public func loadState() -> ProvinceLicenceState {
        lock.withLock { stored }
    }

    public func save(_ state: ProvinceLicenceState) {
        lock.withLock { stored = state == .accepted ? .accepted : .unknown }
    }
}

/// The app's single source of truth for licence acceptance.
///
/// `@MainActor` because the licence sheet and every layer toggle read it during
/// view updates; a second copy on another actor is exactly how a UI that says
/// "off" ends up alongside a request that already went out.
@Observable
@MainActor
public final class ProvinceLicenceStore {
    public private(set) var state: ProvinceLicenceState

    private let storage: any ProvinceLicenceStorage

    public init(storage: any ProvinceLicenceStorage = UserDefaultsProvinceLicenceStorage()) {
        self.storage = storage
        state = storage.loadState()
    }

    /// The clearance to hand to anything that builds requests or installs
    /// overlays. Derived on every read rather than cached, so revoking takes
    /// effect at the next tile rather than at the next relaunch.
    public var clearance: ProvinceLicenceClearance {
        ProvinceLicenceClearance(allowsRestrictedLayers: state == .accepted)
    }

    /// Whether the licence sheet still needs to be shown before a restricted
    /// layer can be turned on.
    public var needsDecision: Bool {
        state != .accepted
    }

    public func accept() {
        state = .accepted
        storage.save(.accepted)
    }

    public func decline() {
        state = .declined
        storage.save(.declined)
    }

    /// Revokes a previously accepted licence, returning the app to its
    /// first-launch position.
    public func revoke() {
        state = .unknown
        storage.save(.unknown)
    }
}
