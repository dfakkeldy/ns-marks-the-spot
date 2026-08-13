import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OverlayViewModelBasemapTests {
    @Test func selectingNSAerialBasemapShowsLayerAndSwitchingAwayHidesIt() throws {
        let controller = MapController()
        let nsAerialURL = try #require(
            URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer")
        )
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.nsAerial.rawValue,
                    name: "NS Aerial",
                    source: .arcgisMapService(nsAerialURL, transparent: false)
                ),
                opacity: 0,
                isVisible: false
            )
        )

        let viewModel = OverlayViewModel(controller: controller)

        viewModel.setBaseMapType(.nsAerial)

        #expect(controller.baseMapType == .nsAerial)
        #expect(controller.layers.first?.isVisible == true)
        #expect((controller.layers.first?.opacity ?? 0) > 0)

        viewModel.setBaseMapType(.standard)

        #expect(controller.baseMapType == .standard)
        #expect(controller.layers.first?.isVisible == false)
    }

    @Test func hidingNSAerialLayerSwitchesBasemapBackToStandard() throws {
        let controller = MapController()
        let nsAerialURL = try #require(URL(string: "https://example.com/ns-aerial"))
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.nsAerial.rawValue,
                    name: "NS Aerial",
                    source: .arcgisMapService(nsAerialURL, transparent: false)
                )
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        viewModel.setBaseMapType(.nsAerial)
        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(controller.baseMapType == .standard)
        #expect(controller.layers.first?.isVisible == false)
    }

    @Test func showingNSAerialLayerSelectsNSAerialBasemap() throws {
        let controller = MapController()
        let nsAerialURL = try #require(URL(string: "https://example.com/ns-aerial"))
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.nsAerial.rawValue,
                    name: "NS Aerial",
                    source: .arcgisMapService(nsAerialURL, transparent: false)
                ),
                opacity: 0,
                isVisible: false
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(controller.baseMapType == .nsAerial)
        #expect(controller.layers.first?.isVisible == true)
        #expect(controller.layers.first?.opacity == 1)
    }

    @Test func showingZeroOpacityOptionalLayerRestoresUsableOpacity() throws {
        let controller = MapController()
        let layerURL = try #require(URL(string: "https://example.com/crown-lands"))
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.crownLands.rawValue,
                    name: "Crown Lands",
                    source: .arcgisDynamic(layerURL, dynamicLayers: nil, layerRestrictions: nil)
                ),
                opacity: 0,
                isVisible: false
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        viewModel.toggleVisibility(LayerID.crownLands.rawValue)

        #expect(controller.layers.first?.isVisible == true)
        #expect((controller.layers.first?.opacity ?? 0) > 0)
    }
}
