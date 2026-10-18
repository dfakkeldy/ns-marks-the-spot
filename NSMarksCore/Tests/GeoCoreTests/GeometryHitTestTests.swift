import Foundation
import Testing

@testable import GeoCore

/// Whether a tap reaches a catalogued feature.
@Suite("Tapping a drawn geometry")
struct GeometryHitTestTests {
    private let tolerance = 0.0005

    private func point(_ lng: Double, _ lat: Double) -> GeoPoint {
        GeoPoint(lat: lat, lng: lng)
    }

    private var square: PolygonHitTest.PolygonPart {
        [[point(-63.6, 44.6), point(-63.4, 44.6), point(-63.4, 44.8), point(-63.6, 44.8),
          point(-63.6, 44.6)]]
    }

    @Test func aTapInsideAnAreaHitsIt() {
        #expect(
            GeometryHitTest.hits(.polygon(square), at: point(-63.5, 44.7), toleranceDegrees: tolerance)
        )
    }

    /// The stroke is drawn a few points wide, so a tap that lands on the line
    /// the user aimed at must not miss for falling a metre outside it.
    @Test func aTapJustOutsideTheEdgeStillHitsIt() {
        #expect(
            GeometryHitTest.hits(
                .polygon(square), at: point(-63.6001, 44.7), toleranceDegrees: tolerance
            )
        )
    }

    @Test func aTapWellOutsideMisses() {
        #expect(
            !GeometryHitTest.hits(
                .polygon(square), at: point(-63.9, 44.7), toleranceDegrees: tolerance
            )
        )
    }

    /// A hole is not the area. A policy area with a lake cut out of it must not
    /// answer for a tap on the lake.
    @Test func aTapInAHoleMisses() {
        let holed: PolygonHitTest.PolygonPart = square + [
            [point(-63.55, 44.65), point(-63.45, 44.65), point(-63.45, 44.75),
             point(-63.55, 44.75), point(-63.55, 44.65)]
        ]
        #expect(
            !GeometryHitTest.hits(.polygon(holed), at: point(-63.5, 44.7), toleranceDegrees: tolerance)
        )
    }

    /// A line encloses nothing, so it is only ever reachable by the tolerance.
    @Test func aTapNearALineHitsItAndOneFurtherOffDoesNot() {
        let reach = GeoJSONGeometry.lineString([point(-63.6, 44.7), point(-63.4, 44.7)])
        #expect(GeometryHitTest.hits(reach, at: point(-63.5, 44.7002), toleranceDegrees: tolerance))
        #expect(!GeometryHitTest.hits(reach, at: point(-63.5, 44.72), toleranceDegrees: tolerance))
    }

    /// Past either end, not just beside the middle: a segment is a segment, and
    /// a tap beyond its last vertex is not on it.
    @Test func aTapPastTheEndOfALineMisses() {
        let reach = GeoJSONGeometry.lineString([point(-63.6, 44.7), point(-63.4, 44.7)])
        #expect(!GeometryHitTest.hits(reach, at: point(-63.3, 44.7), toleranceDegrees: tolerance))
    }

    /// The finger is round. Degrees of latitude cover fewer pixels than degrees
    /// of longitude this far north, so a raw-degree comparison would make the
    /// tap area about 1.4 times taller than it is wide.
    @Test func theToleranceIsTheSameDistanceInEveryDirectionOnScreen() {
        let centre = point(-63.5, 44.7)
        let scale = cos(44.7 * .pi / 180)
        let east = GeometryHitTest.distance(centre, point(-63.5 + 0.001, 44.7))
        let north = GeometryHitTest.distance(centre, point(-63.5, 44.7 + 0.001 * scale))
        #expect(abs(east - north) < 1e-9)
    }

    @Test func multiPolygonAnswersForAnyOfItsParts() {
        let far: PolygonHitTest.PolygonPart = [
            [point(-61.0, 46.0), point(-60.8, 46.0), point(-60.8, 46.2), point(-61.0, 46.0)]
        ]
        let both = GeoJSONGeometry.multiPolygon([square, far])
        #expect(GeometryHitTest.hits(both, at: point(-60.9, 46.05), toleranceDegrees: tolerance))
        #expect(GeometryHitTest.hits(both, at: point(-63.5, 44.7), toleranceDegrees: tolerance))
    }
}
