import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// The contract these exist for: nothing here may let a failure to reach NSPRD
/// arrive at the user as "there is no parcel here", and nothing may let an
/// honest empty answer be dressed up as a failure.
///
/// Each test answers on its own stub channel rather than on the NSPRD host.
/// The host comes from the catalog, so every test here addresses the same one
/// and keying the stubs on it would have tests running side by side overwrite
/// each other's answers and request counts. That the address is the web's is
/// pinned separately, by `ParcelQueryTests`.
@Suite("NSPRD lookups")
struct ParcelFetcherTests {
    /// A fetcher whose requests are answered on `channel`, and only there.
    ///
    /// Stubbing and session-building are one call so a test cannot register its
    /// answers on one channel and then send its requests down another, which
    /// fails as a 404 a long way from the mistake.
    private static func fetcher(
        _ channel: String,
        answering response: StubURLProtocol.Response
    ) -> ParcelFetcher {
        StubURLProtocol.stub(channel: channel, with: response)
        return ParcelFetcher(urlSession: StubURLProtocol.session(channel: channel))
    }

    private static func fetcher(
        _ channel: String,
        answering responses: [(String, StubURLProtocol.Response)]
    ) -> ParcelFetcher {
        StubURLProtocol.stub(channel: channel, matching: responses)
        return ParcelFetcher(urlSession: StubURLProtocol.session(channel: channel))
    }

    private static func clearance(_ state: ProvinceLicenceState) -> ProvinceLicenceClearance {
        ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage(initial: state)).clearance
    }

    private static func collection(pid: String, area: Double) -> StubURLProtocol.Response {
        .success(Data("""
        {
          "type": "FeatureCollection",
          "features": [{"properties": {"PID": "\(pid)", "SHAPE.AREA": \(area)}, "geometry": null}]
        }
        """.utf8))
    }

    @Test func aParcelComesBackWithItsIdentifier() async throws {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(channel: channel) }

        let result = try await fetcher.parcels(
            pids: ["50334317"], clearance: Self.clearance(.accepted)
        )

        #expect(result.identifiedFeatures.map(\.pid) == ["50334317"])
    }

    @Test func aQueryThatMatchedNothingIsNotAFailure() async throws {
        // The whole point. NSPRD looked and found no parcel, and that has to
        // reach the caller as an answer rather than as an error — the two mean
        // opposite things to someone deciding whether a property exists.
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: .success(Data("""
        {"type": "FeatureCollection", "features": []}
        """.utf8)))
        defer { StubURLProtocol.clear(channel: channel) }

        let result = try await fetcher.parcels(
            pids: ["50334317"], clearance: Self.clearance(.accepted)
        )

        #expect(result.isEmpty)
    }

    @Test func anUnansweredLicenceStopsTheRequestBeforeItIsBuilt() async {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await fetcher.parcels(pids: ["50334317"], clearance: Self.clearance(.unknown))
        }
        // Refusing after the fact would still have contacted a restricted
        // service on behalf of a user who never agreed to its licence.
        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
    }

    @Test func aDeclinedLicenceIsRefusedTheSameWay() async {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await fetcher.parcel(
                latitude: 44.6, longitude: -63.5, clearance: Self.clearance(.declined)
            )
        }
        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
    }

    @Test func aServiceThatIsDownIsNotAnEmptyParcelList() async {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: .status(503))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.invalidHTTPStatus(503)) {
            try await fetcher.parcels(pids: ["50334317"], clearance: Self.clearance(.accepted))
        }
    }

    @Test func anArcGISErrorBodyIsNotAnEmptyParcelList() async {
        // HTTP 200 with an error inside. A fetcher that trusted the status code
        // would hand back zero parcels for a query the service never ran.
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: .success(Data("""
        {"error": {"code": 400, "message": "Unable to complete operation."}}
        """.utf8)))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.unreadable(
            .serviceError(code: 400, message: "Unable to complete operation.")
        )) {
            try await fetcher.parcels(pids: ["50334317"], clearance: Self.clearance(.accepted))
        }
    }

    @Test func aNetworkThatIsGoneIsReportedAsUnreachable() async {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: .failure(.notConnectedToInternet))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.unreachable(.notConnectedToInternet)) {
            try await fetcher.parcel(
                latitude: 44.6, longitude: -63.5, clearance: Self.clearance(.accepted)
            )
        }
    }

    @Test func abandoningALookupIsNotAnOutage() async {
        // Tapping a second parcel before the first answers cancels the first.
        // Reporting that as the service being unreachable would put an outage
        // in front of a user whose network is fine.
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: .failure(.cancelled))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.cancelled) {
            try await fetcher.parcel(
                latitude: 44.6, longitude: -63.5, clearance: Self.clearance(.accepted)
            )
        }
    }

    @Test func nothingThatParsesAsAPIDIsRefusedRatherThanAsked() async {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.refused(.noValidPID)) {
            try await fetcher.parcels(pids: ["not a pid"], clearance: Self.clearance(.accepted))
        }
        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
    }

    @Test func acoordinateThatIsNotOnEarthIsRefusedRatherThanAsked() async {
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.refused(.invalidCoordinate)) {
            try await fetcher.parcel(
                latitude: 91, longitude: -63.5, clearance: Self.clearance(.accepted)
            )
        }
        #expect(StubURLProtocol.requestCount(channel: channel) == 0)
    }

    @Test func aLongPIDListIsSplitAndReassembledInBatchOrder() async throws {
        // The batches go out together and come back in whatever order they
        // finish. A parcel list that reshuffles itself run to run is a list two
        // people cannot compare, so the results are put back in batch order.
        let first = (1...ParcelQuery.pidBatchSize).map { String(format: "%08d", $0) }
        let second = String(format: "%08d", ParcelQuery.pidBatchSize + 1)
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: [
            (second, Self.collection(pid: second, area: 200)),
            ("", Self.collection(pid: first[0], area: 100)),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        let result = try await fetcher.parcels(
            pids: first + [second], clearance: Self.clearance(.accepted)
        )

        #expect(StubURLProtocol.requestCount(channel: channel) == 2)
        #expect(result.identifiedFeatures.map(\.pid) == [first[0], second])
    }

    @Test func oneBatchFailingFailsTheLookup() async {
        // Returning the batches that worked would be a parcel list missing
        // parcels, with nothing on it to say so — the user would read a partial
        // answer as a complete one.
        let first = (1...ParcelQuery.pidBatchSize).map { String(format: "%08d", $0) }
        let second = String(format: "%08d", ParcelQuery.pidBatchSize + 1)
        let channel = #function
        let fetcher = Self.fetcher(channel, answering: [
            (second, .status(500)),
            ("", Self.collection(pid: first[0], area: 100)),
        ])
        defer { StubURLProtocol.clear(channel: channel) }

        await #expect(throws: ParcelLookupFailure.invalidHTTPStatus(500)) {
            try await fetcher.parcels(
                pids: first + [second], clearance: Self.clearance(.accepted)
            )
        }
    }
}
