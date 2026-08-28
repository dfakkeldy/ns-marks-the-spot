import Foundation

/// What the geology and resource services published on or near a parcel.
public enum ResourceIntersectionResponse {
    /// One published record the service returned for this parcel.
    ///
    /// A screening record and nothing more. An occurrence, a tenure polygon, or
    /// a mine opening returned here says the Province has that record mapped
    /// against this geometry; it is not proof of mineralization, deposit
    /// extent, grade, recoverability, value, mineral rights, access, permission
    /// to explore, or that the inventory is complete.
    public struct Intersection: Sendable, Equatable {
        public let id: String
        public let name: String
        public let detail: String
        public let relationship: ResourceIntersectionQuery.Relationship

        public init(
            id: String, name: String, detail: String,
            relationship: ResourceIntersectionQuery.Relationship
        ) {
            self.id = id
            self.name = name
            self.detail = detail
            self.relationship = relationship
        }
    }

    public enum Failure: Error, Equatable, Sendable {
        /// ArcGIS reports a rejected query as HTTP 200 with this inside.
        case serviceError(code: Int?, message: String?)
        case malformed
    }

    public static func intersections(
        from data: Data,
        summary: ResourceIntersectionQuery.Summary,
        relationship: ResourceIntersectionQuery.Relationship
    ) throws(Failure) -> [Intersection] {
        let payload: Payload
        do {
            payload = try JSONDecoder().decode(Payload.self, from: data)
        } catch {
            throw .malformed
        }
        if let error = payload.error {
            throw .serviceError(code: error.code, message: error.message)
        }
        // A reply carrying neither `features` nor `error` is a reply this
        // reader does not recognise. Calling it empty would put "no published
        // record here" on screen for it.
        guard let features = payload.features else { throw .malformed }

        return features.map {
            summarize($0.attributes, summary: summary, relationship: relationship)
        }
    }

    /// Repeats removed, first kept.
    ///
    /// The mineral inventory answers the on-parcel query and the within-a-
    /// kilometre one, and an occurrence on the parcel is in both. Keeping the
    /// first means it is listed as being on the parcel, because the on-parcel
    /// request is ordered ahead of the nearby one.
    public static func unique(_ intersections: [Intersection]) -> [Intersection] {
        var seen = Set<String>()
        return intersections.filter { seen.insert($0.id).inserted }
    }

    static func summarize(
        _ attributes: [String: MappedFeatureResponse.AttributeValue],
        summary: ResourceIntersectionQuery.Summary,
        relationship: ResourceIntersectionQuery.Relationship
    ) -> Intersection {
        switch summary {
        case .mineralOccurrence:
            let id = text(attributes["Occ_num"]) ?? text(attributes["geo_id"]) ?? "Unnumbered"
            let commodities = trimmed(attributes["Comm_list"]) ?? trimmed(attributes["Comm_prim"])
            return Intersection(
                id: id,
                // The web keeps an empty `Name` as an empty heading; naming the
                // inventory that answered is a fact about where the record came
                // from rather than a guess at what it is.
                name: trimmed(attributes["Name"]) ?? "Mineral occurrence",
                detail: [trimmed(attributes["Status"]), commodities]
                    .compactMap(\.self)
                    .joined(separator: " · "),
                relationship: relationship
            )
        case .mineralTenure(let fallbackType):
            let id = text(attributes["TENURE_NUMBER_ID"])
                ?? text(attributes["OBJECTID"])
                ?? "Unnumbered"
            let type = trimmed(attributes["MTA_TENURE_TYPE_CODE"]) ?? fallbackType
            return Intersection(
                id: id,
                name: "\(type) \(id)",
                detail: trimmed(attributes["MINERAL_TENURE_STATUS_CODE"]) ?? "",
                relationship: relationship
            )
        case .abandonedMine:
            let id = text(attributes["ShaftID"]) ?? text(attributes["geo_id"]) ?? "Unnumbered"
            let hazard = trimmed(attributes["Degree_Haz"]).map { "Hazard: \($0)" }
            return Intersection(
                id: id,
                name: trimmed(attributes["Name"]) ?? "Abandoned mine opening \(id)",
                detail: [trimmed(attributes["Opening_ty"]), hazard]
                    .compactMap(\.self)
                    .joined(separator: " · "),
                relationship: relationship
            )
        }
    }

    /// The attribute as the web's `String(value)` would render it, or `nil`
    /// when the service sent null or nothing — which is what `??` falls
    /// through on there.
    static func text(_ value: MappedFeatureResponse.AttributeValue?) -> String? {
        switch value {
        case .string(let raw): return raw
        case .number(let raw): return ArcGISExportURL.jsNumber(raw)
        case .null, nil: return nil
        }
    }

    /// `text`, trimmed, with an empty result treated as nothing said.
    static func trimmed(_ value: MappedFeatureResponse.AttributeValue?) -> String? {
        guard let raw = text(value)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty
        else { return nil }
        return raw
    }

    private struct Payload: Decodable {
        struct Feature: Decodable {
            let attributes: [String: MappedFeatureResponse.AttributeValue]
        }

        struct ServiceError: Decodable {
            let code: Int?
            let message: String?
        }

        let features: [Feature]?
        let error: ServiceError?
    }
}
