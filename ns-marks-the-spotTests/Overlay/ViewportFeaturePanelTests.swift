import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// The panel switches for the layers that are queries rather than tiles.
///
/// None of these reach a real network: what is under test is the state the
/// switch and the status chip report, which is decided either side of the
/// request rather than by it.
@MainActor
struct ViewportFeaturePanelTests {
    @Test func everyVectorLayerGetsARowWhenThereIsSomethingToAnswerForIt() {
        let (viewModel, _) = panel()

        let rows = viewModel.rows.filter { row in
            OverlayZIndex.vectorLayers.contains(row.descriptor.id)
        }

        #expect(rows.count == OverlayZIndex.vectorLayers.count)
        #expect(rows.count(where: { $0.isAvailable }) == rows.count)
    }

    @Test func theSectionsThoseLayersLiveInAreNoLongerDropped() {
        let (viewModel, _) = panel()

        let groups = Set(viewModel.sections.map(\.group))

        // Four sections the catalog has always carried and the panel has never
        // shown, because every layer in them is queried rather than tiled.
        #expect(groups.contains(.forestry))
        #expect(groups.contains(.zoning))
        #expect(groups.contains(.groundwater))
        #expect(groups.contains(.hydroPilot))
    }

    @Test func withoutTheQueryLayersThePanelStillOnlyOffersWhatItCanDraw() {
        // A row whose switch is wired to nothing would be worse than no row.
        let viewModel = OverlayViewModel(
            controller: MapController(),
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .accepted)
            )
        )

        let vectorRows = viewModel.rows.filter { row in
            OverlayZIndex.vectorLayers.contains(row.descriptor.id)
        }

        #expect(vectorRows.isEmpty)
    }

    @Test func theSwitchMovesTheLayerItNamesAndNothingElse() {
        let (viewModel, features) = panel()

        viewModel.toggleVisibility(LayerID.zoningHalifax.rawValue)

        #expect(features.isVisible(.zoningHalifax))
        #expect(row(viewModel, .zoningHalifax)?.isVisible == true)
        #expect(features.isVisible(.nsWellLogs) == false)

        viewModel.toggleVisibility(LayerID.zoningHalifax.rawValue)
        #expect(features.isVisible(.zoningHalifax) == false)
    }

    @Test func aQueriedLayerOffersNoOpacitySliderToLieWith() {
        // Its opacity is baked into each feature's style at the catalog value,
        // which is what the web draws. A slider would move a number the map
        // never reads.
        let (viewModel, features) = panel()
        let catalogOpacity = LayerCatalog.descriptor(for: .zoningHalifax)?.opacity ?? 1

        #expect(row(viewModel, .zoningHalifax)?.hasOpacityControl == false)
        #expect(row(viewModel, .nsprd)?.hasOpacityControl == true)

        viewModel.updateLayerOpacity(for: LayerID.zoningHalifax.rawValue, to: 0.35)

        #expect(abs(features.opacity(.zoningHalifax) - catalogOpacity) < 0.0001)
    }

    @Test func theHydroPilotIsBundledSoNoZoomHidesIt() {
        // Every reach ships with the app; there is no viewport query to be too
        // far out for, and the web draws it at the map's minimum zoom.
        let controller = MapController()
        let features = ViewportFeatureViewModel(controller: controller)

        features.setVisible(.invernessHydroPotential, to: true)

        #expect(features.status(.invernessHydroPotential) != .zoomGated(minZoom: 8))
    }

    @Test func theChipSaysWhatTheQuerySaid() {
        let controller = MapController()
        let features = ViewportFeatureViewModel(controller: controller)
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .accepted)
            ),
            features: features
        )
        controller.recordZoomLevel(
            LayerCatalog.descriptor(for: .zoningHalifax)?.minZoom ?? 13
        )

        #expect(row(viewModel, .zoningHalifax)?.runtime?.label == "Off")

        features.setVisible(.zoningHalifax, to: true)

        // No map view behind the controller, so there is no viewport to query
        // and the layer is honestly still loading rather than ready or empty.
        #expect(row(viewModel, .zoningHalifax)?.runtime?.label == "Loading visible area…")
    }

    @Test func aLayerBelowItsZoomFloorSaysHowFarToZoomRatherThanNothingFound() {
        let controller = MapController()
        let features = ViewportFeatureViewModel(controller: controller)
        let minZoom = LayerCatalog.descriptor(for: .nsWellLogs)?.minZoom ?? 0
        #expect(minZoom > 0)

        features.setVisible(.nsWellLogs, to: true)

        // Not a failure and not an empty answer: nothing was asked.
        #expect(features.status(.nsWellLogs) == .zoomGated(minZoom: minZoom))
    }

    @Test func switchingOffIsAnswerEnoughToDropWhatWasDrawn() {
        let (_, features) = panel()

        features.setVisible(.zoningHalifax, to: true)
        features.setVisible(.zoningHalifax, to: false)

        #expect(features.status(.zoningHalifax) == .off)
    }

    @Test func aRestrictedQueryLayerAsksForTheLicenceBeforeItAsksTheProvince() {
        let controller = MapController()
        let features = ViewportFeatureViewModel(controller: controller)
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .unknown)
            ),
            features: features
        )
        // Derived from NSPRD geometry, so producing it is a restricted use of
        // restricted data even though it fetches nothing of its own.
        let layerID = LayerID.mineralProximityParcels
        #expect(LayerCatalog.descriptor(for: layerID)?.requiresProvinceClearance == true)

        viewModel.toggleVisibility(layerID.rawValue)

        // The switch has not moved; the sheet is what moved.
        #expect(features.isVisible(layerID) == false)
        #expect(viewModel.isShowingLicenceSheet)

        viewModel.acceptProvinceLicence()

        // Accepting answers the tap that raised the sheet, rather than
        // dismissing and leaving the user to reach for the switch again.
        #expect(features.isVisible(layerID))
    }

    @Test func aFailureFromARequestTheUserHasMovedPastIsNotReported() async {
        // The switch is answered before the fetch comes back. A cancelled task
        // that is already past its last suspension point still finishes — and
        // through the failing path there is nothing left to cancel — so without
        // a request-generation check this lands as "Source temporarily
        // unavailable" on a layer the user turned off.
        let gate = Gate()
        let controller = MapController()
        // Held for the length of the test: the controller keeps its map view
        // weakly, and without one it finds no bounds and never sends the
        // request this test needs in flight.
        let mapView = MKMapView()
        defer { withExtendedLifetime(mapView) {} }
        controller.mapView = mapView
        controller.recordZoomLevel(20)
        let features = ViewportFeatureViewModel(
            controller: controller,
            zoning: ZoningFetcher(
                transport: HTTPTransport { _ in
                    await gate.wait()
                    throw URLError(.timedOut)
                }
            )
        )

        features.setVisible(.zoningHalifax, to: true)
        // Held until the request is actually at the gate. What this test needs
        // is a fetch in flight when the switch flips, and waiting out the
        // debounce on a timer only guesses at that.
        await settles("the zoning request to reach the gate") {
            await gate.isHoldingARequest
        }
        features.setVisible(.zoningHalifax, to: false)
        await gate.open()
        for _ in 0..<50 { await Task.yield() }

        #expect(features.status(.zoningHalifax) == .off)
    }

    /// Holds a stubbed request open until the test decides it should finish.
    private actor Gate {
        private var waiters: [CheckedContinuation<Void, Never>] = []
        private var isOpen = false

        /// Whether a request is waiting here right now.
        var isHoldingARequest: Bool { !waiters.isEmpty }

        func wait() async {
            guard !isOpen else { return }
            await withCheckedContinuation { waiters.append($0) }
        }

        func open() {
            isOpen = true
            let resumable = waiters
            waiters = []
            resumable.forEach { $0.resume() }
        }
    }

    private func panel() -> (OverlayViewModel, ViewportFeatureViewModel) {
        let controller = MapController()
        let features = ViewportFeatureViewModel(controller: controller)
        let viewModel = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(
                storage: InMemoryProvinceLicenceStorage(initial: .accepted)
            ),
            features: features
        )
        return (viewModel, features)
    }

    private func row(_ viewModel: OverlayViewModel, _ id: LayerID) -> LayerRow? {
        viewModel.rows.first { $0.id == id.rawValue }
    }
}
