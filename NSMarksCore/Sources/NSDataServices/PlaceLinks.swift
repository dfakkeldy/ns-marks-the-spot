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

        // The clamp and the wrap happen in `Double`, before anything becomes an
        // `Int`. Two reasons, and the second is the one that bites: JavaScript
        // does this whole calculation in doubles, so staying in doubles is the
        // faithful port — and a latitude of 1e12, which the civic decoder would
        // pass as a finite number, scales past `Int.max` and traps the app on
        // the way in. Nothing survives the clamp above 4.5e9.
        //
        // `floor` rather than `Int(...)`: Swift truncates toward zero and
        // JavaScript's `Math.floor` goes toward minus infinity, so a southern
        // or western coordinate would land one cell away from the web's answer
        // for the same point.
        let latitudeCeiling = Double(180 * latitudePrecision - 1)
        let scaledLatitude = floor(point.lat * Double(latitudePrecision))
            + Double(90 * latitudePrecision)
        let longitudeRange = Double(360 * longitudePrecision)
        let scaledLongitude = floor(point.lng * Double(longitudePrecision))
            + Double(180 * longitudePrecision)
        // A coordinate near the top of `Double` overflows the scaling to
        // infinity, and the wrap below turns that into a NaN. The web writes
        // the string "undefined" into the code at that point; `nil` is the
        // same statement — no code could be made — without the garbage.
        guard scaledLatitude.isFinite, scaledLongitude.isFinite else { return nil }

        var latitudeValue = Int(max(0, min(latitudeCeiling, scaledLatitude)))

        // `truncatingRemainder` is JavaScript's `%` — both truncate toward
        // zero, so the doubled modulo brings a negative value back into range
        // exactly as the web's does.
        let wrapped = scaledLongitude.truncatingRemainder(dividingBy: longitudeRange)
        var longitudeValue = Int(
            (wrapped + longitudeRange).truncatingRemainder(dividingBy: longitudeRange)
        )

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
        let destination = "\(coordinate(point.lat)),\(coordinate(point.lng))"
        let query = [
            ("api", "1"),
            ("destination", destination),
            ("dir_action", "navigate"),
        ]
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        return URL(string: "https://www.google.com/maps/dir/?\(query)")
    }

    /// The parcel's page on ViewPoint, or `nil` when the PID is not eight
    /// digits.
    ///
    /// A commercial listing site, not a record source. What it shows about a
    /// parcel is its own; nothing there is evidence in this app's sense, and a
    /// page that exists is not a statement that the property is for sale.
    ///
    /// The eight-digit rule is theirs: the URL is keyed on a full PID, and a
    /// partial one would open somebody else's parcel rather than fail.
    public static func viewpointParcelURL(pid: String) -> URL? {
        guard pid.count == 8, pid.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        return URL(string: "https://www.viewpoint.ca/show/property/\(pid)")
    }

    /// A latitude or longitude written the way JavaScript writes it.
    ///
    /// `ArcGISExportURL.jsNumber` is not reusable here. It is byte-matched for
    /// Web Mercator metres, whose magnitudes never approach zero, and its own
    /// documentation says so. Degrees do approach zero, and that is where the
    /// two languages part company twice over: Swift writes `1e-05` where
    /// JavaScript writes `0.00001`, and where both use an exponent Swift pads it
    /// to two digits — `1e-07` against JavaScript's `1e-7`. The prime meridian
    /// and the equator are exactly the coordinates in that gap.
    ///
    /// Exact for any coordinate, which is what this is for: `|value| ≤ 180`
    /// leaves the large-magnitude corners of JavaScript's own rule — the switch
    /// to an exponent above 1e21 — unreachable.
    static func coordinate(_ value: Double) -> String {
        // The whole-number case JavaScript writes without a fraction. The bound
        // is where `Double` stops holding consecutive integers; above it the
        // shortest-round-trip digits and the exact value diverge, and no
        // coordinate is up there.
        if value == value.rounded(), abs(value) < 9e15 { return String(Int64(value)) }

        let written = "\(value)"
        guard let marker = written.firstIndex(of: "e") else { return written }
        let mantissa = String(written[written.startIndex..<marker])
        guard let exponent = Int(written[written.index(after: marker)...]) else { return written }

        // JavaScript writes a decimal down to 1e-6 and only then reaches for an
        // exponent. Swift gives up four orders of magnitude earlier, so the
        // range in between has to be expanded by hand.
        guard exponent < 0 else { return written }
        guard exponent >= -6 else {
            // Both write an exponent here. Only the padding differs.
            return "\(mantissa)e\(exponent)"
        }

        let negative = mantissa.hasPrefix("-")
        let unsigned = mantissa.drop(while: { $0 == "-" })
        let leadingDigits = unsigned.prefix(while: { $0 != "." }).count
        let zeros = String(repeating: "0", count: -exponent - leadingDigits)
        return (negative ? "-0." : "0.") + zeros + unsigned.filter { $0 != "." }
    }

    private static func pow(_ base: Int, _ exponent: Int) -> Int {
        (0..<exponent).reduce(1) { result, _ in result * base }
    }
}
