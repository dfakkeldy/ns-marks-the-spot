import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

private let square: [PolygonHitTest.PolygonPart] = [
    [
        [
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 1),
            GeoPoint(lat: 1, lng: 1),
            GeoPoint(lat: 1, lng: 0),
        ]
    ]
]

private let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)

/// Answers by substring of the URL and the form body together, first match
/// wins, recording what was asked. The body is included because the two mineral
/// requests share a URL and differ only in their buffer distance.
private actor Service {
    private(set) var urls: [URL] = []
    private let replies: [(needle: String, body: String, status: Int)]

    init(_ replies: [(needle: String, body: String, status: Int)]) {
        self.replies = replies
    }

    func take(_ url: URL, sending body: String) -> (Data, Int) {
        urls.append(url)
        let asked = url.absoluteString + "?" + body
        let match = replies.first { asked.contains($0.needle) }
        return (Data((match?.body ?? #"{"features":[]}"#).utf8), match?.status ?? 200)
    }

    nonisolated var transport: HTTPTransport {
        HTTPTransport { request in
            let url = request.url!
            let (data, status) = await self.take(
                url, sending: String(data: request.httpBody ?? Data(), encoding: .utf8) ?? ""
            )
            return (
                data,
                HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            )
        }
    }
}

private func features(_ attributes: [String]) -> String {
    #"{"features":[\#(attributes.map { #"{"attributes":\#($0)}"# }.joined(separator: ","))]}"#
}

@Suite("Resource intersection queries")
struct ResourceIntersectionQueryTests {
    @Test("A parcel with no rings is refused rather than answered with no records")
    func noBoundaryIsNotAnEmptyAnswer() {
        #expect(throws: ResourceIntersectionQuery.Refusal.noBoundary) {
            try ResourceIntersectionQuery.plan(for: [], clearance: cleared)
        }
    }

    @Test("Five requests go out: the inventory twice, tenure on two sublayers, mines once")
    func theWebsFiveRequests() throws {
        let plan = try ResourceIntersectionQuery.plan(for: square, clearance: cleared)

        #expect(plan.refusals.isEmpty)
        #expect(
            plan.requests.map(\.layerID) == [
                .mineralOccurrences, .mineralOccurrences, .mineralTenure, .mineralTenure,
                .abandonedMines,
            ]
        )
        #expect(
            plan.requests.map(\.relationship) == [
                .onParcel, .withinOneKilometre, .onParcel, .onParcel, .onParcel,
            ]
        )
        #expect(plan.requests[2].url.absoluteString.hasSuffix("/NovaRoc/MapServer/1/query"))
        #expect(plan.requests[3].url.absoluteString.hasSuffix("/NovaRoc/MapServer/7/query"))
        #expect(
            plan.requests[4].url.absoluteString
                == "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/"
                    + "Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/0/query"
        )
    }

    @Test("Only the nearby request carries a distance, and it is the web's kilometre")
    func onlyTheNearbyRequestIsBuffered() throws {
        let plan = try ResourceIntersectionQuery.plan(for: square, clearance: cleared)

        #expect(!plan.requests[0].body.contains("distance="))
        #expect(plan.requests[1].body.hasSuffix("&distance=1000&units=esriSRUnit_Meter"))
        #expect(plan.requests[1].body.contains("outFields=geo_id%2COcc_num%2CName"))
        #expect(plan.requests[0].body.contains("returnGeometry=false"))
    }
}

