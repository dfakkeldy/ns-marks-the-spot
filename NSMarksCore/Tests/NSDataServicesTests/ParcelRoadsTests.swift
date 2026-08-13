import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// Two sources, one list, and the evidence for each row kept attached to it.
@Suite("Roads listed for a parcel")
struct ParcelRoadsTests {
    private static func address(_ pntid: String, road: String?) -> CivicAddressResponse.CivicAddress {
        var columns: [String: CivicAddressResponse.Payload.Column] = [
            "pntid": .string(pntid),
        ]
        if let road {
            columns["strname"] = .string(road)
        }
        let properties = CivicAddressResponse.Properties(columns)
        return CivicAddressResponse.CivicAddress(
            pntid: pntid,
            coordinate: GeoPoint(lat: 45, lng: -63),
            label: CivicAddressResponse.format(properties),
            properties: properties
        )
    }

    private static func mapped(
        _ name: String, _ kind: String, _ relationship: MappedFeatureQuery.Relationship
    ) -> MappedFeatureResponse.MappedFeature {
        MappedFeatureResponse.MappedFeature(name: name, kind: kind, relationship: relationship)
    }

    @Test func mappedRoadsComeFirstAndKeepTheirRelationship() {
        let context = ParcelContext(roads: [
            Self.mapped("Highway 19", "Arterial", .intersects),
            Self.mapped("Mabou Ridge Road", "Local", .adjacent),
        ])

        let roads = ParcelRoads.list(context, namedBy: [])

        #expect(roads.map(\.name) == ["Highway 19", "Mabou Ridge Road"])
        #expect(roads.map(\.evidence) == [.intersects, .adjacent])
    }

    /// The reason the merge exists: a parcel addressed to a road the road
    /// layers did not return still has that road named on the record.
    @Test func aRoadOnlyTheAddressFileNamesIsListedAsSuch() {
        let roads = ParcelRoads.list(
            ParcelContext(),
            namedBy: [Self.address("1", road: "Shore Road")]
        )

        #expect(roads.count == 1)
        #expect(roads.first?.name == "Shore Road")
        #expect(roads.first?.kind == "Civic Address File")
        #expect(roads.first?.evidence == .namedByCivicAddress)
    }

    /// One road under two kinds of evidence reads as two roads, which would
    /// overstate what is beside the parcel.
    @Test func aRoadInBothSourcesIsListedOnceOnTheMappedEvidence() {
        let context = ParcelContext(roads: [Self.mapped("Shore Road", "Local", .adjacent)])

        let roads = ParcelRoads.list(
            context,
            namedBy: [Self.address("1", road: "SHORE ROAD"), Self.address("2", road: "Shore Road")]
        )

        #expect(roads.count == 1)
        #expect(roads.first?.evidence == .adjacent)
    }

    @Test func twoAddressesOnOneRoadNameItOnce() {
        let roads = ParcelRoads.list(
            ParcelContext(),
            namedBy: [Self.address("1", road: "Shore Road"), Self.address("2", road: "shore road")]
        )

        #expect(roads.map(\.name) == ["Shore Road"])
    }

    @Test func anAddressWithNoRoadNameAddsNothing() {
        let roads = ParcelRoads.list(ParcelContext(), namedBy: [Self.address("1", road: nil)])

        #expect(roads.isEmpty)
    }
}
