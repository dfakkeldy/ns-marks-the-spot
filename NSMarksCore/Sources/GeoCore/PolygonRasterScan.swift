import Foundation

/// Interior containment asked in raster order.
///
/// `PolygonHitTest.contains` answers one arbitrary point, and pays for that
/// generality on every call: a boundary walk over every vertex of every ring,
/// then a ray cast over them all again. A raster sample asks the same
/// multipolygon about a hundred thousand pixel centres, and those centres
/// arrive in row order — so the crossings the ray cast rediscovers at every
/// pixel can instead be computed once per row and read back per column. The
/// work drops from pixels × vertices to rows × vertices, which is the
/// difference between an hour of pinned CPU on a shoreline parcel and a few
/// milliseconds.
///
/// Two deliberate departures from `PolygonHitTest.contains`:
///
/// - No boundary test. A pixel centre that lands exactly on a ring is decided
///   by ray parity, falling to whichever side the arithmetic says — which is
///   how the web's sampler decides every point. The boundary tie matters when
///   a tap must pick a parcel; it cannot matter to an approximate pixel count,
///   where the whole pixel is already a guess about the ground under it.
/// - Columns within a row must be visited west to east, because the scan reads
///   its sorted crossings with a cursor that only moves that way.
///
/// Interior decisions are otherwise bit-for-bit the ray cast's: each crossing
/// longitude comes from the same formula over the same operands as
/// `isInRingInterior`, and a point is interior to a ring exactly when an odd
/// number of its crossings lie strictly east of the point.
public struct PolygonRasterScan {
    /// One ring with the latitude band it can cross. A row outside the band
    /// has no crossings, so its vertex walk is skipped without reading it.
    private struct BandedRing {
        let points: PolygonHitTest.Ring
        let minLatitude: Double
        let maxLatitude: Double
    }

    /// Every ring, flattened; `partRanges[p]` slices out part `p`'s rings in
    /// GeoJSON order, outer ring first and holes after.
    private let rings: [BandedRing]
    private let partRanges: [Range<Int>]

    /// The current row's crossings, sorted west to east, each tagged with the
    /// ring that produced it. Reused between rows so the row loop allocates
    /// nothing.
    private var crossings: [(longitude: Double, ring: Int)] = []
    /// Per ring: whether an odd number of its crossings lie east of the
    /// cursor's position — the ray cast's own answer for that ring.
    private var parity: [Bool]
    private var cursor = 0
    private var inside = false

    public init(_ multiPolygon: [PolygonHitTest.PolygonPart]) {
        var rings: [BandedRing] = []
        var partRanges: [Range<Int>] = []
        for part in multiPolygon {
            let start = rings.count
            for ring in part {
                var minLatitude = Double.infinity
                var maxLatitude = -Double.infinity
                for point in ring {
                    minLatitude = Swift.min(minLatitude, point.lat)
                    maxLatitude = Swift.max(maxLatitude, point.lat)
                }
                rings.append(
                    BandedRing(
                        points: ring, minLatitude: minLatitude, maxLatitude: maxLatitude
                    )
                )
            }
            partRanges.append(start..<rings.count)
        }
        self.rings = rings
        self.partRanges = partRanges
        self.parity = [Bool](repeating: false, count: rings.count)
    }

    /// Prepares one row. Rows may be visited in any order.
    public mutating func beginRow(latitude: Double) {
        crossings.removeAll(keepingCapacity: true)
        cursor = 0
        for (index, ring) in rings.enumerated() {
            // South of every vertex, every edge is on one side of the row;
            // at or north of the highest vertex, no vertex is strictly above
            // it. Either way there is no sign change and no crossing, so the
            // whole vertex walk is skipped. (A NaN row latitude fails both
            // comparisons and samples nothing, as the ray cast would.)
            guard latitude >= ring.minLatitude, latitude < ring.maxLatitude else {
                parity[index] = false
                continue
            }
            let points = ring.points
            let before = crossings.count
            // The same edge order and arithmetic as `isInRingInterior`, so a
            // pixel centre meets the same crossing longitudes bit for bit.
            var previous = points.count - 1
            for current in points.indices {
                let a = points[current]
                let b = points[previous]
                if (a.lat > latitude) != (b.lat > latitude) {
                    let crossing =
                        (b.lng - a.lng) * (latitude - a.lat) / (b.lat - a.lat) + a.lng
                    if crossing.isFinite {
                        crossings.append((crossing, index))
                    }
                }
                previous = current
            }
            // West of every crossing, the count still to the east is the whole
            // count — even for a closed ring, but odd when a non-finite vertex
            // cost the filter above a crossing. Seeding parity from what was
            // actually kept keeps the walk faithful to what the ray cast
            // would count east of any point.
            parity[index] = (crossings.count - before) % 2 == 1
        }
        crossings.sort { $0.longitude < $1.longitude }
        inside = computeInside()
    }

    /// Whether the point at `longitude` on the current row is interior.
    ///
    /// Longitudes must not decrease within a row: the cursor over the sorted
    /// crossings only moves east.
    public mutating func contains(longitude: Double) -> Bool {
        var moved = false
        while cursor < crossings.count, crossings[cursor].longitude <= longitude {
            parity[crossings[cursor].ring].toggle()
            cursor += 1
            moved = true
        }
        if moved {
            inside = computeInside()
        }
        return inside
    }

    /// Inside any part: odd crossings east of the cursor for the outer ring,
    /// even for every hole — `containment(_:part:)`'s interior rule, asked of
    /// the precomputed parities instead of the vertices.
    private func computeInside() -> Bool {
        for range in partRanges {
            guard let outer = range.first, parity[outer] else { continue }
            if !range.dropFirst().contains(where: { parity[$0] }) {
                return true
            }
        }
        return false
    }
}
