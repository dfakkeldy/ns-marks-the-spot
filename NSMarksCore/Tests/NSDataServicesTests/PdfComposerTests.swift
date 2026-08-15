import CoreGraphics
import Foundation
import GeoCore
import ImageIO
import Testing
import UniformTypeIdentifiers

@testable import NSDataServices

@Suite("PDF text fitting")
struct PdfTextFittingTests {
    /// Wrapping is measured, not counted. Helvetica's "i" and "W" are 222 and
    /// 944 thousandths wide, so any rule based on character count would put
    /// one of these two lines in the wrong place.
    @Test func wrappingUsesRealGlyphWidths() {
        let font = PdfFont.regular
        let narrow = PdfComposer.wrap(
            String(repeating: "i ", count: 20), font: font, size: 10, maxWidth: 100
        )
        let wide = PdfComposer.wrap(
            String(repeating: "W ", count: 20), font: font, size: 10, maxWidth: 100
        )
        #expect(narrow.count < wide.count)
        for line in narrow + wide {
            #expect(font.width(of: line, size: 10) <= 100)
        }
    }

    /// A word longer than the whole column still gets a line of its own rather
    /// than disappearing, because a PID with no spaces in it is exactly the
    /// kind of thing a reader needs to see.
    @Test func aWordWiderThanTheColumnStillGetsALine() {
        let lines = PdfComposer.wrap(
            "00000000 4444444444444444444444444444", font: .regular, size: 10, maxWidth: 30
        )
        #expect(lines == ["00000000", "4444444444444444444444444444"])
    }

    @Test func ellipsisFitsInsideTheWidthItWasGiven() {
        let font = PdfFont.regular
        let trimmed = PdfComposer.ellipsized(
            "Cape Breton Regional Municipality", font: font, size: 9, maxWidth: 60
        )
        #expect(trimmed.hasSuffix("…"))
        #expect(!trimmed.hasSuffix(" …"))
        #expect(font.width(of: trimmed, size: 9) <= 60)
    }

    /// The strip carries a licence obligation, so it shrinks the type rather
    /// than dropping the sources that would not fit.
    @Test func attributionShrinksRatherThanLosingASource() {
        let strip = PdfRect(x: 28, y: 28, width: 556, height: 36)
        let text = (1...20)
            .map { "Source \($0) — Open Government Licence — Nova Scotia" }
            .joined(separator: "  ·  ")
        let fitted = PdfComposer.fitAttribution(
            text, font: .regular, strip: strip, preferredSize: 7
        )

        #expect(fitted.size < 7)
        #expect(fitted.size >= PdfComposer.minimumCaptionSize)
        #expect(!fitted.lines.contains { $0.hasSuffix("…") })
        #expect(fitted.lines.joined(separator: " ").contains("Source 12"))
    }

    /// Past the floor there is nothing left to give, and then the cut has to
    /// be visible. An attribution that just stopped would read as complete.
    @Test func anAttributionTooLongForTheFloorSaysItWasCut() {
        let strip = PdfRect(x: 28, y: 28, width: 200, height: 14)
        let text = (1...40).map { "Source \($0)" }.joined(separator: "  ·  ")
        let fitted = PdfComposer.fitAttribution(
            text, font: .regular, strip: strip, preferredSize: 7
        )

        #expect(fitted.size == PdfComposer.minimumCaptionSize)
        #expect(fitted.lines.last?.hasSuffix("…") == true)
    }
}

@Suite("PDF text encoding")
struct PdfFontEncodingTests {
    /// A base-14 font is addressed one cp1252 byte at a time, so "é" is one
    /// byte, not the two a UTF-8 string would have carried into the file as
    /// "Ã©".
    @Test func accentedLatinSurvivesAsOneWinAnsiByte() {
        #expect(PdfFont.regular.encoded("Café") == [0x43, 0x61, 0x66, 0xE9])
    }

    /// One decorative character a reader happened to type must not be able to
    /// take the whole export with it.
    @Test func charactersTheEncodingCannotHoldBecomeAVisibleStandIn() {
        #expect(PdfFont.regular.sanitized("Lot 3 🚜 north") == "Lot 3 ? north")
        #expect(PdfFont.regular.sanitized("1:5000 ≈ 25 m") == "1:5000 ~ 25 m")
        #expect(PdfFont.regular.sanitized("Café — lot") == "Café — lot")
    }

