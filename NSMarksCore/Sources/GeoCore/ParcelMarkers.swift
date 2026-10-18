import Foundation

/// Where a listed parcel is, when the parcel itself is too small to see.
///
/// Ported from `web/src/services/parcelMarkers.ts`. At an overview zoom a
/// parcel is a sub-pixel polygon: a user looking at the whole province would
/// see nothing at all where a tax sale is, which is the one thing that view is
/// for. A marker stands in until the boundary is legible.
public enum ParcelMarkers {
    /// Markers show at this zoom and below. Polygon fills take over from 12,
    /// where a parcel's shape becomes readable — the same threshold the web
    /// uses, so the two surfaces change over at the same place.
    public static let overviewMaxZoom = 11

    /// The centroid of the largest outer ring, or nil for a parcel with no
    /// boundary to stand for.
    ///
    /// Largest ring rather than all of them averaged: a parcel split by a road
    /// is several parts, and the mean of the parts can land on the road. The
    /// biggest piece is the one a marker over it is honestly pointing at.
    ///
    /// Planar maths on degrees, as on the web. A parcel is far too small for
    /// the projection error to move a marker visibly at the zooms where markers
    /// are drawn at all.
    public static func representativePoint(parts: [[[GeoPoint]]]) -> GeoPoint? {
        var best: (area: Double, point: GeoPoint)?
        for part in parts {
            guard let outer = part.first, outer.count >= 4 else { continue }
            let candidate = ringAreaAndCentroid(outer)
            if best == nil || candidate.area > best!.area {
                best = candidate
            }
        }
        return best?.point
    }

    private static func ringAreaAndCentroid(_ ring: [GeoPoint]) -> (area: Double, point: GeoPoint) {
        var twiceArea = 0.0
        var x = 0.0
        var y = 0.0
        var previous = ring.count - 1
        for index in ring.indices {
            let first = ring[previous]
            let second = ring[index]
            let cross = first.lng * second.lat - second.lng * first.lat
            twiceArea += cross
            x += (first.lng + second.lng) * cross
            y += (first.lat + second.lat) * cross
            previous = index
        }
        guard twiceArea != 0 else {
            // A ring of zero area is a degenerate boundary, not an error. Its
            // first vertex is as good a place to point at as any.
            return (0, ring[0])
        }
        return (
            abs(twiceArea / 2),
            GeoPoint(lat: y / (3 * twiceArea), lng: x / (3 * twiceArea))
        )
    }
}
