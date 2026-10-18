import Foundation
import GeoCore

/// Asks PVSC's open dataset what assessment accounts are on record.
///
/// A port of the web's `pvscAssessments.ts`. Two questions, and they are not
/// the same question:
///
/// - by AAN, when a tax-sale notice named one. The notice is the Province's own
///   link between a sale and an account, and the answer is about that account.
/// - by geometry, when nothing named one. PVSC publishes a point per account;
///   a point falling inside a parcel outline is where PVSC put the point, and
///   nothing more. It is a match on a map, not on a title.
///
/// The distinction survives all the way to the screen because it is the
/// difference between reading a record and inferring one.
///
/// Open Data & Information Government Licence – PVSC & Participating
/// Municipalities: attribution is required, acceptance is not, so this takes no
/// `ProvinceLicenceClearance`.
public enum PVSCAssessmentQuery {
    public static let datasetURL = URL(
        string: "https://www.thedatazone.ca/Assessment/"
            + "Assessed-Value-and-Taxable-Assessed-Value-History/bt58-qu28"
    )!

    public static let licenceURL = URL(
        string: "https://www.pvsc.ca/sites/default/files/shared/"
            + "Open%20Data%20and%20Information%20Government%20Licence%20-%20"
            + "PVSC%20and%20Participating%20Municipalities.pdf"
    )!

    /// The attribution the licence requires, in the licence's own words.
    public static let attribution =
        "Contains information licensed under the Open Data & Information "
            + "Government Licence – PVSC & Participating Municipalities."

    /// When the copy of the dataset these queries read was last published.
    /// Shown beside the figures: an assessment is a dated record.
    public static let sourceDate = "Dataset updated January 12, 2026"

    static let apiURL = "https://www.thedatazone.ca/resource/bt58-qu28.json"

    /// The columns asked for, in the web's order — the order is part of the
    /// request string both surfaces send.
    static let fields = "aan,tax_year,assessed_value,taxable_assessed_value,x_coord,y_coord"

    /// Rows per spatial page. The web's `PVSC_SPATIAL_PAGE_SIZE`.
    public static let pageSize = 1_000

    /// Years of history asked for by AAN. The web's `$limit`.
    static let historyLimit = 10

    public enum Refusal: Error, Equatable, Sendable {
        /// The text is not an Assessment Account Number.
        case notAnAAN
        /// The parcel has no rings, so there is no box to ask about. Nothing
        /// was asked and nothing was learned.
        case noBoundary
        case malformedURL
    }

    /// The eight digits of an AAN, or `nil`.
    ///
    /// Short numbers are padded, because the dataset stores them padded and a
    /// notice may print them without the leading zeros. A number with a letter
    /// in it is not an AAN — same rule as `ParcelQuery.normalizePID`, and for
    /// the same reason: guessing at what a label meant would attach one
    /// account's values to another account's number.
    ///
    /// ASCII digits only, scalar by scalar rather than by `\d` or `isNumber`.
    /// Foundation counts every Unicode decimal digit; JavaScript's `/\d/u` does
    /// not, so `"١٢٣٤"` is refused on the web and would otherwise be padded and
    /// sent from here as though it were an account number somebody wrote down.
    public static func normalizeAAN(_ value: String) -> String? {
        var digits = ""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "0"..."9":
                digits.unicodeScalars.append(scalar)
            case "-":
                continue
            case _ where ParcelQuery.isJSWhitespace(scalar):
                continue
            default:
                return nil
            }
        }
        guard (1...8).contains(digits.count) else { return nil }
        return String(repeating: "0", count: 8 - digits.count) + digits
    }

    /// Up to `historyLimit` years for one account, newest first.
    public static func historyURL(forAAN value: String) throws(Refusal) -> URL {
        guard let aan = normalizeAAN(value) else { throw .notAnAAN }
        return try url([
            ("$select", fields),
            ("$where", "aan='\(aan)'"),
            ("$order", "tax_year DESC"),
            ("$limit", String(historyLimit)),
        ])
    }

    /// One page of the accounts whose published point falls in `bounds`.
    ///
    /// A box, because Socrata answers boxes. Which of the returned points are
    /// actually inside the parcel is decided against the rings afterwards.
    public static func boundedQueryURL(
        _ bounds: CivicAddressQuery.Bounds,
        offset: Int
    ) throws(Refusal) -> URL {
        guard bounds.north.isFinite, bounds.west.isFinite,
              bounds.south.isFinite, bounds.east.isFinite else {
            throw .noBoundary
        }
        return try url([
            ("$select", fields),
            (
                "$where",
                "within_box(location,\(number(bounds.north)),\(number(bounds.west)),"
                    + "\(number(bounds.south)),\(number(bounds.east)))"
            ),
            ("$order", "aan,tax_year DESC"),
            ("$limit", String(pageSize)),
            ("$offset", String(offset)),
        ])
    }

    /// `Number(...)` for the box, which prints integral values without a
    /// trailing `.0`.
    static func number(_ value: Double) -> String {
        ArcGISExportURL.jsNumber(value)
    }

    private static func url(_ parameters: [(String, String)]) throws(Refusal) -> URL {
        let query = parameters
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        guard let url = URL(string: "\(apiURL)?\(query)") else { throw .malformedURL }
        return url
    }
}