    /// Newlines and tabs pass through sanitizing untouched, because wrapping
    /// splits on whitespace afterwards and a "?" in place of a newline would
    /// glue two words together.
    @Test func whitespaceIsLeftAloneForTheWrapperToSplitOn() {
        #expect(PdfComposer.wrap("north\tlot\nline", font: .regular, size: 9, maxWidth: 500)
            == ["north lot line"])
    }

    @Test(arguments: [
        ("#ff8800", PdfColor(1.0, 0.533_333_333_333_333_3, 0.0)),
        ("ff8800", PdfColor(1.0, 0.533_333_333_333_333_3, 0.0)),
        ("rgba(1,2,3,0.5)", PdfComposer.chip),
        ("#fff", PdfComposer.chip),
    ])
    func swatchColoursFallBackRatherThanGuessing(hex: String, expected: PdfColor) {
        #expect(PdfColor(hex: hex, fallback: PdfComposer.chip) == expected)
    }
}

@Suite("Composed page")
struct PdfComposerTests {
    /// A real JPEG, because the page embeds the bytes as DCTDecode and a
    /// reader that could not decode them would fail on the map itself.
    private static func jpeg(width: Int, height: Int) throws -> Data {
        let context = try #require(
            CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            )
        )
        context.setFillColor(CGColor(red: 0.6, green: 0.7, blue: 0.6, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try #require(context.makeImage())
        let out = NSMutableData()
        let destination = try #require(
            CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil)
        )
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        return out as Data
    }

    private static let bounds = GeoBoundingBox(
        south: 46.0, west: -61.4, north: 46.2, east: -61.1
    )

    private static func input(
        template: PdfTemplate = .portrait,
        fields: PdfComposer.Fields = PdfComposer.Fields(
            title: "Lot 3, Big Bras d'Or", subtitle: "PID 15000000", notes: "Screening only."
        ),
        legend: [PdfComposer.LegendEntry]? = [
            PdfComposer.LegendEntry(name: "Parcels", swatchColour: "#3388ff"),
            PdfComposer.LegendEntry(name: "Well logs", swatchColour: nil),
        ],
        attribution: [String] = ["Parcels — Province of Nova Scotia — OGL-NS"],
        disclosures: [String] = []
    ) throws -> PdfComposer.Input {
        PdfComposer.Input(
            template: template,
            bounds: bounds,
            mapImage: PdfComposer.MapImage(
                jpegBytes: try jpeg(width: 64, height: 58), widthPx: 64, heightPx: 58
            ),
            fields: fields,
            legend: legend,
            disclosures: disclosures,
            attributionLines: attribution,
            scaleBar: PrintScaleBar.build(
                bounds: bounds, mapFrame: template.mapFrame, maxWidthPoints: template.scaleBar.maxWidth
            ),
            generatedAt: Date(timeIntervalSince1970: 1_755_216_000)
        )
    }

    /// The composed page opens, has one page of the template's size, and still
    /// carries the registration that says where on the ground it sits.
    @Test(arguments: [PdfTemplate.portrait, PdfTemplate.landscape])
    func aComposedPageOpensAndKnowsWhereItIs(template: PdfTemplate) throws {
        let data = PdfComposer.compose(try Self.input(template: template))
        let provider = try #require(CGDataProvider(data: data as CFData))
        let document = try #require(CGPDFDocument(provider))
        #expect(document.numberOfPages == 1)

        let page = try #require(document.page(at: 1))
        let box = page.getBoxRect(.mediaBox)
        // Converted rather than compared across types: #expect misreports a
        // CGFloat against a Double, failing on two values with identical bit
        // patterns.
        #expect(Double(box.width) == template.pageWidth)
        #expect(Double(box.height) == template.pageHeight)

        let dictionary = try #require(page.dictionary)
        var viewports: CGPDFArrayRef?
        var lgi: CGPDFArrayRef?
        #expect(CGPDFDictionaryGetArray(dictionary, "VP", &viewports))
        #expect(CGPDFDictionaryGetArray(dictionary, "LGIDict", &lgi))
    }

    /// Every baseline the page draws text on, top-down, with the text.
    private static func drawnLines(_ data: Data) -> [(y: Double, text: String)] {
        // Read as bytes rather than as a string. The file is not text in any
        // one encoding: the operators are ASCII, the drawn text is WinAnsi,
        // and the embedded JPEG is neither — decoding the whole thing as
        // cp1252 returns nothing at all, because a JPEG is certain to contain
        // one of the five bytes cp1252 leaves undefined.
        var out = [(y: Double, text: String)]()
        var pendingY: Double?
        for line in data.split(separator: 0x0A) {
            let ascii = String(decoding: line, as: UTF8.self)
            if ascii.hasSuffix(" Tm") {
                pendingY = Double(ascii.split(separator: " ").dropLast().last ?? "")
            } else if line.count > 4, Array(line.suffix(4)) == Array(") Tj".utf8), let y = pendingY {
                // Only the drawn text is cp1252, so only it is decoded that
                // way — which is what lets these tests see the ellipsis and
                // the em dash the page actually carries.
                let bytes = Data(line.dropFirst().dropLast(4))
                out.append((y, String(data: bytes, encoding: .windowsCP1252) ?? ""))
                pendingY = nil
            }
        }
        return out
    }

    /// A title long enough to fill its own block must not print over the map
    /// drawn beneath it, and the reader has to be able to see that it was cut.
    @Test func aTitleTooLongForItsBlockIsCutVisiblyRatherThanSpilling() throws {
        let template = PdfTemplate.portrait
        let content = PdfComposer.compose(
            try Self.input(
                fields: PdfComposer.Fields(
                    title: String(repeating: "Big Bras d'Or ", count: 30),
                    subtitle: "PID 15000000",
                    notes: "Screening only."
                )
            )
        )
        let drawn = Self.drawnLines(content)
        let block = template.titleBlock
        let inBlock = drawn.filter { $0.y >= block.y && $0.y <= block.y + block.height }

        #expect(!inBlock.isEmpty)
        #expect(inBlock.last?.text.hasSuffix("…") == true)
        // Nothing between the block's floor and the top of the map frame,
        // which is where a spilling title used to land.
        let spilled = drawn.filter {
            $0.y < block.y && $0.y > template.mapFrame.y + template.mapFrame.height
        }
        #expect(spilled.isEmpty)
    }

    /// A legend with more layers than rows says how many it is not showing.
    /// One that just stopped at the last row would read as the whole list.
    @Test func aLegendTooShortForItsLayersSaysHowManyAreMissing() throws {
        let entries = (1...20).map {
            PdfComposer.LegendEntry(name: "Layer \($0)", swatchColour: "#3388ff")
        }
        let drawn = Self.drawnLines(PdfComposer.compose(try Self.input(legend: entries)))
        let overflow = drawn.map(\.text).first { $0.contains("more — see attribution") }
        #expect(overflow != nil)

        let shown = drawn.map(\.text).filter { $0.hasPrefix("Layer ") }.count
        #expect(shown > 0)
        #expect(overflow?.contains("\(20 - shown)") == true)
    }

    /// A page exported without its legend still credits its sources and still
    /// says what it could not draw.
    ///
    /// The legend is the user's to switch off; attribution is a licence
    /// obligation and a disclosure is what the reader must not conclude.
    /// Dropping the box must not quietly take either with it.
    @Test func droppingTheLegendKeepsTheAttributionAndTheDisclosures() throws {
        let disclosure = "Not printed — the licence has not been accepted: Provincial imagery."
        let drawn = Self.drawnLines(
            PdfComposer.compose(try Self.input(legend: nil, disclosures: [disclosure]))
        )
        let text = drawn.map(\.text)

        #expect(!text.contains { $0.contains("LEGEND") })
        #expect(!text.contains { $0 == "Parcels" })
        #expect(text.contains { $0.contains("Province of Nova Scotia") })
        #expect(text.contains { $0.contains(disclosure) })
    }

    /// A disclosure has to reach the page even when the title block is already
    /// full.
    ///
    /// Notes share the title block's bottom bound with the title and subtitle,
    /// so a long enough title pushes them off the page entirely — silently.
    /// That is survivable for "Screening only." and not for "this layer was not
    /// printed", which is the difference between a page that is missing a
    /// sentence and a page that is missing a sentence the reader needed in
    /// order to read the rest of it correctly. Disclosures therefore ride in
    /// the attribution strip, which shrinks to fit rather than dropping lines.
    @Test func aDisclosureSurvivesATitleThatFillsTheWholeTitleBlock() throws {
        let disclosure =
            "Not printed — the licence has not been accepted: Provincial imagery."
        let drawn = Self.drawnLines(
            PdfComposer.compose(
                try Self.input(
                    fields: PdfComposer.Fields(
                        title: String(repeating: "Big Bras d'Or ", count: 30),
                        subtitle: "PID 15000000",
                        notes: "Screening only."
                    ),
                    disclosures: [disclosure]
                )
            )
        )
        // The note is gone, pushed out by the title, and the disclosure is not.
        #expect(!drawn.contains { $0.text.contains("Screening only") })
        // The strip joins its entries onto one shrunk-to-fit line, so the
        // disclosure is looked for inside that line rather than as its own.
        #expect(drawn.contains { $0.text.contains(disclosure) })
    }

    /// The stamp is the date in UTC, not the phone's, so two people comparing
    /// the same printed page read the same date on it.
    @Test func theStampIsTheSameDateWhereverItWasPrinted() throws {
        let drawn = Self.drawnLines(PdfComposer.compose(try Self.input()))
        #expect(drawn.contains { $0.text.contains("Generated 2025-08-15") })
        #expect(PdfComposer.pdfDate(Date(timeIntervalSince1970: 1_755_216_000))
            == "D:20250815000000+00'00'")
    }
}

