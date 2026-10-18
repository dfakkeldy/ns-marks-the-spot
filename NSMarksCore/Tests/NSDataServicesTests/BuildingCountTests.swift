import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// A unit square from (0,0) to (1,1), wound as GeoJSON does.
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

/// Answers each sublayer with the count keyed to it, recording what was asked.
private actor Service {
    private(set) var requests: [(url: URL, body: String)] = []
    private let counts: [Int: String]
    private let status: Int

    init(counts: [Int: String], status: Int = 200) {
        self.counts = counts
        self.status = status
    }

    func take(_ url: URL, body: String) -> (Data, Int) {
        requests.append((url, body))
        let sublayer = url.pathComponents.dropLast().last.flatMap(Int.init) ?? -1
        return (Data((counts[sublayer] ?? #"{"count":0}"#).utf8), status)
    }

    nonisolated var transport: HTTPTransport {
        HTTPTransport { request in
            let url = request.url!
            let body = String(data: request.httpBody ?? Data(), encoding: .utf8) ?? ""
            let (data, status) = await self.take(url, body: body)
            return (
                data,
                HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            )
        }
    }
}

@Suite("Building count queries")
struct BuildingCountQueryTests {
    @Test("Without an accepted licence no request is built at all")
    func noClearanceMeansNoRequest() {
        #expect(throws: BuildingCountQuery.Refusal.licenceNotAccepted) {
            try BuildingCountQuery.requests(for: square, clearance: .none)
        }
    }

    @Test("A parcel with no rings is refused rather than counted as none")
    func noBoundaryIsNotZeroBuildings() {
        #expect(throws: BuildingCountQuery.Refusal.noBoundary) {
            try BuildingCountQuery.requests(for: [], clearance: cleared)
        }
    }

    @Test("The three sublayers are asked for a count only, in the web's order")
    func requestsMatchTheWeb() throws {
        let requests = try BuildingCountQuery.requests(for: square, clearance: cleared)

        #expect(requests.map(\.sublayer) == [2, 3, 4])
        #expect(
            requests.map { $0.url.absoluteString } == [
                "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
                    + "BASE_NSTDB_10k_Buildings_UT83/MapServer/2/query",
                "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
                    + "BASE_NSTDB_10k_Buildings_UT83/MapServer/3/query",
                "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
                    + "BASE_NSTDB_10k_Buildings_UT83/MapServer/4/query",
            ]
        )
        // Byte for byte what the web's URLSearchParams produces, including the
        // ring reversal that converts GeoJSON winding to the ArcGIS reading.
        #expect(
            requests[0].body == "f=json&where=1%3D1&geometry=%7B%22rings%22%3A%5B%5B%5B0%2C1%5D"
                + "%2C%5B1%2C1%5D%2C%5B1%2C0%5D%2C%5B0%2C0%5D%5D%5D%2C%22spatialReference%22%3A"
                + "%7B%22wkid%22%3A4326%7D%7D&geometryType=esriGeometryPolygon&inSR=4326"
                + "&spatialRel=esriSpatialRelIntersects&returnCountOnly=true"
        )
    }
}

@Suite("Building count replies")
struct BuildingCountResponseTests {
    @Test("A count comes back as a count")
    func aCountIsRead() throws {
        #expect(try BuildingCountResponse.count(from: Data(#"{"count":7}"#.utf8)) == 7)
        #expect(try BuildingCountResponse.count(from: Data(#"{"count":0}"#.utf8)) == 0)
    }

    @Test("An ArcGIS error inside a 200 is a failure, not a parcel with no buildings")
    func aServiceErrorIsNotZero() {
        #expect(
            throws: BuildingCountResponse.Failure.serviceError(code: 400, message: "Invalid query")
        ) {
            try BuildingCountResponse.count(
                from: Data(#"{"error":{"code":400,"message":"Invalid query"}}"#.utf8)
            )
        }
    }

    @Test("A reply with no count in it is unreadable, not empty")
    func aReplyWithoutACountIsUnreadable() {
        for reply in ["{}", "[]", "not json", #"{"count":"7"}"#, #"{"count":-1}"#, #"{"count":1.5}"#] {
            #expect(throws: BuildingCountResponse.Failure.malformed) {
                try BuildingCountResponse.count(from: Data(reply.utf8))
            }
        }
    }
}

@Suite("Building counts")
struct BuildingCountFetcherTests {
    @Test("Points and footprints are counted apart and added for the headline")
    func countsAreSplitAndSummed() async throws {
        let service = Service(counts: [
            2: #"{"count":1}"#, 3: #"{"count":2}"#, 4: #"{"count":3}"#,
        ])
        let count = try await BuildingCountFetcher(transport: service.transport)
            .count(for: square, clearance: cleared)

        // The web's headline is 6. The split is kept because a point and a
        // footprint can be the same building.
        #expect(count.points == 3)
        #expect(count.polygons == 3)
        #expect(count.total == 6)
        #expect(await service.requests.count == 3)
    }

    @Test("A parcel the Province has nothing mapped on counts zero, and that is an answer")
    func zeroIsAnAnswer() async throws {
        let service = Service(counts: [:])
        let count = try await BuildingCountFetcher(transport: service.transport)
            .count(for: square, clearance: cleared)

        #expect(count.total == 0)
    }

    @Test("One sublayer failing fails the count rather than shortening it")
    func aPartialAnswerIsNotATotal() async {
        let service = Service(counts: [
            2: #"{"count":1}"#, 3: #"{"count":2}"#,
            4: #"{"error":{"code":500,"message":"boom"}}"#,
        ])
        await #expect(
            throws: BuildingCountFailure.unreadable(.serviceError(code: 500, message: "boom"))
        ) {
            try await BuildingCountFetcher(transport: service.transport)
                .count(for: square, clearance: cleared)
        }
    }

    @Test("An outage is an outage, not a parcel with no buildings")
    func anOutageIsNotAnAbsence() async {
        let service = Service(counts: [:], status: 503)
        await #expect(throws: BuildingCountFailure.invalidHTTPStatus(503)) {
            try await BuildingCountFetcher(transport: service.transport)
                .count(for: square, clearance: cleared)
        }
    }

    @Test("Without a licence nothing is sent")
    func noClearanceSendsNothing() async {
        let service = Service(counts: [:])
        await #expect(throws: BuildingCountFailure.refused(.licenceNotAccepted)) {
            try await BuildingCountFetcher(transport: service.transport)
                .count(for: square, clearance: .none)
        }
        #expect(await service.requests.isEmpty)
    }
}
