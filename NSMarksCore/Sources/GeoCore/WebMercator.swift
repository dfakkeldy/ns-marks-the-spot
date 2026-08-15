import Foundation

/// A point in EPSG:3857 metres.
public struct MercatorPoint: Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// Spherical Web Mercator, and ground distance on the same sphere.
///
/// Ported from `web/src/userMaps/transform/webMercator.ts`, and deliberately
/// sharing that file's choice of radius for both the projection and the
/// haversine: mixing the mean radius into one of them would make every reported
/// distance disagree with the projected space it was measured in.
///
/// `TileMath` already carries the world extent and the latitude limit; this is
/// the continuous form of the same projection, needed wherever a frame or a
/// scale bar has to be placed between tile boundaries rather than on them.
public enum WebMercator {
    public static let earthRadiusMetres = 6_378_137.0

    /// Mercator's ordinate diverges at the poles, so every implementation
    /// clamps. This is the limit Leaflet and MapKit both use, which keeps
    /// metres here identical to the map's own projected space.
    public static let maxLatitude = TileMath.maxWebMercatorLatitude

    public static func project(_ point: GeoPoint) -> MercatorPoint {
        let latitude = min(max(point.lat, -maxLatitude), maxLatitude)
        return MercatorPoint(
            x: earthRadiusMetres * point.lng * .pi / 180,
            y: earthRadiusMetres * log(tan(.pi / 4 + (latitude * .pi / 180) / 2))
        )
    }

    /// Clamped symmetrically to `project`, so a frame dragged past the
    /// projection's domain comes back as the edge rather than as a latitude no
    /// map can draw.
    public static func unproject(_ point: MercatorPoint) -> GeoPoint {
        let latitude = (2 * atan(exp(point.y / earthRadiusMetres)) - .pi / 2) * 180 / .pi
        return GeoPoint(
            lat: min(max(latitude, -maxLatitude), maxLatitude),
            lng: point.x / earthRadiusMetres * 180 / .pi
        )
    }

    /// Great-circle distance between two coordinates.
    ///
    /// Distances are reported through this rather than as Mercator magnitudes:
    /// Mercator inflates distance by 1/cos(latitude), which is about 1.44× at
    /// Nova Scotian latitudes. A scale bar drawn from projected metres would
    /// claim a length the ground does not have.
    public static func groundMetres(from start: GeoPoint, to end: GeoPoint) -> Double {
        let startLatitude = start.lat * .pi / 180
        let endLatitude = end.lat * .pi / 180
        let deltaLatitude = endLatitude - startLatitude
        let deltaLongitude = (end.lng - start.lng) * .pi / 180
        let h = pow(sin(deltaLatitude / 2), 2)
            + cos(startLatitude) * cos(endLatitude) * pow(sin(deltaLongitude / 2), 2)
        return 2 * earthRadiusMetres * asin(min(1, sqrt(h)))
    }
}
