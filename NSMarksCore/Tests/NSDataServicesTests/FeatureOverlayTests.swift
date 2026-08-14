import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

private let viewport = GeoBoundingBox(
    south: 45.6, west: -61.4, north: 45.7, east: -61.3
)

private let overlayCleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
private let overlayNotCleared = ProvinceLicenceClearance(allowsRestrictedLayers: false)

/// Answers by URL substring, first match wins, in call order.
private actor PagedService {
    private(set) var urls: [URL] = []
    private let pages: [Data]
    private let status: Int

    init(pages: [Data], status: Int = 200) {
        self.pages = pages
        self.status = status
    }

    func take(_ url: URL) -> (Data, Int) {
        let index = urls.count
        urls.append(url)
        return (index < pages.count ? pages[index] : Data(#"{"features":[]}"#.utf8), status)
    }

    nonisolated var transport: HTTPTransport {
        HTTPTransport { request in
            let url = request.url!
            let (data, status) = await self.take(url)
            return (
                data,
                HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            )
        }
    }
}

private func collection(_ features: String) -> Data {
    Data(#"{"type":"FeatureCollection","features":[\#(features)]}"#.utf8)
}

private func zone(id: String, code: String, longitude: Double) -> String {
    """
    {"type":"Feature","id":"\(id)","geometry":{"type":"Polygon","coordinates":\
    [[[\(longitude),45.6],[\(longitude),45.7],[\(longitude + 0.01),45.7],\
    [\(longitude + 0.01),45.6],[\(longitude),45.6]]]},"properties":{"Zone":"\(code)"}}
    """
}

@Suite("The viewport query is the web's query")
struct FeatureOverlayQueryTests {
    @Test("The parameters and their order match the web")
    func theURLMatchesTheWeb() throws {
        let plan = try FeatureOverlayQuery.plan(
            for: .zoningInverness,
            bounds: viewport,
            outFields: ["Zone", "ZoneName"],
            orderByFields: "OBJECTID",
            idField: "OBJECTID",
            clearance: overlayNotCleared
        )
        let url = try FeatureOverlayQuery.url(for: plan, page: 0)

        #expect(
            url.query(percentEncoded: false) == [
                "where=1=1",
                "geometry=-61.4,45.6,-61.3,45.7",
                "geometryType=esriGeometryEnvelope",
                "spatialRel=esriSpatialRelIntersects",
                "inSR=4326",
                "outSR=4326",
                "outFields=Zone,ZoneName",
                "returnGeometry=true",
                "resultRecordCount=2000",
                "resultOffset=0",
                "orderByFields=OBJECTID",
                "f=geojson",
            ].joined(separator: "&")
        )
        #expect(url.path() == "/IRdatShZ61GuNjMZ/arcgis/rest/services/IN_Zoning/FeatureServer/708/query")
    }

    @Test("A proximity query carries the distance in metres, next to the envelope")
    func theDistanceSitsWithTheGeometry() throws {
        let plan = try FeatureOverlayQuery.plan(
            for: .mineralOccurrences,
            bounds: viewport,
            outFields: ["geo_id"],
            distanceMetres: 1_000,
            clearance: overlayNotCleared
        )
        let query = try FeatureOverlayQuery.url(for: plan, page: 0).query(percentEncoded: false)

        #expect(query?.contains("spatialRel=esriSpatialRelIntersects&distance=1000&units=esriSRUnit_Meter&inSR=4326") == true)
    }

    @Test("Later pages move the offset by the page size")
    func pagesStepByThePageSize() throws {
        let plan = try FeatureOverlayQuery.plan(
            for: .zoningInverness,
            bounds: viewport,
            outFields: ["Zone"],
            clearance: overlayNotCleared
        )

        #expect(
            try FeatureOverlayQuery.url(for: plan, page: 3)
                .query(percentEncoded: false)?.contains("resultOffset=6000") == true
        )
    }

    @Test("A restricted layer is not planned without the licence")
    func theLicenceGateStandsInFrontOfTheURL() {
        #expect(throws: FeatureOverlayQuery.Refusal.licenceNotAccepted) {
            try FeatureOverlayQuery.plan(
                for: .mineralProximityParcels,
                bounds: viewport,
                outFields: ["PID"],
                clearance: overlayNotCleared
            )
        }
        // With the licence accepted the same layer fails for its own reason:
        // the proximity parcels are derived from other queries and the catalog
        // gives them no service of their own. The point of the pair is that
        // the licence is what stops the first call, not a missing URL.
        #expect(throws: FeatureOverlayQuery.Refusal.noServiceURL) {
            try FeatureOverlayQuery.plan(
                for: .mineralProximityParcels,
                bounds: viewport,
                outFields: ["PID"],
                clearance: overlayCleared
            )
        }
    }
}

