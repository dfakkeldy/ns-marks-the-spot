import Foundation
import Testing
@testable import ns_marks_the_spot

struct MapStateDiffTests {
    @Test func identicalStatesEmitNoMutations() {
        var state = MapViewState()
        state.layers = [makeLayer(id: "fletcher")]
        state.annotations = [makeAnnotation(id: "a1")]

        #expect(MapStateDiff.mutations(from: state, to: state).isEmpty)
    }

    @Test func addingLayerEmitsAddTileOverlay() {
        let current = MapViewState()
        var desired = current
        let layer = makeLayer(id: "fletcher", opacity: 0.7, isVisible: false)
        desired.layers = [layer]

        #expect(MapStateDiff.mutations(from: current, to: desired) == [.addTileOverlay(layer)])
    }

    @Test func removingLayerEmitsRemoveTileOverlay() {
        var current = MapViewState()
        current.layers = [makeLayer(id: "fletcher")]
        var desired = current
        desired.layers = []

        #expect(MapStateDiff.mutations(from: current, to: desired) == [.removeTileOverlay(id: "fletcher")])
    }

    @Test func hidingLayerEmitsZeroAlpha() {
        var current = MapViewState()
        current.layers = [makeLayer(id: "fletcher", opacity: 0.8, isVisible: true)]
        var desired = current
        desired.layers[0].isVisible = false

        #expect(
            MapStateDiff.mutations(from: current, to: desired) == [
                .setTileOverlayAlpha(id: "fletcher", alpha: 0)
            ]
        )
    }

    @Test func showingLayerEmitsItsOpacityAsAlpha() {
        var current = MapViewState()
        current.layers = [makeLayer(id: "fletcher", opacity: 0.8, isVisible: false)]
        var desired = current
        desired.layers[0].isVisible = true

        #expect(
            MapStateDiff.mutations(from: current, to: desired) == [
                .setTileOverlayAlpha(id: "fletcher", alpha: 0.8)
            ]
        )
    }

    @Test func opacityChangeOnHiddenLayerEmitsNothing() {
        var current = MapViewState()
        current.layers = [makeLayer(id: "fletcher", opacity: 0.3, isVisible: false)]
        var desired = current
        desired.layers[0].opacity = 0.9

        #expect(MapStateDiff.mutations(from: current, to: desired).isEmpty)
    }

    @Test func changedConfigurationReplacesOverlay() throws {
        var current = MapViewState()
        current.layers = [makeLayer(id: "fletcher")]
        var desired = current
        let replacementURL = try #require(URL(string: "https://example.com/other/{z}/{x}/{y}.png"))
        let replacement = MapLayerState(
            configuration: TileLayerConfiguration(id: "fletcher", name: "Fletcher", source: .tile(replacementURL)),
            opacity: 1.0,
            isVisible: true
        )
        desired.layers = [replacement]

        #expect(
            MapStateDiff.mutations(from: current, to: desired) == [
                .removeTileOverlay(id: "fletcher"),
                .addTileOverlay(replacement)
            ]
        )
    }

    @Test func baseMapTypeChangeEmitsSetMapType() {
        let current = MapViewState()
        var desired = current
        desired.baseMapType = .nsAerial

        #expect(MapStateDiff.mutations(from: current, to: desired) == [.setMapType(.nsAerial)])
    }

    @Test func annotationDiffEmitsRemovalsBeforeAdditions() {
        var current = MapViewState()
        current.annotations = [makeAnnotation(id: "old")]
        var desired = current
        let added = makeAnnotation(id: "new")
        desired.annotations = [added]

        #expect(
            MapStateDiff.mutations(from: current, to: desired) == [
                .removeAnnotation(id: "old"),
                .addAnnotation(added)
            ]
        )
    }

    @Test func interactionModeTransitionsEmitSelectionMutations() {
        let idle = MapViewState()
        var selecting = idle
        selecting.interactionMode = .selectingBounds

        #expect(MapStateDiff.mutations(from: idle, to: selecting) == [.beginBoundsSelection])
        #expect(MapStateDiff.mutations(from: selecting, to: idle) == [.endBoundsSelection])
    }

    @Test func showsUserLocationChangeEmitsMutation() {
        let current = MapViewState()
        var desired = current
        desired.showsUserLocation = true

        #expect(MapStateDiff.mutations(from: current, to: desired) == [.setShowsUserLocation(true)])
    }

    private func makeLayer(id: String, opacity: CGFloat = 1.0, isVisible: Bool = true) -> MapLayerState {
        MapLayerState(
            configuration: TileLayerConfiguration(
                id: id,
                name: id,
                source: .tile(URL(fileURLWithPath: "/"))
            ),
            opacity: opacity,
            isVisible: isVisible
        )
    }

    private func makeAnnotation(id: String) -> MapAnnotation {
        MapAnnotation(id: id, latitude: 44.5, longitude: -63.5, title: id)
    }
}
