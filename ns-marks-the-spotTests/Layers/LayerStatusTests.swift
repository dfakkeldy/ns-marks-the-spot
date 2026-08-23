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
        controller: MapController = MapController(),
        installing ids: [LayerID],
        licence: ProvinceLicenceState = .accepted,
        zoomLevel: Int? = nil,
        taxSale: TaxSaleViewModel? = nil,
        historical: HistoricalTaxSaleViewModel? = nil,
        showsTaxSale: Bool? = nil,
        parcelFetcher: ParcelFetcher = ParcelFetcher(transport: .unanswered),
        civicFetcher: CivicAddressFetcher = CivicAddressFetcher(transport: .unanswered),
        contextFetcher: ParcelContextFetcher = ParcelContextFetcher(transport: .unanswered),
        assessmentFetcher: PVSCAssessmentFetcher = PVSCAssessmentFetcher(transport: .unanswered),
        dwellingFetcher: PVSCDwellingFetcher = PVSCDwellingFetcher(transport: .unanswered),
        buildingFetcher: BuildingCountFetcher = BuildingCountFetcher(transport: .unanswered),
        resourceFetcher: ResourceIntersectionFetcher
            = ResourceIntersectionFetcher(transport: .unanswered),
        floodFetcher: FloodHazardFetcher = FloodHazardFetcher(transport: .unanswered),
        themes: MapThemeLibrary = .forTesting()
    ) -> OverlayViewModel {
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
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: licence)
            ),
            taxSale: taxSale,
            historical: historical,
            parcelFetcher: parcelFetcher,
            civicFetcher: civicFetcher,
            contextFetcher: contextFetcher,
            assessmentFetcher: assessmentFetcher,
            dwellingFetcher: dwellingFetcher,
            buildingFetcher: buildingFetcher,
            resourceFetcher: resourceFetcher,
            floodFetcher: floodFetcher,
            themes: themes
        )
        // The map opens without tax-sale information, as the browser does.
        // Handing this helper a record set is a test saying its map is set up
        // for that job, so it switches on unless the test says otherwise.
        viewModel.setTaxSaleEnabled(showsTaxSale ?? (taxSale != nil || historical != nil))
        return viewModel
    }
}

extension HTTPTransport {
    /// A transport that answers nothing, for the fetchers a test did not stub.
    ///
    /// The defaults above use this rather than a real `URLSession`, and the
    /// reason is not tidiness. Selecting a parcel that has geometry starts
    /// seven evidence requests at once — civic addresses, mapped context,
    /// assessments, dwellings, buildings, resources, flood — so a test that
    /// stubs only the parcel service still sends the other six to the live
    /// Province and PVSC endpoints. That is a unit test contacting a public
    /// service on every run, and on CI it is worse than impolite: those
    /// requests stalled for thirty seconds, the test host was killed
    /// mid-test, and a suite that passes locally reported two tests as failed
    /// with no message against either of them.
    ///
    /// `notConnectedToInternet` rather than a success: a fetcher nobody
    /// stubbed has nothing to say, and the inspection records that as
    /// unavailable, which is what the panel shows when a service cannot be
    /// reached.
    static let unanswered = HTTPTransport { _ in throw URLError(.notConnectedToInternet) }
}

extension MapThemeLibrary {
    /// A library over defaults of its own.
    ///
    /// The real one writes to the test host's standard defaults, which would
    /// leak a saved setup from one test into the next and into whatever else
    /// runs in that host.
    static func forTesting(suite: String = UUID().uuidString) -> MapThemeLibrary {
        MapThemeLibrary(
            storage: UserDefaultsCustomThemeStorage(
                defaults: UserDefaults(suiteName: suite) ?? .standard
            )
        )
    }
}
