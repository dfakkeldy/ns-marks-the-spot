import Foundation

/// A colour in the exported page, in PDF's 0–1 device RGB.
public struct PdfColor: Hashable, Sendable {
    public var red: Double
    public var green: Double
    public var blue: Double

    public init(_ red: Double, _ green: Double, _ blue: Double) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    /// `#rrggbb`, or `fallback` for anything else.
    ///
    /// A layer's swatch colour arrives from the layer catalogue as whatever
    /// CSS the map draws with. A gradient, a named colour, or an `rgba()` is
    /// not something this can turn into a printed square, and guessing would
    /// put a confident wrong colour in the legend, so the neutral chip stands
    /// in instead.
    public init(hex: String, fallback: PdfColor) {
        let value = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        let digits = Array(value)
        guard digits.count == 6, value.allSatisfy(\.isHexDigit) else {
            self = fallback
            return
        }
        func channel(_ start: Int) -> Double {
            Double(UInt8(String(digits[start..<(start + 2)]), radix: 16) ?? 0) / 255.0
        }
        self.init(channel(0), channel(2), channel(4))
    }
}

/// The drawing operators for one page.
///
/// A thin layer over the content-stream syntax rather than a graphics API:
/// enough to place text, rules, boxes and the map image, and nothing else. The
/// page is a layout, not a drawing.
public struct PdfContent {
    private var bytes = Data()

    public init() {}

    public var data: Data { bytes }

    private mutating func write(_ text: String) {
        bytes.append(Data(text.utf8))
    }

    public mutating func fillRectangle(_ rect: PdfRect, colour: PdfColor) {
        write("\(Self.colour(colour, stroking: false))\n\(Self.rect(rect)) f\n")
    }

    public mutating func strokeRectangle(_ rect: PdfRect, colour: PdfColor, width: Double) {
        write(
            "\(Self.colour(colour, stroking: true))\(PdfWriter.number(width)) w\n"
                + "\(Self.rect(rect)) S\n"
        )
    }

    /// Filled and outlined in one path, which is how the scale bar's segments
    /// and the legend swatches are drawn: a light fill needs its own edge to
    /// stay visible on white paper.
    public mutating func fillAndStrokeRectangle(
        _ rect: PdfRect, fill: PdfColor, stroke: PdfColor, width: Double
    ) {
        write(
            "\(Self.colour(fill, stroking: false))\(Self.colour(stroke, stroking: true))"
                + "\(PdfWriter.number(width)) w\n\(Self.rect(rect)) B\n"
        )
    }

    public mutating func line(
        from start: (x: Double, y: Double),
        to end: (x: Double, y: Double),
        colour: PdfColor,
        width: Double
    ) {
        write(
            "\(Self.colour(colour, stroking: true))\(PdfWriter.number(width)) w\n"
                + "\(PdfWriter.number(start.x)) \(PdfWriter.number(start.y)) m "
                + "\(PdfWriter.number(end.x)) \(PdfWriter.number(end.y)) l S\n"
        )
    }

    /// One line of text at a baseline. `text` is encoded to WinAnsi bytes by
    /// the font, so anything it cannot hold has already become a "?" rather
    /// than a mis-drawn glyph.
    public mutating func text(
        _ text: String, font: PdfFont, size: Double, x: Double, y: Double, colour: PdfColor
    ) {
        write("BT\n\(Self.colour(colour, stroking: false))")
        write("/\(font.face == .bold ? "F2" : "F1") \(PdfWriter.number(size)) Tf\n")
        write("1 0 0 1 \(PdfWriter.number(x)) \(PdfWriter.number(y)) Tm\n(")
        bytes.append(contentsOf: Self.escaped(font.encoded(text)))
        write(") Tj\nET\n")
    }

    /// Places an image XObject into `rect`. The image's own pixel dimensions
    /// do not appear: a PDF image is drawn into a unit square and scaled by
    /// the current transform, so the frame decides the size and the pixel
    /// count decides only the detail.
    public mutating func image(_ name: String, in rect: PdfRect) {
        write(
            "q\n\(PdfWriter.number(rect.width)) 0 0 \(PdfWriter.number(rect.height)) "
                + "\(PdfWriter.number(rect.x)) \(PdfWriter.number(rect.y)) cm\n"
                + "/\(name) Do\nQ\n"
        )
    }

    private static func rect(_ rect: PdfRect) -> String {
        "\(PdfWriter.number(rect.x)) \(PdfWriter.number(rect.y)) "
            + "\(PdfWriter.number(rect.width)) \(PdfWriter.number(rect.height)) re"
    }

    private static func colour(_ colour: PdfColor, stroking: Bool) -> String {
        "\(PdfWriter.number(colour.red)) \(PdfWriter.number(colour.green)) "
            + "\(PdfWriter.number(colour.blue)) \(stroking ? "RG" : "rg")\n"
    }

    /// Escapes the delimiters that would otherwise end the string early and
    /// corrupt every operator after it.
    static func escaped(_ codes: [UInt8]) -> [UInt8] {
        var out = [UInt8]()
        for code in codes {
            switch code {
            case UInt8(ascii: "("), UInt8(ascii: ")"), UInt8(ascii: "\\"):
                out.append(UInt8(ascii: "\\"))
                out.append(code)
            case 0x0A, 0x0D, 0x09:
                out.append(UInt8(ascii: "\\"))
                out.append(code == 0x0A ? UInt8(ascii: "n") : code == 0x0D ? UInt8(ascii: "r") : UInt8(ascii: "t"))
            default:
                out.append(code)
            }
        }
        return out
    }
}
