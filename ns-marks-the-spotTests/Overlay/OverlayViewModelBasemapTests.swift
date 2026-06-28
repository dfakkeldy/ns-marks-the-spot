import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OverlayViewModelBasemapTests {
    @Test func selectingNSAerialBasemapShowsLayerAndSwitchingAwayHidesIt() throws {
        let engine = MockMapEngine()
        let nsAerialURL = try #require(
            URL(string: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer")
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
}
