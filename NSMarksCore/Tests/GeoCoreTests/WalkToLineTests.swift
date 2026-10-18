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
        #expect(tight.accuracy == .tighterThanDistance)

        let loose = try #require(
            WalkToLine.reading(from: onTheLine, accuracyMetres: 12, to: [boundary])
        )
        #expect(loose.accuracy == .widerThanDistance)
    }

    /// A fix that never said how well it knows itself is a third thing, and
    /// the first version of this folded it in with the wide ones — which the
    /// caller renders as no caveat at all, the shape of a *good* fix.
    ///
    /// CoreLocation reports a negative `horizontalAccuracy` for a position
    /// whose accuracy it cannot state, and `TrackFix` says the same of
    /// anything non-positive; `TrackRecorder` copies the value through
    /// unchanged, so all of these reach here.
    @Test("An accuracy the device did not state is neither tight nor wide")
    func anAccuracyTheDeviceDidNotStateIsNeitherTightNorWide() throws {
        let onTheLine = GeoPoint(lat: 45.0, lng: -63.00098)
        for unusable: Double? in [nil, -1, 0, -0.5, .nan, .infinity] {
            let reading = try #require(
                WalkToLine.reading(from: onTheLine, accuracyMetres: unusable, to: [boundary])
            )
            #expect(
                reading.accuracy == .unstated,
                "accuracy \(String(describing: unusable)) must not be read as a radius"
            )
        }

        // And least of all where a reader is most likely to act on it: standing
        // on the corner, where every arithmetic shortcut looks harmless.
        let onTheCorner = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 44.999, lng: -63.001),
                accuracyMetres: nil,
                to: [boundary]
            )
        )
        #expect(onTheCorner.distanceMetres == 0)
        #expect(onTheCorner.accuracy == .unstated)

        // A stated radius at zero distance IS wider than the distance, which
        // is the honest answer rather than a special case.
        let statedOnTheCorner = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 44.999, lng: -63.001),
                accuracyMetres: 5,
                to: [boundary]
            )
        )
        #expect(statedOnTheCorner.accuracy == .widerThanDistance)
    }

    /// A projection landing on an end of a segment IS that corner. A caller
    /// may hand over segments with no vertices listed, and then this is the
    /// only thing keeping "to the boundary run" off a reading whose nearest
    /// thing is a corner.
    @Test("A projection onto a segment's end reads as a corner")
    func aProjectionOntoASegmentsEndReadsAsACorner() throws {
        let segmentsOnly = SnapEngine.Target(
            source: .parcel,
            vertices: [],
            segments: [(GeoPoint(lat: 45, lng: -63), GeoPoint(lat: 45, lng: -62.99))]
        )
        // West of the segment's first end: the projection clamps to it.
        let reading = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 45, lng: -63.001),
                accuracyMetres: 5,
                to: [segmentsOnly]
            )
        )
        #expect(reading.kind == .vertex)

        // And the middle of the same segment is still a run of edge.
        let middle = try #require(
            WalkToLine.reading(
                from: GeoPoint(lat: 45.0005, lng: -62.995),
                accuracyMetres: 5,
                to: [segmentsOnly]
            )
        )
        #expect(middle.kind == .edge)
    }

    /// A tie decided by which target the caller listed first would let the
    /// same standing spot report a parcel boundary or the reader's own shape
    /// depending on an array's order.
    @Test("A tie between a corner and an edge is a corner, whichever came first")
    func aTieBetweenACornerAndAnEdgeIsACorner() throws {
        let here = GeoPoint(lat: 45, lng: -63)
        let edgeThrough = SnapEngine.Target(
            source: .ownFeature,
            vertices: [],
            segments: [(GeoPoint(lat: 45, lng: -63.001), GeoPoint(lat: 45, lng: -62.999))]
        )
        let cornerHere = SnapEngine.Target(source: .parcel, vertices: [here], segments: [])

        for order in [[edgeThrough, cornerHere], [cornerHere, edgeThrough]] {
            let reading = try #require(
                WalkToLine.reading(from: here, accuracyMetres: 5, to: order)
            )
            #expect(reading.distanceMetres == 0)
            #expect(reading.kind == .vertex)
            #expect(reading.source == .parcel)
        }
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
