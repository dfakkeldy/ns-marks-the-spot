import Foundation
import Testing

@testable import GeoCore

/// How far to the line, and which way. The reading only — what a caller may
/// say about it is the caller's problem, and the caveats travel with it.
@Suite("Walk to the line")
struct WalkToLineTests {
    /// A square metre-ish box around 45°N, whose west edge runs due north.
    private var boundary: SnapEngine.Target {
        let ring = [
            GeoPoint(lat: 44.999, lng: -63.001),
            GeoPoint(lat: 45.001, lng: -63.001),
            GeoPoint(lat: 45.001, lng: -62.999),
            GeoPoint(lat: 44.999, lng: -62.999),
        ]
        var segments: [(GeoPoint, GeoPoint)] = []
        for index in ring.indices {
            segments.append((ring[index], ring[(index + 1) % ring.count]))
        }
        return SnapEngine.Target(source: .parcel, vertices: ring, segments: segments)
    }

    @Test("Nothing to measure to is nil, not zero")
    func nothingToMeasureTo() {
        #expect(
            WalkToLine.reading(
                from: GeoPoint(lat: 45, lng: -63), accuracyMetres: 5, to: []
            ) == nil
        )
    }

    /// Standing inside the box, west of centre: the west edge is nearest and
    /// it lies due west.
    @Test("The reading gives the distance and the way")
    func theReadingGivesDistanceAndWay() throws {
        let reading = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 45.0, lng: -63.0005),
                accuracyMetres: 5,
                to: [boundary]
            )
        )
        // About 40 m of longitude at 45°N.
        #expect(reading.distanceMetres > 30 && reading.distanceMetres < 50)
        let bearing = try #require(reading.bearingDegrees)
        #expect(abs(bearing - 270) < 1)
        #expect(reading.source == .parcel)
        #expect(reading.kind == .edge)
    }

    /// A corner and an edge are different things to walk to. Diagonally
    /// outside the south-west corner, both adjacent edges project onto the
    /// corner itself, so the corner is the honest answer — inside the box the
    /// perpendicular to an edge is always shorter than the diagonal to a
    /// corner, which is why a vertex-first search gives the wrong number here.
    @Test("A corner reads as a corner")
    func aCornerReadsAsACorner() throws {
        let reading = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 44.9985, lng: -63.0015),
                accuracyMetres: 5,
                to: [boundary]
            )
        )
        #expect(reading.kind == .vertex)
    }

    /// The reason this does not reuse `SnapEngine.nearest`: standing a metre
    /// from an edge and a hundred from every corner, a vertex-first search
    /// answers with the corner.
    @Test("Near an edge, the edge is the answer")
    func nearAnEdgeTheEdgeIsTheAnswer() throws {
        let justInside = GeoPoint(lat: 45.0, lng: -63.00099)
        let reading = try #require(
            WalkToLine.reading(from: justInside, accuracyMetres: 5, to: [boundary])
        )
        #expect(reading.kind == .edge)
        #expect(reading.distanceMetres < 2)

        let vertexFirst = SnapEngine.nearest(
            to: justInside, among: [boundary], toleranceMetres: .greatestFiniteMagnitude
        )
        #expect(vertexFirst?.kind == .vertex)
        #expect((vertexFirst?.distanceMetres ?? 0) > 100)
    }

    /// The number a distance readout can quietly get wrong: three metres to
    /// the boundary, from a fix known to twelve.
    @Test("A distance inside the fix's own error says so")
    func aDistanceInsideTheFixAccuracySaysSo() throws {
        let onTheLine = GeoPoint(lat: 45.0, lng: -63.00098)
        let tight = try #require(
            WalkToLine.reading(from: onTheLine, accuracyMetres: 1, to: [boundary])
        )
        #expect(!tight.isWithinFixAccuracy)

        let loose = try #require(
            WalkToLine.reading(from: onTheLine, accuracyMetres: 12, to: [boundary])
        )
        #expect(loose.isWithinFixAccuracy)

        // No accuracy at all is not a tight one.
        let unknown = try #require(
            WalkToLine.reading(from: onTheLine, accuracyMetres: nil, to: [boundary])
        )
        #expect(!unknown.isWithinFixAccuracy)
    }

    /// Zero is a direction. Standing exactly on the corner has none.
    @Test("Standing on the point has no bearing")
    func standingOnThePointHasNoBearing() throws {
        let corner = GeoPoint(lat: 44.999, lng: -63.001)
        let reading = try #require(
            WalkToLine.reading(from: corner, accuracyMetres: 5, to: [boundary])
        )
        #expect(reading.distanceMetres == 0)
        #expect(reading.bearingDegrees == nil)
    }

    /// Unbounded by design: a boundary far away is exactly what a reader
    /// walking towards it wants to know about, and the snap tolerance is a
    /// decision about what a GESTURE meant.
    @Test("A far boundary is still measured")
    func aFarBoundaryIsStillMeasured() throws {
        let reading = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 45.05, lng: -63.0),
                accuracyMetres: 5,
                to: [boundary]
            )
        )
        #expect(reading.distanceMetres > 5_000)
    }
}
