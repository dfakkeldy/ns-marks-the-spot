import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

@Suite("Labelling a mineral point")
struct ResourcePointLabelTests {
    @Test("An occurrence reads as its name and its commodities")
    func anOccurrenceNamesItsCommodities() {
        #expect(
            ResourcePointOverlay.label(
                for: .mineralOccurrences,
                properties: ["Name": .string("Gold Brook"), "Comm_list": .string("Au, Ag")]
            ) == "Gold Brook · Au, Ag"
        )
    }

    @Test("An empty commodity list falls back to the primary commodity")
    func anEmptyListStillNamesTheCommodity() {
        #expect(
            ResourcePointOverlay.label(
                for: .mineralOccurrences,
                properties: [
                    "Name": .string("Gold Brook"),
                    "Comm_list": .string("  "),
                    "Comm_prim": .string("Au"),
                ]
            ) == "Gold Brook · Au"
        )
    }

    @Test("A mine opening reads as its name and its hazard degree")
    func anOpeningNamesItsHazard() {
        #expect(
            ResourcePointOverlay.label(
                for: .abandonedMines,
                properties: ["Name": .string("Shaft 4"), "Degree_Haz": .string("High")]
            ) == "Shaft 4 · Hazard: High"
        )
    }

    @Test("A record with no name is still named for what it is")
    func anUnnamedRecordIsNotBlank() {
        #expect(
            ResourcePointOverlay.label(for: .mineralOccurrences, properties: [:])
                == "Mineral occurrence"
        )
        #expect(
            ResourcePointOverlay.label(for: .abandonedMines, properties: ["Name": .null])
                == "Abandoned mine opening"
        )
    }
}

@Suite("Fetching mineral points")
struct ResourcePointFetcherTests {
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

    @Test("The layer's own fields are asked for, keyed on geo_id")
    func theCatalogDecidesTheQuery() async throws {
        let service = Service(
            Data(
                """
                {"type":"FeatureCollection","features":[{"type":"Feature","id":"1",\
                "geometry":{"type":"Point","coordinates":[-61.35,45.65]},\
                "properties":{"Name":"Shaft 4","Degree_Haz":"Low"}}]}
                """.utf8
            )
        )
        let points = try await ResourcePointFetcher(transport: service.transport).points(
            for: .abandonedMines,
            in: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: false)
        )

        let query = try #require(await service.urls.first?.query(percentEncoded: false))
        #expect(query.contains("outFields=geo_id,ShaftID,Name,Opening_ty,Degree_Haz,Protection"))
        #expect(query.contains("orderByFields=geo_id"))
        #expect(points.map(\.label) == ["Shaft 4 · Hazard: Low"])
        #expect(points[0].location == GeoPoint(lat: 45.65, lng: -61.35))
    }

    @Test("A layer that is not a point inventory is refused, not queried")
    func onlyThePointInventoriesQualify() async {
        let service = Service(Data(#"{"features":[]}"#.utf8))

        await #expect(throws: FeatureOverlayFailure.refused(.noServiceURL)) {
            try await ResourcePointFetcher(transport: service.transport).points(
                for: .zoningHalifax,
                in: GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3),
                clearance: ProvinceLicenceClearance(allowsRestrictedLayers: true)
            )
        }
        #expect(await service.urls.isEmpty)
    }
}
