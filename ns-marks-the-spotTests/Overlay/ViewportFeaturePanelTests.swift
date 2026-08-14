import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// The panel switches for the layers that are queries rather than tiles.
///
/// None of these reach a network: what is under test is the state the switch,
/// the slider and the status chip report, which is decided before any request
/// goes out.
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

    @Test func theSliderSetsTheOpacityTheFeaturesAreDrawnAt() {
        let (viewModel, features) = panel()

        viewModel.updateLayerOpacity(for: LayerID.zoningHalifax.rawValue, to: 0.35)

        #expect(abs(features.opacity(.zoningHalifax) - 0.35) < 0.0001)
        #expect(abs((row(viewModel, .zoningHalifax)?.opacity ?? 0) - 0.35) < 0.0001)
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
