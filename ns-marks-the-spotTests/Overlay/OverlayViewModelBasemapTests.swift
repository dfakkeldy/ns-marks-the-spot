import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OverlayViewModelBasemapTests {
    @Test func selectingNSAerialBasemapShowsLayerAndSwitchingAwayHidesIt() throws {
        let engine = MockMapEngine()
        let nsAerialURL = try #require(
            URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer")
        )
        let nsAerial = MapKitTileLayer(
            id: LayerID.nsAerial.rawValue,
            name: "NS Aerial",
            type: .arcgisMapService(nsAerialURL, transparent: false)
        )
        nsAerial.opacity = 0
        nsAerial.isVisible = false
        engine.addLayer(nsAerial)

        let viewModel = OverlayViewModel(engine: engine)

        viewModel.setBaseMapType(.nsAerial)

        #expect(engine.baseMapType == .nsAerial)
        #expect(nsAerial.isVisible == true)
        #expect(nsAerial.opacity > 0)

        viewModel.setBaseMapType(.standard)

        #expect(engine.baseMapType == .standard)
        #expect(nsAerial.isVisible == false)
    }

    @Test func hidingNSAerialLayerSwitchesBasemapBackToStandard() throws {
        let engine = MockMapEngine()
        let nsAerialURL = try #require(URL(string: "https://example.com/ns-aerial"))
        let nsAerial = MapKitTileLayer(
            id: LayerID.nsAerial.rawValue,
            name: "NS Aerial",
            type: .arcgisMapService(nsAerialURL, transparent: false)
        )
        engine.addLayer(nsAerial)
        let viewModel = OverlayViewModel(engine: engine)

        viewModel.setBaseMapType(.nsAerial)
        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(engine.baseMapType == .standard)
        #expect(nsAerial.isVisible == false)
    }

    @Test func showingNSAerialLayerSelectsNSAerialBasemap() throws {
        let engine = MockMapEngine()
        let nsAerialURL = try #require(URL(string: "https://example.com/ns-aerial"))
        let nsAerial = MapKitTileLayer(
            id: LayerID.nsAerial.rawValue,
            name: "NS Aerial",
            type: .arcgisMapService(nsAerialURL, transparent: false)
        )
        nsAerial.isVisible = false
        nsAerial.opacity = 0
        engine.addLayer(nsAerial)
        let viewModel = OverlayViewModel(engine: engine)

        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(engine.baseMapType == .nsAerial)
        #expect(nsAerial.isVisible == true)
        #expect(nsAerial.opacity == 1)
    }

    @Test func showingZeroOpacityOptionalLayerRestoresUsableOpacity() throws {
        let engine = MockMapEngine()
        let layerURL = try #require(URL(string: "https://example.com/crown-lands"))
        let layer = MapKitTileLayer(
            id: LayerID.crownLands.rawValue,
            name: "Crown Lands",
            type: .arcgisDynamic(layerURL, dynamicLayers: nil, layerRestrictions: nil)
        )
        layer.isVisible = false
        layer.opacity = 0
        engine.addLayer(layer)
        let viewModel = OverlayViewModel(engine: engine)

        viewModel.toggleVisibility(LayerID.crownLands.rawValue)

        #expect(layer.isVisible == true)
        #expect(layer.opacity > 0)
    }
}
