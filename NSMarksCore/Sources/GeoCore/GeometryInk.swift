import Foundation

/// Whether a shape actually puts something inside a rectangle of ground.
///
/// The box around a shape is not the shape. A concave zone, a diagonal lot, a
/// river that bends away all have boxes covering ground they never touch, and
/// a page or a panel built from the box says a layer is there when the paper is
/// blank. That is the one claim this project's documents must not make: blank
/// ground that the reader is told was answered for.
///
/// Every test here runs in Web Mercator, because that is the plane the ink is
/// laid in: the compositor and the screen both project each vertex and join the
/// projected points with straight lines. The straight line between two
/// positions in degrees is a different line — 3.9 km different across a
/// province-length segment — and judging ink along it answers for a page
/// nobody drew.
///
/// The two questions are separate on purpose, because the answer depends on how
/// the shape is drawn. Line work crossing the rectangle is ink whatever the
/// style. A rectangle *inside* the shape is ink only when the shape is filled;
/// an outline-only shape large enough to hold the whole page strokes its
/// boundary somewhere off it and leaves nothing behind.
extension GeoBoundingBox {
    /// Whether any part of the segment lies in this box.
    ///
    /// Liang-Barsky in the projected plane: clip the segment against the four
    /// edges and see whether any of it survives. Loop-free, so no clipping
    /// iteration can fail to settle. A zero-length segment is a point, and
    /// answers whether the point is in the box.
    public func meets(segmentFrom start: GeoPoint, to end: GeoPoint) -> Bool {
        guard start.lat.isFinite, start.lng.isFinite,
              end.lat.isFinite, end.lng.isFinite
        else { return false }
        let from = WebMercator.project(start)
        let to = WebMercator.project(end)
        let low = WebMercator.project(GeoPoint(lat: south, lng: west))
        let high = WebMercator.project(GeoPoint(lat: north, lng: east))
        let dx = to.x - from.x
        let dy = to.y - from.y
        let edges = [
            (-dx, from.x - low.x),
            (dx, high.x - from.x),
            (-dy, from.y - low.y),
            (dy, high.y - from.y)
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

    /// Whether this ground lies wholly inside the given polygon parts.
    ///
    /// Only meaningful once no edge crosses the box: ground no edge crosses is
    /// entirely in or entirely out, so one interior point decides it. The point
    /// taken is the box's centre in the projected plane, and the crossings are
    /// counted there too, against the straight projected edges the page
    /// actually draws rather than the degree-space ones nobody does.
    public func liesWithin(_ parts: [PolygonHitTest.PolygonPart]) -> Bool {
        let low = WebMercator.project(GeoPoint(lat: south, lng: west))
        let high = WebMercator.project(GeoPoint(lat: north, lng: east))
        let centre = MercatorPoint(x: (low.x + high.x) / 2, y: (low.y + high.y) / 2)
        return parts.contains { part in
            guard let outer = part.first, Self.interior(centre, ring: outer) else {
                return false
            }
            // Rings after the first are holes: ground inside one is ground the
            // part does not cover.
            return !part.dropFirst().contains { Self.interior(centre, ring: $0) }
        }
    }

    /// Even-odd crossing count in the projected plane.
    private static func interior(_ point: MercatorPoint, ring: [GeoPoint]) -> Bool {
        guard ring.count > 2 else { return false }
        var inside = false
        var previous = ring.count - 1
        for index in ring.indices {
            let from = WebMercator.project(ring[index])
            let to = WebMercator.project(ring[previous])
            if (from.y > point.y) != (to.y > point.y),
               point.x < (to.x - from.x) * (point.y - from.y) / (to.y - from.y) + from.x {
                inside.toggle()
            }
            previous = index
        }
        return inside
    }

    /// The same ground plus a margin, given as a fraction of the box's own
    /// projected width and height.
    ///
    /// This is how a stroke's reach is asked about: a boundary whose centre
    /// line passes just outside the page still lays half its width on it, and
    /// the page's points-to-ground scale is exactly its bounds over its frame,
    /// so half a line width of ground is half a line width divided by the
    /// frame. A fraction that is not a number, or is negative, grows nothing.
    public func expanded(byFractionX fractionX: Double, fractionY: Double) -> GeoBoundingBox {
        guard fractionX.isFinite, fractionY.isFinite, fractionX >= 0, fractionY >= 0
        else { return self }
        let low = WebMercator.project(GeoPoint(lat: south, lng: west))
        let high = WebMercator.project(GeoPoint(lat: north, lng: east))
        let padX = (high.x - low.x) * fractionX
        let padY = (high.y - low.y) * fractionY
        let grownLow = WebMercator.unproject(MercatorPoint(x: low.x - padX, y: low.y - padY))
        let grownHigh = WebMercator.unproject(MercatorPoint(x: high.x + padX, y: high.y + padY))
        return GeoBoundingBox(
            south: grownLow.lat, west: grownLow.lng,
            north: grownHigh.lat, east: grownHigh.lng
        )
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
    /// Only meaningful once `lineWorkReaches` has said no. Point and line
    /// geometry enclose nothing and answer no.
    public func surrounds(_ bounds: GeoBoundingBox) -> Bool {
        bounds.liesWithin(polygonParts)
    }
}
