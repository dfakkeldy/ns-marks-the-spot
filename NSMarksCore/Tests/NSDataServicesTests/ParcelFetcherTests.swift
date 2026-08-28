import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// The contract these exist for: nothing here may let a failure to reach NSPRD
/// arrive at the user as "there is no parcel here", and nothing may let an
/// honest empty answer be dressed up as a failure.
@Suite("NSPRD lookups")
struct ParcelFetcherTests {
    private static let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)

    private static func collection(pid: String, area: Double) -> StubTransport.Answer {
        .body(Data("""
        {
          "type": "FeatureCollection",
          "features": [{"properties": {"PID": "\(pid)", "SHAPE.AREA": \(area)}, "geometry": null}]
        }
        """.utf8))
    }

    @Test func aParcelComesBackWithItsIdentifier() async throws {
        let stub = StubTransport(Self.collection(pid: "50334317", area: 1000))

        let result = try await ParcelFetcher(transport: stub.transport)
            .parcels(pids: ["50334317"], clearance: Self.cleared)

        #expect(result.identifiedFeatures.map(\.pid) == ["50334317"])
    }

    @Test func aQueryThatMatchedNothingIsNotAFailure() async throws {
        // The whole point. NSPRD looked and found no parcel, and that has to
        // reach the caller as an answer rather than as an error — the two mean
        // opposite things to someone deciding whether a property exists.
        let stub = StubTransport(.body(Data(#"{"type":"FeatureCollection","features":[]}"#.utf8)))

        let result = try await ParcelFetcher(transport: stub.transport)
            .parcels(pids: ["50334317"], clearance: Self.cleared)

        #expect(result.isEmpty)
    }

    @Test func anUnansweredLicenceStopsTheRequestBeforeItIsBuilt() async {
        let stub = StubTransport(Self.collection(pid: "50334317", area: 1000))
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await fetcher.parcels(pids: ["50334317"], clearance: .none)
        }
        // Refusing after the fact would still have contacted a restricted
        // service on behalf of a user who never agreed to its licence.
        #expect(stub.log.count == 0)
    }

    @Test func aDeclinedLicenceIsRefusedTheSameWay() async {
        let stub = StubTransport(Self.collection(pid: "50334317", area: 1000))
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await fetcher.parcel(latitude: 44.6, longitude: -63.5, clearance: .none)
        }
        #expect(stub.log.count == 0)
    }

    @Test func aServiceThatIsDownIsNotAnEmptyParcelList() async {
        let fetcher = ParcelFetcher(transport: StubTransport(.status(503)).transport)

        await #expect(throws: ParcelLookupFailure.invalidHTTPStatus(503)) {
            try await fetcher.parcels(pids: ["50334317"], clearance: Self.cleared)
        }
    }

    @Test func anArcGISErrorBodyIsNotAnEmptyParcelList() async {
        // HTTP 200 with an error inside. A fetcher that trusted the status code
        // would hand back zero parcels for a query the service never ran.
        let stub = StubTransport(.body(Data("""
        {"error": {"code": 400, "message": "Unable to complete operation."}}
        """.utf8)))
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.unreadable(
            .serviceError(code: 400, message: "Unable to complete operation.")
        )) {
            try await fetcher.parcels(pids: ["50334317"], clearance: Self.cleared)
        }
    }

    @Test func aNetworkThatIsGoneIsReportedAsUnreachable() async {
        let stub = StubTransport(.failure(URLError(.notConnectedToInternet)))
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.unreachable(.notConnectedToInternet)) {
            try await fetcher.parcel(latitude: 44.6, longitude: -63.5, clearance: Self.cleared)
        }
    }

    @Test(arguments: [
        StubTransport.Answer.failure(URLError(.cancelled)),
        .failure(CancellationError()),
    ])
    func abandoningALookupIsNotAnOutage(answer: StubTransport.Answer) async {
        // Tapping a second parcel before the first answers cancels the first,
        // and it arrives as either of these depending on where the cancellation
        // landed. Reporting it as the service being unreachable would put an
        // outage in front of a user whose network is fine.
        let fetcher = ParcelFetcher(transport: StubTransport(answer).transport)

        await #expect(throws: ParcelLookupFailure.cancelled) {
            try await fetcher.parcel(latitude: 44.6, longitude: -63.5, clearance: Self.cleared)
        }
    }

    @Test func nothingThatParsesAsAPIDIsRefusedRatherThanAsked() async {
        let stub = StubTransport(Self.collection(pid: "50334317", area: 1000))
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.refused(.noValidPID)) {
            try await fetcher.parcels(pids: ["not a pid"], clearance: Self.cleared)
        }
        #expect(stub.log.count == 0)
    }

    @Test func acoordinateThatIsNotOnEarthIsRefusedRatherThanAsked() async {
        let stub = StubTransport(Self.collection(pid: "50334317", area: 1000))
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.refused(.invalidCoordinate)) {
            try await fetcher.parcel(latitude: 91, longitude: -63.5, clearance: Self.cleared)
        }
        #expect(stub.log.count == 0)
    }

    @Test func aLongPIDListIsSplitAndReassembledInBatchOrder() async throws {
        // The batches go out together and come back in whatever order they
        // finish. A parcel list that reshuffles itself run to run is a list two
        // people cannot compare, so the results are put back in batch order.
        let first = (1...ParcelQuery.pidBatchSize).map { String(format: "%08d", $0) }
        let second = String(format: "%08d", ParcelQuery.pidBatchSize + 1)
        let stub = StubTransport(matching: [
            (second, Self.collection(pid: second, area: 200)),
            ("", Self.collection(pid: first[0], area: 100)),
        ])

        let result = try await ParcelFetcher(transport: stub.transport)
            .parcels(pids: first + [second], clearance: Self.cleared)

        #expect(stub.log.count == 2)
        #expect(result.identifiedFeatures.map(\.pid) == [first[0], second])
    }

    @Test func oneBatchFailingFailsTheLookup() async {
        // Returning the batches that worked would be a parcel list missing
        // parcels, with nothing on it to say so — the user would read a partial
        // answer as a complete one.
        let first = (1...ParcelQuery.pidBatchSize).map { String(format: "%08d", $0) }
        let second = String(format: "%08d", ParcelQuery.pidBatchSize + 1)
        let stub = StubTransport(matching: [
            (second, .status(500)),
            ("", Self.collection(pid: first[0], area: 100)),
        ])
        let fetcher = ParcelFetcher(transport: stub.transport)

        await #expect(throws: ParcelLookupFailure.invalidHTTPStatus(500)) {
            try await fetcher.parcels(pids: first + [second], clearance: Self.cleared)
        }
    }
}
