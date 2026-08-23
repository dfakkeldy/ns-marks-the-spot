import CoreGraphics
import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// The registration that makes an exported page a GeoPDF, checked by writing a
/// file and reading it back with Core Graphics rather than by inspecting the
/// structures that produced it.
///
/// Reading the bytes back is the point. The whole reason this exporter writes
/// its own PDF is that Core Graphics will not put these dictionaries on a page,
/// so "the dictionary is correct" is worth nothing until something that did not
/// write it can find it in the file.
@Suite("GeoPDF registration")
struct GeoPdfRegistrationTests {
    private static let bounds = GeoBoundingBox(
        south: 46.0, west: -61.4, north: 46.2, east: -61.1
    )
    private static let mapFrame = PdfRect(x: 28, y: 192, width: 556, height: 500)

    /// A one-page file carrying nothing but the registration.
    private static func writtenBytes() -> Data {
        var writer = PdfWriter()
        let catalog = writer.reserve()
        let pages = writer.reserve()
        let page = writer.add(
            .dictionary([
                ("Type", .name("Page")),
                ("Parent", .reference(pages)),
                ("MediaBox", .array([0, 0, 612, 792].map { PdfObject.integer($0) })),
                ("Resources", .dictionary([])),
                ("VP", GeoPdfRegistration.viewport(bounds: bounds, mapFrame: mapFrame)),
                ("LGIDict", GeoPdfRegistration.lgiDict(bounds: bounds, mapFrame: mapFrame)),
            ])
        )
        writer.fill(
            pages,
            with: .dictionary([
                ("Type", .name("Pages")),
                ("Kids", .array([.reference(page)])),
                ("Count", .integer(1)),
            ])
        )
        writer.fill(
            catalog,
            with: .dictionary([("Type", .name("Catalog")), ("Pages", .reference(pages))])
        )
        return writer.data(catalog: catalog)
    }

