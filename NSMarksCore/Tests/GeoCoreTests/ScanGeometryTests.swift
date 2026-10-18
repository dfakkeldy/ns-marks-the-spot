import Testing

@testable import GeoCore

@Suite("Finding the pixel a finger meant")
struct ScanGeometryTests {
    private static let raster = PixelSize(width: 4000, height: 3000)

    @Test func theSheetIsCentredInThePaneAndKeepsItsShape() throws {
        // A pane wider than the sheet's ratio: the fit is limited by height,
        // and the bars go on the sides.
        let fitted = try #require(
            ScanGeometry.fitted(
                Self.raster, in: ScanGeometry.PaneRect(x: 0, y: 0, width: 1000, height: 600)
            )
        )
        #expect(fitted.height == 600)
        #expect(fitted.width == 800)
        #expect(fitted.x == 100)
        #expect(fitted.y == 0)
        #expect(abs(fitted.width / fitted.height - 4000.0 / 3000.0) < 1e-12)
    }

    @Test func aPaneOrARasterWithNoSizeHasNoFit() {
        let pane = ScanGeometry.PaneRect(x: 0, y: 0, width: 100, height: 100)
        #expect(ScanGeometry.fitted(PixelSize(width: 0, height: 10), in: pane) == nil)
        #expect(ScanGeometry.fitted(PixelSize(width: .nan, height: 10), in: pane) == nil)
        #expect(
            ScanGeometry.fitted(
                Self.raster, in: ScanGeometry.PaneRect(x: 0, y: 0, width: 100, height: 0)
            ) == nil
        )
    }

    /// The centre of the pane is the centre of the sheet, and the corners are
    /// the corners. A sign error anywhere in this mapping puts every control
    /// point somewhere the user did not tap, and every other part of the
    /// panel then agrees with it.
    @Test func theCornersAndTheCentreLandWhereTheyShould() throws {
        let pane = ScanGeometry.PaneRect(x: 0, y: 0, width: 1000, height: 600)
        let fitted = try #require(ScanGeometry.fitted(Self.raster, in: pane))
        let cases: [((Double, Double), PixelPoint)] = [
            ((100, 0), PixelPoint(x: 0, y: 0)),
            ((900, 0), PixelPoint(x: 4000, y: 0)),
            ((100, 600), PixelPoint(x: 0, y: 3000)),
            ((500, 300), PixelPoint(x: 2000, y: 1500)),
        ]
        for (point, expected) in cases {
            let pixel = try #require(
                ScanGeometry.pixel(at: point, pixelSize: Self.raster, fitted: fitted)
            )
            #expect(abs(pixel.x - expected.x) < 1e-9)
            #expect(abs(pixel.y - expected.y) < 1e-9)
        }
    }

    /// Y runs down in both spaces, so a tap in the upper half of the pane is
    /// in the upper half of the scan. The web needs a flip here because
    /// Leaflet's Y runs up; a version of this that carried the flip across
    /// would mirror every sheet.
    @Test func theTopOfThePaneIsTheTopOfTheScan() throws {
        let fitted = try #require(
            ScanGeometry.fitted(
                Self.raster, in: ScanGeometry.PaneRect(x: 0, y: 0, width: 800, height: 600)
            )
        )
        let near = try #require(
            ScanGeometry.pixel(at: (400, 60), pixelSize: Self.raster, fitted: fitted)
        )
        #expect(near.y < Self.raster.height / 2)
    }

    /// A tap in the letterboxed margin is a user aiming at the very edge,
    /// which is where the corner features they are pinning are. Clamped, not
    /// refused — and clamped here, because no solver downstream rejects a
    /// negative pixel: it is consumed as ordinary input and saved.
    @Test func aTapOffTheSheetLandsOnItsEdge() throws {
        let fitted = try #require(
            ScanGeometry.fitted(
                Self.raster, in: ScanGeometry.PaneRect(x: 0, y: 0, width: 1000, height: 600)
            )
        )
        let left = try #require(
            ScanGeometry.pixel(at: (10, 300), pixelSize: Self.raster, fitted: fitted)
        )
        #expect(left.x == 0)
        let below = try #require(
            ScanGeometry.pixel(at: (500, 5000), pixelSize: Self.raster, fitted: fitted)
        )
        #expect(below.y == Self.raster.height)
    }

    /// A marker drawn from a control point has to land back under the finger
    /// that placed it, or the sheet and its markers disagree about the same
    /// point.
    @Test func aPointDrawnBackLandsWhereItWasTapped() throws {
        let fitted = try #require(
            ScanGeometry.fitted(
                Self.raster, in: ScanGeometry.PaneRect(x: 20, y: 40, width: 900, height: 700)
            )
        )
        let tapped = (x: 300.0, y: 220.0)
        let pixel = try #require(
            ScanGeometry.pixel(at: tapped, pixelSize: Self.raster, fitted: fitted)
        )
        let drawn = try #require(
            ScanGeometry.point(for: pixel, pixelSize: Self.raster, fitted: fitted)
        )
        #expect(abs(drawn.x - tapped.x) < 1e-9)
        #expect(abs(drawn.y - tapped.y) < 1e-9)
    }
}