@Suite("The page's QR code")
struct PdfQrCodeTests {
    /// A tiny stand-in for a real code: the encoder is a platform framework
    /// and lives in the app, so what is tested here is the drawing — where the
    /// modules land and which way up they are.
    private static let modules: [[Bool]] = [
        [true, true, false],
        [false, true, false],
        [false, false, true],
    ]

    private static let slot = PdfTemplate.SquareSlot(x: 100, y: 50, size: 70)

    /// Every rectangle the content stream fills, as (x, y, width, height).
    private static func filled(_ content: PdfContent) -> [(Double, Double, Double, Double)] {
        String(decoding: content.data, as: UTF8.self)
            .split(separator: "\n")
            .filter { $0.hasSuffix(" re f") || $0.hasSuffix(" re") }
            .compactMap { line in
                let parts = line.split(separator: " ").compactMap { Double($0) }
                guard parts.count == 4 else { return nil }
                return (parts[0], parts[1], parts[2], parts[3])
            }
    }

    /// The code stays inside the square the template gave it. A quiet zone
    /// added outside the slot would put white paper over the block beside it,
    /// and the layout's blocks are meant not to overlap.
    @Test func everyModuleStaysInsideTheSlot() {
        var content = PdfContent()
        PdfComposer.drawQrCode(into: &content, slot: Self.slot, modules: Self.modules)

        let rectangles = Self.filled(content)
        #expect(!rectangles.isEmpty)
        for (x, y, width, height) in rectangles {
            #expect(x >= Self.slot.x)
            #expect(y >= Self.slot.y)
            #expect(x + width <= Self.slot.x + Self.slot.size + 0.001)
            #expect(y + height <= Self.slot.y + Self.slot.size + 0.001)
        }
    }

