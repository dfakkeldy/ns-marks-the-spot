import CoreGraphics
import Foundation
import GeoCore
import ImageIO
import NSDataServices
import Testing
import UniformTypeIdentifiers

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
        #expect(read.pageCount == 1)
        guard case .automatic(let candidate) =
            PdfMapRegistration.selection(of: read.extraction)
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
        #expect(
            PdfMapRegistration.selection(of: read.extraction) == .manual(.absent)
        )
        #expect(read.pixelSize.width == 4096)
    }

    /// A map image that is black in its north-west quarter and white elsewhere.
    private func quarterMarked(width: Int, height: Int) throws -> Data {
        let context = try #require(
            CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            )
        )
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        // The north-west of a north-up map is the top-left of the raster, which
        // in this y-up context is the upper half.
        context.fill(CGRect(x: 0, y: height / 2, width: width / 2, height: height / 2))
        let image = try #require(context.makeImage())
        let out = NSMutableData()
        let destination = try #require(
            CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil)
        )
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        return out as Data
    }

    @Test("The pixels come back the way up the registration says they are")
    func theSheetIsNotMirrored() throws {
        // The corner test above cannot see this. A page rendered upside down
        // registers to exactly the same four corners — they are the corners of
        // the same rectangle — so every number checks out while every sheet
        // drapes mirrored north to south. Measured, before this was fixed: the
        // quarter of the map drawn in the north-west read back at 44.617°N,
        // south of the sheet's own midpoint.
        let bounds = GeoBoundingBox(south: 44.60, west: -63.70, north: 44.70, east: -63.50)
        let template = PdfTemplate.template(.portrait)
        let pdf = PdfComposer.compose(
            PdfComposer.Input(
                template: template,
                bounds: bounds,
                mapImage: PdfComposer.MapImage(
                    jpegBytes: try quarterMarked(width: 400, height: 400),
                    widthPx: 400,
                    heightPx: 400
                ),
                fields: PdfComposer.Fields(title: "Orientation"),
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
        guard case .automatic(let candidate) =
            PdfMapRegistration.selection(of: read.extraction)
        else {
            Issue.record("the marked export was not read as georeferenced")
            return
        }
        let transform = try #require(AffineFit.solve(controlPoints: candidate.gcps))
        let data = try #require(read.image.dataProvider?.data)
        let bytes = try #require(CFDataGetBytePtr(data))

        // Only the ink inside the map frame: the sheet's title block and footer
        // are black on white too, and would drag the centroid off the map.
        let rect = candidate.sourceRect
        let stride = read.image.bytesPerRow
        let pixel = read.image.bitsPerPixel / 8
        var sumX = 0.0, sumY = 0.0, count = 0.0
        for y in Int(rect.y)..<Int(rect.y + rect.height) {
            for x in Int(rect.x)..<Int(rect.x + rect.width)
            where bytes[y * stride + x * pixel] < 128 {
                sumX += Double(x)
                sumY += Double(y)
                count += 1
            }
        }
        try #require(count > 0)

        let here = WebMercator.unproject(
            transform.apply(x: sumX / count, y: sumY / count)
        )
        #expect(here.lat > (bounds.north + bounds.south) / 2)
        #expect(here.lng < (bounds.east + bounds.west) / 2)
    }

    @Test("A file that is not a PDF at all is refused as one")
    func nonsenseIsRefused() {
        #expect(throws: UserMapImportRefusal.self) {
            _ = try PdfMapReader.read(Data("%PDF-1.7 and then nothing".utf8))
        }
    }
}

