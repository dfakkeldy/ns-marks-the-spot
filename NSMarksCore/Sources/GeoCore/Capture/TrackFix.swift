import Foundation

/// One GPS fix as the recorder receives it — the web's `LiveFix`.
///
/// Its own type rather than `CLLocation` because everything downstream of it
/// (the filter, the recorder, the raw GPX writer) is pure and mac-testable,
/// and CoreLocation must not leak into GeoCore.
public struct TrackFix: Hashable, Sendable, Codable {
    public var latitude: Double
    public var longitude: Double
    /// Nil when the fix carried no altitude — never zero-filled.
    public var altitudeM: Double?
    /// Reported horizontal accuracy in metres. Non-positive means broken.
    public var accuracyM: Double
    public var timestamp: Date

    public init(
        latitude: Double,
        longitude: Double,
        altitudeM: Double? = nil,
        accuracyM: Double,
        timestamp: Date
    ) {
        self.latitude = latitude
        self.longitude = longitude
        self.altitudeM = altitudeM
        self.accuracyM = accuracyM
        self.timestamp = timestamp
    }
}
