import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerInstallationTests {
    @Test func appContainerInstallsCatalogLayers() {
        let container = AppContainer()
        let ids = container.mapEngine.layers.map(\.id)

        #expect(ids.contains("fletcher"))
        #expect(ids.contains("ns-aerial"))
        #expect(ids.contains("nsprd"))
        #expect(ids.contains("crown-lands"))
        #expect(ids.contains("flood-risk"))
        #expect(ids.contains("waterfalls"))
    }

    @Test func nsAerialLayerUsesArcGISMapServiceSource() {
        let container = AppContainer()
        let layer = container.mapEngine.layers.first { $0.id == "ns-aerial" }

        guard let layer else {
            Issue.record("NS Aerial layer was not installed")
            return
        }

        if case .arcgisMapService(let url, let transparent) = layer.type {
            #expect(url.absoluteString == "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer")
            #expect(transparent == false)
        } else {
            Issue.record("NS Aerial should use arcgisMapService")
        }
    }
}
