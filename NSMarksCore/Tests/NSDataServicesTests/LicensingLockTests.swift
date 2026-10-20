import Foundation
import GeoCore
import MapCatalog
import Testing
@testable import NSDataServices

@Suite("Unconfirmed licensing uses fail closed")
struct LicensingLockTests {
    private let bounds = GeoBoundingBox(south: 46.2, west: -61.3, north: 46.4, east: -61.1)
    private let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)

    @Test(arguments: [LayerID.zoningInverness, .zoningVictoria, .zoningRichmond, .zoningCumberland])
    func municipalQueriesAreRefused(_ id: LayerID) {
        #expect(throws: FeatureOverlayQuery.Refusal.rightsPending) {
            try FeatureOverlayQuery.plan(for: id, bounds: bounds, outFields: ["*"], clearance: cleared)
        }
    }

    private actor Requests {
        var count = 0
        func record() { count += 1 }
    }

    @Test(arguments: [LayerID.zoningInverness, .zoningVictoria, .zoningRichmond, .zoningCumberland])
    func municipalFetcherNeverContactsTheService(_ id: LayerID) async {
        let requests = Requests()
        let transport = HTTPTransport { request in
            await requests.record()
            return (Data(#"{"features":[]}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        await #expect(throws: FeatureOverlayFailure.refused(.rightsPending)) {
            try await ZoningFetcher(transport: transport).zones(for: id, bounds: bounds, clearance: cleared)
        }
        #expect(await requests.count == 0)
    }

    @Test func halifaxStillHasAnOpenQuery() throws {
        let plan = try FeatureOverlayQuery.plan(for: .zoningHalifax, bounds: bounds, outFields: ["*"], clearance: cleared)
        #expect(plan.serviceURL.absoluteString.contains("ZoningBoundaries"))
    }

    @Test(arguments: LayerCatalog.restrictedLayerIDs)
    func acceptanceDoesNotGrantReproduction(_ id: LayerID) {
        #expect(throws: LayerUse.Refusal.self) { try LayerUse.requireReproduction([id]) }
    }

    @Test func fletcherDisplayAndOpenDataRemainAvailable() throws {
        let fletcher = try #require(LayerCatalog.descriptor(for: .fletcher))
        #expect(fletcher.availability == .available)
        #expect(LayerUse.queryLockReason(for: fletcher) == nil)
        #expect(throws: LayerUse.Refusal.self) { try LayerUse.requireReproduction([.fletcher]) }
        try LayerUse.requireReproduction([.oldGrowthPolicy, .zoningHalifax])
        #expect(throws: LayerUse.Refusal.self) {
            try LayerUse.requireReproduction([], includesParcelGeometry: true)
        }
    }
}
