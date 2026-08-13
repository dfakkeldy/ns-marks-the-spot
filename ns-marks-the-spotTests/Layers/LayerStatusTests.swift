import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
@testable import ns_marks_the_spot

@MainActor
struct LayerStatusTests {
    @Test func fletcherReturnsDownloadable() {
        let viewModel = OverlayViewModel.forTesting(installing: [])

        #expect(viewModel.offlineStatus(for: LayerID.fletcher.rawValue) == "Downloadable")
    }

    @Test func nsAerialReturnsCachedWhenViewed() {
        let viewModel = OverlayViewModel.forTesting(installing: [])

        #expect(viewModel.offlineStatus(for: LayerID.nsAerial.rawValue) == "Cached when viewed")
    }

    @Test func unknownLayerReturnsOnline() {
        let viewModel = OverlayViewModel.forTesting(installing: [])

        #expect(viewModel.offlineStatus(for: "unknown") == "Online")
    }

    @Test func selectingNSAerialBasemapTurnsLayerVisible() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial])

        viewModel.setBaseMapType(.nsAerial)

        #expect(viewModel.layers.first?.isVisible == true)
    }

    @Test func switchingAwayFromNSAerialHidesLayer() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial])

        viewModel.setBaseMapType(.nsAerial)
        viewModel.setBaseMapType(.standard)

        #expect(viewModel.layers.first?.isVisible == false)
    }

    // MARK: - Rows

    @Test func everyPresentedLayerHasARow() {
        let viewModel = OverlayViewModel.forTesting(installing: [])
        let ids = Set(viewModel.rows.map(\.id))

        // The Church sheets have no tiles and are never installed, and they
        // still get a row: the panel reads the catalog, not the map, so a layer
        // that has not shipped reads as "not yet" rather than as absent.
        #expect(ids.contains(LayerID.churchRichmond.rawValue))
        #expect(ids.contains(LayerID.fletcher.rawValue))
        #expect(ids.contains(LayerID.nsAerial.rawValue))
    }

    @Test func rowsFollowPanelOrderRatherThanDrawOrder() {
        let viewModel = OverlayViewModel.forTesting(installing: [])
        let uiOrders = viewModel.rows.map(\.descriptor.uiOrder)

        // Reading order, which is not z-order: place names draw on top of
        // everything and are listed nowhere near the end.
        #expect(uiOrders == uiOrders.sorted())
        #expect(viewModel.rows.first?.id == LayerID.nsAerial.rawValue)
    }

    @Test func uninstalledRowsAreUnavailable() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial])
        let church = try #require(viewModel.rows.first { $0.id == LayerID.churchRichmond.rawValue })
        let aerial = try #require(viewModel.rows.first { $0.id == LayerID.nsAerial.rawValue })

        #expect(church.isAvailable == false)
        #expect(church.isVisible == false)
        #expect(aerial.isAvailable)
    }
}

extension OverlayViewModel {
    /// A view model over a controller holding exactly the named layers.
    ///
    /// Built from catalog descriptors rather than hand-written configurations,
    /// so a test cannot assert against a layer shaped differently from the one
    /// the app installs.
    static func forTesting(
        installing ids: [LayerID],
        licence: ProvinceLicenceState = .accepted,
        zoomLevel: Int? = nil,
        parcelFetcher: ParcelFetcher = ParcelFetcher(),
        civicFetcher: CivicAddressFetcher = CivicAddressFetcher()
    ) -> OverlayViewModel {
        let controller = MapController()
        for id in ids {
            guard let descriptor = LayerCatalog.descriptor(for: id),
                  let layer = AppContainer.makeLayer(
                      from: descriptor,
                      fletcherBaseURL: URL(string: "https://tiles.example.test/fletcher")
                  ) else { continue }
            controller.addLayer(layer)
        }
        if let zoomLevel {
            controller.recordZoomLevel(zoomLevel)
        }
        return OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: licence)
            ),
            parcelFetcher: parcelFetcher,
            civicFetcher: civicFetcher
        )
    }
}