@Suite("Reading a page of features")
struct FeatureOverlayResponseTests {
    @Test("Geometry and properties come through")
    func aFeatureIsRead() throws {
        let page = try FeatureOverlayResponse.page(
            from: collection(zone(id: "7", code: "CR", longitude: -61.35))
        )

        #expect(page.returnedCount == 1)
        #expect(page.features.count == 1)
        #expect(page.features[0].id == "7")
        #expect(page.features[0].properties["Zone"] == .string("CR"))
        #expect(page.features[0].geometry.polygonParts.count == 1)
        #expect(page.features[0].geometry.boundingBox?.north == 45.7)
    }

    @Test("A rejected query is an error, not an empty viewport")
    func aServiceErrorIsNotEmptiness() {
        #expect(
            throws: FeatureOverlayResponse.Failure.serviceError(code: 400, message: "Invalid field")
        ) {
            try FeatureOverlayResponse.page(
                from: Data(
                    #"{"error":{"code":400,"message":"Invalid field"},"features":[]}"#.utf8
                )
            )
        }
    }

    @Test("A response with no feature list is malformed, not empty")
    func aMissingListIsMalformed() {
        #expect(throws: FeatureOverlayResponse.Failure.malformed) {
            try FeatureOverlayResponse.page(from: Data(#"{"type":"FeatureCollection"}"#.utf8))
        }
    }

    @Test("One unreadable shape costs that feature, and is counted")
    func anUnreadableGeometryIsCountedNotHidden() throws {
        let page = try FeatureOverlayResponse.page(
            from: collection(
                """
                {"type":"Feature","id":"1","geometry":{"type":"Sphere","coordinates":[]},\
                "properties":{}},\(zone(id: "2", code: "R1", longitude: -61.35))
                """
            )
        )

        #expect(page.returnedCount == 2)
        #expect(page.unreadableCount == 1)
        #expect(page.features.map(\.id) == ["2"])
    }

    @Test("A line of one point, and a ring that cannot close, are unreadable")
    func degenerateGeometryIsRefusedRatherThanDrawnAsNothing() throws {
        // Both decode happily as coordinate lists and then draw nothing at all,
        // so accepting them would delete a feature from the map while the
        // query still reported a complete answer.
        let page = try FeatureOverlayResponse.page(
            from: collection(
                """
                {"type":"Feature","id":"1","geometry":{"type":"LineString",\
                "coordinates":[[-61.35,45.65]]},"properties":{}},\
                {"type":"Feature","id":"2","geometry":{"type":"Polygon",\
                "coordinates":[[[-61.35,45.65],[-61.34,45.65],[-61.35,45.65]]]},\
                "properties":{}},\(zone(id: "3", code: "R1", longitude: -61.35))
                """
            )
        )

        #expect(page.returnedCount == 3)
        #expect(page.unreadableCount == 2)
        #expect(page.features.map(\.id) == ["3"])
    }
}

