import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerStatusTests {
    @Test func fletcherReturnsDownloadable() {
        let controller = MapController()
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.fletcher.rawValue,
                    name: "Fletcher",
                    source: .tile(URL(fileURLWithPath: "/"))
                )
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        #expect(viewModel.offlineStatus(for: LayerID.fletcher.rawValue) == "Downloadable")
    }

    @Test func nsAerialReturnsCachedWhenViewed() {
        let controller = MapController()
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.nsAerial.rawValue,
                    name: "NS Aerial",
                    source: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
                )
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        #expect(viewModel.offlineStatus(for: LayerID.nsAerial.rawValue) == "Cached when viewed")
    }

    @Test func unknownLayerReturnsOnline() {
        let controller = MapController()
        let viewModel = OverlayViewModel(controller: controller)

        #expect(viewModel.offlineStatus(for: "unknown") == "Online")
    }

    @Test func selectingNSAerialBasemapTurnsLayerVisible() {
        let controller = MapController()
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.nsAerial.rawValue,
                    name: "NS Aerial",
                    source: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
                ),
                isVisible: false
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        viewModel.setBaseMapType(.nsAerial)

        #expect(controller.layers.first?.isVisible == true)
    }

    @Test func switchingAwayFromNSAerialHidesLayer() {
        let controller = MapController()
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(
                    id: LayerID.nsAerial.rawValue,
                    name: "NS Aerial",
                    source: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
                ),
                isVisible: true
            )
        )
        let viewModel = OverlayViewModel(controller: controller)

        viewModel.setBaseMapType(.nsAerial)
        viewModel.setBaseMapType(.standard)

        #expect(controller.layers.first?.isVisible == false)
    }
}
