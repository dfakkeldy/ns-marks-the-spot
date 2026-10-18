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
        // Swift's integer parsing accepts a leading sign; the web's
        // `/^EPSG:(\d+)$/i` does not, and a file the two surfaces disagree
        // about is worse than a file both refuse.
        "EPSG:+26920",
        "EPSG:-26920",
        "EPSG:26920 20",
        "EPSG:2692٠",  // Arabic-Indic zero: a digit to Swift, not to the web
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

    /// Pinned to proj4's numbers rather than round-tripped through
    /// `WebMercator.project`. A round trip through the same helper cancels its
    /// own mistakes: give both directions the wrong earth radius and the test
    /// still passes while every sheet lands in the wrong place.
    @Test func webMercatorMetresComeBackAsDegrees() throws {
        let point = try RasterProjection.groundPosition(
            crs: "EPSG:3857", x: -7_013_820.0, y: 5_780_000.0
        )
        #expect(abs(point.lat - 45.997_820_745_048_67) < 1e-9)
        #expect(abs(point.lng - (-63.006_217_060_631_82)) < 1e-9)
    }

    /// `WebMercator.unproject` clamps to the projection's latitude limit, so an
    /// ordinate that is not a coordinate at all comes back looking like a
    /// perfectly ordinary 85.05°. Checked before unprojecting, or a raster
    /// tagged with someone else's units is drawn at the top of the world.
    @Test func mercatorOrdinatesOutsideTheProjectedWorldAreRefused() {
        for (x, y) in [(0.0, 100_000_000.0), (100_000_000.0, 0.0), (0.0, -30_000_000.0)] {
            #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
                try RasterProjection.groundPosition(crs: "EPSG:3857", x: x, y: y)
            }
        }
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
        // Far east of the zone the truncated series is still finite and no
        // longer accurate — measured 154 m against proj4 at this easting.
        #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
            try RasterProjection.groundPosition(
                crs: "EPSG:26920", x: 2_000_000, y: 5_100_000
            )
        }
        // Southern-hemisphere northings: these three CRSs are northern, so the
        // false northing is zero and a negative latitude means the file is not
        // what it says it is.
        #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
            try RasterProjection.groundPosition(
                crs: "EPSG:2962", x: 500_000, y: -1_000_000
            )
        }
    }

    /// The province's own sheets overrun their zone: Yarmouth is about 3.4°
    /// west of the 63rd meridian and still ships as zone 20. The domain check
    /// has to admit that, which is why it is five degrees and not three.
    @Test func aSheetThatOverrunsItsZoneTheWayNovaScotiasDoIsStillPlaced() throws {
        let yarmouth = try RasterProjection.groundPosition(
            crs: "EPSG:26920", x: 240_000, y: 4_860_000
        )
        #expect(yarmouth.lng < -66)
        #expect(yarmouth.lat > 43)
    }

    /// What no guard here can catch, recorded so nobody reads the refusals
    /// above as more than they are: a zone-21 raster labelled zone 20 lands 6°
    /// west — a plausible Maritime coordinate, about 470 km from the truth.
    /// The offset from the central meridian is identical in both zones, so the
    /// coordinate carries no evidence of which one is right; only the file's
    /// own declaration says, and that declaration is what is wrong. It is
    /// caught, if at all, by the user seeing the sheet land in the wrong
    /// county.
    @Test func aMislabelledZoneIsPlacedConfidentlyInTheWrongPlace() throws {
        let honest = try RasterProjection.groundPosition(
            crs: "EPSG:2962", x: 700_000, y: 5_100_000
        )
        let mislabelled = try RasterProjection.groundPosition(
            crs: "EPSG:26920", x: 700_000, y: 5_100_000
        )
        // 1e-8° is the tolerance this file pins proj4 at throughout: about a
        // millimetre, and this coordinate sits near the zone edge where the
        // series is at its weakest.
        #expect(abs(honest.lng - (-54.415_934_879_586_075)) < 1e-8)
        #expect(abs(mislabelled.lng - (-60.415_934_879_586_075)) < 1e-8)
        #expect(WebMercator.groundMetres(from: honest, to: mislabelled) > 400_000)
    }

    /// A geotransform that cannot be inverted puts every pixel of the sheet on
    /// one line, or on one point. The corners still project to real places, so
    /// nothing about them looks wrong — the sheet simply is not there once it
    /// is drawn, which reads as a rendering bug rather than as a bad file.
    ///
    /// The cases: no scale at all; a rotation-only pair whose rows are
    /// parallel, so the sheet folds onto a line; and a scale small enough that
    /// the determinant underflows, which is a collapse arriving by a different
    /// route.
    @Test(arguments: [
        [400_000.0, 0, 0, 5_040_000.0, 0, 0],
        [400_000.0, 10, 20, 5_040_000.0, 5, 10],
        [400_000.0, 1e-160, 0, 5_040_000.0, 0, 1e-160],
    ])
    func aRasterThatCollapsesToNothingIsRefusedBeforeItIsDrawn(geotransform: [Double]) {
        let georeference = RasterProjection.EmbeddedGeoreference(
            crs: "EPSG:26920", geotransform: geotransform
        )
        #expect(throws: RasterProjection.Refusal.invalidGeoreferencing) {
            _ = try RasterProjection.groundPosition(georeference, x: 0, y: 0)
        }
        // And the import gate reports it as georeferencing the user can
        // replace by hand, not as a corrupt file.
        do {
            try UserMapImport.checkGeoreferencing(
                georeference, pixelSize: PixelSize(width: 4000, height: 3000)
            )
            Issue.record("expected a refusal")
        } catch {
            #expect(error.code == .invalidGeoreferencing)
        }
    }

    /// The same shape of transform, one honest reflection away: a north-up
    /// sheet has a negative Y scale and a negative determinant, and a test
    /// that checked for a positive one would refuse every ordinary GeoTIFF.
    @Test func anOrdinaryNorthUpSheetIsNotMistakenForACollapse() throws {
        let point = try RasterProjection.groundPosition(
            RasterProjection.EmbeddedGeoreference(
                crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
            ),
            x: 100, y: 100
        )
        #expect(point.lat < 45.5)
        #expect(point.lat > 45.0)
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

        // One cell, interpolated the way the renderer interpolates — in Web
        // Mercator, not by averaging degrees — misses the middle of the sheet
        // by kilometres.
        let coarse = try RasterProjection.latLngMesh(wide, pixelSize: size, gridSize: 1)
        let centre = try RasterProjection.groundPosition(wide, x: 2000, y: 1000)
        #expect(
            WebMercator.groundMetres(from: MeshInterpolation.centre(of: coarse), to: centre)
                > 2_000
        )

        // Eight cells does not make the curve go away; it makes it small. This
        // is measured between vertices, at the centre of one cell, because a
        // vertex is where the mesh is exact by construction and asserting
        // there would prove nothing about the mesh at all.
        let dense = try RasterProjection.latLngMesh(wide, pixelSize: size)
        let insideACell = try RasterProjection.groundPosition(wide, x: 2250, y: 1125)
        let residual = WebMercator.groundMetres(
            from: MeshInterpolation.centre(of: dense, row: 4, column: 4), to: insideACell
        )
        #expect(residual < 50)
        // And the residual is real, not zero: quoting it here so a later change
        // that made it worse would have to change this number knowingly.
        #expect(residual > 30)
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
        #expect(throws: GcpMesh.MeshRefusal.outsideRaster) {
            try RasterProjection.latLngMesh(
                Self.georeference,
                pixelSize: Self.pixelSize,
                sourceRect: PixelRect(x: 0, y: 0, width: 5000, height: 500)
            )
        }
    }
}
