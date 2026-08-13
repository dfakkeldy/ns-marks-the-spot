import Foundation
import Testing

@testable import GeoCore

// The web decides parcel containment with these exact rules; a divergence here
// attaches an assessment record to a different parcel than the web would.

@Suite("PolygonHitTest")
struct PolygonHitTestTests {
    /// A unit square with a central square hole, in GeoJSON ring order.
    private let squareWithHole: PolygonHitTest.PolygonPart = [
        [
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 10),
            GeoPoint(lat: 10, lng: 10),
            GeoPoint(lat: 10, lng: 0),
        ],
        [
            GeoPoint(lat: 4, lng: 4),
            GeoPoint(lat: 4, lng: 6),
            GeoPoint(lat: 6, lng: 6),
            GeoPoint(lat: 6, lng: 4),
        ],
    ]

    @Test("contains a point in the interior")
    func interior() {
        #expect(PolygonHitTest.contains(GeoPoint(lat: 2, lng: 2), part: squareWithHole))
    }

    @Test("rejects a point outside the outer ring")
    func outside() {
        #expect(
            !PolygonHitTest.contains(GeoPoint(lat: 20, lng: 20), part: squareWithHole)
        )
    }

    @Test("rejects a point inside a hole")
    func insideHole() {
        #expect(!PolygonHitTest.contains(GeoPoint(lat: 5, lng: 5), part: squareWithHole))
    }

    @Test("treats a point on the outer edge as contained")
    func onOuterEdge() {
        #expect(PolygonHitTest.contains(GeoPoint(lat: 0, lng: 5), part: squareWithHole))
    }

    @Test("treats a vertex as contained")
    func onVertex() {
        #expect(PolygonHitTest.contains(GeoPoint(lat: 10, lng: 10), part: squareWithHole))
    }

    @Test("treats a point on a hole edge as contained, not excluded")
    func onHoleEdge() {
        // Boundary wins over hole exclusion: the short-circuit runs before the
        // interior tests, matching the web's ordering.
        #expect(PolygonHitTest.contains(GeoPoint(lat: 4, lng: 5), part: squareWithHole))
    }

    @Test("separates a point on the edge from a point well inside")
    func containmentDistinguishesTheEdge() {
        // A point on a shared edge sits on both neighbours. Callers that would
        // otherwise report it as this parcel's need to be able to see that.
        #expect(
            PolygonHitTest.containment(GeoPoint(lat: 0, lng: 5), part: squareWithHole) == .boundary
        )
        #expect(
            PolygonHitTest.containment(GeoPoint(lat: 2, lng: 2), part: squareWithHole) == .interior
        )
        #expect(PolygonHitTest.containment(GeoPoint(lat: 20, lng: 20), part: squareWithHole) == nil)
        #expect(PolygonHitTest.containment(GeoPoint(lat: 5, lng: 5), part: squareWithHole) == nil)
    }

    @Test("takes the strongest containment across a multipolygon")
    func containmentAcrossPartsPrefersTheInterior() {
        let west: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0),
                GeoPoint(lat: 0, lng: 5),
                GeoPoint(lat: 5, lng: 5),
                GeoPoint(lat: 5, lng: 0),
            ]
        ]
        let east: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 5),
                GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 5, lng: 10),
                GeoPoint(lat: 5, lng: 5),
            ]
        ]
        // On the seam between the two parts of one parcel — a boundary of each,
        // but inside the parcel, so the parcel-level answer is not "on an edge".
        #expect(
            PolygonHitTest.containment(GeoPoint(lat: 2, lng: 5), multiPolygon: [west, east])
                == .boundary
        )
        #expect(
            PolygonHitTest.containment(GeoPoint(lat: 2, lng: 2), multiPolygon: [west, east])
                == .interior
        )
        #expect(
            PolygonHitTest.containment(GeoPoint(lat: 2, lng: 20), multiPolygon: [west, east]) == nil
        )
    }

    @Test("rejects everything for an empty part")
    func emptyPart() {
        #expect(!PolygonHitTest.contains(GeoPoint(lat: 1, lng: 1), part: []))
    }

    @Test("rejects everything for a degenerate ring")
    func degenerateRing() {
        let sliver: PolygonHitTest.PolygonPart = [
            [GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 1, lng: 1)]
        ]
        #expect(!PolygonHitTest.contains(GeoPoint(lat: 5, lng: 5), part: sliver))
    }

    @Test("matches any part of a multipolygon")
    func multiPolygon() {
        let west: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0),
                GeoPoint(lat: 0, lng: 1),
                GeoPoint(lat: 1, lng: 1),
                GeoPoint(lat: 1, lng: 0),
            ]
        ]
        let east: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 0, lng: 11),
                GeoPoint(lat: 1, lng: 11),
                GeoPoint(lat: 1, lng: 10),
            ]
        ]
        let parts = [west, east]
        #expect(PolygonHitTest.contains(GeoPoint(lat: 0.5, lng: 10.5), multiPolygon: parts))
        #expect(PolygonHitTest.contains(GeoPoint(lat: 0.5, lng: 0.5), multiPolygon: parts))
        #expect(!PolygonHitTest.contains(GeoPoint(lat: 0.5, lng: 5), multiPolygon: parts))
    }

    @Test("handles a concave ring where a ray crosses twice")
    func concave() {
        // An L-shape: the notch must read as outside even though it lies within
        // the bounding box.
        let lShape: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0),
                GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 4, lng: 10),
                GeoPoint(lat: 4, lng: 4),
                GeoPoint(lat: 10, lng: 4),
                GeoPoint(lat: 10, lng: 0),
            ]
        ]
        #expect(PolygonHitTest.contains(GeoPoint(lat: 2, lng: 2), part: lShape))
        #expect(!PolygonHitTest.contains(GeoPoint(lat: 8, lng: 8), part: lShape))
    }
}
