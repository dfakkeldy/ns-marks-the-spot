import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// Withdrawing acceptance of the Province licence.
///
/// Accepting used to be a one-way door: the app could ask, and had no control
/// that took the answer back. What makes a revoke control honest is not the
/// button but what happens behind it — the requests stop, what is on screen
/// goes, and the bytes already on the device are deleted. A control that did
/// only the first would leave the map drawing restricted imagery from cache
/// under a licence the user had just withdrawn.
@MainActor
@Suite("Withdrawing the provincial licence")
struct LicenceRevocationTests {
    private static func model(
        _ licence: ProvinceLicenceState,
        tileCache: TileCache? = nil
    ) -> (OverlayViewModel, MapController) {
        let controller = MapController()
        for id in [LayerID.nsAerial, .roads, .contours] {
            if let descriptor = LayerCatalog.descriptor(for: id),
               let layer = AppContainer.makeLayer(from: descriptor, fletcherBaseURL: nil)
            {
                controller.addLayer(layer)
            }
        }
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: licence)
            ),
            tileCache: tileCache
        )
        return (viewModel, controller)
    }

    @Test func thereIsNothingToWithdrawUntilSomethingWasAccepted() {
        let (unknown, _) = Self.model(.unknown)
        let (declined, _) = Self.model(.declined)
        let (accepted, _) = Self.model(.accepted)

        #expect(unknown.hasAcceptedProvinceLicence == false)
        #expect(declined.hasAcceptedProvinceLicence == false)
        #expect(accepted.hasAcceptedProvinceLicence)
    }

    @Test func withdrawingRefusesEveryRestrictedLayerAgain() async {
        let (viewModel, controller) = Self.model(.accepted)
        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)
        #expect(viewModel.hasAcceptedProvinceLicence)

        await viewModel.revokeProvinceLicence()

        #expect(viewModel.hasAcceptedProvinceLicence == false)
        // Not merely "no new requests": the switch has to move too, or a
        // refused layer sits there switched on reporting whatever its last
        // tile did.
        #expect(
            controller.layers
                .first { $0.id == LayerID.nsAerial.rawValue }?.isVisible == false
        )
    }

    /// The sweep list is derived from the catalog, so a restricted layer added
    /// later is swept without anyone remembering to add it here.
    @Test func everyRestrictedInstalledLayerIsSwept() {
        let (_, controller) = Self.model(.accepted)
        let swept = Set(
            OverlayViewModel.restrictedInstalledLayers(controller.layers).map(\.id)
        )

        for layer in controller.layers {
            let id = LayerID(rawValue: layer.id)
            let isRestricted = id.map(LayerCatalog.restrictedLayerIDs.contains) ?? true
            #expect(swept.contains(layer.id) == isRestricted)
        }
    }

    /// An installed layer whose id is not in the catalog cannot be shown to be
    /// unrestricted, and the safe reading of "unknown" is to delete its tiles.
    @Test func anUncataloguedLayerIsSweptRatherThanKept() {
        let unknown = MapLayerState(
            configuration: TileLayerConfiguration(
                id: "not-in-the-catalog",
                name: "Unknown",
                source: .tile(URL(string: "https://example.test/{z}/{x}/{y}.png")!)
            )
        )

        #expect(
            OverlayViewModel.restrictedInstalledLayers([unknown]).map(\.id)
                == ["not-in-the-catalog"]
        )
    }

    /// Withdrawing takes the restricted setup off the device as well as off the
    /// screen.
    ///
    /// The stored session is the last thing written under the licence: it names
    /// the layers that were drawn and the parcel that was open, and a reader
    /// who withdrew permission and then force-quit would otherwise find both
    /// still there. Rewritten rather than cleared, because where they were
    /// standing is theirs.
    @Test func withdrawingRewritesTheSessionItWasWrittenInto() async throws {
        let store = MapSessionStore.forTesting()
        let viewModel = OverlayViewModel.forTesting(
            installing: [.nsprd, .roads],
            licence: .accepted,
            zoomLevel: 16,
            sessionStore: store
        )

        viewModel.restore(
            from: URL(
                string: "https://kinnokilabs.com/apps/nsmarksthespot/map/"
                    + "?pid=77777777&layers=modern,nsprd,roads&position=46.1,-60.1,14"
            )!
        )
        // The lookup fails with no parcel service stubbed, which is the case
        // worth storing: the PID a restore is still resolving is written into
        // the session so a launch inside that window does not lose the card.
        await viewModel.awaitParcelLookup()
        viewModel.rememberSession()

        let before = try #require(store.load())
        #expect(before.view.pid == "77777777")
        #expect(before.view.layerIDs.contains(LayerID.nsprd.rawValue))
        #expect(before.view.layerIDs.contains(LayerID.roads.rawValue))

        await viewModel.revokeProvinceLicence()

        let after = try #require(store.load())
        #expect(after.view.pid == nil)
        #expect(after.view.layerIDs.contains(LayerID.nsprd.rawValue) == false)
        #expect(after.view.layerIDs.contains(LayerID.roads.rawValue) == false)
        // And the position is still the reader's own.
        #expect(after.view.position.zoom == 14)
    }

    @Test func withdrawingDeletesTheCachedTiles() async throws {
        let directory = URL.temporaryDirectory
            .appendingPathComponent("licence-revocation-\(UUID().uuidString)")
        let cache = TileCache(diskRoot: directory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let (viewModel, controller) = Self.model(.accepted, tileCache: cache)
        let aerial = try #require(
            controller.layers.first { $0.id == LayerID.nsAerial.rawValue }
        )
        let name = aerial.configuration.cacheIdentifier
        cache.cacheTile(Data([1, 2, 3]), z: 10, x: 1, y: 1, layerName: name)
        #expect(cache.cachedTile(z: 10, x: 1, y: 1, layerName: name) != nil)

        await viewModel.revokeProvinceLicence()

        #expect(cache.cachedTile(z: 10, x: 1, y: 1, layerName: name) == nil)
        #expect(viewModel.licenceSweepFailure == nil)
    }
}
