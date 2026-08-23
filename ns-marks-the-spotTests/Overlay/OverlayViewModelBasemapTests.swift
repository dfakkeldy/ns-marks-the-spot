import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OverlayViewModelBasemapTests {
    @Test func selectingNSAerialBasemapShowsLayerAndSwitchingAwayHidesIt() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial])
        viewModel.updateLayerOpacity(for: LayerID.nsAerial.rawValue, to: 0)

        viewModel.setBaseMapType(.nsAerial)

        #expect(viewModel.baseMapType == .nsAerial)
        #expect(viewModel.layers.first?.isVisible == true)
        #expect((viewModel.layers.first?.opacity ?? 0) > 0)

        viewModel.setBaseMapType(.standard)

        #expect(viewModel.baseMapType == .standard)
        #expect(viewModel.layers.first?.isVisible == false)
    }

    @Test func hidingNSAerialLayerSwitchesBasemapBackToStandard() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial])

        viewModel.setBaseMapType(.nsAerial)
        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(viewModel.baseMapType == .standard)
        #expect(viewModel.layers.first?.isVisible == false)
    }

    @Test func showingNSAerialLayerSelectsNSAerialBasemap() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial])
        viewModel.updateLayerOpacity(for: LayerID.nsAerial.rawValue, to: 0)

        viewModel.toggleVisibility(LayerID.nsAerial.rawValue)

        #expect(viewModel.baseMapType == .nsAerial)
        #expect(viewModel.layers.first?.isVisible == true)
        #expect(viewModel.layers.first?.opacity == 1)
    }

    @Test func showingZeroOpacityOptionalLayerRestoresTheCatalogOpacity() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.crownLands])
        viewModel.updateLayerOpacity(for: LayerID.crownLands.rawValue, to: 0)

        viewModel.toggleVisibility(LayerID.crownLands.rawValue)

        #expect(viewModel.layers.first?.isVisible == true)
        // The catalog's own opening opacity, not an invented one: these are
        // overlays the modern base map has to read through.
        let expected = try #require(LayerCatalog.descriptor(for: .crownLands)?.opacity)
        #expect(viewModel.layers.first?.opacity == CGFloat(expected))
    }

    // MARK: - Licence gate

    @Test func turningOnARestrictedLayerRaisesTheLicenceSheet() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        viewModel.toggleVisibility(LayerID.nsprd.rawValue)

        // The switch must not move: the layer stays off until the licence is
        // answered, so the panel never says "on" for something that draws
        // nothing and contacts nothing.
        #expect(viewModel.isShowingLicenceSheet)
        #expect(viewModel.licencePromptedLayerName == LayerCatalog.descriptor(for: .nsprd)?.name)
        #expect(viewModel.layers.first?.isVisible == false)
    }

    @Test func acceptingTheLicenceTurnsOnTheLayerTheUserReachedFor() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        viewModel.acceptProvinceLicence()

        // Accepting answers the tap, rather than dismissing a dialog and
        // leaving the user to tap the same switch again.
        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.layers.first?.isVisible == true)
        #expect(viewModel.rows.allSatisfy { $0.needsLicence == false })
    }

    @Test func decliningTheLicenceLeavesTheLayerOff() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        viewModel.declineProvinceLicence()

        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.layers.first?.isVisible == false)

        // And the row stays reachable: declining is an answer for now, not a
        // permanent removal of the only route back to the sheet.
        let row = try #require(viewModel.rows.first { $0.id == LayerID.nsprd.rawValue })
        #expect(row.isAvailable)
        #expect(row.needsLicence)
    }

    @Test func dismissingTheSheetWithoutAnsweringChangesNothing() throws {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsprd], licence: .unknown)

        viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        viewModel.dismissLicenceSheet()

        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.layers.first?.isVisible == false)

        // Still unanswered, so the next tap raises the sheet again.
        viewModel.toggleVisibility(LayerID.nsprd.rawValue)
        #expect(viewModel.isShowingLicenceSheet)
    }

    @Test func pickingTheRestrictedBaseMapRaisesTheLicenceSheet() throws {
        // The base-map picker is a second way to turn NS Aerial on, and it is
        // the one a user is most likely to reach first. Without the gate here it
        // would mark the layer visible, every tile would be refused, and the
        // picker would sit on "NS Aerial" over a blank map.
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial], licence: .unknown)

        viewModel.setBaseMapType(.nsAerial)

        #expect(viewModel.isShowingLicenceSheet)
        #expect(viewModel.baseMapType == .standard)
        #expect(viewModel.layers.first?.isVisible == false)

        viewModel.acceptProvinceLicence()

        // Accepting answers the pick, the same way it answers a tap on the row.
        #expect(viewModel.baseMapType == .nsAerial)
        #expect(viewModel.layers.first?.isVisible == true)
    }

    @Test func unrestrictedBaseMapsAreNotGated() {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial], licence: .unknown)

        viewModel.setBaseMapType(.satellite)

        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.baseMapType == .satellite)
    }

    @Test func unrestrictedLayersToggleWithoutTheSheet() throws {
        // Fletcher is ours to show under the Rumsey permission, so the Province
        // licence has nothing to say about it — and it is the layer the app
        // opens with, so it has to work before anything has been accepted.
        let descriptor = try #require(LayerCatalog.descriptor(for: .fletcher))
        #expect(descriptor.requiresProvinceClearance == false)
        #expect(descriptor.nativeDefaultVisible)

        let viewModel = OverlayViewModel.forTesting(installing: [.fletcher], licence: .unknown)
        #expect(viewModel.layers.first?.isVisible == true)

        viewModel.toggleVisibility(LayerID.fletcher.rawValue)
        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.layers.first?.isVisible == false)

        viewModel.toggleVisibility(LayerID.fletcher.rawValue)
        #expect(viewModel.isShowingLicenceSheet == false)
        #expect(viewModel.layers.first?.isVisible == true)
    }

    @Test func acceptedLicenceIsHandedToTheTileQueues() {
        // The panel and the tile requests read two different values — an
        // `@Observable` store on the main actor, and a lock-guarded box the
        // overlay queues can touch — so acceptance has to reach both. A row
        // that unlocks while the box still refuses is a layer that says "on"
        // and draws nothing.
        let box = LicenceClearanceBox()
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage(initial: .unknown))
        let viewModel = OverlayViewModel(
            controller: MapController(),
            licenceStore: store,
            clearanceBox: box
        )

        #expect(box.clearance.allowsRestrictedLayers == false)

        viewModel.acceptProvinceLicence()
        #expect(box.clearance.allowsRestrictedLayers)
        #expect(store.state == .accepted)

        viewModel.declineProvinceLicence()
        #expect(box.clearance.allowsRestrictedLayers == false)
        #expect(store.state == .declined)
    }

    @Test func revokingThroughTheStoreAloneStillReachesTheTileQueues() async {
        // The store is reachable without going through this view model, and a
        // revoke control has not been built yet. If the box were only written by
        // `accept`/`decline`, the first such control would ship a map that keeps
        // fetching restricted imagery after the user withdrew permission. The
        // mirror is what makes that not depend on remembering.
        let box = LicenceClearanceBox()
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage(initial: .accepted))
        let viewModel = OverlayViewModel(
            controller: MapController(),
            licenceStore: store,
            clearanceBox: box
        )
        #expect(box.clearance.allowsRestrictedLayers)

        store.revoke()

        // Observation reports the change before the store applies it, so the
        // re-read is one hop behind rather than immediate. Polled rather than
        // slept on: the assertion is that it arrives, not how fast.
        var refused = false
        for _ in 0..<50 where !refused {
            await Task.yield()
            refused = !box.clearance.allowsRestrictedLayers
        }
        #expect(refused)
        withExtendedLifetime(viewModel) {}
    }

    @Test func revokingSwitchesTheLayerOffRatherThanLeavingItOnDrawingNothing() async {
        // Stopping the requests is only half of a revocation. The switch would
        // stay on, and the runtime line reports the last thing the tiles did —
        // so the panel would sit there saying a layer was ready over a square
        // that is now being refused every time it is asked for.
        let box = LicenceClearanceBox()
        let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage(initial: .accepted))
        let controller = MapController()
        if let descriptor = LayerCatalog.descriptor(for: .crownLands),
           let layer = AppContainer.makeLayer(
               from: descriptor,
               fletcherBaseURL: URL(string: "https://tiles.example.test/fletcher")
           ) {
            controller.addLayer(layer)
        }
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: store,
            clearanceBox: box
        )
        viewModel.toggleVisibility(LayerID.crownLands.rawValue)
        #expect(Self.isVisible(viewModel, .crownLands) == true)

        store.revoke()

        var hidden = false
        for _ in 0..<50 where !hidden {
            await Task.yield()
            hidden = Self.isVisible(viewModel, .crownLands) == false
        }
        #expect(hidden)
    }

    private static func isVisible(_ viewModel: OverlayViewModel, _ id: LayerID) -> Bool? {
        viewModel.rows.first { $0.id == id.rawValue }?.isVisible
    }

    @Test func anAcceptedLicenceIsAlreadyInTheBoxAtLaunch() {
        // Every overlay is installed during `AppContainer.init`, before any view
        // exists. On the second launch after acceptance the box has to start
        // permissive, or every tile drawn before the layer panel is first opened
        // is refused.
        let container = AppContainer(
            licenceStorage: InMemoryProvinceLicenceStorage(initial: .accepted),
            sessionStore: .forTesting()
        )

        #expect(container.licenceStore.needsDecision == false)
        #expect(container.clearanceBox.clearance.allowsRestrictedLayers)
    }
}
