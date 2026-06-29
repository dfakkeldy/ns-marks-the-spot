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
            .waterfalls
        ])
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
        #expect(descriptor?.sourceURL?.absoluteString == "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer")
    }

    @Test func provinceAttributionIsIncluded() {
        let descriptor = LayerCatalog.descriptor(for: .nsAerial)

        #expect(descriptor?.attribution.provider == "Province of Nova Scotia")
        #expect(descriptor?.attribution.disclaimer.contains("without warranty or liability") == true)
    }
}