@Suite("Importing a PDF")
struct PdfMapImportTests {
    /// A page with the given boxes and nothing meaningful drawn on it.
    private func page(media: CGRect, crop: CGRect? = nil) throws -> Data {
        let data = NSMutableData()
        let consumer = try #require(CGDataConsumer(data: data))
        var box = media
        let context = try #require(CGContext(consumer: consumer, mediaBox: &box, nil))
        var info: [String: Any] = [kCGPDFContextMediaBox as String: Data(
            bytes: &box, count: MemoryLayout<CGRect>.size
        )]
        if var crop {
            info[kCGPDFContextCropBox as String] = Data(
                bytes: &crop, count: MemoryLayout<CGRect>.size
            )
        }
        context.beginPDFPage(info as CFDictionary)
        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 10, y: 10, width: 20, height: 20))
        context.endPDFPage()
        context.closePDF()
        return data as Data
    }

    @Test("A PDF this app cannot place is imported anyway, and says why")
    func anUnplaceablePageIsStillAMap() throws {
        let imported = try UserMapImporter.import(
            data: try page(media: CGRect(x: 0, y: 0, width: 300, height: 200)),
            id: "map-1",
            name: "Scan"
        )
        // Not a refusal: the page is a usable map either way, and refusing it
        // would have made the old advice — place it by hand — impossible on the
        // very path that gave it.
        #expect(imported.needsGeoreferencing)
        #expect(imported.record.sourceRect == nil)
        #expect(
            imported.record.pdf?.registration == .manual(reason: .absent, adjusted: false)
        )
        #expect(imported.record.pdf?.note.contains("Add matching points") == true)
    }

    @Test("A page cropped to its map frame is read at the crop box")
    func theCropBoxIsWhatIsDrawn() throws {
        // A sheet cropped down to a square frame. Reading the media box here
        // would size the raster to the uncropped page while every reader in the
        // world showed the crop — so the registration's pixels and the image's
        // pixels would be different pixels.
        let read = try PdfMapReader.read(
            try page(
                media: CGRect(x: 0, y: 0, width: 400, height: 200),
                crop: CGRect(x: 50, y: 0, width: 200, height: 200)
            )
        )
        #expect(read.pixelSize.width == read.pixelSize.height)
    }

    @Test("The app's own export imports placed, with the frame it used named")
    func theExportImportsPlaced() throws {
        let bounds = GeoBoundingBox(south: 44.60, west: -63.70, north: 44.70, east: -63.50)
        let template = PdfTemplate.template(.portrait)
        let pdf = PdfComposer.compose(
            PdfComposer.Input(
                template: template,
                bounds: bounds,
                mapImage: PdfComposer.MapImage(jpegBytes: Data(), widthPx: 1, heightPx: 1),
                fields: PdfComposer.Fields(title: "Import"),
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

        let imported = try UserMapImporter.import(data: pdf, id: "map-2", name: "Export")
        #expect(!imported.needsGeoreferencing)
        #expect(imported.record.sourceRect != nil)
        guard case .embedded(let embedded) = imported.record.pdf?.registration else {
            Issue.record("the app's own export did not import placed")
            return
        }
        // Sole, not chosen: the page carried one frame and the user was never
        // asked anything. The row says which, and saying "chosen by you" about
        // a choice nobody made would be the app putting words in their mouth.
        #expect(embedded.selection == .sole)
        #expect(embedded.flavour == .measure)
        #expect(!embedded.adjusted)
        let frameID = embedded.frameID
        // The control points are named for the frame that produced them, so a
        // record cannot end up holding two frames' points under one identity.
        guard case .controlPoints(let points, let method) = imported.record.placement else {
            Issue.record("a placed export carried no control points")
            return
        }
        #expect(method == .affine)
        #expect(points.count == 4)
        #expect(points.allSatisfy { $0.id.hasPrefix(frameID) })
    }
}

/// A registered page that is also rotated.
///
/// Assembled by hand because there is no other way to get one. `PdfComposer`
/// never writes `/Rotate`, and PDFKit, which can set it, drops the `/VP`
/// registration when it rewrites the file. Five objects and an xref table is
/// less machinery than either alternative.
private func rotatedRegisteredPdf(rotation: Int, width: Int = 400, height: Int = 200) -> Data {
    // The map is north-up in the page's own space, whatever `/Rotate` then asks
    // a reader to do with the sheet. Ink fills the page's top-left quarter,
    // which is the north-west of the ground below it. `LPTS` names the BBox
    // corners anticlockwise from the bottom left, and `GPTS` answers each with
    // the ground there.
    let content = "0 0 0 rg 0 \(height / 2) \(width / 2) \(height / 2) re f\n"
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        """
        << /Type /Page /Parent 2 0 R /MediaBox [0 0 \(width) \(height)] \
        /Rotate \(rotation) /Contents 4 0 R /VP [ << /Type /Viewport \
        /BBox [0 0 \(width) \(height)] /Name (Sheet) /Measure << /Type /Measure \
        /Subtype /GEO /GCS << /Type /GEOGCS /EPSG 4326 >> \
        /LPTS [0 0 0 1 1 1 1 0] \
        /GPTS [44.60 -63.70 44.70 -63.70 44.70 -63.50 44.60 -63.50] >> >> ] >>
        """,
        "<< /Length \(content.utf8.count) >>\nstream\n\(content)endstream",
    ]

    var bytes = Data("%PDF-1.7\n".utf8)
    var offsets = [Int]()
    for (index, body) in objects.enumerated() {
        offsets.append(bytes.count)
        bytes.append(Data("\(index + 1) 0 obj\n\(body)\nendobj\n".utf8))
    }
    let startxref = bytes.count
    var table = "xref\n0 \(objects.count + 1)\n0000000000 65535 f \n"
    for offset in offsets {
        table += String(format: "%010d 00000 n \n", offset)
    }
    table += "trailer\n<< /Size \(objects.count + 1) /Root 1 0 R >>\n"
    table += "startxref\n\(startxref)\n%%EOF\n"
    bytes.append(Data(table.utf8))
    return bytes
}

