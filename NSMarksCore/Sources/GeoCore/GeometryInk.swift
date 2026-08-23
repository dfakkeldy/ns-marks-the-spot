import Foundation

/// Whether a shape actually puts something inside a rectangle of ground.
///
/// The box around a shape is not the shape. A concave zone, a diagonal lot, a
/// river that bends away all have boxes covering ground they never touch, and
/// a page or a panel built from the box says a layer is there when the paper is
/// blank. That is the one claim this project's documents must not make: blank
/// ground that the reader is told was answered for.
///
/// The two questions are separate on purpose, because the answer depends on how
/// the shape is drawn. Line work crossing the rectangle is ink whatever the
/// style. A rectangle *inside* the shape is ink only when the shape is filled;
/// an outline-only shape large enough to hold the whole page strokes its
/// boundary somewhere off it and leaves nothing behind.
extension GeoBoundingBox {
    /// Whether any part of the segment lies in this box.
    ///
    /// Liang-Barsky: clip the segment against the four edges and see whether
    /// any of it survives. Loop-free, so no clipping iteration can fail to
    /// settle. A zero-length segment is a point, and answers whether the point
    /// is in the box.
    public func meets(segmentFrom start: GeoPoint, to end: GeoPoint) -> Bool {
        let dx = end.lng - start.lng
        let dy = end.lat - start.lat
        guard dx.isFinite, dy.isFinite, start.lng.isFinite, start.lat.isFinite else {
            return false
        }
        let edges = [
            (-dx, start.lng - west),
            (dx, east - start.lng),
            (-dy, start.lat - south),
            (dy, north - start.lat)
        ]
        var enter = 0.0
        var leave = 1.0
        for (direction, distance) in edges {
            if direction == 0 {
                // Parallel to this edge: either the whole segment is on the
                // wrong side of it or the edge does not constrain it.
                if distance < 0 { return false }
                continue
            }
            let crossing = distance / direction
            if direction < 0 {
                if crossing > leave { return false }
                enter = Swift.max(enter, crossing)
            } else {
                if crossing < enter { return false }
                leave = Swift.min(leave, crossing)
            }
        }
        return true
    }

    /// Whether any of the ring's edges lie in this box, the closing edge
    /// included.
    ///
    /// A ring whose closing position was omitted still describes the same area,
    /// so the edge back to the start is walked whether or not it was written
    /// down.
    ///
    /// A single position has no edges and is not ink: every drawing path in
    /// this project skips a ring shorter than two positions, so counting one as
    /// a mark would claim ground the page leaves blank.
    public func meets(ring: [GeoPoint]) -> Bool {
        guard ring.count > 1 else { return false }
        for index in ring.indices where meets(
            segmentFrom: ring[index], to: ring[(index + 1) % ring.count]
        ) {
            return true
        }
        return false
    }

    /// The same, for an open line: no edge from the last position back to the
    /// first, because a river does not close.
    public func meets(line: [GeoPoint]) -> Bool {
        guard line.count > 1 else { return false }
        for index in line.indices.dropLast() where meets(
            segmentFrom: line[index], to: line[index + 1]
        ) {
            return true
        }
        return false
    }
}

extension GeoJSONGeometry {
    /// Whether this geometry's line work crosses the given ground.
    ///
    /// Points count: a point on the page is drawn as a marker there. A point
    /// off it is not, however close its box is.
    public func lineWorkReaches(_ bounds: GeoBoundingBox) -> Bool {
        switch self {
        case .point(let point):
            bounds.meets(segmentFrom: point, to: point)
        case .multiPoint(let points):
            points.contains { bounds.meets(segmentFrom: $0, to: $0) }
        case .lineString(let line):
            bounds.meets(line: line)
        case .multiLineString(let lines):
            lines.contains { bounds.meets(line: $0) }
        case .polygon(let part):
            part.contains { bounds.meets(ring: $0) }
        case .multiPolygon(let parts):
            parts.contains { part in part.contains { bounds.meets(ring: $0) } }
        }
    }

    /// Whether the given ground lies wholly inside one of this geometry's
    /// areas.
    ///
    /// Only meaningful once `lineWorkReaches` has said no: ground no edge
    /// crosses is entirely in or entirely out, so its centre decides it. Point
    /// and line geometry enclose nothing and answer no.
    public func surrounds(_ bounds: GeoBoundingBox) -> Bool {
        PolygonHitTest.contains(
            GeoPoint(
                lat: (bounds.south + bounds.north) / 2,
                lng: (bounds.west + bounds.east) / 2
            ),
            multiPolygon: polygonParts
        )
    }
}
