import Foundation
import GeoCore

/// Asks the Nova Scotia Civic Address File where the civic points are.
///
/// A port of the query half of the web's `civicAddresses.ts`. Two questions are
/// asked of the same Socrata dataset: which civic points fall inside a parcel,
/// and which ones match what somebody typed.
///
/// Unlike NSPRD and NSTDB this dataset is published under the Open Government
/// Licence – Nova Scotia, which needs attribution but no acceptance gate, so
/// nothing here takes a `ProvinceLicenceClearance`. That is the web's reading
/// too, written down in its `provinceLicense` module.
public enum CivicAddressQuery {
    /// The dataset's own page, which is where its licence and currency are
    /// stated. Shown rather than linked-to-implicitly: a civic point is evidence
    /// about a Province record, and the record has to be findable.
    public static let datasetURL = URL(
        string: "https://data.novascotia.ca/Municipalities/Nova-Scotia-Civic-Address-File-Civic-Points/tntn-er5g"
    )!

    /// The licence itself, not the dataset page that names it. Kept separate
    /// because a line reading "Open Government Licence" that opens a dataset
    /// has told the reader where the terms are and then not taken them there.
    public static let licenceURL = URL(
        string: "https://support.novascotia.ca/services/open-data-portal-licence"
    )!

    /// The attribution the licence requires, in the licence's own words. Owed
    /// wherever these addresses are shown, which is the search list as well as
    /// the parcel panel.
    public static let attribution =
        "Contains information licensed under the Open Government Licence – Nova Scotia."

    static let geoJSONURL = "https://data.novascotia.ca/resource/tntn-er5g.geojson"

    /// The columns asked for, in the web's order — the order is part of the
    /// request string both surfaces send.
    public static let fields = [
        "the_geom", "pntid", "civicnum", "civsuffix", "unit_num", "add_loc",
        "strprefix", "strname", "strsuffix", "strdir", "comm", "mun", "county",
    ]

    /// Socrata's page size for the bounded query, and the number of search
    /// results kept.
    public static let pageSize = 1_000
    public static let searchLimit = 12

    /// Why no request was produced.
    public enum Refusal: Error, Equatable, Sendable {
        /// Under three characters. Two letters match half the province, and the
        /// dataset would answer with whatever twelve rows sorted first.
        case queryTooShort
        /// The parcel has no boundary to bound a query with. Distinct from a
        /// query that found nothing: nothing was asked, so nothing was learned.
        case noBoundary
        case malformedURL
    }

    /// The north/west/south/east box Socrata's `within_box` wants.
    public struct Bounds: Sendable, Equatable {
        public let north: Double
        public let west: Double
        public let south: Double
        public let east: Double

        public init(north: Double, west: Double, south: Double, east: Double) {
            self.north = north
            self.west = west
            self.south = south
            self.east = east
        }
    }

    /// One page of the civic points inside `bounds`.
    public static func boundedQueryURL(
        _ bounds: Bounds,
        limit: Int = pageSize,
        offset: Int = 0
    ) throws(Refusal) -> URL {
        try url(with: [
            ("$select", fields.joined(separator: ",")),
            (
                "$where",
                "within_box(the_geom,\(number(bounds.north)),\(number(bounds.west)),"
                    + "\(number(bounds.south)),\(number(bounds.east)))"
            ),
            ("$order", "pntid"),
            ("$limit", String(limit)),
            ("$offset", String(offset)),
        ])
    }

    /// The civic points matching typed text.
    ///
    /// A leading civic number is pulled out of the full-text query and asked as
    /// an exact column match, because Socrata's full-text index would otherwise
    /// return every address on the street and rank `11064` no higher than
    /// `110640`.
    public static func searchURL(
        _ query: String,
        limit: Int = searchLimit,
        suggest: Bool = false
    ) throws(Refusal) -> URL {
        let normalized = normalize(query)
        // JavaScript's `.length`, so a three-character search means the same
        // thing on both surfaces.
        guard normalized.utf16.count >= 3 else { throw .queryTooShort }

        let leading = leadingCivicNumber(in: normalized)
        let fullText = leading?.rest ?? normalized
        var parameters: [(String, String)] = [
            ("$select", fields.joined(separator: ",")),
            ("$q", fullText),
            ("$order", "pntid"),
            ("$limit", String(limit)),
        ]
        if let leading {
            parameters.append((
                "$where",
                leading.suffix.isEmpty
                    ? "civicnum=\(leading.number)"
                    : "civicnum=\(leading.number) AND upper(civsuffix)='\(leading.suffix)'"
            ))
        }
        if suggest, let prefix = suggestionPrefix(in: fullText) {
            let completed = String(fullText.dropLast(prefix.count))
                .trimmingCharacters(in: .whitespaces)
            parameters.removeAll { $0.0 == "$q" }
            if !completed.isEmpty {
                parameters.append(("$q", officialSpelling(of: completed) ?? completed))
            }
            // Alphabetic input only. Civic numbers and suffixes keep their
            // exact predicates; the last word may match a word's beginning.
            let term = prefix.uppercased()
            let prefixWhere = ["strprefix", "strname", "strsuffix", "strdir", "comm", "mun", "county"]
                .map { "(starts_with(upper(\($0)),'\(term)') OR upper(\($0)) like '% \(term)%')" }
                .joined(separator: " OR ")
            let civicWhere = parameters.first { $0.0 == "$where" }?.1
            parameters.removeAll { $0.0 == "$where" }
            parameters.append(("$where", (civicWhere.map { "\($0) AND " } ?? "") + "(\(prefixWhere))"))
        }
        return try url(with: parameters)
    }

