import Foundation
import Testing

@testable import GeoCore

@Suite("Raster coordinate systems")
struct RasterCoordinateSystemTests {
    @Test func anEpsgCodeIsReadInEitherCase() {
        #expect(RasterProjection.CoordinateSystem(crs: "EPSG:26920") == .nad83UtmZone20)
        #expect(RasterProjection.CoordinateSystem(crs: "epsg:26920") == .nad83UtmZone20)
        #expect(RasterProjection.CoordinateSystem(crs: " EPSG:2962 ") == .nad83CsrsUtmZone21)
    }

    /// The list is closed on purpose. A projection library recognises a great
    /// many systems NS data never ships in, and placing a sheet with one of
    /// those because it could be parsed is exactly the mistake this refuses.
    @Test(arguments: [
        "EPSG:32620",  // WGS 84 / UTM 20N — parseable, and not what NS ships
        "EPSG:2036",   // NAD83(CSRS) / New Brunswick Stereographic
        "+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs",
        "NAD83 / UTM zone 20N",
        "EPSG:",
        "",
    ])
    func aSystemOutsideTheListIsRefused(crs: String) {
        #expect(RasterProjection.CoordinateSystem(crs: crs) == nil)
        #expect(throws: RasterProjection.Refusal.unsupportedCoordinateSystem(crs)) {
            try RasterProjection.validate(crs: crs)
        }
    }
}

@Suite("Ground positions from a raster")
struct RasterProjectionTests {
    /// Ground truth from proj4, the library the web map projects through, so
    /// the two surfaces place the same sheet on the same ground. Agreement to
    /// 1e-8° is about a millimetre — far below the georeferencing error of any
    /// scanned sheet, and tight enough that a wrong series term could not hide
    /// under it.
    @Test(arguments: [
        (700_000.0, 5_140_000.0, 46.383_985_228, -60.399_006_355),
        (300_000.0, 4_900_000.0, 44.225_784_265, -65.504_063_776),
        (500_000.0, 5_000_000.0, 45.153_477_184, -63.0),
        (412_000.0, 5_030_000.0, 45.417_983_401, -64.124_743_177),
        (650_000.0, 5_210_000.0, 47.026_500_408, -61.025_976_414),
    ])
    func utmZone20MatchesProj4(
        easting: Double, northing: Double, lat: Double, lng: Double
    ) throws {
        for crs in ["EPSG:26920", "EPSG:2961"] {
            let point = try RasterProjection.groundPosition(
                crs: crs, x: easting, y: northing
            )
            #expect(abs(point.lat - lat) < 1e-8)
            #expect(abs(point.lng - lng) < 1e-8)
        }
    }

    /// Zone 21 is the same series with a different central meridian, so this
    /// is the test that catches the meridian being wired to a constant.
    @Test(arguments: [
        (700_000.0, 5_140_000.0, 46.383_985_228, -54.399_006_355),
        (500_000.0, 5_000_000.0, 45.153_477_184, -57.0),
        (412_000.0, 5_030_000.0, 45.417_983_401, -58.124_743_177),
    ])
    func utmZone21MatchesProj4(
        easting: Double, northing: Double, lat: Double, lng: Double
    ) throws {
        let point = try RasterProjection.groundPosition(
            crs: "EPSG:2962", x: easting, y: northing
        )
        #expect(abs(point.lat - lat) < 1e-8)
        #expect(abs(point.lng - lng) < 1e-8)
    }

    @Test func degreesArePassedThroughInLngLatOrder() throws {
        for crs in ["EPSG:4326", "EPSG:4617"] {
            let point = try RasterProjection.groundPosition(
                crs: crs, x: -61.387_588, y: 46.353_788
            )
            #expect(point.lat == 46.353_788)
            #expect(point.lng == -61.387_588)
        }
    }

    @Test func webMercatorMetresComeBackAsDegrees() throws {
        let source = GeoPoint(lat: 46.353_788, lng: -61.387_588)
        let projected = WebMercator.project(source)
        let point = try RasterProjection.groundPosition(
            crs: "EPSG:3857", x: projected.x, y: projected.y
        )
        #expect(abs(point.lat - source.lat) < 1e-9)
        #expect(abs(point.lng - source.lng) < 1e-9)
    }

    private static let georeference = RasterProjection.EmbeddedGeoreference(
        // A north-up sheet: origin at the top-left, 10 m pixels, Y increasing
        // downward.
        crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
    )

    @Test func aPixelIsPlacedThroughTheGeotransform() throws {
        let origin = try RasterProjection.groundPosition(Self.georeference, x: 0, y: 0)
        let expected = try RasterProjection.groundPosition(
            crs: "EPSG:26920", x: 400_000, y: 5_040_000
        )
        #expect(origin == expected)

        // 100 pixels right and 200 down is 1 km east and 2 km south.
        let inland = try RasterProjection.groundPosition(Self.georeference, x: 100, y: 200)
        let byHand = try RasterProjection.groundPosition(
            crs: "EPSG:26920", x: 401_000, y: 5_038_000
        )
        #expect(inland == byHand)
        #expect(inland.lat < origin.lat)
        #expect(inland.lng > origin.lng)
    }

