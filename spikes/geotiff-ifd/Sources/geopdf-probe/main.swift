import Foundation
import CoreGraphics

/// Spike: can CoreGraphics' CGPDF object API reach a GeoPDF's registration
/// dictionaries?
///
/// The web parser walks pdf-lib's object graph: page → /VP → Viewport → /BBox
/// and /Measure (/Type, /Subtype, /GCS, /LPTS, /GPTS, /Name), and page →
/// /LGIDict → /Type, /Version, /CTM, /Neatline, /Projection. This probe walks
/// the same paths through CGPDFDictionary/CGPDFArray and emits JSON so the two
/// can be diffed rather than eyeballed.
///
/// CGPDF is the only PDF object reader on the platform that does not require a
/// third-party dependency, so "can it reach these keys" decides whether Phase 8
/// can read GeoPDF frames at all.

// MARK: - JSON value

indirect enum JSON {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([(String, JSON)])

    func encoded(indent: Int = 0) -> String {
        let pad = String(repeating: "  ", count: indent)
        let inner = String(repeating: "  ", count: indent + 1)
        switch self {
        case .null: return "null"
        case .bool(let value): return value ? "true" : "false"
        case .number(let value):
            if value == value.rounded() && abs(value) < 1e15 {
                return String(format: "%.0f", value)
            }
            return String(format: "%.10g", value)
        case .string(let value):
            var escaped = ""
            for scalar in value.unicodeScalars {
                switch scalar {
                case "\\": escaped += "\\\\"
                case "\"": escaped += "\\\""
                case "\n": escaped += "\\n"
                case "\r": escaped += "\\r"
                case "\t": escaped += "\\t"
                default:
                    // PDF strings carry arbitrary bytes; anything below 0x20
                    // has to be escaped or the JSON is unparseable.
                    if scalar.value < 0x20 {
                        escaped += String(format: "\\u%04x", scalar.value)
                    } else {
                        escaped.unicodeScalars.append(scalar)
                    }
                }
            }
            return "\"\(escaped)\""
        case .array(let values):
            if values.isEmpty { return "[]" }
            let body = values.map { inner + $0.encoded(indent: indent + 1) }
            return "[\n" + body.joined(separator: ",\n") + "\n" + pad + "]"
        case .object(let pairs):
            if pairs.isEmpty { return "{}" }
            let body = pairs.map { inner + "\"\($0.0)\": " + $0.1.encoded(indent: indent + 1) }
            return "{\n" + body.joined(separator: ",\n") + "\n" + pad + "}"
        }
    }
}

// MARK: - CGPDF accessors

func name(_ dictionary: CGPDFDictionaryRef, _ key: String) -> String? {
    var value: UnsafePointer<Int8>?
    guard CGPDFDictionaryGetName(dictionary, key, &value), let value else { return nil }
    return String(cString: value)
}

func integer(_ dictionary: CGPDFDictionaryRef, _ key: String) -> Int? {
    var value: CGPDFInteger = 0
    guard CGPDFDictionaryGetInteger(dictionary, key, &value) else { return nil }
    return Int(value)
}

func text(_ dictionary: CGPDFDictionaryRef, _ key: String) -> String? {
    var value: CGPDFStringRef?
    guard CGPDFDictionaryGetString(dictionary, key, &value), let value,
          let cf = CGPDFStringCopyTextString(value)
    else { return nil }
    return cf as String
}

