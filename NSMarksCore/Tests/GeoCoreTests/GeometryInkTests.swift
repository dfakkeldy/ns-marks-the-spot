import Foundation
import Testing

@testable import GeoCore

/// Whether a shape puts anything inside a rectangle of ground.
///
/// The reason this is not the box test it replaces: a page or a panel built
/// from a shape's bounding box tells the reader a layer is on ground the
/// shape never reaches. Blank paper with a legend entry over it is the map
/// claiming an answer it does not have.
@Suite("Ink inside a rectangle")
struct GeometryInkTests {
    /// An L, drawn anticlockwise from the south-west. Its bounding box is the
    /// whole 0...10 square; the shape itself leaves the north-east quarter
    /// empty.
    private static let ell = GeoJSONGeometry.polygon([
        [
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 10),
            GeoPoint(lat: 4, lng: 10),
            GeoPoint(lat: 4, lng: 4),
            GeoPoint(lat: 10, lng: 4),
            GeoPoint(lat: 10, lng: 0),
            GeoPoint(lat: 0, lng: 0)
        ]
    ])

    private static func box(
        _ south: Double, _ west: Double, _ north: Double, _ east: Double
    ) -> GeoBoundingBox {
        GeoBoundingBox(south: south, west: west, north: north, east: east)
    }

    @Test("The corner an L's box covers and the L does not has no ink in it")
    func theCornerAnEllsBoxCoversAndTheEllDoesNotHasNoInkInIt() {
        let corner = Self.box(6, 6, 9, 9)
        // The premise: the box test this replaces says yes here.
        #expect(Self.ell.boundingBox?.intersects(corner) == true)
        #expect(!Self.ell.lineWorkReaches(corner))
        #expect(!Self.ell.surrounds(corner))
    }

    @Test("A rectangle the boundary crosses has ink in it")
    func aRectangleTheBoundaryCrossesHasInkInIt() {
        // Straddles the inner corner at (4, 4).
        #expect(Self.ell.lineWorkReaches(Self.box(3, 3, 5, 5)))
        // And one that only clips the western edge.
        #expect(Self.ell.lineWorkReaches(Self.box(1, -1, 2, 0.5)))
    }

    @Test("A rectangle wholly inside the shape is surrounded and uncrossed")
    func aRectangleWhollyInsideTheShapeIsSurroundedAndUncrossed() {
        let inside = Self.box(1, 1, 3, 3)
        #expect(!Self.ell.lineWorkReaches(inside))
        #expect(Self.ell.surrounds(inside))
    }

    /// The distinction the fill gate turns on. Line and point geometry enclose
    /// no ground, so "is this page inside it" is no rather than unanswered.
    @Test("A line encloses nothing")
    func aLineEnclosesNothing() {
        let river = GeoJSONGeometry.lineString([
            GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 10, lng: 10)
        ])
        #expect(!river.surrounds(Self.box(4, 5, 5, 6)))
        // The diagonal misses a rectangle its box covers.
        #expect(river.boundingBox?.intersects(Self.box(1, 7, 2, 9)) == true)
        #expect(!river.lineWorkReaches(Self.box(1, 7, 2, 9)))
        // And crosses one on its way.
        #expect(river.lineWorkReaches(Self.box(4, 4, 6, 6)))
    }

    /// A river drawn as an open line has no edge from its last position back to
    /// its first. Closing it would put a stream where the survey has none.
    @Test("An open line is not closed behind the caller's back")
    func anOpenLineIsNotClosedBehindTheCallersBack() {
        let bend = GeoJSONGeometry.lineString([
            GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 0, lng: 10), GeoPoint(lat: 10, lng: 10)
        ])
        // The closing edge would run from (10, 10) back to (0, 0) straight
        // through here.
        #expect(!bend.lineWorkReaches(Self.box(4, 4, 6, 6)))
        // A ring with the same positions does draw it.
        let ring = GeoJSONGeometry.polygon([
            [
                GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 10, lng: 10), GeoPoint(lat: 0, lng: 0)
            ]
        ])
        #expect(ring.lineWorkReaches(Self.box(4, 4, 6, 6)))
    }

    /// A ring whose closing position the source omitted describes the same
    /// area, so its closing edge is walked whether or not it was written down.
    @Test("An unclosed ring still has its closing edge")
    func anUnclosedRingStillHasItsClosingEdge() {
        let unclosed = GeoJSONGeometry.polygon([
            [
                GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 10, lng: 10)
            ]
        ])
        #expect(unclosed.lineWorkReaches(Self.box(4, 4, 6, 6)))
    }

    /// Every drawing path in this project skips a ring or line shorter than two
    /// positions, so a stray position must not read as a mark.
    @Test("A lone position in a ring draws nothing and marks nothing")
    func aLonePositionInARingDrawsNothingAndMarksNothing() {
        let stray = GeoJSONGeometry.polygon([[GeoPoint(lat: 5, lng: 5)]])
        #expect(!stray.lineWorkReaches(Self.box(4, 4, 6, 6)))
        let strayLine = GeoJSONGeometry.lineString([GeoPoint(lat: 5, lng: 5)])
        #expect(!strayLine.lineWorkReaches(Self.box(4, 4, 6, 6)))
    }

    @Test("A point is ink where it stands and nowhere else")
    func aPointIsInkWhereItStandsAndNowhereElse() {
        let well = GeoJSONGeometry.point(GeoPoint(lat: 5, lng: 5))
        #expect(well.lineWorkReaches(Self.box(4, 4, 6, 6)))
        #expect(!well.lineWorkReaches(Self.box(0, 0, 1, 1)))
        #expect(!well.surrounds(Self.box(4, 4, 6, 6)))
    }

    /// A hole is ground the shape does not cover, and a page inside one is
    /// blank.
    @Test("A page inside a hole is not surrounded")
    func aPageInsideAHoleIsNotSurrounded() {
        let donut = GeoJSONGeometry.polygon([
            [
                GeoPoint(lat: 0, lng: 0), GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 10, lng: 10), GeoPoint(lat: 10, lng: 0),
                GeoPoint(lat: 0, lng: 0)
            ],
            [
                GeoPoint(lat: 3, lng: 3), GeoPoint(lat: 3, lng: 7),
                GeoPoint(lat: 7, lng: 7), GeoPoint(lat: 7, lng: 3),
                GeoPoint(lat: 3, lng: 3)
            ]
        ])
        #expect(!donut.surrounds(Self.box(4, 4, 6, 6)))
        #expect(!donut.lineWorkReaches(Self.box(4, 4, 6, 6)))
        #expect(donut.surrounds(Self.box(1, 1, 2, 2)))
    }

    /// The segment clip on its own, including the case that decides whether a
    /// point query works at all.
    @Test("A segment with no length asks whether its point is in the box")
    func aSegmentWithNoLengthAsksWhetherItsPointIsInTheBox() {
        let square = Self.box(0, 0, 10, 10)
        let inside = GeoPoint(lat: 5, lng: 5)
        let outside = GeoPoint(lat: 5, lng: 11)
        #expect(square.meets(segmentFrom: inside, to: inside))
        #expect(!square.meets(segmentFrom: outside, to: outside))
        // A segment that passes through without either end inside.
        #expect(
            square.meets(
                segmentFrom: GeoPoint(lat: 5, lng: -5), to: GeoPoint(lat: 5, lng: 15)
            )
        )
        // And one that passes by.
        #expect(
            !square.meets(
                segmentFrom: GeoPoint(lat: 15, lng: -5), to: GeoPoint(lat: 15, lng: 15)
            )
        )
    }

    /// Coordinates that are not numbers reach this from a source, not from a
    /// caller, and the answer has to be no rather than a crash or a yes.
    @Test("A segment with no finite coordinates is not ink")
    func aSegmentWithNoFiniteCoordinatesIsNotInk() {
        let square = Self.box(0, 0, 10, 10)
        #expect(
            !square.meets(
                segmentFrom: GeoPoint(lat: .nan, lng: 5), to: GeoPoint(lat: 5, lng: 5)
            )
        )
        #expect(
            !square.meets(
                segmentFrom: GeoPoint(lat: 5, lng: 5), to: GeoPoint(lat: .infinity, lng: 5)
            )
        )
    }
}
