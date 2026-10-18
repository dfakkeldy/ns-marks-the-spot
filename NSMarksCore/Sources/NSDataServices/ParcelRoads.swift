/// The roads to list for a parcel, and what each one is listed on.
///
/// Two sources answer this question and they answer it differently. The NSTDB
/// road layers say a road crosses the parcel or runs within
/// `MappedFeatureQuery.adjacentRoadDistanceMetres` of it — geometry. The Civic
/// Address File says a civic point on the parcel is addressed to a road —
/// a record. A road can appear in one and not the other, and the difference is
/// worth keeping: neither is a finding about legal access or frontage.
public enum ParcelRoads {
    /// Why this road is on the list.
    public enum Evidence: Sendable, Equatable {
        case intersects
        case adjacent
        /// No mapped road segment matched, but a civic address on the parcel
        /// names this road. Evidence that the road exists and that an address
        /// here refers to it — not that it touches this parcel.
        case namedByCivicAddress
    }

    public struct Road: Sendable, Equatable {
        public let name: String
        public let kind: String
        public let evidence: Evidence

        public init(name: String, kind: String, evidence: Evidence) {
            self.name = name
            self.kind = kind
            self.evidence = evidence
        }
    }

    /// The web's `MappedContextDetails` merge, in its order: everything the
    /// road layers returned, then the roads only the address file names.
    ///
    /// A road the mapped layers already returned is not repeated from the
    /// address file, because the same road listed twice under two kinds of
    /// evidence reads as two roads.
    public static func list(
        _ context: ParcelContext,
        namedBy addresses: [CivicAddressResponse.CivicAddress]
    ) -> [Road] {
        var mapped = context.roads.map {
            Road(
                name: $0.name,
                kind: $0.kind,
                evidence: $0.relationship == .intersects ? .intersects : .adjacent
            )
        }
        var seen = Set(context.roads.map { $0.name.lowercased() })
        for name in addresses.compactMap(\.roadName) where seen.insert(name.lowercased()).inserted {
            mapped.append(Road(name: name, kind: "Civic Address File", evidence: .namedByCivicAddress))
        }
        return mapped
    }
}
