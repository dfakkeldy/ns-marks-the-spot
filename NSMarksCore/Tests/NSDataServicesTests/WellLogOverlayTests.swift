import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

@Suite("Reading a well log")
struct WellLogRecordTests {
    private let somewhere = GeoPoint(lat: 45.65, lng: -61.35)

    @Test("The accuracy bands are the manual's boundaries")
    func theBandsFollowTheManual() {
        #expect(WellLogOverlay.classify(metres: 50) == .surveyed)
        #expect(WellLogOverlay.classify(metres: 50.1) == .mapReferenced)
        #expect(WellLogOverlay.classify(metres: 800) == .mapReferenced)
        #expect(WellLogOverlay.classify(metres: 1_500) == .sheetReferenced)
        #expect(WellLogOverlay.classify(metres: 1_500.1) == .community)
    }

    @Test("A zero or missing estimate is unknown, not a perfectly located well")
    func noEstimateIsNotPrecision() {
        #expect(WellLogOverlay.classify(metres: 0) == .unknown)
        #expect(WellLogOverlay.classify(metres: -1) == .unknown)
        #expect(WellLogOverlay.classify(metres: nil) == .unknown)
        #expect(WellLogOverlay.classify(metres: .nan) == .unknown)
    }

    @Test("A coarse record is described as a report near a place")
    func aCoarseRecordIsNotALocatedWell() {
        let community = WellLogOverlay.statement(for: .community, metres: 8_000)
        #expect(community == "A well was reported within about 8 km of here. "
            + "The marker is not the well location.")
        #expect(
            WellLogOverlay.statement(for: .surveyed, metres: 30)
                == "Surveyed coordinate, reported accurate to about ±30 m."
        )
        #expect(
            WellLogOverlay.statement(for: .unknown, metres: 1_200)
                .hasPrefix("This record carries no location-accuracy estimate.")
        )
    }

    @Test("Distances read in metres below a kilometre and kilometres above")
    func distancesReadTheWayTheWebWritesThem() {
        #expect(WellLogOverlay.accuracyDistance(800) == "800 m")
        #expect(WellLogOverlay.accuracyDistance(1_000) == "1 km")
        #expect(WellLogOverlay.accuracyDistance(1_500) == "1.5 km")
        #expect(WellLogOverlay.accuracyDistance(8_000) == "8 km")
    }

    @Test("The no-data marker is dropped, and a flowing well's reading is not")
    func theSentinelIsNotADepth() {
        let record = WellLogOverlay.record(
            at: somewhere,
            properties: [
                "DEPTH": .number(-9_999),
                "STATIC": .number(-3.5),
                "YIELD_LPM": .number(22.7),
            ]
        )

        #expect(record.depthMetres == nil)
        #expect(record.staticLevelMetres == -3.5)
        #expect(record.yieldLitresPerMinute == 22.7)
    }

    @Test("The completion date is read in UTC, as the web reads it")
    func theDateDoesNotSlideWithTheReader() {
        // 2004-06-01T00:00:00Z. Read in local time west of Greenwich this
        // would report the day before.
        #expect(
            WellLogOverlay.completionDate(.number(1_086_048_000_000)) == "2004-06-01"
        )
        #expect(WellLogOverlay.completionDate(.null) == nil)
        #expect(WellLogOverlay.completionDate(.string("2004-06-01")) == nil)
    }

    @Test("The accuracy estimate travels with the record")
    func theEstimateStaysAttached() {
        let record = WellLogOverlay.record(
            at: somewhere,
            properties: [
                "WELLNUM": .string(" 12345 "),
                "GEOREF_A": .number(8_000),
                "GEOREF_S": .string("Community centroid"),
            ]
        )

        #expect(record.wellNumber == "12345")
        #expect(record.accuracy == .community)
        #expect(record.accuracyMetres == 8_000)
        #expect(record.coordinateSource == "Community centroid")
        #expect(record.accuracyStatement.contains("not the well location"))
    }
}

@Suite("Fetching well logs")
struct WellLogFetcherTests {
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

    private let viewport = GeoBoundingBox(
        south: 45.6, west: -61.4, north: 45.7, east: -61.3
    )

    @Test("The owner's address is never asked for")
    func theAddressColumnIsExcludedAtTheQuery() async throws {
        let service = Service(Data(#"{"type":"FeatureCollection","features":[]}"#.utf8))
        _ = try await WellLogFetcher(transport: service.transport).wells(
            in: viewport,
            filter: .all,
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: true)
        )

        let query = try #require(await service.urls.first?.query(percentEncoded: false))
        #expect(query.contains("outFields=OBJECTID,WELLNUM,DATE,DEPTH,CASING,BEDROCK,STATIC,YIELD_LPM,GEOREF_A,GEOREF_S"))
        #expect(!query.contains("ADDRESS"))
    }

    @Test("The surveyed filter is applied by the service, not after the transfer")
    func coarseRecordsAreNeverTransferred() async throws {
        let service = Service(Data(#"{"type":"FeatureCollection","features":[]}"#.utf8))
        _ = try await WellLogFetcher(transport: service.transport).wells(
            in: viewport,
            filter: .surveyed,
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: true)
        )

        #expect(
            await service.urls.first?.query(percentEncoded: false)?
                .contains("where=GEOREF_A > 0 AND GEOREF_A <= 50") == true
        )
    }

    @Test("A record that is not a point is not placed")
    func onlyPointsArePlaced() async throws {
        let service = Service(
            Data(
                """
                {"type":"FeatureCollection","features":[\
                {"type":"Feature","id":"1","geometry":{"type":"Point",\
                "coordinates":[-61.35,45.65]},"properties":{"WELLNUM":"1","GEOREF_A":40}},\
                {"type":"Feature","id":"2","geometry":{"type":"LineString",\
                "coordinates":[[-61.35,45.65],[-61.34,45.66]]},"properties":{"WELLNUM":"2"}}]}
                """.utf8
            )
        )
        let wells = try await WellLogFetcher(transport: service.transport).wells(
            in: viewport,
            filter: .all,
            clearance: ProvinceLicenceClearance(allowsRestrictedLayers: true)
        )

        #expect(wells.map(\.wellNumber) == ["1"])
        #expect(wells[0].location == GeoPoint(lat: 45.65, lng: -61.35))
        #expect(wells[0].accuracy == .surveyed)
    }
}
