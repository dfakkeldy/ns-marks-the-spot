import Foundation

/// Asks PVSC's residential dwelling dataset what is on the accounts an
/// assessment lookup already matched.
///
/// A port of the web's `pvscDwellings.ts`. This question is downstream of the
/// assessment one and cannot be asked without it: the dataset is keyed by
/// account number, not by geometry, so a parcel with no matched account has
/// nothing to ask about — which is not the same as a parcel with no building.
///
/// The dataset is residential only. A parcel carrying a shop, a barn, or a
/// hunting camp answers this question with nothing, and the wording that
/// reaches the screen has to survive that.
///
/// Open Data & Information Government Licence – PVSC & Participating
/// Municipalities, the same as the assessment dataset: attribution required,
/// acceptance not.
public enum PVSCDwellingQuery {
    public static let datasetURL = URL(
        string: "https://www.thedatazone.ca/Assessment/"
            + "Residential-Dwelling-Characteristics/a859-xvcs"
    )!

    /// When the copy of the dataset these queries read was last published.
    public static let sourceDate = "Dataset updated January 12, 2026"

    static let apiURL = "https://www.thedatazone.ca/resource/a859-xvcs.json"

    static let fields =
        "aan,year_built,style,square_foot_living_area,living_units,bathrooms,"
            + "garage,under_construction"

    /// Rows asked for. The web's `DWELLING_QUERY_LIMIT`, and it is a ceiling
    /// rather than a page: there is no second request, so a parcel with more
    /// than a hundred dwelling records would be listed short.
    public static let limit = 100

    public enum Refusal: Error, Equatable, Sendable {
        /// Not one of the account numbers was usable, so there is nothing to
        /// ask about. Nothing was asked and nothing was learned.
        case noAccounts
        case malformedURL
    }

    /// The accounts to ask about, in first-seen order with duplicates dropped.
    static func accountNumbers(_ values: [String]) -> [String] {
        var seen: Set<String> = []
        return values.compactMap(PVSCAssessmentQuery.normalizeAAN).filter { seen.insert($0).inserted }
    }

    public static func url(forAANs values: [String]) throws(Refusal) -> URL {
        let accounts = accountNumbers(values)
        guard !accounts.isEmpty else { throw .noAccounts }

        let list = accounts.map { "'\($0)'" }.joined(separator: ",")
        let query = [
            ("$select", fields),
            ("$where", "aan in(\(list))"),
            ("$order", "aan,year_built DESC"),
            ("$limit", String(limit)),
        ]
        .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
        .joined(separator: "&")

        guard let url = URL(string: "\(apiURL)?\(query)") else { throw .malformedURL }
        return url
    }
}
