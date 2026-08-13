import Foundation

/// A WGS84 latitude/longitude rectangle.
///
/// Named after its edges rather than after two corner points because that is
/// how every source we transcribe from writes them, and because a corner pair
/// is the shape that lets a transposition pass silently: `(south, west)` and
/// `(west, south)` are both two doubles, and only one of them is a place in
/// Nova Scotia.
///
/// Deliberately independent of `MKMapRect` and `MKCoordinateRegion` for the
/// same reason `GeoPoint` is independent of `CLLocationCoordinate2D` — GeoCore
/// stays MapKit-free so its maths is testable without a simulator, and the app
/// bridges at the `MapSurface/` boundary.
///
/// Antimeridian-crossing boxes are out of scope: everything this app draws is
/// in Nova Scotia, and modelling the wrap would add a case no call site here
/// can exercise.
public struct GeoBoundingBox: Hashable, Sendable {
    public var south: Double
    public var west: Double
    public var north: Double
    public var east: Double

    public init(south: Double, west: Double, north: Double, east: Double) {
        self.south = south
        self.west = west
        self.north = north
        self.east = east
    }

    /// True when the box is the right way up — north above south, east right
    /// of west.
    public var isWellFormed: Bool {
        north > south && east > west
    }

    public var center: GeoPoint {
        GeoPoint(lat: (south + north) / 2, lng: (west + east) / 2)
    }

    public func contains(_ point: GeoPoint) -> Bool {
        point.lat >= south && point.lat <= north
            && point.lng >= west && point.lng <= east
    }

    /// Whether two boxes share any ground, edges included.
    ///
    /// Used to decide which Fletcher sheets a viewport needs, so a sheet
    /// touching the viewport edge counts: excluding it would leave a blank
    /// strip at the screen edge that fills in only after a further pan.
    public func intersects(_ other: GeoBoundingBox) -> Bool {
        south <= other.north && north >= other.south
            && west <= other.east && east >= other.west
    }
}
