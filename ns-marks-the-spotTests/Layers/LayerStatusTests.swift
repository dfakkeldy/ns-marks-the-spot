import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerStatusTests {
    @Test func fletcherReturnsDownloadable() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(
            id: LayerID.fletcher.rawValue,
            name: "Fletcher",
            type: .tile(URL(fileURLWithPath: "/"))
        )
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        #expect(viewModel.offlineStatus(for: LayerID.fletcher.rawValue) == "Downloadable")
    }

    @Test func nsAerialReturnsCachedWhenViewed() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(
            id: LayerID.nsAerial.rawValue,
            name: "NS Aerial",
            type: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
        )
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        #expect(viewModel.offlineStatus(for: LayerID.nsAerial.rawValue) == "Cached when viewed")
    }

    @Test func unknownLayerReturnsOnline() {
        let engine = MockMapEngine()
        let viewModel = OverlayViewModel(engine: engine)

        #expect(viewModel.offlineStatus(for: "unknown") == "Online")
    }

    @Test func selectingNSAerialBasemapTurnsLayerVisible() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(
            id: LayerID.nsAerial.rawValue,
            name: "NS Aerial",
            type: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
        )
        layer.isVisible = false
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        viewModel.setBaseMapType(.nsAerial)

        #expect(layer.isVisible == true)
    }

    @Test func switchingAwayFromNSAerialHidesLayer() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(
            id: LayerID.nsAerial.rawValue,
            name: "NS Aerial",
            type: .arcgisMapService(URL(string: "https://example.com")!, transparent: false)
        )
        layer.isVisible = true
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        viewModel.setBaseMapType(.nsAerial)
        viewModel.setBaseMapType(.standard)

        #expect(layer.isVisible == false)
    }
}
