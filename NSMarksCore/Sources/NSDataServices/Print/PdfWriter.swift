import Foundation

/// A value in a PDF file.
///
/// Only the handful of forms this exporter emits. Enough to write a page, and
/// deliberately not a general PDF library.
public indirect enum PdfObject: Sendable {
    case null
    case boolean(Bool)
    case number(Double)
    case integer(Int)
    /// A PDF name, written `/Name`. The leading slash is added here.
    case name(String)
    /// A literal string, written `(…)` with escapes.
    case string(String)
    /// A hex string, written `<…>`. Used where a viewer must not have to guess
    /// an encoding — the WKT and the dictionary labels in the geo registration.
    case hexString(String)
    /// A PDF text string: UTF-16BE behind a byte-order mark, which is the one
    /// form every reader has to decode. Document metadata goes out this way so
    /// a title with an accent or a dash survives into the reader's window,
    /// rather than arriving as the mojibake a raw byte string would give.
    case textString(String)
    case array([PdfObject])
    case dictionary([(String, PdfObject)])
    /// A stream: its dictionary entries, and its bytes. `/Length` is written by
    /// the writer.
    case stream([(String, PdfObject)], Data)
    /// A reference to another object, written `n 0 R`.
    case reference(Int)
}

/// Writes a PDF file object by object.
///
/// This exists because the export has to carry GeoPDF registration, and neither
/// `UIGraphicsPDFRenderer` nor `CGPDFContext` will put an arbitrary dictionary
/// on a page — `/VP` with its `/Measure`, and the OGC `/LGIDict`, are precisely
/// the entries they do not expose. A map that says where it is on the ground is
/// the whole point of the export, so the file is written directly rather than
/// drawn into and then patched.
///
/// Objects are written in the order they are added, with a cross-reference
/// table at the end. No object streams and no compression of the file
/// structure: `useObjectStreams: false` is what the web writes too, and it
/// keeps the registration dictionaries readable by anything that opens the
/// file with a text editor or a parser that skips indirect references.
public struct PdfWriter {
    private var objects: [PdfObject?] = []

    public init() {}

    /// Reserves an object number to be filled in later, which is what lets the
    /// page reference its own contents and the catalog reference the page.
    public mutating func reserve() -> Int {
        objects.append(nil)
        return objects.count
    }

    @discardableResult
    public mutating func add(_ object: PdfObject) -> Int {
        objects.append(object)
        return objects.count
    }

    public mutating func fill(_ number: Int, with object: PdfObject) {
        objects[number - 1] = object
    }

    /// The finished file.
    ///
    /// `catalog` is the object number of the document catalog. Any object
    /// reserved and never filled is written as null rather than left as a
    /// dangling reference a reader would have to recover from.
    public func data(catalog: Int, info: Int? = nil) -> Data {
        var out = Data("%PDF-1.7\n".utf8)
        // A comment of high bytes, which is how a file declares itself binary
        // to tools that would otherwise transfer it as text and corrupt the
        // image stream.
        out.append(contentsOf: [0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])

        var offsets = [Int]()
        for (index, object) in objects.enumerated() {
            offsets.append(out.count)
            out.append(Data("\(index + 1) 0 obj\n".utf8))
            out.append(Self.serialize(object ?? .null))
            out.append(Data("\nendobj\n".utf8))
        }

        let xrefOffset = out.count
        out.append(Data("xref\n0 \(objects.count + 1)\n".utf8))
        out.append(Data("0000000000 65535 f \n".utf8))
        for offset in offsets {
            out.append(Data(String(format: "%010d 00000 n \n", offset).utf8))
        }
        out.append(Data("trailer\n".utf8))
        var trailer: [(String, PdfObject)] = [
            ("Size", .integer(objects.count + 1)),
            ("Root", .reference(catalog)),
        ]
        if let info { trailer.append(("Info", .reference(info))) }
        out.append(Self.serialize(.dictionary(trailer)))
        out.append(Data("\nstartxref\n\(xrefOffset)\n%%EOF\n".utf8))
        return out
    }