@Suite("Resource intersection rows")
struct ResourceIntersectionResponseTests {
    @Test("A mineral occurrence keeps its number, name, status and commodities")
    func anOccurrenceIsRead() throws {
        let found = try ResourceIntersectionResponse.intersections(
            from: Data(
                features([
                    #"{"Occ_num":"012","Name":"Gold Brook","Status":"Showing","Comm_list":"Au, Ag"}"#
                ]).utf8
            ),
            summary: .mineralOccurrence,
            relationship: .onParcel
        )

        #expect(found == [
            ResourceIntersectionResponse.Intersection(
                id: "012", name: "Gold Brook", detail: "Showing · Au, Ag", relationship: .onParcel
            )
        ])
    }

    @Test("A record with no number is named for the inventory that answered")
    func anUnnumberedRecordIsNotInvented() throws {
        let found = try ResourceIntersectionResponse.intersections(
            from: Data(features([#"{"Comm_prim":"Cu"}"#]).utf8),
            summary: .mineralOccurrence,
            relationship: .withinOneKilometre
        )

        #expect(found.first?.id == "Unnumbered")
        #expect(found.first?.name == "Mineral occurrence")
        #expect(found.first?.detail == "Cu")
    }

    @Test("A numeric identifier renders as the web renders it")
    func aNumericIdentifierMatchesTheWeb() throws {
        // ArcGIS sends OBJECTID as a number, and `String(12)` is "12" — not
        // "12.0", which is what a naive Double description would put on screen.
        let found = try ResourceIntersectionResponse.intersections(
            from: Data(features([#"{"OBJECTID":12,"MINERAL_TENURE_STATUS_CODE":"ACTIVE"}"#]).utf8),
            summary: .mineralTenure(fallbackType: "Mineral lease"),
            relationship: .onParcel
        )

        #expect(found == [
            ResourceIntersectionResponse.Intersection(
                id: "12", name: "Mineral lease 12", detail: "ACTIVE", relationship: .onParcel
            )
        ])
    }

    @Test("A mine opening carries its type and hazard, and neither is filled in")
    func aMineOpeningIsRead() throws {
        let found = try ResourceIntersectionResponse.intersections(
            from: Data(
                features([
                    #"{"ShaftID":"S-1","Opening_ty":"Shaft","Degree_Haz":"High"}"#,
                    #"{"geo_id":"G-9","Opening_ty":"Pit"}"#,
                ]).utf8
            ),
            summary: .abandonedMine,
            relationship: .onParcel
        )

        #expect(found[0].name == "Abandoned mine opening S-1")
        #expect(found[0].detail == "Shaft · Hazard: High")
        // No hazard published is no hazard sentence, rather than a hazard of
        // none.
        #expect(found[1].detail == "Pit")
    }

    @Test("An ArcGIS error inside a 200 is a failure, not an absence of records")
    func aServiceErrorIsNotAnAbsence() {
        #expect(
            throws: ResourceIntersectionResponse.Failure.serviceError(code: 400, message: "nope")
        ) {
            try ResourceIntersectionResponse.intersections(
                from: Data(#"{"error":{"code":400,"message":"nope"}}"#.utf8),
                summary: .abandonedMine,
                relationship: .onParcel
            )
        }
    }

    @Test("A reply with neither features nor an error is unreadable, not empty")
    func anUnrecognisedReplyIsNotEmpty() {
        #expect(throws: ResourceIntersectionResponse.Failure.malformed) {
            try ResourceIntersectionResponse.intersections(
                from: Data("{}".utf8), summary: .abandonedMine, relationship: .onParcel
            )
        }
    }
}

@Suite("Resource intersection lookups")
struct ResourceIntersectionFetcherTests {
    @Test("An occurrence on the parcel is listed as on the parcel, not as nearby")
    func theOnParcelRelationshipWins() async throws {
        // Both requests return the same record: it is on the parcel, so it is
        // also within a kilometre of it.
        let service = Service([
            ("mineral_occurrence", features([#"{"Occ_num":"012","Name":"Gold Brook"}"#]), 200)
        ])
        let result = try await ResourceIntersectionFetcher(transport: service.transport)
            .intersections(for: square, clearance: cleared)

        let source = try #require(result.sources.first { $0.layerID == .mineralOccurrences })
        let occurrences = try source.records.get()
        #expect(occurrences.count == 1)
        #expect(occurrences.first?.relationship == .onParcel)
    }

    @Test("One source failing leaves the others standing")
    func oneSourceFailingIsNotThreeFailing() async throws {
        let service = Service([
            ("NovaRoc", #"{"error":{"code":500,"message":"boom"}}"#, 200),
            ("Abandoned_Mine", features([#"{"ShaftID":"S-1"}"#]), 200),
        ])
        let result = try await ResourceIntersectionFetcher(transport: service.transport)
            .intersections(for: square, clearance: cleared)

        #expect(result.sources.map(\.layerID) == [.mineralOccurrences, .mineralTenure, .abandonedMines])
        #expect(result.sources[0].records == .success([]))
        #expect(
            result.sources[1].records
                == .failure(.unreadable(.serviceError(code: 500, message: "boom")))
        )
        #expect(result.sources[2].records.map { $0.map(\.id) } == .success(["S-1"]))
    }

    /// The mineral inventory is two requests. Half an answer is not a list.
    @Test("A source whose second request fails reports the failure, not the first half")
    func aHalfAnsweredSourceIsAFailure() async throws {
        // Only the buffered request carries a distance, so this needle takes
        // down the nearby half and leaves the on-parcel half answering.
        let service = Service([("distance=1000", "not json", 200)])
        let result = try await ResourceIntersectionFetcher(transport: service.transport)
            .intersections(for: square, clearance: cleared)

        #expect(result.sources[0].records == .failure(.unreadable(.malformed)))
    }

    @Test("A source that published nothing here answers with nothing, per source")
    func anEmptyAnswerIsAnAnswer() async throws {
        let service = Service([])
        let result = try await ResourceIntersectionFetcher(transport: service.transport)
            .intersections(for: square, clearance: cleared)

        #expect(result.sources.allSatisfy { $0.records == .success([]) })
        #expect(await service.urls.count == 5)
    }

    @Test("An outage on a source is an outage, not a parcel with no records")
    func anOutageIsNotAnAbsence() async throws {
        let service = Service([("Abandoned_Mine", "", 503)])
        let result = try await ResourceIntersectionFetcher(transport: service.transport)
            .intersections(for: square, clearance: cleared)

        #expect(result.sources[2].records == .failure(.invalidHTTPStatus(503)))
    }
}
