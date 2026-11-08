import Testing

@testable import ns_marks_the_spot

/// A tap on the map is held until it cannot be half of a double tap.
///
/// The gesture itself takes a person or a UI test: see
/// `testADoubleTapWhileMeasuringZoomsAndPlacesNoPoint`. These pin what happens
/// to a held tap, which a UI test cannot reach for the case that matters most:
/// XCUITest cannot place two taps quickly enough to overlap the wait.
@Suite("Held map tap")
@MainActor
struct HeldMapTapTests {
    private final class Tapped {
        var latitudes: [Double] = []
    }

    private func makeController(recording tapped: Tapped) -> MapController {
        let controller = MapController()
        controller.events = { event in
            if case .mapTapped(let latitude, _) = event { tapped.latitudes.append(latitude) }
        }
        return controller
    }

    /// Long enough that a timer still running would have fired.
    private func waitOutTheInterval() async {
        try? await Task.sleep(for: MapController.doubleTapInterval * 3)
    }

    @Test func aTapMadeAloneCountsOnceTheIntervalHasPassed() async {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.holdTap(latitude: 1, longitude: 0)
        #expect(tapped.latitudes.isEmpty, "the tap counted before a second one could arrive")
        await waitOutTheInterval()
        #expect(tapped.latitudes == [1])
    }

    /// The second tap of a double tap, or the drag of a one-handed zoom.
    @Test func aFurtherTapMeansTheHeldTapNeverHappened() async {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.holdTap(latitude: 1, longitude: 0)
        controller.settleHeldTap(byTouchWithTapCount: 2)
        await waitOutTheInterval()
        #expect(tapped.latitudes.isEmpty)
    }

    /// A quick tap somewhere else: both are meant, in order, and the first
    /// does not wait out an interval the second has already answered.
    @Test func aTouchElsewhereReleasesTheHeldTapAtOnce() async {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.holdTap(latitude: 1, longitude: 0)
        controller.settleHeldTap(byTouchWithTapCount: 1)
        #expect(tapped.latitudes == [1])
        controller.holdTap(latitude: 2, longitude: 0)
        await waitOutTheInterval()
        #expect(tapped.latitudes == [1, 2], "the released tap counted twice or the next one was lost")
    }

    /// A touch with nothing held is every ordinary touch on the map.
    @Test func aTouchWithNothingHeldDoesNothing() {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.settleHeldTap(byTouchWithTapCount: 1)
        controller.settleHeldTap(byTouchWithTapCount: 2)
        #expect(tapped.latitudes.isEmpty)
    }
}
