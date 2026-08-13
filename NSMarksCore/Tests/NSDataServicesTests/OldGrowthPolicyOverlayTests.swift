import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

private let viewport = GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3)
private let anyClearance = ProvinceLicenceClearance(allowsRestrictedLayers: false)

private func policyCollection(_ features: String) -> Data {
    Data(#"{"type":"FeatureCollection","features":[\#(features)]}"#.utf8)
}

private func policyArea(oldGrowth: String, hectares: String = "12.5") -> String {
    """
    {"type":"Feature","geometry":{"type":"Polygon","coordinates":\
    [[[-61.4,45.6],[-61.4,45.7],[-61.3,45.7],[-61.3,45.6],[-61.4,45.6]]]},\
    "properties":{"old_growth":"\(oldGrowth)","hectares":"\(hectares)",\
    "selmethtxt":"Field verified"}}
    """
}

@Suite("Querying the old-growth policy layer")
struct OldGrowthPolicyQueryTests {
    @Test("within_box takes its corners north, west, south, east")
    func theBoxIsWrittenInTheSourcesOwnOrder() throws {
        let query = try #require(
            OldGrowthPolicyOverlay.url(for: viewport, offset: 0, clearance: anyClearance)
                .query(percentEncoded: false)
        )

        #expect(query.contains("$where=within_box(the_geom,45.7,-61.4,45.6,-61.3)"))
        #expect(query.contains("$order=:id"))
        #expect(query.contains("$limit=1000"))
        #expect(query.contains("$offset=0"))
    }
}

@Suite("Reading old-growth policy areas")
struct OldGrowthPolicyResponseTests {
    @Test("The source's two status codes are read, and nothing else is guessed")
    func anUnknownCodeStaysUnknown() throws {
        let page = try OldGrowthPolicyOverlay.page(
            from: policyCollection(
                [policyArea(oldGrowth: "1"), policyArea(oldGrowth: "2"), policyArea(oldGrowth: "3")]
                    .joined(separator: ",")
            )
        )

        #expect(page.areas.map(\.status) == [.confirmedOldGrowth, .restorationOpportunity, .unknown])
        #expect(page.areas[0].hectares == 12.5)
        #expect(page.areas[0].selectionMethod == "Field verified")
    }

    @Test("A response that is not a feature collection is malformed, not empty")
    func aMalformedReplyIsNotAnEmptyViewport() {
        #expect(throws: OldGrowthPolicyOverlay.Failure.malformed) {
            try OldGrowthPolicyOverlay.page(from: Data(#"{"error":"nope"}"#.utf8))
        }
    }

    @Test("A geometry that encloses no ground is not a policy area")
    func onlyArealGeometryIsAnArea() throws {
        let page = try OldGrowthPolicyOverlay.page(
            from: policyCollection(
                """
                {"type":"Feature","geometry":{"type":"Point","coordinates":[-61.35,45.65]},\
                "properties":{"old_growth":"1"}}
                """
            )
        )

        #expect(page.returnedCount == 1)
        #expect(page.areas.isEmpty)
    }
}

@Suite("Fetching old-growth policy areas")
struct OldGrowthPolicyFetcherTests {
    private actor Service {
        private(set) var requests: [URLRequest] = []
        private let pages: [Data]
        private let status: Int

        init(pages: [Data], status: Int = 200) {
            self.pages = pages
            self.status = status
        }

        func take(_ request: URLRequest) -> (Data, Int) {
            let index = requests.count
            requests.append(request)
            return (
                index < pages.count ? pages[index] : Data(#"{"features":[]}"#.utf8),
                status
            )
        }

        nonisolated var transport: HTTPTransport {
            HTTPTransport { request in
                let (data, status) = await self.take(request)
                return (
                    data,
                    HTTPURLResponse(
                        url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil
                    )!
                )
            }
        }
    }

    @Test("A short page ends the paging, and asks for GeoJSON")
    func aShortPageIsTheLastPage() async throws {
        let service = Service(pages: [policyCollection(policyArea(oldGrowth: "1"))])
        let areas = try await OldGrowthPolicyFetcher(transport: service.transport)
            .areas(in: viewport, clearance: anyClearance)

        #expect(areas.count == 1)
        let requests = await service.requests
        #expect(requests.count == 1)
        #expect(
            requests[0].value(forHTTPHeaderField: "Accept")
                == "application/geo+json, application/json"
        )
    }

    @Test("A full page is followed by the next, at the next offset")
    func aFullPageIsFollowed() async throws {
        let full = policyCollection(
            Array(
                repeating: policyArea(oldGrowth: "1"),
                count: OldGrowthPolicyOverlay.pageSize
            ).joined(separator: ",")
        )
        let service = Service(pages: [full, policyCollection(policyArea(oldGrowth: "2"))])
        let areas = try await OldGrowthPolicyFetcher(transport: service.transport)
            .areas(in: viewport, clearance: anyClearance)

        #expect(areas.count == OldGrowthPolicyOverlay.pageSize + 1)
        #expect(
            await service.requests[1].url?.query(percentEncoded: false)?
                .contains("$offset=1000") == true
        )
    }

    @Test("An outage is not an absence of policy areas")
    func anOutageIsNotEmptiness() async {
        let service = Service(pages: [Data("down".utf8)], status: 502)

        await #expect(throws: OldGrowthPolicyOverlay.Failure.invalidHTTPStatus(502)) {
            try await OldGrowthPolicyFetcher(transport: service.transport)
                .areas(in: viewport, clearance: anyClearance)
        }
    }
}
