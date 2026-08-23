import Foundation

/// One of the two base-14 fonts the exported page uses.
///
/// Base-14 means the file names the font rather than carrying it: every PDF
/// reader already has Helvetica, so the page stays small and needs no font
/// embedding. The price is the encoding — a base-14 Type 1 font is addressed
/// through WinAnsi (cp1252), one byte per character, which is why text has to
/// be encoded and measured rather than written out as UTF-8.
public struct PdfFont: Sendable {
    public enum Face: String, Sendable {
        case regular = "Helvetica"
        case bold = "Helvetica-Bold"
    }

    public let face: Face

    public static let regular = PdfFont(face: .regular)
    public static let bold = PdfFont(face: .bold)

    /// The WinAnsi byte for a scalar, or nil when cp1252 has no room for it.
    ///
    /// Emoji, arrows, and most symbols fall outside cp1252. A reader who types
    /// one into a title should get a page, not a failed export, so callers run
    /// text through ``sanitized(_:)`` first.
    public func code(for scalar: Unicode.Scalar) -> UInt8? {
        Self.codes[scalar.value]
    }

    /// The width of `text` at `size`, in PDF points.
    ///
    /// Glyph widths only, no kerning. The web measures the same strings
    /// through pdf-lib, which does apply pair kerning, so a wrap point can
    /// occasionally land a word earlier there than here — "Wave To" measures
    /// about 6% narrower with kerning. What matters on the page is that this
    /// measurement matches what the page draws, and the page draws unkerned
    /// text, so a line measured to fit does fit.
    public func width(of text: String, size: Double) -> Double {
        var total = 0.0
        let table = Self.widths[face == .bold ? 1 : 0]
        for scalar in text.unicodeScalars {
            total += Double(table[scalar.value] ?? 0)
        }
        return total * size / 1000.0
    }

    /// Replaces anything cp1252 cannot hold, so no string can fail to draw.
    ///
    /// "≈" gets a stand-in of its own because the scale bar emits it on
    /// purpose and "~" reads naturally in its place. Everything else outside
    /// the encoding becomes "?" — visible, rather than a character silently
    /// dropped or an export that dies over one decorative symbol. Whitespace
    /// passes through untouched, because word wrapping splits on it later.
    public func sanitized(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        for scalar in text.unicodeScalars {
            if scalar == "≈" {
                out.append("~")
            } else if CharacterSet.whitespacesAndNewlines.contains(scalar)
                || code(for: scalar) != nil {
                out.append(scalar)
            } else {
                out.append("?")
            }
        }
        return String(out)
    }

    /// The bytes a content stream carries for this text, already sanitized.
    public func encoded(_ text: String) -> [UInt8] {
        sanitized(text).unicodeScalars.compactMap { code(for: $0) }
    }

