import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

private let proximityViewport = GeoBoundingBox(
    south: 45.6, west: -61.4, north: 45.7, east: -61.3
)

/// Splits requests by whether they are the occurrence query or the NSPRD one.
private actor TwoServices {
    private(set) var occurrenceURLs: [URL] = []
    private(set) var parcelBodies: [String] = []
    private let occurrences: Data
    private let parcels: [Data]

    init(occurrences: Data, parcels: [Data]) {
        self.occurrences = occurrences
        self.parcels = parcels
    }

    func take(_ request: URLRequest) -> Data {
        let url = request.url!
        if url.absoluteString.contains("mineral_occurrence_database") {
            occurrenceURLs.append(url)
            return occurrences
        }
        let index = parcelBodies.count
        parcelBodies.append(String(decoding: request.httpBody ?? Data(), as: UTF8.self))
        return index < parcels.count ? parcels[index] : Data(#"{"features":[]}"#.utf8)
    }

    nonisolated var transport: HTTPTransport {
        HTTPTransport { request in
            (
                await self.take(request),
                HTTPURLResponse(
                    url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
                )!
            )
        }
    }
}

private func occurrencePoints(_ count: Int) -> Data {
    let features = (0..<count).map { index in
        """
        {"type":"Feature","id":"\(index)","geometry":{"type":"Point",\
        "coordinates":[\(-61.35 + Double(index) / 10_000),45.65]},\
        "properties":{"geo_id":"\(index)","Name":"Occurrence \(index)"}}
        """
    }
    return Data(
        #"{"type":"FeatureCollection","features":[\#(features.joined(separator: ","))]}"#.utf8
    )
}

private func parcelCollection(pids: [String]) -> Data {
    let features = pids.map { pid in
        """
        {"type":"Feature","geometry":{"type":"Polygon","coordinates":\
        [[[-61.4,45.6],[-61.4,45.7],[-61.3,45.7],[-61.3,45.6],[-61.4,45.6]]]},\
        "properties":{"PID":"\(pid)"}}
        """
    }
    return Data(
        #"{"type":"FeatureCollection","features":[\#(features.joined(separator: ","))]}"#.utf8
    )
}

@Suite("Deriving mineral-proximity parcels")
struct MineralProximityTests {
    private let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
    private let notCleared = ProvinceLicenceClearance(allowsRestrictedLayers: false)

    @Test("Without the Province licence nothing is asked, of either service")
    func theDerivedLayerIsGatedEvenThoughItsFirstHalfIsOpen() async {
        let service = TwoServices(occurrences: occurrencePoints(1), parcels: [])

        await #expect(throws: MineralProximityOverlay.Failure.refused(.licenceNotAccepted)) {
            try await MineralProximityFetcher(transport: service.transport)
                .parcels(in: proximityViewport, clearance: notCleared)
        }
        #expect(await service.occurrenceURLs.isEmpty)
        #expect(await service.parcelBodies.isEmpty)
    }

    @Test("An empty occurrence result means NSPRD is never asked")
    func noOccurrencesMeansNoRestrictedRequest() async throws {
        let service = TwoServices(occurrences: occurrencePoints(0), parcels: [])
        let parcels = try await MineralProximityFetcher(transport: service.transport)
            .parcels(in: proximityViewport, clearance: cleared)

        #expect(parcels.isEmpty)
        #expect(await service.occurrenceURLs.count == 1)
        #expect(await service.parcelBodies.isEmpty)
    }

    @Test("The occurrence query carries the same kilometre the parcel query does")
    func bothHalvesUseOneRadius() async throws {
        let service = TwoServices(
            occurrences: occurrencePoints(1), parcels: [parcelCollection(pids: ["01234567"])]
        )
        _ = try await MineralProximityFetcher(transport: service.transport)
            .parcels(in: proximityViewport, clearance: cleared)

        let occurrenceQuery = try #require(
            await service.occurrenceURLs.first?.query(percentEncoded: false)
        )
        #expect(occurrenceQuery.contains("distance=1000&units=esriSRUnit_Meter"))

        let body = try #require(await service.parcelBodies.first)
        #expect(body.contains("distance=1000"))
        #expect(body.contains("geometryType=esriGeometryMultipoint"))
        #expect(body.contains("outFields=PID"))
    }

    @Test("A parcel returned by two occurrence batches is drawn once")
    func aParcelNearTwoOccurrencesIsOneParcel() async throws {
        // Two batches: 501 occurrence points split 500 + 1, both answering with
        // the same parcel.
        let service = TwoServices(
            occurrences: occurrencePoints(MineralProximityOverlay.pointsPerBatch + 1),
            parcels: [
                parcelCollection(pids: ["01234567", "01234568"]),
                parcelCollection(pids: ["01234567"]),
            ]
        )
        let parcels = try await MineralProximityFetcher(transport: service.transport)
            .parcels(in: proximityViewport, clearance: cleared)

        #expect(await service.parcelBodies.count == 2)
        #expect(parcels.map(\.pid) == ["01234567", "01234568"])
    }

    @Test("A numeric PID is not read, because it is not the same identifier")
    func aNumericPIDIsNotAPID() async throws {
        let service = TwoServices(
            occurrences: occurrencePoints(1),
            parcels: [
                Data(
                    """
                    {"type":"FeatureCollection","features":[{"type":"Feature",\
                    "geometry":{"type":"Polygon","coordinates":\
                    [[[-61.4,45.6],[-61.4,45.7],[-61.3,45.7],[-61.3,45.6],[-61.4,45.6]]]},\
                    "properties":{"PID":1234567}}]}
                    """.utf8
                )
            ]
        )
        let parcels = try await MineralProximityFetcher(transport: service.transport)
            .parcels(in: proximityViewport, clearance: cleared)

        #expect(parcels.isEmpty)
    }

    @Test("Occurrence points are batched at the web's batch size")
    func batchesMatchTheWeb() {
        let points = (0..<1_001).map { GeoPoint(lat: 45.0, lng: -61.0 + Double($0) / 1_000) }
        let batches = MineralProximityOverlay.batches(of: points)

        #expect(batches.map(\.count) == [500, 500, 1])
    }
}
