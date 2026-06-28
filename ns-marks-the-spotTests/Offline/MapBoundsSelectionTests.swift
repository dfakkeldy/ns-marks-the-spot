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
}