/// The OGC Best Practice encoding writes LGIDict /CTM as a MIXED array —
/// `[ (0.05) 0 0 (0.05) 2 48 ]` — where some elements are PDF strings holding
/// a number and others are real numbers. The web parser's `scalar()` coerces
/// both, gated on a strict numeric pattern, so this does the same. Reading
/// only CGPDFArrayGetNumber silently loses every OGC BP GeoPDF.
private let pdfNumberPattern = try! NSRegularExpression(
    pattern: #"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$"#)

func coerceNumber(_ array: CGPDFArrayRef, _ index: Int) -> Double? {
    var real: CGPDFReal = 0
    if CGPDFArrayGetNumber(array, index, &real) { return Double(real) }

    var string: CGPDFStringRef?
    guard CGPDFArrayGetString(array, index, &string), let string,
          let cf = CGPDFStringCopyTextString(string)
    else { return nil }
    let trimmed = (cf as String).trimmingCharacters(in: .whitespaces)
    let range = NSRange(trimmed.startIndex..., in: trimmed)
    guard pdfNumberPattern.firstMatch(in: trimmed, range: range) != nil else { return nil }
    return Double(trimmed)
}

func numbers(_ dictionary: CGPDFDictionaryRef, _ key: String) -> [Double]? {
    var arrayRef: CGPDFArrayRef?
    guard CGPDFDictionaryGetArray(dictionary, key, &arrayRef), let arrayRef else { return nil }
    var values: [Double] = []
    for index in 0..<CGPDFArrayGetCount(arrayRef) {
        guard let value = coerceNumber(arrayRef, index) else { return nil }
        values.append(value)
    }
    return values
}

func dictionary(_ dictionary: CGPDFDictionaryRef, _ key: String) -> CGPDFDictionaryRef? {
    var value: CGPDFDictionaryRef?
    guard CGPDFDictionaryGetDictionary(dictionary, key, &value) else { return nil }
    return value
}

/// Every key present in a dictionary — the check that CGPDF is not hiding
/// structure the pdf-lib walk can see.
func keys(_ source: CGPDFDictionaryRef) -> [String] {
    final class Box { var keys: [String] = [] }
    let box = Box()
    CGPDFDictionaryApplyFunction(source, { key, _, info in
        guard let info else { return }
        Unmanaged<Box>.fromOpaque(info).takeUnretainedValue().keys.append(String(cString: key))
    }, Unmanaged.passUnretained(box).toOpaque())
    return box.keys.sorted()
}

// MARK: - Registration walks

func measureCandidates(page: CGPDFDictionaryRef) -> JSON {
    var vp: CGPDFArrayRef?
    // /VP is normally an array of viewport dictionaries.
    guard CGPDFDictionaryGetArray(page, "VP", &vp), let vp else {
        // Some producers write a bare dictionary; record that shape too.
        if let single = dictionary(page, "VP") {
            return .array([viewportJSON(single, index: 0)])
        }
        return .array([])
    }
    var out: [JSON] = []
    for index in 0..<CGPDFArrayGetCount(vp) {
        var entry: CGPDFDictionaryRef?
        if CGPDFArrayGetDictionary(vp, index, &entry), let entry {
            out.append(viewportJSON(entry, index: index))
        } else {
            out.append(.object([("index", .number(Double(index))),
                                ("error", .string("not a dictionary"))]))
        }
    }
    return .array(out)
}

func viewportJSON(_ viewport: CGPDFDictionaryRef, index: Int) -> JSON {
    var pairs: [(String, JSON)] = [
        ("index", .number(Double(index))),
        ("keys", .array(keys(viewport).map(JSON.string))),
        ("type", name(viewport, "Type").map(JSON.string) ?? .null),
        ("name", text(viewport, "Name").map(JSON.string) ?? .null),
        ("bbox", numbers(viewport, "BBox").map { .array($0.map(JSON.number)) } ?? .null),
    ]
    guard let measure = dictionary(viewport, "Measure") else {
        pairs.append(("measure", .null))
        return .object(pairs)
    }
    var measurePairs: [(String, JSON)] = [
        ("keys", .array(keys(measure).map(JSON.string))),
        ("type", name(measure, "Type").map(JSON.string) ?? .null),
        ("subtype", name(measure, "Subtype").map(JSON.string) ?? .null),
        ("lpts", numbers(measure, "LPTS").map { .array($0.map(JSON.number)) } ?? .null),
        ("gpts", numbers(measure, "GPTS").map { .array($0.map(JSON.number)) } ?? .null),
        ("bounds", numbers(measure, "Bounds").map { .array($0.map(JSON.number)) } ?? .null),
    ]
    if let gcs = dictionary(measure, "GCS") {
        measurePairs.append(("gcs", .object([
            ("keys", .array(keys(gcs).map(JSON.string))),
            ("type", name(gcs, "Type").map(JSON.string) ?? .null),
            ("epsg", integer(gcs, "EPSG").map { JSON.number(Double($0)) } ?? .null),
            ("wkt", text(gcs, "WKT").map(JSON.string) ?? .null),
        ])))
    } else {
        measurePairs.append(("gcs", .null))
    }
    pairs.append(("measure", .object(measurePairs)))
    return .object(pairs)
}

func lgiCandidates(page: CGPDFDictionaryRef) -> JSON {
    func entryJSON(_ entry: CGPDFDictionaryRef, index: Int) -> JSON {
        var pairs: [(String, JSON)] = [
            ("index", .number(Double(index))),
            ("keys", .array(keys(entry).map(JSON.string))),
            ("type", name(entry, "Type").map(JSON.string) ?? .null),
            ("version", text(entry, "Version").map(JSON.string)
                ?? integer(entry, "Version").map { JSON.number(Double($0)) } ?? .null),
            ("ctm", numbers(entry, "CTM").map { .array($0.map(JSON.number)) } ?? .null),
            ("neatline", numbers(entry, "Neatline").map { .array($0.map(JSON.number)) } ?? .null),
        ]
        if let projection = dictionary(entry, "Projection") {
            pairs.append(("projection", .object([
                ("keys", .array(keys(projection).map(JSON.string))),
                ("type", name(projection, "Type").map(JSON.string) ?? .null),
                ("projectionType", text(projection, "ProjectionType").map(JSON.string) ?? .null),
                ("epsg", integer(projection, "EPSG").map { JSON.number(Double($0)) } ?? .null),
                ("zone", integer(projection, "Zone").map { JSON.number(Double($0)) } ?? .null),
                ("hemisphere", text(projection, "Hemisphere").map(JSON.string) ?? .null),
                ("datum", text(projection, "Datum").map(JSON.string) ?? .null),
            ])))
        } else {
            pairs.append(("projection", .null))
        }
        return .object(pairs)
    }

    var array: CGPDFArrayRef?
    if CGPDFDictionaryGetArray(page, "LGIDict", &array), let array {
        var out: [JSON] = []
        for index in 0..<CGPDFArrayGetCount(array) {
            var entry: CGPDFDictionaryRef?
            if CGPDFArrayGetDictionary(array, index, &entry), let entry {
                out.append(entryJSON(entry, index: index))
            }
        }
        return .array(out)
    }
    // LGIDict may also be a single dictionary rather than an array.
    if let single = dictionary(page, "LGIDict") {
        return .array([entryJSON(single, index: 0)])
    }
    return .array([])
}

// MARK: - Per-file probe

func probe(_ url: URL) -> JSON {
    guard let document = CGPDFDocument(url as CFURL) else {
        return .object([("open", .string("CGPDFDocument(url) returned nil"))])
    }
    var pairs: [(String, JSON)] = [
        ("pageCount", .number(Double(document.numberOfPages))),
        ("isEncrypted", .bool(document.isEncrypted)),
        ("isUnlocked", .bool(document.isUnlocked)),
        ("allowsCopying", .bool(document.allowsCopying)),
    ]
    if let info = document.info, let producer = text(info, "Producer") {
        pairs.append(("producer", .string(producer)))
    } else {
        pairs.append(("producer", .null))
    }

    var pageJSONs: [JSON] = []
    for number in 1...max(document.numberOfPages, 1) {
        guard let page = document.page(at: number), let dict = page.dictionary else { continue }
        let media = page.getBoxRect(.mediaBox)
        let crop = page.getBoxRect(.cropBox)
        pageJSONs.append(.object([
            ("page", .number(Double(number))),
            ("rotation", .number(Double(page.rotationAngle))),
            ("mediaBox", .array([media.minX, media.minY, media.width, media.height].map(JSON.number))),
            ("cropBox", .array([crop.minX, crop.minY, crop.width, crop.height].map(JSON.number))),
            ("pageKeys", .array(keys(dict).map(JSON.string))),
            ("vp", measureCandidates(page: dict)),
            ("lgidict", lgiCandidates(page: dict)),
        ]))
    }
    pairs.append(("pages", .array(pageJSONs)))
    return .object(pairs)
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard !arguments.isEmpty else {
    print("usage: geopdf-probe <dir-or-file.pdf> ...")
    exit(2)
}

var files: [URL] = []
for path in arguments {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) else { continue }
    if isDirectory.boolValue {
        let contents = (try? FileManager.default.contentsOfDirectory(atPath: path)) ?? []
        files += contents.filter { $0.hasSuffix(".pdf") }.sorted()
            .map { URL(fileURLWithPath: path).appendingPathComponent($0) }
    } else {
        files.append(URL(fileURLWithPath: path))
    }
}

let output = JSON.object(files.map { ($0.lastPathComponent, probe($0)) })
print(output.encoded())
