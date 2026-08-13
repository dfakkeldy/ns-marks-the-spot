import Foundation
import GeoCore

/// Ways of handing a mapped point to somebody standing outside the app.
///
/// A port of the web's `googleMaps.ts`, and it stays a port: the strings both
/// surfaces show for the same civic point have to match, or two people reading
/// the same property off two screens would read out different codes.
///
/// Neither of these is evidence. A Plus Code is the Province's coordinate
/// written another way, and directions go to that coordinate — not to a door,
/// a driveway, or a parcel.
public enum PlaceLinks {
    /// Open Location Code's alphabet, in its own order. Not alphabetical, and
    /// not arbitrary: the characters that look alike are left out.
    private static let alphabet = Array("23456789CFGHJMPQRVWX")
    private static let base = 20
    private static let latitudePrecision = 25_000_000
    private static let longitudePrecision = 8_192_000
    private static let latitudeGridRows = 5
    private static let longitudeGridColumns = 4
    private static let gridCodeLength = 5

    /// The full 10-character Plus Code for a point, or `nil` if the point is
    /// not a pair of finite numbers.
    ///
    /// The web throws there; returning `nil` lets the caller leave the code out
    /// rather than take down the panel around it. Either way nothing is shown
    /// for a coordinate that cannot be encoded.
    ///
    /// Google's specification: https://github.com/google/open-location-code
    public static func plusCode(for point: GeoPoint) -> String? {
        guard point.lat.isFinite, point.lng.isFinite else { return nil }

        // `floor` before the conversion, not `Int(...)`: Swift truncates toward
        // zero and JavaScript's `Math.floor` goes toward minus infinity, so a
        // southern or western coordinate would land one cell away from the
        // web's answer for the same point.
        var latitudeValue = Int(floor(point.lat * Double(latitudePrecision)))
            + 90 * latitudePrecision
        latitudeValue = max(0, min(180 * latitudePrecision - 1, latitudeValue))

        var longitudeValue = Int(floor(point.lng * Double(longitudePrecision)))
            + 180 * longitudePrecision
        let longitudeRange = 360 * longitudePrecision
        longitudeValue = ((longitudeValue % longitudeRange) + longitudeRange) % longitudeRange

        latitudeValue /= pow(latitudeGridRows, gridCodeLength)
        longitudeValue /= pow(longitudeGridColumns, gridCodeLength)

        var code = Array(repeating: Character(" "), count: 11)
        code[8] = "+"
        code[9] = alphabet[latitudeValue % base]
        code[10] = alphabet[longitudeValue % base]
        latitudeValue /= base
        longitudeValue /= base

        for index in stride(from: 6, through: 0, by: -2) {
            code[index] = alphabet[latitudeValue % base]
            code[index + 1] = alphabet[longitudeValue % base]
            latitudeValue /= base
            longitudeValue /= base
        }
        return String(code)
    }

    /// Driving directions to a mapped point.
    ///
    /// To the coordinate the Province published, which is what the app knows.
    /// Where that coordinate sits on a property — the building, the driveway,
    /// the lot centre — is the file's business and varies by record.
    public static func directionsURL(for point: GeoPoint) -> URL? {
        guard point.lat.isFinite, point.lng.isFinite else { return nil }
        let destination = "\(ArcGISExportURL.jsNumber(point.lat)),"
            + ArcGISExportURL.jsNumber(point.lng)
        let query = [
            ("api", "1"),
            ("destination", destination),
            ("dir_action", "navigate"),
        ]
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        return URL(string: "https://www.google.com/maps/dir/?\(query)")
    }

    private static func pow(_ base: Int, _ exponent: Int) -> Int {
        (0..<exponent).reduce(1) { result, _ in result * base }
    }
}
