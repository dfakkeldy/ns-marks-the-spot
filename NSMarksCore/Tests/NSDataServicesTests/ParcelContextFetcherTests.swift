import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// The same contract as the parcel lookups, one level out: an empty context has
/// to mean the services were asked and had nothing mapped on this parcel, and
/// every other outcome has to be distinguishable from that.
@Suite("Parcel context lookups")
struct ParcelContextFetcherTests {
    private static let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)

    private static let square: PolygonHitTest.PolygonPart = [[
        GeoPoint(lat: 44.6, lng: -63.5),
        GeoPoint(lat: 44.6, lng: -63.4),
        GeoPoint(lat: 44.7, lng: -63.4),
        GeoPoint(lat: 44.6, lng: -63.5),
    ]]

    private static let nothing = StubTransport.Answer.body(Data(#"{"features":[]}"#.utf8))

    private static func answer(_ attributes: String) -> StubTransport.Answer {
        .body(Data(#"{"features":[{"attributes":\#(attributes)}]}"#.utf8))
    }

    /// The road and water services, taken from the catalog so a moved service
    /// stops matching rather than quietly testing the wrong host.
    private static func service(_ id: LayerID) -> String {
        LayerCatalog.descriptor(for: id)?.serviceURL?.absoluteString ?? "no-service.invalid"
    }

    /// Both fixtures carry a kind as well as a name, because the sublayers
    /// answer with different fallback kinds and the dedupe key is name *and*
    /// kind — the same river with six sublayer names is six features, correctly.
    @Test func roadsAndWaterAreKeptApartByWhichServiceAnswered() async throws {
        let stub = StubTransport(matching: [
            (
                Self.service(.waterFeatures),
                Self.answer(#"{"RIVNAME_1":"Margaree River","FEAT_DESC":"Watercourse line"}"#)
            ),
            (
                Self.service(.roads),
                Self.answer(#"{"STREET":"Trunk 19","ROADC_DESC":"Arterial"}"#)
            ),
        ])

        let context = try await ParcelContextFetcher(transport: stub.transport)
            .context(for: [Self.square], clearance: Self.cleared)

        #expect(context.roads == [
            .init(name: "Trunk 19", kind: "Arterial", relationship: .intersects)
        ])
        #expect(context.water == [
            .init(name: "Margaree River", kind: "Watercourse", relationship: .intersects)
        ])
        #expect(stub.log.count == 22)
    }

    @Test func everyRequestIsAPostCarryingTheParcelOutline() async throws {
        let stub = StubTransport(Self.nothing)
        _ = try await ParcelContextFetcher(transport: stub.transport)
            .context(for: [Self.square], clearance: Self.cleared)

        // A parcel outline is far past what a query string will carry, so these
        // have to be POSTs with the geometry in the body — as a GET some proxy
        // would truncate it and answer about a different shape.
        #expect(stub.log.count == 22)
        #expect(stub.log.all.allSatisfy { $0.httpMethod == "POST" })
        #expect(stub.log.all.allSatisfy { $0.url?.lastPathComponent == "query" })
        #expect(stub.log.all.allSatisfy {
            String(decoding: $0.httpBody ?? Data(), as: UTF8.self).contains("rings")
        })
    }

    @Test func aRoadThatBothCrossesAndPassesNearbyIsListedOnceAsCrossing() async throws {
        // Every road sublayer is asked twice, so the same road comes back from
        // both. Listing it twice would double the apparent road frontage;
        // listing it as "nearby" would understate a road that runs through the
        // property.
        let stub = StubTransport(matching: [
            (Self.service(.roads), Self.answer(#"{"STREET":"Trunk 19","ROADC_DESC":"Arterial"}"#)),
            ("", Self.nothing),
        ])

        let context = try await ParcelContextFetcher(transport: stub.transport)
            .context(for: [Self.square], clearance: Self.cleared)

        #expect(context.roads.count == 1)
        #expect(context.roads.first?.relationship == .intersects)
    }

    @Test func oneSublayerFailingFailsTheWholeLookup() async {
        // The alternative is a road list missing roads with nothing on it to
        // say so. A short list of roads reads as a complete one, and someone
        // screening a property for access would act on it.
        let stub = StubTransport(matching: [
            ("/8/query", .status(500)),
            ("", Self.nothing),
        ])
        let fetcher = ParcelContextFetcher(transport: stub.transport)

        await #expect(throws: ParcelContextFailure.invalidHTTPStatus(500)) {
            try await fetcher.context(for: [Self.square], clearance: Self.cleared)
        }
    }

    @Test func anArcGISErrorUnderA200IsNotAnEmptyContext() async {
        let stub = StubTransport(matching: [
            ("/8/query", .body(Data(#"{"error":{"code":400,"message":"no"}}"#.utf8))),
            ("", Self.nothing),
        ])
        let fetcher = ParcelContextFetcher(transport: stub.transport)

        await #expect(throws: ParcelContextFailure.unreadable(
            .serviceError(code: 400, message: "no")
        )) {
            try await fetcher.context(for: [Self.square], clearance: Self.cleared)
        }
    }

    @Test(arguments: [
        StubTransport.Answer.failure(URLError(.cancelled)),
        .failure(CancellationError()),
    ])
    func abandoningALookupIsNotAnOutage(answer: StubTransport.Answer) async {
        let fetcher = ParcelContextFetcher(transport: StubTransport(answer).transport)

        await #expect(throws: ParcelContextFailure.cancelled) {
            try await fetcher.context(for: [Self.square], clearance: Self.cleared)
        }
    }

    @Test func aNetworkThatIsGoneIsReportedAsUnreachable() async {
        let stub = StubTransport(.failure(URLError(.notConnectedToInternet)))
        let fetcher = ParcelContextFetcher(transport: stub.transport)

        await #expect(throws: ParcelContextFailure.unreachable(.notConnectedToInternet)) {
            try await fetcher.context(for: [Self.square], clearance: Self.cleared)
        }
    }

    @Test func anUnansweredLicenceStopsTheRequestBeforeItIsBuilt() async {
        let stub = StubTransport(Self.nothing)
        let fetcher = ParcelContextFetcher(transport: stub.transport)

        await #expect(throws: ParcelContextFailure.refused(.licenceNotAccepted)) {
            try await fetcher.context(for: [Self.square], clearance: .none)
        }
        #expect(stub.log.count == 0)
    }

    @Test func aParcelWithNoOutlineIsRefusedRatherThanAnsweredWithNothing() async {
        // Nothing was asked, so nothing was learned. Returning an empty context
        // would render identically to a parcel with no road and no water on it.
        let stub = StubTransport(Self.nothing)
        let fetcher = ParcelContextFetcher(transport: stub.transport)

        await #expect(throws: ParcelContextFailure.refused(.noBoundary)) {
            try await fetcher.context(for: [], clearance: Self.cleared)
        }
        #expect(stub.log.count == 0)
    }

    @Test func servicesWithNothingMappedHereGiveAnEmptyContext() async throws {
        // The one honest empty: all twenty-two answered, none had anything on
        // this parcel.
        let context = try await ParcelContextFetcher(transport: StubTransport(Self.nothing).transport)
            .context(for: [Self.square], clearance: Self.cleared)

        #expect(context == ParcelContext())
    }
}