    static func suggestionPrefix(in query: String) -> String? {
        JSRegex.firstMatch(#"(?:^|\s)([a-zA-Z]+)$"#, in: normalize(query))?[1]
    }

    /// A second spelling of the same search, or `nil` if it would be identical.
    ///
    /// The file records official road names — `Highway 19`, `D.R.'s Lane` — and
    /// people type `hwy 19` and `dr's`. The first query is what was typed; this
    /// one is what the Province would have written, and the caller only sends it
    /// when the first found nothing.
    public static func officialSpelling(of query: String) -> String? {
        let normalized = normalize(query)
        let spelled = JSRegex.replacingAll(
            #"\b([a-z]{2,4})'s\b"#,
            in: expandRoadAliases(normalized),
            caseInsensitive: true
        ) { match in
            // `dr's` is how someone types `D.R.'s`, which is how the file
            // spells it. The letters before the apostrophe become initials.
            let initials = match.uppercased().dropLast(2)
            return initials.map(String.init).joined(separator: ".") + ".'s"
        }
        return spelled == normalized ? nil : spelled
    }

    // MARK: - The pieces

    /// Trimmed, with curly apostrophes straightened and runs of whitespace
    /// collapsed. Typing on iOS produces `’` by default, and the dataset stores
    /// `'`.
    static func normalize(_ query: String) -> String {
        query
            .replacingOccurrences(of: "\u{2018}", with: "'")
            .replacingOccurrences(of: "\u{2019}", with: "'")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// `hwy` and `route 19` as the file spells them.
    static func expandRoadAliases(_ value: String) -> String {
        let withoutHwy = JSRegex.replacingAll(
            #"\bhwy\b"#, in: value, caseInsensitive: true
        ) { _ in "Highway" }
        return JSRegex.replacingAll(
            #"\broute(?=\s+\d+[a-z]?\b)"#, in: withoutHwy, caseInsensitive: true
        ) { _ in "Highway" }
    }

    /// The web's `/^(\d+)([a-z]?)\s+(.{2,})$/iu`.
    ///
    /// A number with nothing after it is not split off — `11064` alone stays a
    /// full-text search, since the file's full-text index is the only thing that
    /// can tell which street it belongs to.
    static func leadingCivicNumber(
        in query: String
    ) -> (number: Int, suffix: String, rest: String)? {
        guard let match = JSRegex.firstMatch(#"^(\d+)([a-zA-Z]?)\s+(.{2,})$"#, in: query),
              match.count == 4,
              // More digits than an integer holds is not a civic number. The
              // whole string stays a full-text search rather than becoming a
              // `civicnum=` filter for a number nobody typed.
              let number = Int(match[1])
        else { return nil }
        return (number, match[2].uppercased(), match[3])
    }

    /// `Number(...)` for the box, which prints integral values without a
    /// trailing `.0`.
    static func number(_ value: Double) -> String {
        ArcGISExportURL.jsNumber(value)
    }

    private static func url(with parameters: [(String, String)]) throws(Refusal) -> URL {
        let query = parameters
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        guard let url = URL(string: "\(geoJSONURL)?\(query)") else { throw .malformedURL }
        return url
    }
}

// MARK: - Regex helpers

/// Enough of JavaScript's regular expressions to port the ones that decide what
/// a typed address means.
///
/// These rules are a user-visible contract — the same text has to find the same
/// address on both surfaces — so they are transcribed rather than reimplemented
/// as Swift string logic, and these two functions are what transcribing needs
/// that `range(of:options:.regularExpression)` cannot do: capture groups, and a
/// replacement computed from the match.
enum JSRegex {
    /// The whole match followed by its capture groups, or `nil`. A group that
    /// did not participate comes back as an empty string, as in JavaScript it
    /// would be `undefined` and every caller here defaults it away.
    static func firstMatch(_ pattern: String, in value: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(
                in: value, range: NSRange(value.startIndex..., in: value)
              )
        else { return nil }

        return (0..<match.numberOfRanges).map { index in
            guard let range = Range(match.range(at: index), in: value) else { return "" }
            return String(value[range])
        }
    }

    /// Every match replaced by `transform`, which receives the matched text.
    static func replacingAll(
        _ pattern: String,
        in value: String,
        caseInsensitive: Bool = false,
        with transform: (String) -> String
    ) -> String {
        guard let regex = try? NSRegularExpression(
            pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : []
        ) else { return value }

        var result = ""
        var consumed = value.startIndex
        for match in regex.matches(in: value, range: NSRange(value.startIndex..., in: value)) {
            guard let range = Range(match.range, in: value) else { continue }
            result += value[consumed..<range.lowerBound]
            result += transform(String(value[range]))
            consumed = range.upperBound
        }
        result += value[consumed...]
        return result
    }
}