@Suite("Paging a viewport")
struct FeatureOverlayFetcherTests {
    private func plan(idField: String = "OBJECTID") throws -> FeatureOverlayQuery.Plan {
        try FeatureOverlayQuery.plan(
            for: .zoningInverness,
            bounds: viewport,
            outFields: ["Zone"],
            orderByFields: idField,
            idField: idField,
            clearance: overlayNotCleared
        )
    }

    @Test("A short page ends the paging")
    func aShortPageIsTheLastPage() async throws {
        let service = PagedService(pages: [collection(zone(id: "1", code: "CR", longitude: -61.35))])
        let overlay = try await FeatureOverlayFetcher(transport: service.transport)
            .features(for: plan())

        #expect(overlay.features.count == 1)
        #expect(await service.urls.count == 1)
    }

    @Test("A full page is followed by the next one")
    func afullPageIsFollowed() async throws {
        let full = collection(
            (0..<FeatureOverlayQuery.pageSize)
                .map { zone(id: "\($0)", code: "CR", longitude: -61.35) }
                .joined(separator: ",")
        )
        let service = PagedService(
            pages: [full, collection(zone(id: "last", code: "R1", longitude: -61.34))]
        )
        let overlay = try await FeatureOverlayFetcher(transport: service.transport)
            .features(for: plan())

        #expect(overlay.features.count == FeatureOverlayQuery.pageSize + 1)
        let urls = await service.urls
        #expect(urls.count == 2)
        #expect(urls[1].query(percentEncoded: false)?.contains("resultOffset=2000") == true)
    }

    @Test("A feature returned twice is kept once")
    func aRepeatedFeatureIsNotDrawnTwice() async throws {
        let repeated = zone(id: "7", code: "CR", longitude: -61.35)
        let full = collection(
            ([repeated]
                + (1..<FeatureOverlayQuery.pageSize)
                .map { zone(id: "other-\($0)", code: "CR", longitude: -61.35) })
                .joined(separator: ",")
        )
        let service = PagedService(pages: [full, collection(repeated)])
        let overlay = try await FeatureOverlayFetcher(transport: service.transport)
            .features(for: plan())

        #expect(overlay.features.count == FeatureOverlayQuery.pageSize)
    }

    @Test("The same feature keyed two ways is still one feature")
    func theIDFieldAndTheFeatureIDShareOneNamespace() async throws {
        // Some services publish the row id at the top level, some only in the
        // attributes, and a service that changes its mind between pages must
        // not draw the zone twice.
        let withTopLevelID = zone(id: "7", code: "CR", longitude: -61.35)
        let withOnlyTheField = """
            {"type":"Feature","geometry":{"type":"Polygon","coordinates":\
            [[[-61.35,45.6],[-61.35,45.7],[-61.34,45.7],[-61.34,45.6],[-61.35,45.6]]]},\
            "properties":{"OBJECTID":7,"Zone":"CR"}}
            """
        let service = PagedService(pages: [collection("\(withTopLevelID),\(withOnlyTheField)")])
        let overlay = try await FeatureOverlayFetcher(transport: service.transport)
            .features(for: plan())

        #expect(overlay.features.count == 1)
    }

    @Test("A service that never runs out is refused, not truncated")
    func anEndlessServiceIsRefused() async throws {
        let full = collection(
            (0..<FeatureOverlayQuery.pageSize)
                .map { zone(id: "\($0)", code: "CR", longitude: -61.35) }
                .joined(separator: ",")
        )
        let service = PagedService(
            pages: Array(repeating: full, count: FeatureOverlayQuery.maximumPages)
        )

        await #expect(throws: FeatureOverlayFailure.tooManyFeatures) {
            try await FeatureOverlayFetcher(transport: service.transport).features(for: plan())
        }
    }

    @Test("An HTTP failure is not an empty viewport")
    func anOutageIsNotEmptiness() async throws {
        let service = PagedService(pages: [Data("upstream is down".utf8)], status: 503)

        await #expect(throws: FeatureOverlayFailure.invalidHTTPStatus(503)) {
            try await FeatureOverlayFetcher(transport: service.transport).features(for: plan())
        }
    }
}
