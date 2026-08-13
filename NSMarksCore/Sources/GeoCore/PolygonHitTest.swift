import Foundation

/// Planar point-in-polygon with hole support, ported from the ring helpers in
/// `web/src/services/pvscAssessments.ts`.
///
/// The maths is deliberately planar in degree space rather than geodesic. Over a
/// single parcel the difference is far below the coordinate precision NSPRD
/// publishes, and the web decides containment this way — an assessment record
/// must attach to the same parcel on both surfaces, so the algorithm is copied
/// rather than improved.
///
/// GeoJSON position order is `[x = longitude, y = latitude]`; `GeoPoint.lng`
/// supplies x and `GeoPoint.lat` supplies y throughout.
public enum PolygonHitTest {
    /// A linear ring: the first and last positions may or may not be repeated,
    /// because every traversal here closes the ring with a modulo index.
    public typealias Ring = [GeoPoint]
    /// A GeoJSON Polygon's coordinates: outer ring first, then holes.
    public typealias PolygonPart = [Ring]

    /// Points exactly on an edge count as contained.
    ///
    /// This matters at shared parcel boundaries: a click on the line between two
    /// parcels hits both, and the caller resolves the tie by draw order. Ejecting
    /// boundary points instead would leave hairline gaps that identify nothing.
    static func isOnSegment(_ point: GeoPoint, start: GeoPoint, end: GeoPoint) -> Bool {
        let segmentX = end.lng - start.lng
        let segmentY = end.lat - start.lat
        let cross =
            (point.lng - start.lng) * segmentY - (point.lat - start.lat) * segmentX
        let tolerance = 1e-10 * max(1, abs(segmentX), abs(segmentY))
        if abs(cross) > tolerance {
            return false
        }
        let dot =
            (point.lng - start.lng) * (point.lng - end.lng)
            + (point.lat - start.lat) * (point.lat - end.lat)
        return dot <= tolerance
    }

    static func isOnRingBoundary(_ point: GeoPoint, ring: Ring) -> Bool {
        guard !ring.isEmpty else { return false }
        return ring.indices.contains { index in
            isOnSegment(point, start: ring[index], end: ring[(index + 1) % ring.count])
        }
    }

    /// Even-odd ray cast, boundary cases excluded — callers test the boundary
    /// first so that a vertex hit does not depend on ray parity.
    static func isInRingInterior(_ point: GeoPoint, ring: Ring) -> Bool {
        guard ring.count >= 3 else { return false }
        var inside = false
        var previous = ring.count - 1
        for index in ring.indices {
            let current = ring[index]
            let prior = ring[previous]
            let crossesRay =
                (current.lat > point.lat) != (prior.lat > point.lat)
                && point.lng
                    < (prior.lng - current.lng) * (point.lat - current.lat)
                        / (prior.lat - current.lat) + current.lng
            if crossesRay {
                inside.toggle()
            }
            previous = index
        }
        return inside
    }

    /// Contained by a single polygon: inside the outer ring and outside every
    /// hole, with any boundary hit short-circuiting to true.
    public static func contains(_ point: GeoPoint, part: PolygonPart) -> Bool {
        if part.contains(where: { isOnRingBoundary(point, ring: $0) }) {
            return true
        }
        guard let outerRing = part.first else { return false }
        let holes = part.dropFirst()
        return isInRingInterior(point, ring: outerRing)
            && !holes.contains { isInRingInterior(point, ring: $0) }
    }

    /// Contained by any part of a MultiPolygon.
    public static func contains(_ point: GeoPoint, multiPolygon: [PolygonPart]) -> Bool {
        multiPolygon.contains { contains(point, part: $0) }
    }
}
