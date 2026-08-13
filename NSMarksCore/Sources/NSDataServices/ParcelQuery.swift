import Foundation
import GeoCore
import MapCatalog

/// Addresses the NSPRD parcel layer's `/query` endpoint.
///
/// Every entry point takes a `ProvinceLicenceClearance` and checks it before it
/// assembles anything, for the same reason `TileRequestFactory` does: NSPRD is
/// Province-restricted, and a code path that builds the URL first would leave
/// the address lying around as a value even when the user has not agreed to the
/// licence. Refusing early means there is nothing to log or retry by accident.
///
/// The query strings are byte-compatible with the web's `nsprd.ts`, not merely
/// equivalent — same parameters, same order, same `URLSearchParams` encoding.
/// That makes a URL from the browser's network tab and a URL from the phone the
/// same string, which is the difference between comparing two bug reports and
/// re-deriving both.
public enum ParcelQuery {
    /// PIDs per request, matching the web's `NSPRD_PID_BATCH_SIZE`.
    ///
    /// The ceiling is the service's `where` clause length, not politeness, so
    /// this is a parity constant rather than a tunable.
    public static let pidBatchSize = 40

    /// Why a query was not produced.
    public enum Refusal: Error, Equatable, Sendable {
        /// NSPRD is Province-restricted and the user has not accepted.
        case licenceNotAccepted
        /// Nothing in the input parsed as an eight-digit PID.
        case noValidPID
        /// A latitude outside ±90, a longitude outside ±180, or a non-finite one.
        case invalidCoordinate
        /// The catalog has no NSPRD descriptor, or it carries no service URL.
        case noServiceURL
        case malformedURL
    }

    /// The feature layer the web calls `NSPRD_LAYER_URL`.
    ///
    /// Derived from the catalog descriptor rather than written out again: the
    /// map draws this service and the inspector queries it, and those two must
    /// not be able to drift onto different hosts. `ParcelQueryTests` pins the
    /// derived string against the web's literal.
    static var layerURL: URL? {
        guard let service = LayerCatalog.descriptor(for: .nsprd)?.serviceURL else {
            return nil
        }
        var base = service.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }
        return URL(string: "\(base)/0")
    }

    /// The digits of an eight-digit PID, or `nil`.
    ///
    /// A port of the web's `normalizePid`, including its shape: anything that is
    /// not digits, spaces or hyphens is rejected outright rather than stripped,
    /// so `PID 12345678` fails instead of quietly succeeding. Typing a label and
    /// getting a silent match on the number inside it is how you end up
    /// researching the wrong parcel.
    public static func normalizePID(_ value: String) -> String? {
        var digits = ""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "0"..."9":
                digits.unicodeScalars.append(scalar)
            case "-":
                continue
            case _ where isJSWhitespace(scalar):
                continue
            default:
                return nil
            }
        }
        guard digits.count == 8 else { return nil }
        return digits
    }

    /// The valid PIDs in `values`, first spelling wins, order preserved.
    ///
    /// Matches `Array.from(new Set(...))`: JavaScript's `Set` iterates in
    /// insertion order, so the batches the phone sends line up with the web's
    /// and a captured request can be compared request-for-request.
    public static func normalizedPIDs(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for value in values {
            guard let pid = normalizePID(value), seen.insert(pid).inserted else {
                continue
            }
            ordered.append(pid)
        }
        return ordered
    }

    /// `pids` split into request-sized groups, already normalized.
    public static func batches(of pids: [String]) -> [[String]] {
        let normalized = normalizedPIDs(pids)
        return stride(from: 0, to: normalized.count, by: pidBatchSize).map { start in
            Array(normalized[start..<min(start + pidBatchSize, normalized.count)])
        }
    }

    /// Every request needed to fetch `pids`, in batch order.
    public static func pidQueryURLs(
        pids: [String],
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> [URL] {
        guard clearance.allows(.nsprd) else { throw .licenceNotAccepted }
        let groups = batches(of: pids)
        guard !groups.isEmpty else { throw .noValidPID }

        var urls: [URL] = []
        urls.reserveCapacity(groups.count)
        for group in groups {
            urls.append(try pidQueryURL(normalizedPIDs: group))
        }
        return urls
    }

    /// One request for up to `pidBatchSize` PIDs.
    public static func pidQueryURL(
        pids: [String],
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> URL {
        guard clearance.allows(.nsprd) else { throw .licenceNotAccepted }
        let normalized = normalizedPIDs(pids)
        guard !normalized.isEmpty else { throw .noValidPID }
        return try pidQueryURL(normalizedPIDs: normalized)
    }

    /// The parcel under a tapped point.
    public static func pointQueryURL(
        latitude: Double,
        longitude: Double,
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> URL {
        guard clearance.allows(.nsprd) else { throw .licenceNotAccepted }
        guard latitude.isFinite, latitude >= -90, latitude <= 90 else {
            throw .invalidCoordinate
        }
        guard longitude.isFinite, longitude >= -180, longitude <= 180 else {
            throw .invalidCoordinate
        }

        return try query([
            ("where", "1=1"),
            ("geometry", "\(ArcGISExportURL.jsNumber(longitude)),\(ArcGISExportURL.jsNumber(latitude))"),
            ("geometryType", "esriGeometryPoint"),
            ("inSR", "4326"),
            ("spatialRel", "esriSpatialRelIntersects"),
            ("outFields", outFields),
            ("returnGeometry", "true"),
            ("outSR", "4326"),
            ("f", "geojson"),
        ])
    }

    private static let outFields = "PID,UPDAT_DATE,SHAPE.AREA"

    private static func pidQueryURL(normalizedPIDs pids: [String]) throws(Refusal) -> URL {
        let list = pids.map { "'\($0)'" }.joined(separator: ",")
        return try query([
            ("where", "PID IN (\(list))"),
            ("outFields", outFields),
            ("returnGeometry", "true"),
            ("outSR", "4326"),
            ("f", "geojson"),
        ])
    }

    /// Insertion order is the web's order, and it is part of the byte match.
    private static func query(_ parameters: [(String, String)]) throws(Refusal) -> URL {
        guard let layerURL else { throw .noServiceURL }
        let encoded = parameters
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        guard let url = URL(string: "\(layerURL.absoluteString)/query?\(encoded)") else {
            throw .malformedURL
        }
        return url
    }

    /// JavaScript's `\s`, which is not any of Foundation's whitespace sets.
    ///
    /// It carries the Unicode space separators *and* the byte-order mark, which
    /// `CharacterSet.whitespacesAndNewlines` omits — and a BOM is exactly what
    /// arrives when a PID is pasted out of a spreadsheet export. Matching the
    /// web here means the same paste succeeds on both surfaces.
    static func isJSWhitespace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar {
        case " ", "\t", "\n", "\r", "\u{0B}", "\u{0C}",
             "\u{A0}", "\u{1680}", "\u{2028}", "\u{2029}",
             "\u{202F}", "\u{205F}", "\u{3000}", "\u{FEFF}":
            return true
        case "\u{2000}"..."\u{200A}":
            return true
        default:
            return false
        }
    }
}
