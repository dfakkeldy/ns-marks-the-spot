import Foundation

/// What the NSTDB services say is mapped on a parcel.
///
/// A port of the naming rules in the web's `parcelContext.ts`. They look
/// cosmetic and are not: `name` and `kind` are what the inspector shows and
/// what the evidence note exports, so a rule that differs between the two
/// surfaces produces two different descriptions of the same property from the
/// same bytes.
public enum MappedFeatureResponse {
    /// One thing the Province has mapped on or beside the parcel.
    ///
    /// Never a claim of access, frontage, ownership, or service. A road that
    /// intersects a parcel on NSTDB is a line on a 1:10,000 map crossing an
    /// NSPRD polygon, and nothing more.
    public struct MappedFeature: Sendable, Equatable {
        public let name: String
        public let kind: String
        public let relationship: MappedFeatureQuery.Relationship

        public init(name: String, kind: String, relationship: MappedFeatureQuery.Relationship) {
            self.name = name
            self.kind = kind
            self.relationship = relationship
        }
    }

    /// Why a reply produced no features.
    ///
    /// As with parcels, none of these may be shown as "nothing is mapped
    /// here". They all mean the service did not answer the question.
    public enum Failure: Error, Equatable, Sendable {
        /// ArcGIS reports a rejected query as HTTP 200 with this inside.
        case serviceError(code: Int?, message: String?)
        /// Not JSON, or not JSON shaped like an ArcGIS query reply.
        case malformed
    }

    /// The features in one sublayer's reply.
    public static func features(
        from data: Data,
        layer: MappedFeatureQuery.Layer,
        relationship: MappedFeatureQuery.Relationship
    ) throws(Failure) -> [MappedFeature] {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformed
        }
        if let error = payload.error {
            throw .serviceError(code: error.code, message: error.message)
        }
        // A reply carrying neither `features` nor `error` is not an empty
        // answer — it is a reply this reader does not recognise, and calling it
        // empty would put "nothing mapped here" on screen for it.
        guard let features = payload.features else { throw .malformed }

        return features.map {
            summarize($0.attributes, fallbackKind: layer.fallbackKind, relationship: relationship)
        }
    }

    /// `features` with repeats removed, first spelling kept.
    ///
    /// The same road is returned by the intersecting query and the adjacent
    /// one, and by more than one sublayer. Keeping the first means a road that
    /// crosses the parcel is listed as crossing it rather than as merely
    /// nearby, because the intersecting requests are ordered first.
    public static func unique(_ features: [MappedFeature]) -> [MappedFeature] {
        var seen = Set<String>()
        return features.filter { feature in
            seen.insert("\(feature.name.lowercased())|\(feature.kind.lowercased())").inserted
        }
    }

    /// The web's `summarizeFeature`.
    ///
    /// A named feature wins over a description, and a description over the name
    /// of the sublayer that answered — most specific first, and never invented.
    static func summarize(
        _ attributes: [String: AttributeValue],
        fallbackKind: String,
        relationship: MappedFeatureQuery.Relationship
    ) -> MappedFeature {
        let named = clean(attributes["STREET"])
            ?? clean(attributes["RTE_NO"])
            ?? clean(attributes["RIVNAME_1"])
            ?? clean(attributes["RIVNAME_2"])
        let description = cleanDescription(attributes["FEAT_DESC"])
        let roadClass = clean(attributes["ROADC_DESC"])

        // The description is only used as the kind when there is also a name to
        // put in front of it — otherwise it has already been used *as* the
        // name, and repeating it would read as two facts about the feature.
        let kind: String
        if let roadClass {
            kind = roadClass
        } else if named != nil, let description {
            kind = description
        } else {
            kind = fallbackKind
        }

        return MappedFeature(
            name: named ?? description ?? fallbackKind,
            kind: kind,
            relationship: relationship
        )
    }

    /// Trimmed, or `nil`. A lone hyphen is NSTDB's empty string.
    static func clean(_ value: AttributeValue?) -> String? {
        guard case .string(let raw) = value else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == "-" ? nil : trimmed
    }

    /// `FEAT_DESC` reduced to the feature itself.
    ///
    /// NSTDB descriptions read like `Road - Paved, undivided` and
    /// `Watercourse line`; the qualifier after the dash and the geometry-type
    /// suffix are dropped, then the result is sentence-cased. Ported rule for
    /// rule from the web's regular expressions rather than reimplemented, since
    /// the output is user-visible text on both surfaces.
    static func cleanDescription(_ value: AttributeValue?) -> String? {
        guard let description = clean(value) else { return nil }

        var cleaned = description
        // `/\s+-\s+.*$/u` — everything from the first spaced hyphen on.
        if let dash = cleaned.range(of: #"\s+-\s+.*$"#, options: .regularExpression) {
            cleaned.removeSubrange(dash)
        }
        // `/\s+(?:line|point|polygon)$/iu` — the geometry-type suffix.
        if let suffix = cleaned.range(
            of: #"\s+(?:line|point|polygon)$"#,
            options: [.regularExpression, .caseInsensitive]
        ) {
            cleaned.removeSubrange(suffix)
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = cleaned.first else { return nil }
        return first.uppercased() + cleaned.dropFirst().lowercased()
    }

    /// An ArcGIS attribute, which may be a string, a number, or null.
    public enum AttributeValue: Sendable, Equatable, Decodable {
        case string(String)
        case number(Double)
        case null

        public init(from decoder: Decoder) throws {
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

    private struct Payload: Decodable {
        struct Feature: Decodable {
            let attributes: [String: AttributeValue]
        }

        struct ServiceError: Decodable {
            let code: Int?
            let message: String?
        }

        let features: [Feature]?
        let error: ServiceError?
    }
}
