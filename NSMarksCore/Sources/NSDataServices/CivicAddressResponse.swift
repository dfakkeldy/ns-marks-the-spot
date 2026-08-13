import Foundation
import GeoCore

/// What the Civic Address File says, and how it is spelled out.
///
/// The formatting rules are a port of the web's `civicAddresses.ts`. They decide
/// the words under a search result and in the parcel inspector, so a rule that
/// differs between the surfaces produces two different addresses for the same
/// Province record.
public enum CivicAddressResponse {
    /// One civic point: a Province record of an address, at the coordinate the
    /// Province placed it.
    ///
    /// A civic point is not a parcel, a building, or a door. `placement` says
    /// what the coordinate was put on — often a building centroid, sometimes the
    /// driveway entrance — and it is kept out of the address text for that
    /// reason.
    public struct CivicAddress: Sendable, Equatable {
        public let pntid: String
        public let coordinate: GeoPoint
        public let label: String
        public let properties: Properties

        /// The road name alone, for the access context in the inspector, or
        /// `nil` when the record has no street.
        public var roadName: String? { properties.roadName }
    }

    /// The columns asked for, trimmed at decode. A column the file left blank,
    /// or filled with its `-` placeholder, arrives as `nil` rather than as text
    /// that would be printed.
    public struct Properties: Sendable, Equatable {
        public let pntid: String?
        public let civicNumber: String?
        public let civicSuffix: String?
        public let unitNumber: String?
        /// `add_loc`: where on the property the point was placed. Deliberately
        /// absent from `label` — "Building Centroid" is metadata about the dot,
        /// not part of anybody's address.
        public let placement: String?
        public let streetPrefix: String?
        public let streetName: String?
        public let streetSuffix: String?
        public let streetDirection: String?
        public let community: String?
        public let municipality: String?
        public let county: String?

        /// The web's `formatCivicRoadName`.
        public var roadName: String? {
            let name = [streetPrefix, streetName, streetSuffix, streetDirection]
                .compactMap(\.self)
                .joined(separator: " ")
            return name.isEmpty ? nil : name
        }
    }

    public enum Failure: Error, Equatable, Sendable {
        /// Not JSON, or not a GeoJSON feature collection.
        case malformed
        /// A feature collection carrying rows, none of which could be read.
        ///
        /// Distinct from `malformed` and from an empty collection, because it
        /// is neither: the file had something to say and this build could not
        /// read it. Reporting it as an empty result would turn a parsing defect
        /// into "there is no such address".
        case unusableRows(Int)
    }

    /// One reply: the addresses in it, and how many rows it actually carried.
    ///
    /// The two counts differ, and the difference matters. `rowCount` is what
    /// decides whether Socrata has more pages, so it counts rows as sent —
    /// counting only the usable ones would end the paging run early and drop
    /// addresses that were there.
    public struct Page: Sendable, Equatable {
        public let addresses: [CivicAddress]
        public let rowCount: Int
    }

    /// Every civic point in a reply, in the order the file returned them.
    ///
    /// Features without a `pntid` or without a usable coordinate are dropped:
    /// there is nothing to identify or place them with, and a point at the
    /// origin would draw itself in the Gulf of Guinea.
    public static func page(from data: Data) throws(Failure) -> Page {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformed
        }
        guard payload.type == "FeatureCollection", let features = payload.features else {
            throw .malformed
        }

