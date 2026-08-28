import Foundation

/// Whether a tap landed on a geometry, measured in the space the map draws in.
///
/// The tolerance is the finger, and it is a caller's business: how much ground
/// a fingertip covers depends on the zoom, so a fixed tolerance would make a
/// line untappable when zoomed out and greedy when zoomed in.
public enum GeometryHitTest {
    /// Screen-shaped distance in degrees of longitude.
    ///
    /// Latitude is divided by cos(lat) because Web Mercator lays longitude out
    /// linearly across the screen and latitude does not: the same pixel height
    /// covers fewer degrees of latitude the further north the map is, so
    /// comparing raw degrees would make a tap taller than it is wide in Nova
    /// Scotia by a factor of about 1.4.
    public static func distance(_ first: GeoPoint, _ second: GeoPoint) -> Double {
        let scale = max(cos(first.lat * .pi / 180), 0.01)
        let latitude = (first.lat - second.lat) / scale
        let longitude = first.lng - second.lng
        return (latitude * latitude + longitude * longitude).squareRoot()
    }

    /// The distance to the nearest point of a segment, projected in the same
    /// scaled space `distance` measures in — so it is the nearest point on
    /// screen rather than the nearest one in raw degrees.
    public static func distanceToSegment(
        _ point: GeoPoint, _ start: GeoPoint, _ end: GeoPoint
    ) -> Double {
        let scale = max(cos(point.lat * .pi / 180), 0.01)
        let dx = end.lng - start.lng
        let dy = (end.lat - start.lat) / scale
        let lengthSquared = dx * dx + dy * dy
        guard lengthSquared > 0 else { return distance(point, start) }
        var t =
            ((point.lng - start.lng) * dx + ((point.lat - start.lat) / scale) * dy) / lengthSquared
        t = min(max(t, 0), 1)
        return distance(
            point, GeoPoint(lat: start.lat + t * dy * scale, lng: start.lng + t * dx)
        )
    }

    public static func isNear(_ point: GeoPoint, line: [GeoPoint], tolerance: Double) -> Bool {
        guard line.count >= 2 else {
            return line.first.map { distance(point, $0) <= tolerance } ?? false
        }
        for index in 0..<(line.count - 1)
        where distanceToSegment(point, line[index], line[index + 1]) <= tolerance {
            return true
        }
        return false
    }

    /// Whether `point` lands on `geometry`.
    ///
    /// An area answers for its boundary as well as its interior: the stroke is
    /// drawn a few points wide, and a tap that lands on the line the user aimed
    /// at must not miss because it fell a metre outside it.
    public static func hits(
        _ geometry: GeoJSONGeometry, at point: GeoPoint, toleranceDegrees tolerance: Double
    ) -> Bool {
        switch geometry {
        case .point(let candidate):
            distance(point, candidate) <= tolerance
        case .multiPoint(let candidates):
            candidates.contains { distance(point, $0) <= tolerance }
        case .lineString(let line):
            isNear(point, line: line, tolerance: tolerance)
        case .multiLineString(let lines):
            lines.contains { isNear(point, line: $0, tolerance: tolerance) }
        case .polygon(let part):
            PolygonHitTest.contains(point, part: part)
                || part.contains { isNear(point, line: $0, tolerance: tolerance) }
        case .multiPolygon(let parts):
            PolygonHitTest.contains(point, multiPolygon: parts)
                || parts.contains { part in
                    part.contains { isNear(point, line: $0, tolerance: tolerance) }
                }
        }
    }
}
