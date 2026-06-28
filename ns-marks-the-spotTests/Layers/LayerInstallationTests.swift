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

    @Test func fletcherLayerUsesOldMapsOnlineXYZTemplate() {
        guard let installedLayer = installedLayer(id: "fletcher") else {
            Issue.record("Fletcher layer was not installed")
            return
        }

        if case .tile(let url) = installedLayer.type {
            #expect(url.absoluteString.contains("https://wmts.oldmapsonline.org/maps/"))
            #expect(url.absoluteString.contains("%7Bz%7D/%7Bx%7D/%7By%7D.png"))
        } else {
            Issue.record("Fletcher should use a remote XYZ tile template")
        }
    }

    @Test func arcGISDynamicLayersRetainRestrictionsAndPayloads() {
        guard let floodRisk = installedLayer(id: "flood-risk"),
              let propertyBoundaries = installedLayer(id: "nsprd"),
              let waterfalls = installedLayer(id: "waterfalls") else {
            Issue.record("Expected dynamic ArcGIS layers were not installed")
            return
        }

        if case .arcgisDynamic(_, let dynamicLayers, let layerRestrictions) = floodRisk.type {
            #expect(dynamicLayers == nil)
            #expect(layerRestrictions == "show:24,25,26")
        } else {
            Issue.record("Flood risk should use ArcGIS dynamic layers")
        }

        if case .arcgisDynamic(_, let dynamicLayers, let layerRestrictions) = propertyBoundaries.type {
            #expect(layerRestrictions == nil)
            #expect(dynamicLayers?.contains("\"mapLayerId\":0") == true)
            #expect(dynamicLayers?.contains("\"showLabels\":false") == true)
        } else {
            Issue.record("Property boundaries should use ArcGIS dynamic layers")
        }

        if case .arcgisDynamic(_, let dynamicLayers, let layerRestrictions) = waterfalls.type {
            #expect(layerRestrictions == nil)
            #expect(dynamicLayers?.contains("\"mapLayerId\":1") == true)
            #expect(dynamicLayers?.contains("FEAT_DESC = 'Falls -  On a single line river point'") == true)
        } else {
            Issue.record("Waterfalls should use ArcGIS dynamic layers")
        }
    }

    private func installedLayer(id: String) -> (any MapLayer)? {
        AppContainer().mapEngine.layers.first { $0.id == id }
    }
}
