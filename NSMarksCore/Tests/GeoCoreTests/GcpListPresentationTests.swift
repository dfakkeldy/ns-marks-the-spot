import Testing
@testable import GeoCore

@Suite("Control-point list")
struct GcpListPresentationTests {
    private func point(_ id: String, x: Double, y: Double, lat: Double = 45, lng: Double = -63)
        -> SessionControlPoint
    {
        SessionControlPoint(
            id: id, pixel: PixelPoint(x: x, y: y), map: GeoPoint(lat: lat, lng: lng)
        )
    }

    /// The column's name is the difference between "this point is wrong" and
    /// "this point is holding the map down". Deleting by the second reading of
    /// the first label is what took a real sheet from 43 m to 392 m.
    @Test func theResidualColumnIsNamedForWhatItMeasures() {
        #expect(GcpListPresentation.residualColumn(for: .affine).label == "Off by")
        #expect(GcpListPresentation.residualColumn(for: .spline).label == "If removed")
        #expect(
            GcpListPresentation.residualColumn(for: .spline).hint
                .contains("not that it is in the wrong place")
        )
    }

    @Test func aRoundedMetreIsAsPreciseAsTheClaimGets() {
        #expect(GcpListPresentation.residualText(41.4) == "41 m")
        #expect(GcpListPresentation.residualText(nil) == "—")
        #expect(GcpListPresentation.residualText(.nan) == "—")
    }

    /// The number a user reads is the point's identity, and the residual array
    /// is indexed by it. A sorted list that renumbered would mislabel every row.
    @Test func sortingDoesNotRenumberThePoints() {
        let points = [
            point("a", x: 30, y: 0), point("b", x: 10, y: 0), point("c", x: 20, y: 0),
        ]
        let rows = GcpListPresentation.rows(
            points, report: nil, sort: .init(key: .scan)
        )
        #expect(rows.map(\.id) == ["b", "c", "a"])
        #expect(rows.map(\.number) == [2, 3, 1])
    }

    /// Zero is a real reading here — a freshly imported proposal reads exactly
    /// that — so an unknown must not be parked among the zeroes where the
    /// points that most need moving are.
    @Test func aPointWithNoFigureSortsLastBothWays() {
        let points = [point("a", x: 0, y: 0), point("b", x: 1, y: 0), point("c", x: 2, y: 0)]
        let report = GeoreferenceResiduals.Report(
            metresPerControlPoint: [0, 90], rmsMetres: 0, mostInconsistentIndex: nil
        )
        let ascending = GcpListPresentation.rows(
            points, report: report, sort: .init(key: .residual)
        )
        let descending = GcpListPresentation.rows(
            points, report: report, sort: .init(key: .residual, descending: true)
        )
        #expect(ascending.map(\.id) == ["a", "b", "c"])
        #expect(descending.map(\.id) == ["b", "a", "c"])
    }

    /// This list is rebuilt on every touch move of a drag. Equal residuals that
    /// swapped places between frames would make the row under the finger move.
    @Test func tiesKeepTheSessionsOwnOrder() {
        let points = [point("a", x: 0, y: 0), point("b", x: 1, y: 0), point("c", x: 2, y: 0)]
        let report = GeoreferenceResiduals.Report(
            metresPerControlPoint: [7, 7, 7], rmsMetres: 7, mostInconsistentIndex: nil
        )
        for descending in [false, true] {
            let rows = GcpListPresentation.rows(
                points, report: report, sort: .init(key: .residual, descending: descending)
            )
            #expect(rows.map(\.id) == ["a", "b", "c"])
        }
    }

    @Test func theAccusedRowIsTheOneTheReportNames() {
        let points = [point("a", x: 0, y: 0), point("b", x: 1, y: 0)]
        let report = GeoreferenceResiduals.Report(
            metresPerControlPoint: [3, 4], rmsMetres: 3.5, mostInconsistentIndex: 1
        )
        let rows = GcpListPresentation.rows(points, report: report)
        #expect(rows.map(\.isSuspect) == [false, true])
    }
}

@Suite("Zooming the scan")
struct ScanZoomTests {
    private let pane = ScanGeometry.PaneRect(x: 0, y: 0, width: 400, height: 400)
    private let pixelSize = PixelSize(width: 1000, height: 500)

    /// A tap, a marker and a drag all read the zoomed rectangle, so a point
    /// placed while zoomed in has to land where the finger was.
    @Test func aTapWhileZoomedInLandsWhereTheFingerIs() throws {
        let fitted = try #require(ScanGeometry.fitted(pixelSize, in: pane))
        let zoomed = try #require(
            ScanGeometry.zoomed(fitted, in: pane, scale: 3, offset: (x: 17, y: -9))
        )
        let pixel = PixelPoint(x: 640, y: 310)
        let at = try #require(
            ScanGeometry.point(for: pixel, pixelSize: pixelSize, fitted: zoomed)
        )
        let back = try #require(
            ScanGeometry.pixel(at: at, pixelSize: pixelSize, fitted: zoomed)
        )
        #expect(abs(back.x - pixel.x) < 1e-6)
        #expect(abs(back.y - pixel.y) < 1e-6)
    }

    @Test func zoomingHoldsTheCentreOfThePaneStill() throws {
        let fitted = try #require(ScanGeometry.fitted(pixelSize, in: pane))
        let middle = try #require(
            ScanGeometry.pixel(at: (x: 200, y: 200), pixelSize: pixelSize, fitted: fitted)
        )
        let zoomed = try #require(
            ScanGeometry.zoomed(fitted, in: pane, scale: 4, offset: (x: 0, y: 0))
        )
        let after = try #require(
            ScanGeometry.pixel(at: (x: 200, y: 200), pixelSize: pixelSize, fitted: zoomed)
        )
        #expect(abs(after.x - middle.x) < 1e-6)
        #expect(abs(after.y - middle.y) < 1e-6)
    }

    @Test func zoomingToAPointPutsItInTheMiddle() throws {
        let fitted = try #require(ScanGeometry.fitted(pixelSize, in: pane))
        let pixel = PixelPoint(x: 900, y: 40)
        let offset = try #require(
            ScanGeometry.offsetCentring(
                pixel, pixelSize: pixelSize, fitted: fitted, in: pane, scale: 5
            )
        )
        let zoomed = try #require(
            ScanGeometry.zoomed(fitted, in: pane, scale: 5, offset: offset)
        )
        let at = try #require(
            ScanGeometry.point(for: pixel, pixelSize: pixelSize, fitted: zoomed)
        )
        #expect(abs(at.x - 200) < 1e-6)
        #expect(abs(at.y - 200) < 1e-6)
    }

    /// A pane before layout has no rectangle to scale about, and a scale of
    /// zero would divide by nothing one line later.
    @Test func anUnlaidPaneAndAZeroScaleAreRefused() throws {
        let fitted = try #require(ScanGeometry.fitted(pixelSize, in: pane))
        #expect(ScanGeometry.zoomed(fitted, in: pane, scale: 0, offset: (x: 0, y: 0)) == nil)
        #expect(
            ScanGeometry.zoomed(
                fitted, in: .init(x: 0, y: 0, width: 0, height: 0), scale: 2,
                offset: (x: 0, y: 0)
            ) == nil
        )
    }
}
