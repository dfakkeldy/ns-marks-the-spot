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
/// The stub is keyed on the NSPRD host, which comes from the catalog rather
/// than from a literal — so if the catalog ever moves the service, these stop
/// answering instead of quietly testing a host the app no longer uses.
@Suite("NSPRD lookups")
struct ParcelFetcherTests {
    /// Taken from a URL `ParcelQuery` actually builds, rather than written out
    /// here: a literal would keep answering after the catalog moved the
    /// service, and these would pass while testing an address the app no longer
    /// calls. The unreachable fallback makes that failure loud instead.
    private static var host: String {
        let url = try? ParcelQuery.pointQueryURL(
            latitude: 44.6, longitude: -63.5, clearance: clearance(.accepted)
        )
        return url?.host() ?? "no-nsprd-url.invalid"
    }

    private static func fetcher() -> ParcelFetcher {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return ParcelFetcher(urlSession: URLSession(configuration: configuration))
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
        StubURLProtocol.stub(host: Self.host, with: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(host: Self.host) }

        let result = try await Self.fetcher().parcels(
            pids: ["50334317"], clearance: Self.clearance(.accepted)
        )

        #expect(result.identifiedFeatures.map(\.pid) == ["50334317"])
    }

    @Test func aQueryThatMatchedNothingIsNotAFailure() async throws {
        // The whole point. NSPRD looked and found no parcel, and that has to
        // reach the caller as an answer rather than as an error — the two mean
        // opposite things to someone deciding whether a property exists.
        StubURLProtocol.stub(host: Self.host, with: .success(Data("""
        {"type": "FeatureCollection", "features": []}
        """.utf8)))
        defer { StubURLProtocol.clear(host: Self.host) }

        let result = try await Self.fetcher().parcels(
            pids: ["50334317"], clearance: Self.clearance(.accepted)
        )

        #expect(result.isEmpty)
    }

    @Test func anUnansweredLicenceStopsTheRequestBeforeItIsBuilt() async {
        StubURLProtocol.stub(host: Self.host, with: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await Self.fetcher().parcels(
                pids: ["50334317"], clearance: Self.clearance(.unknown)
            )
        }
        // Refusing after the fact would still have contacted a restricted
        // service on behalf of a user who never agreed to its licence.
        #expect(StubURLProtocol.requestCount(host: Self.host) == 0)
    }

    @Test func aDeclinedLicenceIsRefusedTheSameWay() async {
        StubURLProtocol.stub(host: Self.host, with: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.refused(.licenceNotAccepted)) {
            try await Self.fetcher().parcel(
                latitude: 44.6, longitude: -63.5, clearance: Self.clearance(.declined)
            )
        }
        #expect(StubURLProtocol.requestCount(host: Self.host) == 0)
    }

    @Test func aServiceThatIsDownIsNotAnEmptyParcelList() async {
        StubURLProtocol.stub(host: Self.host, with: .status(503))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.invalidHTTPStatus(503)) {
            try await Self.fetcher().parcels(
                pids: ["50334317"], clearance: Self.clearance(.accepted)
            )
        }
    }

    @Test func anArcGISErrorBodyIsNotAnEmptyParcelList() async {
        // HTTP 200 with an error inside. A fetcher that trusted the status code
        // would hand back zero parcels for a query the service never ran.
        StubURLProtocol.stub(host: Self.host, with: .success(Data("""
        {"error": {"code": 400, "message": "Unable to complete operation."}}
        """.utf8)))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.unreadable(
            .serviceError(code: 400, message: "Unable to complete operation.")
        )) {
            try await Self.fetcher().parcels(
                pids: ["50334317"], clearance: Self.clearance(.accepted)
            )
        }
    }

    @Test func aNetworkThatIsGoneIsReportedAsUnreachable() async {
        StubURLProtocol.stub(host: Self.host, with: .failure(.notConnectedToInternet))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.unreachable(.notConnectedToInternet)) {
            try await Self.fetcher().parcel(
                latitude: 44.6, longitude: -63.5, clearance: Self.clearance(.accepted)
            )
        }
    }

    @Test func abandoningALookupIsNotAnOutage() async {
        // Tapping a second parcel before the first answers cancels the first.
        // Reporting that as the service being unreachable would put an outage
        // in front of a user whose network is fine.
        StubURLProtocol.stub(host: Self.host, with: .failure(.cancelled))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.cancelled) {
            try await Self.fetcher().parcel(
                latitude: 44.6, longitude: -63.5, clearance: Self.clearance(.accepted)
            )
        }
    }

    @Test func nothingThatParsesAsAPIDIsRefusedRatherThanAsked() async {
        StubURLProtocol.stub(host: Self.host, with: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.refused(.noValidPID)) {
            try await Self.fetcher().parcels(
                pids: ["not a pid"], clearance: Self.clearance(.accepted)
            )
        }
        #expect(StubURLProtocol.requestCount(host: Self.host) == 0)
    }

    @Test func acoordinateThatIsNotOnEarthIsRefusedRatherThanAsked() async {
        StubURLProtocol.stub(host: Self.host, with: Self.collection(pid: "50334317", area: 1000))
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.refused(.invalidCoordinate)) {
            try await Self.fetcher().parcel(
                latitude: 91, longitude: -63.5, clearance: Self.clearance(.accepted)
            )
        }
        #expect(StubURLProtocol.requestCount(host: Self.host) == 0)
    }

    @Test func aLongPIDListIsSplitAndReassembledInBatchOrder() async throws {
        // The batches go out together and come back in whatever order they
        // finish. A parcel list that reshuffles itself run to run is a list two
        // people cannot compare, so the results are put back in batch order.
        let first = (1...ParcelQuery.pidBatchSize).map { String(format: "%08d", $0) }
        let second = String(format: "%08d", ParcelQuery.pidBatchSize + 1)

        StubURLProtocol.stub(host: Self.host, matching: [
            (second, Self.collection(pid: second, area: 200)),
            ("", Self.collection(pid: first[0], area: 100)),
        ])
        defer { StubURLProtocol.clear(host: Self.host) }

        let result = try await Self.fetcher().parcels(
            pids: first + [second], clearance: Self.clearance(.accepted)
        )

        #expect(StubURLProtocol.requestCount(host: Self.host) == 2)
        #expect(result.identifiedFeatures.map(\.pid) == [first[0], second])
    }

    @Test func oneBatchFailingFailsTheLookup() async {
        // Returning the batches that worked would be a parcel list missing
        // parcels, with nothing on it to say so — the user would read a partial
        // answer as a complete one.
        let first = (1...ParcelQuery.pidBatchSize).map { String(format: "%08d", $0) }
        let second = String(format: "%08d", ParcelQuery.pidBatchSize + 1)

        StubURLProtocol.stub(host: Self.host, matching: [
            (second, .status(500)),
            ("", Self.collection(pid: first[0], area: 100)),
        ])
        defer { StubURLProtocol.clear(host: Self.host) }

        await #expect(throws: ParcelLookupFailure.invalidHTTPStatus(500)) {
            try await Self.fetcher().parcels(
                pids: first + [second], clearance: Self.clearance(.accepted)
            )
        }
    }
}
