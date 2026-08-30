import Foundation
import GeoCore
import Testing

@testable import NSDataServices

@Suite("NSPRD envelope query for snapping")
struct ParcelEnvelopeQueryTests {
    static let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
    static let bounds = GeoBoundingBox(
        south: 44.64, west: -63.59, north: 44.66, east: -63.57
    )

    @Test func refusesWithoutLicenceBeforeAssemblingAURL() {
        #expect(throws: ParcelQuery.Refusal.licenceNotAccepted) {
            try ParcelQuery.envelopeQueryURL(bounds: Self.bounds, clearance: .none)
        }
    }

    @Test func asksForAnEnvelopeOfPIDPolygons() throws {
        let url = try ParcelQuery.envelopeQueryURL(bounds: Self.bounds, clearance: Self.cleared)
        let query = try #require(url.query(percentEncoded: false))
        #expect(query.contains("geometryType=esriGeometryEnvelope"))
        #expect(query.contains("inSR=4326"))
        #expect(query.contains("outFields=PID"))
        #expect(query.contains("returnGeometry=true"))
        #expect(query.contains("orderByFields=PID"))
        #expect(query.contains("resultRecordCount=\(CaptureSpec.Snap.maxParcels + 1)"))
        #expect(query.contains("f=geojson"))
        // The envelope is west,south,east,north — ArcGIS order, matching the
        // overlay helper the web's snap source already uses.
        #expect(query.contains("geometry=-63.59,44.64,-63.57,44.66"))
    }

    @Test func anInvertedBoxIsAnInvalidCoordinate() {
        let inverted = GeoBoundingBox(south: 45, west: -63, north: 44, east: -64)
        #expect(throws: ParcelQuery.Refusal.invalidCoordinate) {
            try ParcelQuery.envelopeQueryURL(bounds: inverted, clearance: Self.cleared)
        }
    }
}

@Suite("NSPRD envelope fetch for snapping")
struct ParcelSnapFetcherTests {
    static let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
    static let bounds = GeoBoundingBox(
        south: 44.64, west: -63.59, north: 44.66, east: -63.57
    )

    @Test func aLicenceRefuseNeverContactsTheService() async {
        let stub = StubTransport(.body(Data(#"{"type":"FeatureCollection","features":[]}"#.utf8)))
        let fetcher = ParcelFetcher(transport: stub.transport)
        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await fetcher.parcels(in: Self.bounds, clearance: .none)
        }
        #expect(stub.log.count == 0)
    }

    @Test func anEmptyViewportIsReadyNotAbsent() async throws {
        let stub = StubTransport(.body(Data(#"{"type":"FeatureCollection","features":[]}"#.utf8)))
        let result = try await ParcelFetcher(transport: stub.transport)
            .parcels(in: Self.bounds, clearance: Self.cleared)
        #expect(result.isEmpty)
    }

    @Test func exceededTransferLimitIsDenseNotASubset() async {
        let stub = StubTransport(.body(Data("""
        {
          "type": "FeatureCollection",
          "exceededTransferLimit": true,
          "features": [{"properties": {"PID": "12345678"}, "geometry": null}]
        }
        """.utf8)))
        let fetcher = ParcelFetcher(transport: stub.transport)
        await #expect(throws: ParcelLookupFailure.tooManyParcels(count: 1)) {
            try await fetcher.parcels(in: Self.bounds, clearance: Self.cleared)
        }
    }

    @Test func oneOverTheCapIsDense() async {
        var features: [String] = []
        for index in 0..<(CaptureSpec.Snap.maxParcels + 1) {
            features.append(
                "{\"properties\":{\"PID\":\"\(String(format: "%08d", 10_000_000 + index))\"},\"geometry\":null}"
            )
        }
        let body = "{\"type\":\"FeatureCollection\",\"features\":[\(features.joined(separator: ","))]}"
        let stub = StubTransport(.body(Data(body.utf8)))
        let fetcher = ParcelFetcher(transport: stub.transport)
        await #expect(throws: ParcelLookupFailure.tooManyParcels(count: CaptureSpec.Snap.maxParcels + 1)) {
            try await fetcher.parcels(in: Self.bounds, clearance: Self.cleared)
        }
    }
}