    /// One white square plus one rectangle per dark module — a code drawn any
    /// other way would either lose modules or invent them.
    @Test func oneRectangleIsDrawnPerDarkModule() {
        var content = PdfContent()
        PdfComposer.drawQrCode(into: &content, slot: Self.slot, modules: Self.modules)

        let dark = Self.modules.flatMap(\.self).filter(\.self).count
        #expect(Self.filled(content).count == dark + 1)
    }

    /// Modules arrive top row first and PDF counts up from the bottom of the
    /// page. Getting this backwards mirrors the code vertically, which still
    /// looks like a QR and scans as nothing.
    @Test func theFirstRowOfModulesDrawsAtTheTopOfTheSlot() throws {
        var content = PdfContent()
        PdfComposer.drawQrCode(into: &content, slot: Self.slot, modules: Self.modules)

        // Drop the white background, which covers the whole slot.
        let squares = Self.filled(content).filter { $0.2 < Self.slot.size }
        let highest = try #require(squares.max { $0.1 < $1.1 })
        let lowest = try #require(squares.min { $0.1 < $1.1 })

        // Row 0 is dark at its left edge; row 2 only at its right. So the
        // highest square on the page is also the leftmost, and the lowest is
        // the rightmost — which a vertical mirror would swap.
        #expect(highest.0 < lowest.0)
        #expect(highest.1 > lowest.1)
        let moduleSize = Self.slot.size / 7
        #expect(abs(highest.1 - (Self.slot.y + Self.slot.size - 3 * moduleSize)) < 0.001)
    }

    @Test func aPageWithNoLinkDrawsNoCode() throws {
        var withCode = PdfContent()
        PdfComposer.drawQrCode(into: &withCode, slot: Self.slot, modules: [])
        #expect(withCode.data.isEmpty)
    }
}
