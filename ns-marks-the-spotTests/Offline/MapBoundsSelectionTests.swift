import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct MapBoundsSelectionTests {
    @Test func mockEngineDeliversSelectedBounds() {
        let engine = MockMapEngine()
        var received: MapBounds?

        engine.beginBoundsSelection { bounds in
            received = bounds
        }

        engine.simulateBoundsSelection(
            MapBounds(
                minLatitude: 44.0,
                minLongitude: -64.0,
                maxLatitude: 45.0,
                maxLongitude: -63.0
            )
        )

        #expect(
            received?.normalized == MapBounds(
                minLatitude: 44.0,
                minLongitude: -64.0,
                maxLatitude: 45.0,
                maxLongitude: -63.0
            )
        )
    }

    @Test func endingSelectionClearsCallback() {
        let engine = MockMapEngine()
        var deliveryCount = 0

        engine.beginBoundsSelection { _ in
            deliveryCount += 1
        }
        engine.endBoundsSelection()

        engine.simulateBoundsSelection(
            MapBounds(
                minLatitude: 44.0,
                minLongitude: -64.0,
                maxLatitude: 45.0,
                maxLongitude: -63.0
            )
        )

        #expect(deliveryCount == 0)
    }

    @Test func mockEngineReturnsCurrentVisibleBounds() {
        let engine = MockMapEngine()
        let visibleBounds = MapBounds(
            minLatitude: 44.0,
            minLongitude: -64.0,
            maxLatitude: 45.0,
            maxLongitude: -63.0
        )
        engine.visibleBounds = visibleBounds

        #expect(engine.currentVisibleBounds() == visibleBounds)
    }
}