    /// Unicode scalar, WinAnsi code, Helvetica width, Helvetica-Bold width —
    /// flattened, four values per character.
    ///
    /// Generated from `@pdf-lib/standard-fonts`, the same Adobe metrics the
    /// web export measures against, so a line that fits on one surface fits on
    /// the other.
    private static let table: [Int32] = [
        32, 32, 278, 278, 33, 33, 278, 333, 34, 34, 355, 474, 35, 35, 556, 556, 36, 36, 556,
        556, 37, 37, 889, 889, 38, 38, 667, 722, 39, 39, 191, 238, 40, 40, 333, 333, 41, 41,
        333, 333, 42, 42, 389, 389, 43, 43, 584, 584, 44, 44, 278, 278, 45, 45, 333, 333,
        46, 46, 278, 278, 47, 47, 278, 278, 48, 48, 556, 556, 49, 49, 556, 556, 50, 50, 556,
        556, 51, 51, 556, 556, 52, 52, 556, 556, 53, 53, 556, 556, 54, 54, 556, 556, 55, 55,
        556, 556, 56, 56, 556, 556, 57, 57, 556, 556, 58, 58, 278, 333, 59, 59, 278, 333,
        60, 60, 584, 584, 61, 61, 584, 584, 62, 62, 584, 584, 63, 63, 556, 611, 64, 64,
        1015, 975, 65, 65, 667, 722, 66, 66, 667, 722, 67, 67, 722, 722, 68, 68, 722, 722,
        69, 69, 667, 667, 70, 70, 611, 611, 71, 71, 778, 778, 72, 72, 722, 722, 73, 73, 278,
        278, 74, 74, 500, 556, 75, 75, 667, 722, 76, 76, 556, 611, 77, 77, 833, 833, 78, 78,
        722, 722, 79, 79, 778, 778, 80, 80, 667, 667, 81, 81, 778, 778, 82, 82, 722, 722,
        83, 83, 667, 667, 84, 84, 611, 611, 85, 85, 722, 722, 86, 86, 667, 667, 87, 87, 944,
        944, 88, 88, 667, 667, 89, 89, 667, 667, 90, 90, 611, 611, 91, 91, 278, 333, 92, 92,
        278, 278, 93, 93, 278, 333, 94, 94, 469, 584, 95, 95, 556, 556, 96, 96, 333, 333,
        97, 97, 556, 556, 98, 98, 556, 611, 99, 99, 500, 556, 100, 100, 556, 611, 101, 101,
        556, 556, 102, 102, 278, 333, 103, 103, 556, 611, 104, 104, 556, 611, 105, 105, 222,
        278, 106, 106, 222, 278, 107, 107, 500, 556, 108, 108, 222, 278, 109, 109, 833, 889,
        110, 110, 556, 611, 111, 111, 556, 611, 112, 112, 556, 611, 113, 113, 556, 611, 114,
        114, 333, 389, 115, 115, 500, 556, 116, 116, 278, 333, 117, 117, 556, 611, 118, 118,
        500, 556, 119, 119, 722, 778, 120, 120, 500, 556, 121, 121, 500, 556, 122, 122, 500,
        500, 123, 123, 334, 389, 124, 124, 260, 280, 125, 125, 334, 389, 126, 126, 584, 584,
        160, 160, 278, 278, 161, 161, 333, 333, 162, 162, 556, 556, 163, 163, 556, 556, 164,
        164, 556, 556, 165, 165, 556, 556, 166, 166, 260, 280, 167, 167, 556, 556, 168, 168,
        333, 333, 169, 169, 737, 737, 170, 170, 370, 370, 171, 171, 556, 556, 172, 172, 584,
        584, 173, 173, 333, 333, 174, 174, 737, 737, 175, 175, 333, 333, 176, 176, 400, 400,
        177, 177, 584, 584, 178, 178, 333, 333, 179, 179, 333, 333, 180, 180, 333, 333, 181,
        181, 556, 611, 182, 182, 537, 556, 183, 183, 278, 278, 184, 184, 333, 333, 185, 185,
        333, 333, 186, 186, 365, 365, 187, 187, 556, 556, 188, 188, 834, 834, 189, 189, 834,
        834, 190, 190, 834, 834, 191, 191, 611, 611, 192, 192, 667, 722, 193, 193, 667, 722,
        194, 194, 667, 722, 195, 195, 667, 722, 196, 196, 667, 722, 197, 197, 667, 722, 198,
        198, 1000, 1000, 199, 199, 722, 722, 200, 200, 667, 667, 201, 201, 667, 667, 202,
        202, 667, 667, 203, 203, 667, 667, 204, 204, 278, 278, 205, 205, 278, 278, 206, 206,
        278, 278, 207, 207, 278, 278, 208, 208, 722, 722, 209, 209, 722, 722, 210, 210, 778,
        778, 211, 211, 778, 778, 212, 212, 778, 778, 213, 213, 778, 778, 214, 214, 778, 778,
        215, 215, 584, 584, 216, 216, 778, 778, 217, 217, 722, 722, 218, 218, 722, 722, 219,
        219, 722, 722, 220, 220, 722, 722, 221, 221, 667, 667, 222, 222, 667, 667, 223, 223,
        611, 611, 224, 224, 556, 556, 225, 225, 556, 556, 226, 226, 556, 556, 227, 227, 556,
        556, 228, 228, 556, 556, 229, 229, 556, 556, 230, 230, 889, 889, 231, 231, 500, 556,
        232, 232, 556, 556, 233, 233, 556, 556, 234, 234, 556, 556, 235, 235, 556, 556, 236,
        236, 278, 278, 237, 237, 278, 278, 238, 238, 278, 278, 239, 239, 278, 278, 240, 240,
        556, 611, 241, 241, 556, 611, 242, 242, 556, 611, 243, 243, 556, 611, 244, 244, 556,
        611, 245, 245, 556, 611, 246, 246, 556, 611, 247, 247, 584, 584, 248, 248, 611, 611,
        249, 249, 556, 611, 250, 250, 556, 611, 251, 251, 556, 611, 252, 252, 556, 611, 253,
        253, 500, 556, 254, 254, 556, 611, 255, 255, 500, 556, 338, 140, 1000, 1000, 339,
        156, 944, 944, 352, 138, 667, 667, 353, 154, 500, 556, 376, 159, 500, 556, 381, 142,
        611, 611, 382, 158, 500, 500, 402, 131, 556, 556, 710, 136, 333, 333, 732, 152, 333,
        333, 8211, 150, 556, 556, 8212, 151, 1000, 1000, 8216, 145, 222, 278, 8217, 146,
        222, 278, 8218, 130, 222, 278, 8220, 147, 333, 500, 8221, 148, 333, 500, 8222, 132,
        333, 500, 8224, 134, 556, 556, 8225, 135, 556, 556, 8226, 149, 350, 350, 8230, 133,
        1000, 1000, 8240, 137, 1000, 1000, 8249, 139, 333, 333, 8250, 155, 333, 333, 8364,
        128, 556, 556, 8482, 153, 1000, 1000
    ]

    private static let codes: [UInt32: UInt8] = {
        var map = [UInt32: UInt8](minimumCapacity: table.count / 4)
        for index in stride(from: 0, to: table.count, by: 4) {
            map[UInt32(table[index])] = UInt8(table[index + 1])
        }
        return map
    }()

    /// Index 0 is Helvetica, index 1 is Helvetica-Bold.
    private static let widths: [[UInt32: Int32]] = {
        var regular = [UInt32: Int32](minimumCapacity: table.count / 4)
        var bold = regular
        for index in stride(from: 0, to: table.count, by: 4) {
            regular[UInt32(table[index])] = table[index + 2]
            bold[UInt32(table[index])] = table[index + 3]
        }
        return [regular, bold]
    }()
}
