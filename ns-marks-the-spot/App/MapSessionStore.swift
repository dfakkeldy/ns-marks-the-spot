import Foundation
import NSDataServices

/// Where the map was when the app last went away.
///
/// The browser keeps this in the address bar: every pan rewrites the URL, so a
/// reload opens on the same ground, in the same record set, with the same
/// layers drawn. A phone has no address bar. Without this a cold launch put the
/// reader back on the province at the opening zoom and switched the default
/// layers on again over the ones they had deliberately switched off.
///
/// Stored as the link itself rather than as a record of its own. The share URL
/// already says everything a resumed session needs, both surfaces read it, and
/// a second encoding would be a second thing to keep in step with it. It also
/// means what lands in the defaults is a link a person can paste into a browser
/// to see what the app was showing.
///
/// It is a view, not a permission. Restoring reads the licence again; a stored
/// session cannot put a restricted layer back on its own.
@MainActor
struct MapSessionStore {
    static let key = "map-session-v1"
    /// The background is stored beside the link rather than inside it. MapKit's
    /// satellite and hybrid maps have no name in the vocabulary the two
    /// surfaces share, and inventing one would put a word in a pasteable link
    /// that the browser would drop on arrival.
    static let backgroundKey = "map-session-background-v1"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The last view, or `nil` on a first launch and after anything unreadable.
    func load() -> MapSession? {
        guard let stored = defaults.string(forKey: Self.key),
              // `parse` never fails, so without this a stored value that had
              // been truncated or overwritten would open the map on the default
              // view and present it as the one the reader left.
              MapShareState.carriesState(stored),
              // `carriesState` answers for a link a reader pasted, where one
              // recognised parameter is enough to act on. This is stricter
              // because it can be: `save` always writes a position, so a stored
              // value without one was not written by this app and its silence
              // about where the map was is not an answer.
              URLComponents(string: stored)?.queryItems?.contains(
                  where: { $0.name == "position" }
              ) == true
        else { return nil }
        return MapSession(
            view: MapShareState.parse(stored),
            // Absent for a session written before the background was carried,
            // and absent is not "Standard": the link itself says whether the
            // modern map was on, and answering for it here would switch a
            // reader's blank background back to streets.
            background: defaults.string(forKey: Self.backgroundKey)
                .flatMap(MapBaseType.init(rawValue:))
        )
    }

    func save(_ session: MapSession) {
        guard let url = session.view.url(base: OverlayViewModel.webMapURL) else { return }
        defaults.set(url.absoluteString, forKey: Self.key)
        if let background = session.background {
            defaults.set(background.rawValue, forKey: Self.backgroundKey)
        } else {
            defaults.removeObject(forKey: Self.backgroundKey)
        }
    }

    func clear() {
        defaults.removeObject(forKey: Self.key)
        defaults.removeObject(forKey: Self.backgroundKey)
    }
}

/// A view worth reopening: everything a shared link carries, and the one thing
/// it cannot.
///
/// The background is separate because it is a native concept. The browser has
/// one base map and a switch for it; this app has MapKit's standard, satellite
/// and hybrid maps, NS Aerial, and none at all. A session that dropped it would
/// put a reader who works in satellite back on streets at every cold launch.
struct MapSession: Equatable {
    var view: MapShareState
    var background: MapBaseType?

    init(view: MapShareState, background: MapBaseType? = nil) {
        self.view = view
        self.background = background
    }
}