        return Page(addresses: features.compactMap(address(from:)), rowCount: features.count)
    }

    static func address(from feature: Payload.Feature) -> CivicAddress? {
        let properties = Properties(feature.properties)
        guard let pntid = properties.pntid,
              let coordinates = feature.geometry?.coordinates,
              coordinates.count >= 2,
              coordinates[0].isFinite, coordinates[1].isFinite
        else { return nil }

        let label = format(properties)
        return CivicAddress(
            pntid: pntid,
            // GeoJSON positions are [longitude, latitude].
            coordinate: GeoPoint(lat: coordinates[1], lng: coordinates[0]),
            // A record with no street, community, or county still exists and
            // still has a place on the map; it just cannot be written as an
            // address.
            label: label.isEmpty ? "Mapped civic point" : label,
            properties: properties
        )
    }

    /// The web's `formatCivicAddress`.
    ///
    /// Segments repeat constantly in this file — a community and a municipality
    /// are often the same word — so each part is added once, compared without
    /// case. That is why `Mabou, Mabou, Inverness County` comes out as
    /// `Mabou, Inverness County`.
    public static func format(_ properties: Properties) -> String {
        let numbered = properties.civicNumber.map {
            $0 + (properties.civicSuffix ?? "")
        }
        let street = unique([
            numbered,
            properties.streetPrefix,
            properties.streetName,
            properties.streetSuffix,
            properties.streetDirection,
        ]).joined(separator: " ")

        let unit = properties.unitNumber.map { value in
            value.range(of: #"^unit\b"#, options: [.regularExpression, .caseInsensitive]) != nil
                ? value
                : "Unit \(value)"
        }

        return unique([
            unit,
            street.isEmpty ? nil : street,
            properties.community,
            properties.municipality,
            properties.county,
        ]).joined(separator: ", ")
    }

    static func unique(_ values: [String?]) -> [String] {
        var seen = Set<String>()
        return values.compactMap(\.self).filter { seen.insert($0.lowercased()).inserted }
    }

    // MARK: - Ranking

    /// The results worth showing for `query`, best first.
    ///
    /// Socrata's full-text search is generous — asking for `Highway 19` returns
    /// everything with a `19` in it — so the ranking is what makes the list
    /// usable. It only ever discards and reorders what the file returned; it
    /// never invents a match.
    public static func ranked(_ addresses: [CivicAddress], for query: String) -> [CivicAddress] {
        var seen = Set<String>()
        let scored = addresses
            .filter { seen.insert($0.pntid).inserted }
            .map { (address: $0, score: matchScore($0, query: query)) }
            .filter { $0.score > 0 }
            .enumerated()
            .sorted { left, right in
                if left.element.score != right.element.score {
                    return left.element.score > right.element.score
                }
                let order = left.element.address.label.compare(
                    right.element.address.label,
                    options: [],
                    range: nil,
                    locale: Locale(identifier: "en_CA")
                )
                // The index tiebreak keeps two records with the same words in
                // the order the file returned them, rather than in whatever
                // order the sort happened to leave them.
                return order == .orderedSame ? left.offset < right.offset : order == .orderedAscending
            }
            .map(\.element)

        // An exact road-name match crowds out the merely-plausible; a list with
        // no exact match at all keeps everything, since there is nothing better
        // to prefer.
        let best = scored.first?.score ?? 0
        return scored
            .filter { best <= 1 || $0.score == best }
            .prefix(CivicAddressQuery.searchLimit)
            .map(\.address)
    }

    /// 3 for the road itself, 2 for a road starting with what was typed, 1 for
    /// an address containing every word of it, 0 for no match.
    static func matchScore(_ address: CivicAddress, query: String) -> Int {
        let queryKey = matchKey(query)
        let queryTerms = queryKey.split(separator: " ").map(String.init)
        let labelTerms = Set(matchKey(address.label).split(separator: " ").map(String.init))
        guard !queryTerms.isEmpty, queryTerms.allSatisfy(labelTerms.contains) else { return 0 }

        let roadKey = matchKey(address.roadName ?? "")
        if roadKey == queryKey { return 3 }
        if roadKey.hasPrefix("\(queryKey) ") { return 2 }
        return 1
    }

    /// Text reduced to what two spellings of the same road have in common:
    /// accents decomposed and dropped, case folded, punctuation removed.
    ///
    /// `D.R.'s Lane` and `drs lane` reduce to the same key, which is what lets
    /// somebody find that road without knowing how the Province punctuates it.
    static func matchKey(_ value: String) -> String {
        let expanded = CivicAddressQuery.expandRoadAliases(value)
        let unmarked = JSRegex.replacingAll(
            #"\p{M}"#, in: expanded.decomposedStringWithCompatibilityMapping
        ) { _ in "" }
        let unpunctuated = unmarked
            .lowercased()
            .replacingOccurrences(of: "[.\u{2018}\u{2019}']", with: "", options: .regularExpression)
        return JSRegex.replacingAll(
            #"[^\p{L}\p{N}]+"#, in: unpunctuated
        ) { _ in " " }
            .trimmingCharacters(in: .whitespaces)
    }

    // MARK: - The wire shape

    struct Payload: Decodable {
        struct Geometry: Decodable {
            let coordinates: [Double]?
        }

        struct Feature: Decodable {
            let geometry: Geometry?
            let properties: [String: Column]
        }

        /// A Socrata column, which arrives as a string, a number, or null.
        enum Column: Decodable {
            case string(String)
            case number(Double)
            case null

            init(from decoder: Decoder) throws {
                let container = try decoder.singleValueContainer()
                if container.decodeNil() {
                    self = .null
                } else if let value = try? container.decode(String.self) {
                    self = .string(value)
                } else if let value = try? container.decode(Double.self) {
                    self = .number(value)
                } else {
                    self = .null
                }
            }
        }

        let type: String?
        let features: [Feature]?
    }
}

extension CivicAddressResponse.Properties {
    init(_ columns: [String: CivicAddressResponse.Payload.Column]) {
        func value(_ name: String) -> String? {
            CivicAddressResponse.clean(columns[name])
        }
        self.init(
            pntid: value("pntid"),
            civicNumber: value("civicnum"),
            civicSuffix: value("civsuffix"),
            unitNumber: value("unit_num"),
            placement: value("add_loc"),
            streetPrefix: value("strprefix"),
            streetName: value("strname"),
            streetSuffix: value("strsuffix"),
            streetDirection: value("strdir"),
            community: value("comm"),
            municipality: value("mun"),
            county: value("county")
        )
    }
}

extension CivicAddressResponse {
    /// The web's `cleanComponent`: trimmed, whitespace collapsed, stray commas
    /// removed. Blank and `-` mean the column is empty.
    static func clean(_ column: Payload.Column?) -> String? {
        let raw: String
        switch column {
        case .string(let value): raw = value
        case .number(let value): raw = ArcGISExportURL.jsNumber(value)
        case .null, nil: return nil
        }

        let cleaned = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"^,+|,+$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty || cleaned == "-" ? nil : cleaned
    }
}