    static func serialize(_ object: PdfObject) -> Data {
        switch object {
        case .null:
            return Data("null".utf8)
        case .boolean(let value):
            return Data((value ? "true" : "false").utf8)
        case .integer(let value):
            return Data(String(value).utf8)
        case .number(let value):
            return Data(number(value).utf8)
        case .name(let value):
            return Data("/\(escapedName(value))".utf8)
        case .string(let value):
            return Data("(\(escapedString(value)))".utf8)
        case .hexString(let value):
            let hex = Array(value.utf8).map { String(format: "%02X", $0) }.joined()
            return Data("<\(hex)>".utf8)
        case .textString(let value):
            var bytes: [UInt8] = [0xFE, 0xFF]
            for unit in Array(value.utf16) {
                bytes.append(UInt8(unit >> 8))
                bytes.append(UInt8(unit & 0xFF))
            }
            let hex = bytes.map { String(format: "%02X", $0) }.joined()
            return Data("<\(hex)>".utf8)
        case .array(let values):
            let body = values.map { String(decoding: serialize($0), as: UTF8.self) }
            return Data("[\(body.joined(separator: " "))]".utf8)
        case .dictionary(let entries):
            return dictionaryData(entries)
        case .stream(let entries, let bytes):
            var out = dictionaryData(entries + [("Length", .integer(bytes.count))])
            out.append(Data("\nstream\n".utf8))
            out.append(bytes)
            out.append(Data("\nendstream".utf8))
            return out
        case .reference(let number):
            return Data("\(number) 0 R".utf8)
        }
    }

    private static func dictionaryData(_ entries: [(String, PdfObject)]) -> Data {
        var out = Data("<<".utf8)
        for (key, value) in entries {
            out.append(Data(" /\(escapedName(key)) ".utf8))
            out.append(serialize(value))
        }
        out.append(Data(" >>".utf8))
        return out
    }

    /// Numbers are written in decimal with no exponent, because a PDF has no
    /// exponent form. A coordinate in EPSG:3857 metres is around 10⁷ and a
    /// scale factor around 10⁻⁴, and Swift's default description would write
    /// some of those as `1e-05`, which a reader is entitled to reject.
    static func number(_ value: Double) -> String {
        guard value.isFinite else { return "0" }
        if value == value.rounded(), abs(value) < 1e15 {
            return String(Int(value))
        }
        var text = String(format: "%.8f", value)
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text.isEmpty ? "0" : text
    }

    /// `#` escapes for anything outside the range a name may hold literally.
    static func escapedName(_ name: String) -> String {
        var out = ""
        for byte in Array(name.utf8) {
            let isPlain = (byte > 0x20 && byte < 0x7F)
                && byte != UInt8(ascii: "/") && byte != UInt8(ascii: "#")
                && byte != UInt8(ascii: "(") && byte != UInt8(ascii: ")")
                && byte != UInt8(ascii: "<") && byte != UInt8(ascii: ">")
                && byte != UInt8(ascii: "[") && byte != UInt8(ascii: "]")
                && byte != UInt8(ascii: "{") && byte != UInt8(ascii: "}")
                && byte != UInt8(ascii: "%")
            out += isPlain
                ? String(UnicodeScalar(byte))
                : String(format: "#%02X", byte)
        }
        return out
    }

    /// Literal strings escape their delimiters and the escape character, and
    /// anything outside printable ASCII goes out as an octal byte so the file
    /// stays byte-safe whatever a user typed into a title.
    static func escapedString(_ text: String) -> String {
        var out = ""
        for byte in Array(text.utf8) {
            switch byte {
            case UInt8(ascii: "("), UInt8(ascii: ")"), UInt8(ascii: "\\"):
                out += "\\" + String(UnicodeScalar(byte))
            case 0x0A:
                out += "\\n"
            case 0x0D:
                out += "\\r"
            case 0x09:
                out += "\\t"
            case 0x20...0x7E:
                out += String(UnicodeScalar(byte))
            default:
                out += String(format: "\\%03o", byte)
            }
        }
        return out
    }
}