    /// A rotated geotransform is the reason the rotation terms exist, and the
    /// reason a mesh cannot assume its rows are lines of constant northing.
    @Test func theRotationTermsAreNotIgnored() throws {
        let rotated = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: [400_000, 0, 10, 5_040_000, -10, 0]
        )
        let origin = try RasterProjection.groundPosition(rotated, x: 0, y: 0)
        let across = try RasterProjection.groundPosition(rotated, x: 100, y: 0)
        let down = try RasterProjection.groundPosition(rotated, x: 0, y: 100)
        // With the resolutions sitting in the rotation slots, stepping across
        // the raster moves 1 km south and stepping down it moves 1 km east —
        // a quarter turn from the north-up sheet above.
        #expect(across == (try RasterProjection.groundPosition(
            crs: "EPSG:26920", x: 400_000, y: 5_039_000
        )))
        #expect(down == (try RasterProjection.groundPosition(
            crs: "EPSG:26920", x: 401_000, y: 5_040_000
        )))
        #expect(across.lat < origin.lat)
        #expect(down.lng > origin.lng)
        // Not asserted: that moving down the grid leaves longitude alone. Grid
        // north is not true north away from the central meridian, so a
        // kilometre straight down this zone's grid also moves about 0.0002°
        // east. That convergence is real, and a test that demanded it be zero
        // would be demanding the projection be wrong.
    }

    @Test(arguments: [
        [Double.nan, 10, 0, 5_040_000, 0, -10],
        [400_000, .infinity, 0, 5_040_000, 0, -10],
        [400_000, 10, 0, 5_040_000, 0],
    ])
    func georeferencingThatIsNotNumbersIsRefused(geotransform: [Double]) {
        let broken = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: geotransform
        )
        #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
            try RasterProjection.groundPosition(broken, x: 0, y: 0)
        }
    }

    /// A tiepoint that lands nowhere near its declared zone comes back from the
    /// series finite-looking and no longer meaning anything. Unchecked, that is
    /// a sheet drawn stretched across the globe rather than an import that
    /// failed.
    @Test func aCoordinateOutsideItsZonesValidAreaIsRefused() {
        #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
            try RasterProjection.groundPosition(
                crs: "EPSG:26920", x: 500_000, y: 50_000_000
            )
        }
        #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
            try RasterProjection.groundPosition(
                crs: "EPSG:4326", x: -61.4, y: 460.3
            )
        }
    }
}

@Suite("Embedded raster mesh")
struct EmbeddedMeshTests {
    private static let georeference = RasterProjection.EmbeddedGeoreference(
        crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
    )
    private static let pixelSize = PixelSize(width: 4000, height: 3000)

    @Test func theLatticeIsGridSizePlusOneSquare() throws {
        let mesh = try RasterProjection.latLngMesh(
            Self.georeference, pixelSize: Self.pixelSize
        )
        #expect(RasterProjection.embeddedGridSize == 8)
        #expect(mesh.count == 9)
        #expect(mesh.allSatisfy { $0.count == 9 })
        #expect(mesh[0][0] == (try RasterProjection.groundPosition(
            Self.georeference, x: 0, y: 0
        )))
        #expect(mesh[8][8] == (try RasterProjection.groundPosition(
            Self.georeference, x: 4000, y: 3000
        )))
    }

    /// The claim behind eight cells rather than the affine warp's one: this
    /// path curves. A UTM row of constant northing is not a line of constant
    /// latitude, so a single cell would visibly bow across a county-scale
    /// sheet — measured here as the gap between the interpolated midpoint of
    /// the coarse cell and where the ground actually is.
    @Test func thisPathCurvesWhichIsWhyItGetsARealLattice() throws {
        // A sheet the width of the province, which is the scale the eight is
        // for.
        let wide = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: [250_000, 100, 0, 5_100_000, 0, -100]
        )
        let size = PixelSize(width: 4000, height: 2000)
        let coarse = try RasterProjection.latLngMesh(wide, pixelSize: size, gridSize: 1)
        let truth = try RasterProjection.groundPosition(wide, x: 2000, y: 1000)
        let flat = GeoPoint(
            lat: (coarse[0][0].lat + coarse[0][1].lat
                  + coarse[1][0].lat + coarse[1][1].lat) / 4,
            lng: (coarse[0][0].lng + coarse[0][1].lng
                  + coarse[1][0].lng + coarse[1][1].lng) / 4
        )
        #expect(WebMercator.groundMetres(from: flat, to: truth) > 100)

        // And at the real grid size the same midpoint is a lattice vertex, so
        // the bow it would have carried is gone.
        let dense = try RasterProjection.latLngMesh(wide, pixelSize: size)
        #expect(WebMercator.groundMetres(from: dense[4][4], to: truth) < 1e-6)
    }

    @Test func onlyTheSelectedRectangleIsEvaluated() throws {
        let mesh = try RasterProjection.latLngMesh(
            Self.georeference,
            pixelSize: Self.pixelSize,
            gridSize: 1,
            sourceRect: PixelRect(x: 100, y: 50, width: 1000, height: 500)
        )
        #expect(mesh[0][0] == (try RasterProjection.groundPosition(
            Self.georeference, x: 100, y: 50
        )))
        #expect(mesh[1][1] == (try RasterProjection.groundPosition(
            Self.georeference, x: 1100, y: 550
        )))
    }

    @Test func aRectangleReachingPastTheRasterIsRefused() {
        #expect(throws: GcpMesh.RectRefusal.outsideRaster) {
            try RasterProjection.latLngMesh(
                Self.georeference,
                pixelSize: Self.pixelSize,
                sourceRect: PixelRect(x: 0, y: 0, width: 5000, height: 500)
            )
        }
    }
}
