import CoreLocation
import GeoCore
import MapKit
import Testing

@testable import ns_marks_the_spot

/// Which position the walk-to-line reading is measured from.
///
/// The reading itself is `WalkToLine`, and it is tested in GeoCoreTests. This
/// is the question that comes before it and that the first version answered
/// with a nil-coalescing operator: **whose fix, and is it still true?**
@Suite("The fix a walk-to-line reading measures from")
@MainActor
struct WalkToLineFixTests {
    private func fix(_ lat: Double, agoSeconds: TimeInterval, now: Date) -> TrackFix {
        TrackFix(
            latitude: lat, longitude: -63.0, accuracyM: 5,
            timestamp: now.addingTimeInterval(-agoSeconds)
        )
    }

    /// The one that would have shipped. `pause()` stops the updates and keeps
    /// `lastFix`; only `stop()` clears it. A walk paused at the gate and
    /// carried half a mile down the boundary went on measuring from the gate,
    /// with nothing on screen saying so.
    @Test("A paused recording's old fix does not outrank a newer one from the map")
    func aPausedRecordingsOldFixDoesNotOutrankANewerOneFromTheMap() {
        let now = Date()
        let atTheGate = fix(45.0, agoSeconds: 20, now: now)
        let hereNow = fix(45.01, agoSeconds: 1, now: now)

        let chosen = MapContainerView.walkToLineFix(
            recorder: atTheGate, map: hereNow, now: now
        )
        #expect(chosen == hereNow)
    }

    /// And the other way round, which is the ordinary case: the recorder is
    /// the one being fed while a walk is under way.
    @Test("The recorder's fix wins when it is the newer one")
    func theRecordersFixWinsWhenItIsTheNewerOne() {
        let now = Date()
        let recorder = fix(45.0, agoSeconds: 1, now: now)
        let map = fix(45.01, agoSeconds: 20, now: now)
        #expect(MapContainerView.walkToLineFix(recorder: recorder, map: map, now: now) == recorder)
    }

    /// "Twelve metres to the boundary" is a claim about where the reader is
    /// standing now. Past the window it is not made at all, rather than made
    /// quietly from somewhere else.
    @Test("A fix past the window is not measured from")
    func aFixPastTheWindowIsNotMeasuredFrom() {
        let now = Date()
        let stale = fix(45.0, agoSeconds: MapController.locateMaxFixAge + 1, now: now)
        #expect(MapContainerView.walkToLineFix(recorder: stale, map: nil, now: now) == nil)
        #expect(MapContainerView.walkToLineFix(recorder: stale, map: stale, now: now) == nil)
        #expect(MapContainerView.walkToLineFix(recorder: nil, map: nil, now: now) == nil)

        // Both sides of the clock, as the map's own gate reads it: a fix an
        // hour ahead is no more current than one an hour behind.
        let ahead = fix(45.0, agoSeconds: -(MapController.locateClockTolerance + 1), now: now)
        #expect(MapContainerView.walkToLineFix(recorder: ahead, map: nil, now: now) == nil)

        // And a stale one alongside a fresh one loses rather than poisoning it.
        let fresh = fix(45.02, agoSeconds: 2, now: now)
        #expect(MapContainerView.walkToLineFix(recorder: stale, map: fresh, now: now) == fresh)
    }

    /// The map's fix has to be *observed* to be any use here. `userLocationFix()`
    /// reads `MKUserLocation` out of the map view, which publishes nothing — a
    /// view built on it renders once and keeps that answer while the dot walks
    /// away underneath.
    @Test("The map's accepted fix is kept where a view can watch it")
    func theMapsAcceptedFixIsKeptWhereAViewCanWatchIt() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        #expect(controller.lastUserFix == nil)

        let now = Date()
        controller.receiveFix(
            CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: 46.2, longitude: -60.9),
                altitude: 0, horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: now
            ),
            now: now
        )
        #expect(controller.lastUserFix?.latitude == 46.2)

        // A second one replaces it, which is the whole point.
        let later = now.addingTimeInterval(3)
        controller.receiveFix(
            CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: 46.3, longitude: -60.9),
                altitude: 0, horizontalAccuracy: 5, verticalAccuracy: -1, timestamp: later
            ),
            now: later
        )
        #expect(controller.lastUserFix?.latitude == 46.3)

        // An invalid position is not a fix and must not replace a good one.
        controller.receiveFix(
            CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: 0, longitude: 0),
                altitude: 0, horizontalAccuracy: -1, verticalAccuracy: -1, timestamp: later
            ),
            now: later
        )
        #expect(controller.lastUserFix?.latitude == 46.3)
    }
}
