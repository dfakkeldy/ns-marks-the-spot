import CoreLocation
import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// A Lock Screen a test drives.
@MainActor
private final class SpyActivity: TrackActivityPresenter {
    private(set) var started: [TrackActivityAttributes.ContentState] = []
    private(set) var updated: [TrackActivityAttributes.ContentState] = []
    private(set) var ended: [TrackActivityAttributes.ContentState] = []

    var isShowing = false

    func start(_ state: TrackActivityAttributes.ContentState, startedAt: Date) {
        started.append(state)
        isShowing = true
    }

    func update(_ state: TrackActivityAttributes.ContentState) { updated.append(state) }

    func end(_ state: TrackActivityAttributes.ContentState) {
        ended.append(state)
        isShowing = false
    }
}

@MainActor
private final class QuietSource: LocationFixSource {
    var authorizationStatus: CLAuthorizationStatus = .authorizedWhenInUse
    var servicesEnabled = true
    var deliversInBackground = false
    weak var receiver: (any LocationFixReceiver)?
    func requestWhenInUseAuthorization() {}
    func startUpdatingLocation() {}
    func stopUpdatingLocation() {}

    func deliver(latitude: Double, longitude: Double, accuracyM: Double, at seconds: TimeInterval) {
        receiver?.locationSource(
            self,
            received: CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                altitude: 0, horizontalAccuracy: accuracyM, verticalAccuracy: -1,
                timestamp: Date(timeIntervalSince1970: seconds)
            )
        )
    }
}

@MainActor
private final class QuietScreen: ScreenWakeLock {
    var isHeldAwake = false
}

@MainActor
private final class QuietBackground: BackgroundActivity {
    var isRunning = false
    var onUnavailable: ((String) -> Void)?
}

/// What the Lock Screen is told about a walk, and how often.
///
/// §12.11's Live Activity. The reader's phone is in a pocket, so the only
/// account of the recording they can get is this one — which makes "what it
/// says" and "when it stops saying it" the whole of the contract.
@Suite("The walk on the Lock Screen")
@MainActor
struct TrackActivityTests {
    private func rig() -> (TrackRecorder, QuietSource, SpyActivity) {
        let source = QuietSource()
        let activity = SpyActivity()
        return (
            TrackRecorder(
                source: source, screen: QuietScreen(),
                background: QuietBackground(), activity: activity
            ),
            source, activity
        )
    }

    @Test("A walk starts one activity and ends it with what the walk came to")
    func aWalkStartsOneActivityAndEndsItWithWhatTheWalkCameTo() {
        let (recorder, source, activity) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        #expect(activity.started.count == 1)
        #expect(activity.started[0].isRecording)
        #expect(activity.started[0].distanceMetres == 0)

        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_001)

        _ = recorder.stop(now: Date(timeIntervalSince1970: 1_060))
        #expect(activity.ended.count == 1)
        // Ended saying it has ended. A Live Activity left claiming to be
        // recording is a claim on the Lock Screen that the walk goes on.
        #expect(activity.ended[0].isRecording == false)
        #expect(activity.ended[0].runningSince == nil)
        #expect(!activity.isShowing)
    }

    /// The clock on the Lock Screen counts by itself from `runningSince`, so
    /// the app is never woken to say what a clock already knows. Pausing
    /// freezes it at the elapsed seconds; resuming hands it a new instant to
    /// count from rather than the original start, or the paused minutes would
    /// reappear in the total.
    @Test("Pausing freezes the clock and resuming restarts it from what was banked")
    func pausingFreezesTheClockAndResumingRestartsIt() throws {
        let (recorder, _, activity) = rig()
        let start = Date(timeIntervalSince1970: 1_000)
        recorder.start(now: start)
        #expect(activity.started[0].runningSince == start)

        recorder.pause(now: start.addingTimeInterval(60))
        let paused = try #require(activity.updated.last)
        #expect(paused.isRecording == false)
        #expect(paused.runningSince == nil)
        #expect(abs(paused.elapsedSeconds - 60) < 0.001)

        // Resumed five minutes later: the clock counts from an instant that
        // already has the first minute in it, and not from five minutes ago.
        let resumedAt = start.addingTimeInterval(360)
        recorder.resume(now: resumedAt)
        let resumed = try #require(activity.updated.last)
        #expect(resumed.isRecording)
        let runningSince = try #require(resumed.runningSince)
        #expect(abs(runningSince.timeIntervalSince(resumedAt) + 60) < 0.001)
    }

    /// ActivityKit budgets updates from a backgrounded app, and the clock
    /// needs none of them: only the distance does. So fixes are not one update
    /// each — but a change of state is pushed the moment it happens, because
    /// that is what a reader looking at a Lock Screen is waiting for.
    @Test("Fixes do not each buy an update, and a state change always does")
    func fixesDoNotEachBuyAnUpdateAndAStateChangeAlwaysDoes() {
        let (recorder, source, activity) = rig()
        recorder.start(now: Date(timeIntervalSince1970: 1_000))
        let updatesAtStart = activity.updated.count

        // A minute of walking, a fix a second.
        for second in 1...50 {
            source.deliver(
                latitude: 45.0 + Double(second) * 0.0001, longitude: -63.0,
                accuracyM: 5, at: 1_000 + Double(second)
            )
        }
        let pushed = activity.updated.count - updatesAtStart
        #expect(pushed > 0)
        // Fifty fixes, ten seconds apart at most: five or so, not fifty.
        #expect(pushed <= 6)

        // And the pause is not on a cadence.
        recorder.pause(now: Date(timeIntervalSince1970: 1_051))
        #expect(activity.updated.last?.isRecording == false)
    }

    /// The Lock Screen's numbers are the HUD's numbers. Two screens, one walk.
    @Test("The Lock Screen rounds a distance the way the map does")
    func theLockScreenRoundsADistanceTheWayTheMapDoes() {
        for metres in [0.0, 1.4, 1.5, 141.49, 999.4, 999.5, 1_000, 1_234.5, 12_345.6] {
            #expect(
                TrackActivityFormat.distance(metres) == Geodesy.formatDistance(metres),
                "the Lock Screen and the HUD must not disagree at \(metres) m"
            )
        }
    }
}
