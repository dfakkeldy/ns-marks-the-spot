import CoreGraphics
import Foundation
import GeoCore
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// Drawing a PDF page into pixels a control point can be recorded against.
///
/// The registration itself is GeoCore's and tested there. What is checked here
/// is the transform the page is drawn through, because a registration read
/// through the wrong one describes pixels that are not in the image — and every
/// number in it still looks perfectly reasonable.
@Suite("Placing a PDF page on the canvas")
struct PdfMapReaderTransformTests {
    /// A landscape page, drawn at twice its size.
    private let box = CGRect(x: 0, y: 0, width: 200, height: 100)

    private func corners(rotation: Int) -> [CGPoint] {
        let transform = PdfMapReader.drawingTransform(
            box: box, scale: 2, rotation: rotation
        )
        // Bottom-left, bottom-right, top-left of the page, in PDF's y-up space.
        return [CGPoint(x: 0, y: 0), CGPoint(x: 200, y: 0), CGPoint(x: 0, y: 100)]
            .map { $0.applying(transform) }
    }

    @Test("An unrotated page is magnified from its own corner")
    func theSimpleCase() {
        #expect(corners(rotation: 0) == [
            CGPoint(x: 0, y: 0), CGPoint(x: 400, y: 0), CGPoint(x: 0, y: 200),
        ])
    }

    @Test("A quarter turn is clockwise, as a reader would turn the page")
    func aQuarterTurnGoesTheWayTheReaderTurnsIt() {
        // Canvas is 200 × 400 once the page is turned. The page's bottom-left
        // becomes the top-left, its bottom-right the bottom-left: a clockwise
        // turn. Counter-clockwise would mirror the sheet's registration onto
        // the wrong half of the canvas while every number stayed finite.
        #expect(corners(rotation: 90) == [
            CGPoint(x: 0, y: 400), CGPoint(x: 0, y: 0), CGPoint(x: 200, y: 400),
        ])
        #expect(corners(rotation: 270) == [
            CGPoint(x: 200, y: 0), CGPoint(x: 200, y: 400), CGPoint(x: 0, y: 0),
        ])
    }

    @Test("A half turn puts the page's origin in the opposite corner")
    func aHalfTurn() {
        #expect(corners(rotation: 180) == [
            CGPoint(x: 400, y: 200), CGPoint(x: 0, y: 200), CGPoint(x: 400, y: 0),
        ])
    }

    @Test("A page cropped out of a larger sheet is not shifted by its own origin")
    func theMediaBoxOriginIsSubtracted() {
        let transform = PdfMapReader.drawingTransform(
            box: CGRect(x: 36, y: 36, width: 200, height: 100), scale: 2, rotation: 0
        )
        #expect(CGPoint(x: 36, y: 36).applying(transform) == CGPoint(x: 0, y: 0))
        #expect(CGPoint(x: 236, y: 136).applying(transform) == CGPoint(x: 400, y: 200))
    }
}

@Suite("Reading a page this app wrote")
struct PdfMapRoundTripTests {
    /// The export's own GeoPDF, read back.
    ///
    /// The two halves are written and read months apart and against different
    /// specifications, and this is the only test that can catch them disagreeing
    /// — a registration this app writes and cannot itself read is one nobody
    /// would notice until a user handed the page to a surveyor.
    @Test("A page this app exported comes back on the ground it was written for")
    func theExportRoundTrips() throws {
        let bounds = GeoBoundingBox(south: 44.60, west: -63.70, north: 44.70, east: -63.50)
        let template = PdfTemplate.template(.portrait)
        let pdf = PdfComposer.compose(
            PdfComposer.Input(
                template: template,
                bounds: bounds,
                mapImage: PdfComposer.MapImage(jpegBytes: Data(), widthPx: 1, heightPx: 1),
                fields: PdfComposer.Fields(title: "Round trip"),
                legend: nil,
                disclosures: [],
                attributionLines: [],
                scaleBar: PrintScaleBar.build(
                    bounds: bounds,
                    mapFrame: template.mapFrame,
                    maxWidthPoints: template.scaleBar.maxWidth
                ),
                shareURLText: nil,
                qrModules: nil,
                appendix: [],
                generatedAt: Date(timeIntervalSince1970: 0)
            )
        )

        let read = try PdfMapReader.read(pdf)
        guard case .placed(let candidate, _) =
            PdfMapRegistration.outcome(of: read.extraction)
        else {
            Issue.record("the app's own export was not read as georeferenced")
            return
        }
        #expect(candidate.flavour == .measure)
        #expect(candidate.gcps.count == 4)

        // Not the control points themselves — those are what was written. The
        // frame's own corners, through the warp the record will draw by.
        let transform = try #require(AffineFit.solve(controlPoints: candidate.gcps))
        let rect = candidate.sourceRect
        let northWest = WebMercator.unproject(transform.apply(x: rect.x, y: rect.y))
        let southEast = WebMercator.unproject(
            transform.apply(x: rect.x + rect.width, y: rect.y + rect.height)
        )
        #expect(abs(northWest.lat - bounds.north) < 1e-6)
        #expect(abs(northWest.lng - bounds.west) < 1e-6)
        #expect(abs(southEast.lat - bounds.south) < 1e-6)
        #expect(abs(southEast.lng - bounds.east) < 1e-6)
        // The map frame, not the whole page: a sheet draped over the title
        // block would put the legend on the ground.
        #expect(rect.width < read.pixelSize.width)
    }

    @Test("An ordinary PDF with no registration goes to the georeferencer")
    func aPlainPageIsNotARefusal() throws {
        let data = NSMutableData()
        let consumer = try #require(CGDataConsumer(data: data))
        var media = CGRect(x: 0, y: 0, width: 300, height: 200)
        let context = try #require(CGContext(consumer: consumer, mediaBox: &media, nil))
        context.beginPDFPage(nil)
        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 10, y: 10, width: 50, height: 50))
        context.endPDFPage()
        context.closePDF()

        let read = try PdfMapReader.read(data as Data)
        #expect(PdfMapRegistration.outcome(of: read.extraction) == .unregistered)
        #expect(read.pixelSize.width == 4096)
    }

    @Test("A file that is not a PDF at all is refused as one")
    func nonsenseIsRefused() {
        #expect(throws: UserMapImportRefusal.self) {
            _ = try PdfMapReader.read(Data("%PDF-1.7 and then nothing".utf8))
        }
    }
}
