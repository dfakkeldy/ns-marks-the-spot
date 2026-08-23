import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

private let inverness = LayerCatalog.zoningDetail(for: .zoningInverness)!
private let cumberland = LayerCatalog.zoningDetail(for: .zoningCumberland)!
private let halifax = LayerCatalog.zoningDetail(for: .zoningHalifax)!

private func properties(
    _ pairs: [String: String]
) -> [String: MappedFeatureResponse.AttributeValue] {
    pairs.mapValues { .string($0) }
}

@Suite("Reading a zone")
struct ZoningDescriptionTests {
    @Test("A code-prefixed name is not read back with its code twice")
    func aPrefixedCodeIsStripped() {
        let described = ZoningOverlay.describe(
            properties(["Zone": "CR", "ZONETYPE": "CR Commercial Recreation", "PLAN_": "Mabou"]),
            detail: inverness
        )

        #expect(described.code == "CR")
        #expect(described.name == "Commercial Recreation")
        #expect(described.planArea == "Mabou")
        #expect(described.label == "CR — Commercial Recreation")
    }

    @Test("A code-suffixed name is not read back with its code twice")
    func aSuffixedCodeIsStripped() {
        let described = ZoningOverlay.describe(
            properties(["ZONE": "AG", "ZoneName": "Agriculture (AG)"]),
            detail: cumberland
        )

        #expect(described.name == "Agriculture")
        #expect(described.planArea == nil)
    }

    @Test("A name that merely starts with the code's letters keeps them")
    func aNameThatOnlyLooksPrefixedIsLeftAlone() {
        // "CRown" is not "CR ", and eating the letters would rename the zone.
        #expect(ZoningOverlay.stripRedundantCode("CRown Land Buffer", code: "CR")
            == "CRown Land Buffer")
    }

    @Test("A source with no plan-area column reports no plan area")
    func anAbsentFieldIsNotInvented() {
        let described = ZoningOverlay.describe(
            properties(["ZONE": "ER-1", "DESCRIPTION": "Established Residential"]),
            detail: halifax
        )

        #expect(described.planArea == nil)
        #expect(described.label == "ER-1 — Established Residential")
    }

    @Test("A polygon with no stated zone says so rather than reading as blank")
    func anUnstatedZoneIsNamedAsUnstated() {
        let described = ZoningOverlay.describe(
            properties(["Zone": "   ", "ZONETYPE": ""]),
            detail: inverness
        )

        #expect(described.code == nil)
        #expect(described.name == nil)
        #expect(described.label == "Zone not stated")
    }

    @Test("A numeric zone code is read, not dropped")
    func aNumericCodeIsRead() {
        let described = ZoningOverlay.describe(
            ["Zone": .number(4), "ZONETYPE": .string("Mixed Use")],
            detail: inverness
        )

        #expect(described.label == "4 — Mixed Use")
    }
}

@Suite("Fetching zones for a viewport")
struct ZoningFetcherTests {
    private actor Service {
        private(set) var urls: [URL] = []
        private let body: Data

        init(_ body: Data) { self.body = body }

        func take(_ url: URL) -> Data {
            urls.append(url)
            return body
        }

        nonisolated var transport: HTTPTransport {
            HTTPTransport { request in
                let url = request.url!
                return (
                    await self.take(url),
                    HTTPURLResponse(
                        url: url, statusCode: 200, httpVersion: nil, headerFields: nil
                    )!
                )
            }
        }
    }

    @Test("The layer's own fields are the fields asked for")
    func theDescriptorDecidesTheQuery() async throws {
        let service = Service(
            Data(
                """
                {"type":"FeatureCollection","features":[{"type":"Feature","id":"1",\
                "geometry":{"type":"Polygon","coordinates":[[[-61.4,45.6],[-61.4,45.7],\
                [-61.3,45.7],[-61.3,45.6],[-61.4,45.6]]]},\
                "properties":{"Zone":"R1","ZONETYPE":"R1 Rural Residential","PLAN_":"Whycocomagh"}}]}
                """.utf8
            )
        )
        let result = try await ZoningFetcher(transport: service.transport).zones(
            for: .zoningInverness,
            bounds: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: false)
        )

        let query = await service.urls[0].query(percentEncoded: false)
        #expect(query?.contains("outFields=OBJECTID,Zone,ZONETYPE,PLAN_") == true)
        #expect(query?.contains("orderByFields=OBJECTID") == true)
        #expect(result.zones.count == 1)
        #expect(result.zones[0].description.label == "R1 — Rural Residential")
        #expect(result.zones[0].geometry.polygonParts.count == 1)
    }

    @Test("A layer that is not a zoning layer is refused, not queried")
    func onlyZoningLayersAreZoning() async {
        let service = Service(Data(#"{"features":[]}"#.utf8))

        await #expect(throws: FeatureOverlayFailure.refused(.noServiceURL)) {
            try await ZoningFetcher(transport: service.transport).zones(
                for: .nsWellLogs,
                bounds: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
                clearance: ProvinceLicenceClearance(allowsRestrictedLayers: true)
            )
        }
        #expect(await service.urls.isEmpty)
    }
}