    /// Reads the written file's page dictionary and hands it to `body`.
    ///
    /// A closure rather than a return value: a `CGPDFDictionaryRef` is owned by
    /// its document, so returning one would hand back a pointer into a
    /// document that had already been released — which reads as an empty
    /// dictionary and would have made every assertion below fail for a reason
    /// that has nothing to do with the file.
    private static func withPageDictionary<Result>(
        _ body: (CGPDFDictionaryRef) throws -> Result
    ) throws -> Result {
        let data = writtenBytes()
        let provider = try #require(CGDataProvider(data: data as CFData))
        let document = try #require(CGPDFDocument(provider))
        #expect(document.numberOfPages == 1)
        let page = try #require(document.page(at: 1))
        return try body(try #require(page.dictionary))
    }

    private static func array(_ dictionary: CGPDFDictionaryRef, _ key: String) throws
        -> CGPDFArrayRef {
        var value: CGPDFArrayRef?
        #expect(CGPDFDictionaryGetArray(dictionary, key, &value))
        return try #require(value)
    }

    private static func dictionary(_ array: CGPDFArrayRef, at index: Int) throws
        -> CGPDFDictionaryRef {
        var value: CGPDFDictionaryRef?
        #expect(CGPDFArrayGetDictionary(array, index, &value))
        return try #require(value)
    }

    /// A literal string entry, read back as text. Returns nil when the entry is
    /// missing *or* is some other kind of object — a name written where a
    /// string belongs is exactly the mistake this has to be able to see.
    private static func string(_ dictionary: CGPDFDictionaryRef, _ key: String) -> String? {
        var value: CGPDFStringRef?
        guard CGPDFDictionaryGetString(dictionary, key, &value), let value else { return nil }
        return CGPDFStringCopyTextString(value) as String?
    }

    private static func numbers(_ array: CGPDFArrayRef) -> [Double] {
        (0..<CGPDFArrayGetCount(array)).compactMap { index in
            var value = CGPDFReal(0)
            guard CGPDFArrayGetNumber(array, index, &value) else { return nil }
            return Double(value)
        }
    }

    /// Core Graphics can open the file at all — the structure, the
    /// cross-reference table and the trailer are what a reader expects, not
    /// only what the writer intended.
    @Test func theFileIsAPdfSomethingElseCanOpen() throws {
        let data = Self.writtenBytes()
        #expect(data.starts(with: Array("%PDF-1.7".utf8)))
        try Self.withPageDictionary { _ in }
    }

    /// The ISO 32000 flavour: corners in latitude and longitude, in the corner
    /// order the standard fixes, against the unit square of the viewport.
    @Test func theViewportNamesTheGroundInLatitudeAndLongitude() throws {
        try Self.withPageDictionary { page in
        let viewports = try Self.array(page, "VP")
        #expect(CGPDFArrayGetCount(viewports) == 1)

        let viewport = try Self.dictionary(viewports, at: 0)
        let bbox = Self.numbers(try Self.array(viewport, "BBox"))
        #expect(bbox == [28, 192, 584, 692])

        var measure: CGPDFDictionaryRef?
        #expect(CGPDFDictionaryGetDictionary(viewport, "Measure", &measure))
        let gpts = Self.numbers(try Self.array(try #require(measure), "GPTS"))
        #expect(gpts.count == 8)
        // South-west, north-west, north-east, south-east, each (lat, lng).
        // Compared to a tolerance because the file is decimal text: a corner
        // is written to eight places and read back through a decimal parser,
        // so the last bit of a Double need not survive the trip.
        let corners = [
            46.0, -61.4,
            46.2, -61.4,
            46.2, -61.1,
            46.0, -61.1,
        ]
        for (written, wanted) in zip(gpts, corners) {
            #expect(abs(written - wanted) < 1e-8)
        }
        }
    }

    /// The OGC flavour: the transform that turns a point on the page into a
    /// coordinate on the ground. Checked by putting the frame's own corners
    /// through it, because a transform that is merely present and wrong is
    /// worse than one that is absent.
    @Test func theLgiTransformPutsTheFrameCornersOnTheirCoordinates() throws {
        try Self.withPageDictionary { page in
        let dictionaries = try Self.array(page, "LGIDict")
        let lgi = try Self.dictionary(dictionaries, at: 0)
        let ctm = Self.numbers(try Self.array(lgi, "CTM"))
        #expect(ctm.count == 6)

        func ground(x: Double, y: Double) -> MercatorPoint {
            MercatorPoint(
                x: ctm[0] * x + ctm[2] * y + ctm[4],
                y: ctm[1] * x + ctm[3] * y + ctm[5]
            )
        }

        let northWest = WebMercator.project(GeoPoint(lat: 46.2, lng: -61.4))
        let southEast = WebMercator.project(GeoPoint(lat: 46.0, lng: -61.1))
        let topLeft = ground(x: 28, y: 692)
        let bottomRight = ground(x: 584, y: 192)

        #expect(abs(topLeft.x - northWest.x) < 1e-3)
        #expect(abs(topLeft.y - northWest.y) < 1e-3)
        #expect(abs(bottomRight.x - southEast.x) < 1e-3)
        #expect(abs(bottomRight.y - southEast.y) < 1e-3)
        }
    }

    /// GDAL warns "Non closed ring" at producers that leave the neatline open,
    /// and a warning on import is something a reader then has to decide whether
    /// to trust. The ring closes.
    @Test func theNeatlineRingIsClosed() throws {
        try Self.withPageDictionary { page in
        let lgi = try Self.dictionary(try Self.array(page, "LGIDict"), at: 0)
        let neatline = Self.numbers(try Self.array(lgi, "Neatline"))

        #expect(neatline.count == 10)
        #expect(Array(neatline.prefix(2)) == Array(neatline.suffix(2)))
        }
    }

    /// The projection description GDAL actually reads.
    ///
    /// Every entry here was wrong once, and each one failed silently in a
    /// different way: a `ProjectionType` written as a name made GDAL discard
    /// the projection and report page pixels; a zero `ScaleFactor` made PROJ
    /// refuse the CRS; and the datum code "WGE" put the frame 21 km north by
    /// measuring a spherical transform against an ellipsoid. Core Graphics
    /// opened the file happily through all three.
    @Test func theProjectionIsSphericalMercatorAReaderCanUse() throws {
        try Self.withPageDictionary { page in
            let lgi = try Self.dictionary(try Self.array(page, "LGIDict"), at: 0)
            var projection: CGPDFDictionaryRef?
            #expect(CGPDFDictionaryGetDictionary(lgi, "Projection", &projection))
            let projectionDictionary = try #require(projection)

            #expect(Self.string(projectionDictionary, "ProjectionType") == "MC")
            #expect(Self.string(projectionDictionary, "Units") == "m")

            var scaleFactor = CGPDFReal(0)
            #expect(CGPDFDictionaryGetNumber(projectionDictionary, "ScaleFactor", &scaleFactor))
            #expect(scaleFactor == 1)

            var datum: CGPDFDictionaryRef?
            #expect(CGPDFDictionaryGetDictionary(projectionDictionary, "Datum", &datum))
            var ellipsoid: CGPDFDictionaryRef?
            #expect(CGPDFDictionaryGetDictionary(try #require(datum), "Ellipsoid", &ellipsoid))
            let ellipsoidDictionary = try #require(ellipsoid)

            var semiMajorAxis = CGPDFReal(0)
            #expect(
                CGPDFDictionaryGetNumber(ellipsoidDictionary, "SemiMajorAxis", &semiMajorAxis)
            )
            #expect(Double(semiMajorAxis) == WebMercator.earthRadiusMetres)

            var inverseFlattening = CGPDFReal(1)
            #expect(
                CGPDFDictionaryGetNumber(ellipsoidDictionary, "InvFlattening", &inverseFlattening)
            )
            #expect(inverseFlattening == 0)
        }
    }

    /// Both flavours are written, because the readers in the field disagree
    /// about which one is the standard.
    @Test func bothFlavoursArePresent() throws {
        try Self.withPageDictionary { page in
            var viewports: CGPDFArrayRef?
            var lgi: CGPDFArrayRef?
            #expect(CGPDFDictionaryGetArray(page, "VP", &viewports))
            #expect(CGPDFDictionaryGetArray(page, "LGIDict", &lgi))
        }
    }
}

@Suite("PDF object writing")
struct PdfWriterTests {
    /// A PDF has no exponent form. An EPSG:3857 coordinate is around 10⁷ and a
    /// scale factor around 10⁻⁴, and Swift's own description would write some
    /// of those as `1e-05`, which a reader may reject outright.
    @Test(arguments: [
        (0.000_012_5, "0.0000125"),
        (-7_000_000.5, "-7000000.5"),
        (42.0, "42"),
        (Double.nan, "0"),
        (Double.infinity, "0"),
    ])
    func numbersAreWrittenWithoutAnExponent(value: Double, expected: String) {
        #expect(PdfWriter.number(value) == expected)
    }

    /// Whatever a reader typed into a title has to survive as bytes. A stray
    /// bracket that closed the string early would corrupt every object after
    /// it.
    @Test func stringsEscapeTheirDelimiters() {
        #expect(PdfWriter.escapedString("A (parcel) \\ here") == #"A \(parcel\) \\ here"#)
        #expect(PdfWriter.escapedString("Café").hasSuffix(#"\303\251"#))
    }

    @Test func namesEscapeWhatTheyCannotHoldLiterally() {
        #expect(PdfWriter.escapedName("Map frame") == "Map#20frame")
        #expect(PdfWriter.escapedName("LGIDict") == "LGIDict")
    }
}
