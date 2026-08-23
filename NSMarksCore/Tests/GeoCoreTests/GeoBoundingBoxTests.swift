import Testing

@testable import GeoCore

@Suite("A box around a scattering of points")
struct GeoBoundingBoxCoveringTests {
    @Test func theBoxHoldsEveryPointAndNoMore() throws {
        let points = [
            GeoPoint(lat: 44.65, lng: -63.58),  // Halifax
            GeoPoint(lat: 46.14, lng: -60.19),  // Sydney
            GeoPoint(lat: 43.84, lng: -66.12),  // Yarmouth
        ]
        let box = try #require(GeoBoundingBox.covering(points))
        #expect(box.south == 43.84)
        #expect(box.north == 46.14)
        #expect(box.west == -66.12)
        #expect(box.east == -60.19)
        #expect(points.allSatisfy(box.contains))
    }

    /// A warped sheet's edges bow outward, so the extremes are not at the
    /// corners. A box taken from the four corners alone clips the bulge, and
    /// MapKit does not draw outside the rectangle it was given — the missing
    /// strip would read as a decode failure rather than as a too-small box.
    @Test func aBowedEdgeIsInsideTheBox() throws {
        let corners = [
            GeoPoint(lat: 45.0, lng: -64.0), GeoPoint(lat: 45.0, lng: -63.0),
            GeoPoint(lat: 44.0, lng: -64.0), GeoPoint(lat: 44.0, lng: -63.0),
        ]
        let bulge = GeoPoint(lat: 45.2, lng: -63.5)
        let cornersOnly = try #require(GeoBoundingBox.covering(corners))
        #expect(!cornersOnly.contains(bulge))

        let whole = try #require(GeoBoundingBox.covering(corners + [bulge]))
        #expect(whole.north == 45.2)
        #expect(whole.contains(bulge))
    }

    /// One unplaceable vertex refuses the whole box. Skipping it would return
    /// a confident rectangle around a sheet that draws with a hole in it,
    /// which is the wrong thing to look correct.
    @Test(arguments: [
        GeoPoint(lat: .nan, lng: -63.0),
        GeoPoint(lat: 45.0, lng: .infinity),
        GeoPoint(lat: 91.0, lng: -63.0),
        GeoPoint(lat: 45.0, lng: -181.0),
    ])
    func oneVertexThatIsNotAPlaceRefusesTheBox(bad: GeoPoint) {
        #expect(GeoBoundingBox.covering([GeoPoint(lat: 45, lng: -64), bad]) == nil)
    }

    @Test func nothingToCoverIsNoBox() {
        #expect(GeoBoundingBox.covering([GeoPoint]()) == nil)
    }

    /// A single point, or a mesh that collapsed onto one, gives a box with no
    /// area rather than nil. It is a truthful answer, and a caller asking
    /// `isWellFormed` still gets told it is not a rectangle.
    @Test func onePointIsADegenerateBoxNotARefusal() throws {
        let box = try #require(GeoBoundingBox.covering([GeoPoint(lat: 45, lng: -64)]))
        #expect(box.south == box.north)
        #expect(box.west == box.east)
        #expect(!box.isWellFormed)
    }
}
