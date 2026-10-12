import Foundation

/// Who the app says it is, on every request it makes.
///
/// The Province's map services, OpenStreetMap and our own tile host all read
/// the same name and the same contact page. That is what lets an operator
/// tell this app's traffic — residents looking at the ground in front of
/// them — from bulk scraping, and know where to ask if it ever looks wrong.
/// The system default (`<executable>/<build> CFNetwork/… Darwin/…`) names a
/// build, not a project, and gives nobody a way to reach it.
///
/// OpenStreetMap's tile policy requires exactly this; the Province's services
/// do not, but they are the ones separating public use from scrapers, and a
/// request that names itself is the only kind they can tell apart.
public enum ClientIdentity {
    /// `NSMarksTheSpot/<version> iOS (+<contact page>)`.
    ///
    /// The version is the app's marketing version. A test runner has no app
    /// bundle of its own, so there it reads whatever its host bundle says, or
    /// "dev" — which is why tests check the name and contact, not the number.
    public static let userAgent: String = {
        let version = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String
        return "NSMarksTheSpot/\(version ?? "dev") iOS "
            + "(+https://kinnokilabs.com/apps/nsmarksthespot/)"
    }()

    /// The request, carrying the identifying `User-Agent`.
    ///
    /// A request that already names an agent keeps it: anything that sets one
    /// on purpose knows something this default does not.
    public static func identified(_ request: URLRequest) -> URLRequest {
        guard request.value(forHTTPHeaderField: "User-Agent") == nil else {
            return request
        }
        var request = request
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        return request
    }
}
