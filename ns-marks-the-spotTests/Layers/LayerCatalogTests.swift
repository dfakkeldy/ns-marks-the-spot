import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerCatalogTests {
    @Test func containsExpectedV1Layers() {
        let ids = Set(LayerCatalog.all.map(\.id))

        #expect(ids == [
            .fletcher,
            .nsAerial,
            .nsPropertyBoundaries,
            .crownLands,
            .floodRisk,
            .waterfalls,
            .churchInverness,
            .churchVictoria,
            .churchRichmond,
            .churchCapeBreton
        ])
    }

    @Test func churchSheetsAreCataloguedWithoutASource() {
        let churchIDs: [LayerID] = [
            .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton
        ]

        for id in churchIDs {
            let descriptor = LayerCatalog.descriptor(for: id)

            // Catalogued for attribution and metadata only; no tiles exist yet,
            // so there is deliberately nothing to fetch.
            #expect(descriptor?.sourceURL == nil)
            #expect(descriptor?.offlinePolicy == .onlineOnly)
            #expect(descriptor?.defaultVisibility == false)
            #expect(descriptor?.renderingRole == .overlay)
        }
    }

    @Test func churchSheetsCreditTheRumseyCollection() throws {
        let descriptor = try #require(LayerCatalog.descriptor(for: .churchRichmond))

        #expect(descriptor.attribution.provider == "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries")
        #expect(descriptor.userCaveat?.contains("1885") == true)
        #expect(descriptor.attribution.licenseURL?.absoluteString == "https://www.davidrumsey.com/about/copyright-and-permissions")
    }

    @Test func fletcherIsSavedAreaDownloadable() {
        let descriptor = LayerCatalog.descriptor(for: .fletcher)

        #expect(descriptor?.offlinePolicy == .savedAreaDownloadable)
        #expect(descriptor?.renderingRole == .overlay)
        #expect(descriptor?.defaultOpacity == 1.0)
    }

    @Test func nsAerialIsViewedCacheOnlyAndDualRole() {
        let descriptor = LayerCatalog.descriptor(for: .nsAerial)

        #expect(descriptor?.offlinePolicy == .viewedCacheOnly)
        #expect(descriptor?.renderingRole == .basemapAndOverlay)
        #expect(descriptor?.sourceURL?.absoluteString == "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer")
    }

    @Test func arcGISDynamicLayersAvoidLowZoomExports() {
        let dynamicLayers = LayerCatalog.all.filter { $0.sourceKind == .arcGISDynamic }

        #expect(dynamicLayers.allSatisfy { $0.minZoom >= 12 })
    }

    @Test func provinceAttributionIsIncluded() {
        let descriptor = LayerCatalog.descriptor(for: .nsAerial)

        #expect(descriptor?.attribution.provider == "Province of Nova Scotia")
        #expect(descriptor?.attribution.disclaimer.contains("without warranty or liability") == true)
    }
}
