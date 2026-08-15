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
public struct GeoBoundingBox: Hashable, Sendable, Codable {
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

    /// The ground both boxes share, or `nil` when they share none.
    ///
    /// Boxes that only touch along an edge return the degenerate box rather
    /// than `nil`, matching `intersects`. A caller measuring area gets zero,
    /// which is the truthful answer.
    public func intersection(with other: GeoBoundingBox) -> GeoBoundingBox? {
        guard intersects(other) else { return nil }
        return GeoBoundingBox(
            south: Swift.max(south, other.south),
            west: Swift.max(west, other.west),
            north: Swift.min(north, other.north),
            east: Swift.min(east, other.east)
        )
    }

    /// The smallest box holding every box in `boxes`, or `nil` for none.
    public static func union<S: Sequence<GeoBoundingBox>>(_ boxes: S) -> GeoBoundingBox? {
        var iterator = boxes.makeIterator()
        guard var result = iterator.next() else { return nil }
        while let box = iterator.next() {
            result = GeoBoundingBox(
                south: Swift.min(result.south, box.south),
                west: Swift.min(result.west, box.west),
                north: Swift.max(result.north, box.north),
                east: Swift.max(result.east, box.east)
            )
        }
        return result
    }

    /// The smallest box holding every point, or `nil` when the sequence is
    /// empty or any point is not a place.
    ///
    /// One bad vertex refuses the whole box rather than being skipped. This is
    /// how a warped raster gets the rectangle MapKit culls it against, and a
    /// box computed from the survivors of a mesh with a NaN in it would be a
    /// confident rectangle around a sheet that draws with a hole in it — the
    /// wrong thing to look correct.
    ///
    /// Every vertex is read, not just the four corners: a warped sheet's edges
    /// bow outward, and a box drawn to the corners alone clips the bulge.
    public static func covering<S: Sequence<GeoPoint>>(_ points: S) -> GeoBoundingBox? {
        var result: GeoBoundingBox?
        for point in points {
            guard point.lat.isFinite, point.lng.isFinite,
                  abs(point.lat) <= 90, abs(point.lng) <= 180
            else { return nil }
            guard let current = result else {
                result = GeoBoundingBox(
                    south: point.lat, west: point.lng, north: point.lat, east: point.lng
                )
                continue
            }
            result = GeoBoundingBox(
                south: Swift.min(current.south, point.lat),
                west: Swift.min(current.west, point.lng),
                north: Swift.max(current.north, point.lat),
                east: Swift.max(current.east, point.lng)
            )
        }
        return result
    }
}
