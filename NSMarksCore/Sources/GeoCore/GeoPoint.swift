import Foundation

/// A WGS84 coordinate, deliberately independent of `CLLocationCoordinate2D`.
///
/// GeoCore stays MapKit-free so its maths can be unit-tested mac-native without
/// a simulator; the app bridges to CoreLocation at the `MapSurface/` boundary.
/// Field names mirror the web's `GeoPoint` (`lat`/`lng`) so ported algorithms
/// read line-for-line against their TypeScript originals.
public struct GeoPoint: Hashable, Sendable, Codable {
    public var lat: Double
    public var lng: Double

    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}
