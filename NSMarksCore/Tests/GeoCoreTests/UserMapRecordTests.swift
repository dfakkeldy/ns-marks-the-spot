import Foundation
import Testing

@testable import GeoCore

@Suite("A saved user map")
struct UserMapRecordTests {
    private static let size = PixelSize(width: 2000, height: 1700)

    private static func record(
        _ placement: UserMapRecord.Placement, sourceRect: PixelRect? = nil
    ) -> UserMapRecord {
        UserMapRecord(
            id: "map-1", name: "Church 1864", pixelSize: size,
            sourceRect: sourceRect, placement: placement
        )
    }

    private static func points(_ controls: [GroundControlPoint]) -> [SessionControlPoint] {
        controls.enumerated().map {
            SessionControlPoint(id: "gcp-\($0 + 1)", pixel: $1.pixel, map: $1.map)
        }
    }

    /// The record's own method decides the lattice, not the panel's. A saved
    /// spline record that drew through an affine would snap back the moment
    /// the panel closed, and the panel's own tests would not notice.
    @Test func aSavedSplineDrawsThroughItsSpline() {
        let controls = Self.points(GeoreferenceFixtures.bent)
        let spline = Self.record(.controlPoints(controls, method: .spline))
        let affine = Self.record(.controlPoints(controls, method: .affine))

        #expect(spline.mesh?.count == GcpMesh.splineGridSize + 1)
        #expect(affine.mesh?.count == GcpMesh.affineGridSize + 1)
        // And they place the sheet differently, which is the reason the method
        // has to survive being saved.
        let splineCorner = try? #require(spline.mesh?.last?.last)
        let affineCorner = try? #require(affine.mesh?.last?.last)
        if let splineCorner, let affineCorner {
            #expect(WebMercator.groundMetres(from: splineCorner, to: affineCorner) > 1)
        }
    }

    /// Below the bending threshold a spline record takes the affine lattice.
    /// At three points the two surfaces agree to a nanometre, so the dense
    /// lattice buys nothing and costs two thousand draws in place of two.
    @Test func aSplineRecordWithNoBendTakesTheAffineLattice() {
        let record = Self.record(
            .controlPoints(
                Self.points(Array(GeoreferenceFixtures.bent.prefix(3))), method: .spline
            )
        )
        #expect(record.mesh?.count == GcpMesh.affineGridSize + 1)
        #expect(!record.needsGeoreferencing)
    }

    /// Nil means draw nothing, and the badge is derived from the same answer
    /// rather than from a second rule — so a record cannot be badged placed
    /// while nothing draws, or unplaced while a sheet is on the screen.
    @Test(arguments: [GeoreferenceMethod.affine, .spline])
    func aRecordThatCannotBePlacedDrawsNothingAndSaysSo(method: GeoreferenceMethod) {
        let tooFew = Self.record(
            .controlPoints(
                Self.points(Array(GeoreferenceFixtures.bent.prefix(2))), method: method
            )
        )
        #expect(tooFew.mesh == nil)
        #expect(tooFew.needsGeoreferencing)

        let thin = (0..<6).map { index in
            GroundControlPoint(
                pixel: PixelPoint(x: Double(index) * 100, y: Double(index) * 100.05),
                map: GeoPoint(lat: 46 + Double(index) * 0.01, lng: -61 + Double(index) * 0.01)
            )
        }
        let squashed = Self.record(.controlPoints(Self.points(thin), method: method))
        #expect(squashed.mesh == nil)
        #expect(squashed.needsGeoreferencing)
    }

    /// Two control points on one scan pixel refuse the spline and not the
    /// affine, so the record's own method decides whether it can be placed.
    @Test func aRefusalOneSolverHasAndTheOtherDoesNotFollowsTheMethod() {
        var controls = GeoreferenceFixtures.bent
        controls[5] = GroundControlPoint(
            pixel: controls[4].pixel, map: GeoPoint(lat: 46.3, lng: -61.3)
        )
        let points = Self.points(controls)
        #expect(Self.record(.controlPoints(points, method: .spline)).mesh == nil)
        #expect(Self.record(.controlPoints(points, method: .affine)).mesh != nil)
    }

    /// A file that placed itself needs no control points, and gets the denser
    /// lattice its path actually requires.
    @Test func anEmbeddedRecordDrawsThroughItsOwnGeoreferencing() {
        let record = Self.record(
            .embedded(
                RasterProjection.EmbeddedGeoreference(
                    crs: "EPSG:26920",
                    geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
                )
            )
        )
        #expect(record.mesh?.count == RasterProjection.embeddedGridSize + 1)
        #expect(!record.needsGeoreferencing)
    }

    /// Georeferencing a file states can still be unusable — a tiepoint that
    /// lands nowhere near its declared zone. That is not a placement, and the
    /// record says so rather than drawing a sheet stretched across the globe.
    @Test func anEmbeddedRecordWhoseNumbersAreNotAPlaceDrawsNothing() {
        let record = Self.record(
            .embedded(
                RasterProjection.EmbeddedGeoreference(
                    crs: "EPSG:26920",
                    geotransform: [400_000, 10, 0, 50_000_000, 0, -10]
                )
            )
        )
        #expect(record.mesh == nil)
        #expect(record.needsGeoreferencing)
    }

    /// A cropped sheet draws over what the user kept, not over the scan they
    /// cropped it from.
    ///
    /// Each cropped mesh is required to exist before its corner is compared.
    /// An optional that is nil differs from every corner there is, so a
    /// version of this test that only compared the two would pass just as
    /// happily if cropping had stopped placing the sheet at all.
    @Test(arguments: [GeoreferenceMethod.affine, .spline])
    func aCropIsHonouredOnEveryPlacementKind(method: GeoreferenceMethod) throws {
        let crop = PixelRect(x: 100, y: 50, width: 1200, height: 900)
        let controls = Self.points(GeoreferenceFixtures.bent)

        let whole = try #require(Self.record(.controlPoints(controls, method: method)).mesh)
        let cropped = try #require(
            Self.record(.controlPoints(controls, method: method), sourceRect: crop).mesh
        )
        #expect(whole[0][0] != cropped[0][0])

        let embedded = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
        )
        let wholeEmbedded = try #require(Self.record(.embedded(embedded)).mesh)
        let croppedEmbedded = try #require(
            Self.record(.embedded(embedded), sourceRect: crop).mesh
        )
        #expect(wholeEmbedded[0][0] != croppedEmbedded[0][0])
    }
}
