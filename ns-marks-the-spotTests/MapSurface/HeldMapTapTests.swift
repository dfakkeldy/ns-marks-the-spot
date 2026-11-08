import CoreGraphics
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

    private let spot = CGPoint(x: 100, y: 100)

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
        controller.holdTap(latitude: 1, longitude: 0, at: spot)
        #expect(tapped.latitudes.isEmpty, "the tap counted before a second one could arrive")
        await waitOutTheInterval()
        #expect(tapped.latitudes == [1])
    }

    /// The second tap of a double tap, or the drag of a one-handed zoom. The
    /// finger need not come back to the same place, and MapKit does not ask it to.
    @Test func aTouchNearTheHeldTapMeansItNeverHappened() async {
        for distance in [0, MapController.doubleTapReach - 1] {
            let tapped = Tapped()
            let controller = makeController(recording: tapped)
            controller.holdTap(latitude: 1, longitude: 0, at: spot)
            controller.settleHeldTap(byTouchOnMapAt: CGPoint(x: spot.x + distance, y: spot.y))
            await waitOutTheInterval()
            #expect(tapped.latitudes.isEmpty, "a touch \(distance) points away let the tap count")
        }
    }

    /// A quick tap somewhere else: both are meant, in order, and the first
    /// does not wait out an interval the second has already answered.
    @Test func aTouchBeyondTheReachReleasesTheHeldTapAtOnce() async {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.holdTap(latitude: 1, longitude: 0, at: spot)
        controller.settleHeldTap(
            byTouchOnMapAt: CGPoint(x: spot.x, y: spot.y + MapController.doubleTapReach)
        )
        #expect(tapped.latitudes == [1])
        controller.holdTap(latitude: 2, longitude: 0, at: spot)
        await waitOutTheInterval()
        #expect(tapped.latitudes == [1, 2], "the released tap counted twice or the next one was lost")
    }

    /// A button pressed straight after the tap, however close to it: the tap
    /// must land first, in the mode it was made in.
    @Test func aTouchOffTheMapReleasesTheHeldTapAtOnce() {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.holdTap(latitude: 1, longitude: 0, at: spot)
        controller.settleHeldTap(byTouchOnMapAt: nil)
        #expect(tapped.latitudes == [1])
    }

    /// A touch with nothing held is every ordinary touch in the window.
    @Test func aTouchWithNothingHeldDoesNothing() {
        let tapped = Tapped()
        let controller = makeController(recording: tapped)
        controller.settleHeldTap(byTouchOnMapAt: spot)
        controller.settleHeldTap(byTouchOnMapAt: nil)
        #expect(tapped.latitudes.isEmpty)
    }
}