@Suite("A page that asks to be turned before it is read")
struct RotatedPdfPageTests {
    private static let bounds = GeoBoundingBox(
        south: 44.60, west: -63.70, north: 44.70, east: -63.50
    )

    /// The rotation branch, measured rather than derived.
    ///
    /// The reader turns the page, and separately writes a viewport transform
    /// that has to describe the pixels that turn produced. Nothing else checks
    /// the two against each other: the existing rotation tests do corner
    /// arithmetic on `drawingTransform` alone, and corners survive a page being
    /// turned the wrong way or coming out mirrored. Here the same quarter of
    /// the same map is drawn four times and asked where it landed. All four
    /// answers have to be the same piece of ground, because they are.
    @Test("However the page is turned, the ink is on the same ground", arguments: [0, 90, 180, 270])
    func aTurnedPageStillRegistersToItsOwnGround(rotation: Int) throws {
        let read = try PdfMapReader.read(rotatedRegisteredPdf(rotation: rotation))
        guard case .automatic(let candidate) =
            PdfMapRegistration.selection(of: read.extraction)
        else {
            Issue.record("a page turned \(rotation)° was not read as georeferenced")
            return
        }
        let transform = try #require(AffineFit.solve(controlPoints: candidate.gcps))
        let data = try #require(read.image.dataProvider?.data)
        let bytes = try #require(CFDataGetBytePtr(data))

        let stride = read.image.bytesPerRow
        let pixel = read.image.bitsPerPixel / 8
        var sumX = 0.0, sumY = 0.0, count = 0.0
        for y in 0..<read.image.height {
            for x in 0..<read.image.width where bytes[y * stride + x * pixel] < 128 {
                sumX += Double(x)
                sumY += Double(y)
                count += 1
            }
        }
        try #require(count > 0, "a page turned \(rotation)° came out blank")

        let here = WebMercator.unproject(
            transform.apply(x: sumX / count, y: sumY / count)
        )
        #expect(here.lat > (Self.bounds.north + Self.bounds.south) / 2)
        #expect(here.lng < (Self.bounds.east + Self.bounds.west) / 2)
    }
}
