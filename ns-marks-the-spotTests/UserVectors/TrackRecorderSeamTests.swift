import CoreLocation
import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// A location source a test drives.
///
/// Everything here is what a device does and a test cannot ask for: a fix at a
/// chosen time and accuracy, an authorization change in a chosen order, a
/// `kCLErrorDenied` arriving before or after the status that explains it.
@MainActor
private final class ScriptedFixSource: LocationFixSource {
    var authorizationStatus: CLAuthorizationStatus = .authorizedWhenInUse
    var servicesEnabled = true
    weak var receiver: (any LocationFixReceiver)?

    private(set) var didRequestAuthorization = false
    /// `allowsBackgroundLocationUpdates` on the real manager.
    var deliversInBackground = false
    /// How many times updates have been asked for and let go, so a test can
    /// see a refused start ask CoreLocation for nothing at all.
    private(set) var updateStarts = 0
    private(set) var updateStops = 0
    var isUpdating: Bool { updateStarts > updateStops }

    func requestWhenInUseAuthorization() { didRequestAuthorization = true }
    func startUpdatingLocation() { updateStarts += 1 }
    func stopUpdatingLocation() { updateStops += 1 }

    func deliver(
        latitude: Double, longitude: Double, accuracyM: Double, at seconds: TimeInterval
    ) {
        guard let receiver else { return }
        receiver.locationSource(
            self,
            received: CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                altitude: 0,
                horizontalAccuracy: accuracyM,
                verticalAccuracy: -1,
                timestamp: Date(timeIntervalSince1970: seconds)
            )
        )
    }

    func changeAuthorization(to status: CLAuthorizationStatus) {
        authorizationStatus = status
        receiver?.locationSourceAuthorizationChanged(self)
    }

    func fail(with code: CLError.Code) {
        receiver?.locationSource(self, failedWith: CLError(code))
    }
}

@MainActor
private final class SpyScreen: ScreenWakeLock {
    var isHeldAwake = false
}

/// The walk's licence to continue off screen, counted rather than merely
/// observed: a session started twice is a second promise behind one walk, and
/// the real one is idempotent for that reason.
/// A Lock Screen that is not one. Injected in every rig here, because the
/// default is the real `LiveActivityPresenter` — and a unit test that reaches
/// ActivityKit for real blocks the main actor long enough to starve every
/// other main-actor test in the bundle. That is how this was found: an
/// unrelated deadlock-detector test began timing out at sixty seconds.
@MainActor
private final class UnwatchedActivity: TrackActivityPresenter {
    var isShowing = false
    func start(_ state: TrackActivityAttributes.ContentState, startedAt: Date) { isShowing = true }
    func update(_ state: TrackActivityAttributes.ContentState) {}
    func end(_ state: TrackActivityAttributes.ContentState) { isShowing = false }
}

@MainActor
private final class SpyBackground: BackgroundActivity {
    private(set) var starts = 0
    private(set) var ends = 0
    var isRunning = false {
        didSet {
            guard isRunning != oldValue else { return }
            if isRunning { starts += 1 } else { ends += 1 }
        }
    }

    var onUnavailable: ((String?) -> Void)?

    /// What the real session's `diagnostics` sequence does. Nil is the session
    /// saying the problem has gone.
    func reportUnavailable(_ reason: String?) { onUnavailable?(reason) }
}

/// The seam the design document has claimed since N1 and did not have.
@Suite("Track recorder, driven")
@MainActor
struct TrackRecorderSeamTests {
    private func recorder() -> (TrackRecorder, ScriptedFixSource, SpyScreen, SpyBackground) {
        let source = ScriptedFixSource()
        let screen = SpyScreen()
        let background = SpyBackground()
        return (
            TrackRecorder(
                source: source, screen: screen, background: background,
                activity: UnwatchedActivity()
            ),
            source, screen, background
        )
    }

    /// The rule the field review found broken: a session that cannot record
    /// must not hold the screen awake, and must ask CoreLocation for nothing.
    @Test func aRefusedStartTouchesNothing() {
        let (recorder, source, screen, background) = self.recorder()
        source.authorizationStatus = .denied

        #expect(recorder.start() == .denied)
        #expect(recorder.status == .idle)
        #expect(!screen.isHeldAwake)
        #expect(source.updateStarts == 0)
        #expect(!source.didRequestAuthorization)
        // Nor the background session: an indicator in the status bar for a
        // recording that was refused is a promise about nothing.
        #expect(!background.isRunning)
        #expect(background.starts == 0)
        #expect(!source.deliversInBackground)
        // And it says so, so the button can repeat it on every attempt.
        #expect(recorder.isShowingRecorder)
    }

    /// The device-wide switch refuses a granted app, in its own words.
    @Test func theDeviceSwitchRefusesAGrantedApp() {
        let (recorder, source, screen, _) = self.recorder()
        source.authorizationStatus = .authorizedWhenInUse
        source.servicesEnabled = false

        #expect(recorder.start() == .servicesOff)
        #expect(!screen.isHeldAwake)
        #expect(source.updateStarts == 0)
    }

    /// Nothing to prompt for: iOS shows its own alert while the switch is off,
    /// and this app's status stays `.notDetermined`, so the reader used to tap
    /// Record and get silence.
    @Test func anUnaskedAppWithTheSwitchOffSaysWhichSwitch() {
        let (recorder, source, _, _) = self.recorder()
        source.authorizationStatus = .notDetermined
        source.servicesEnabled = false

        #expect(recorder.start() == .servicesOff)
        #expect(!source.didRequestAuthorization)
    }

    /// Granted while a refused start waited: the recording begins THEN, with
    /// its clock started then.
    @Test func aGrantStartsTheWaitingRecording() {
        let (recorder, source, screen, _) = self.recorder()
        source.authorizationStatus = .notDetermined

        #expect(recorder.start() == nil)
        #expect(recorder.status == .idle)
        #expect(source.didRequestAuthorization)
        #expect(!screen.isHeldAwake)

        source.changeAuthorization(to: .authorizedWhenInUse)
        #expect(recorder.status == .recording)
        #expect(screen.isHeldAwake)
        #expect(source.isUpdating)
    }

    /// Refused mid-walk pauses rather than leaving "Recording" over a clock
    /// running on fixes that will not come — and gives the screen back.
    @Test func aRefusalMidWalkPausesAndReleasesTheScreen() {
        let (recorder, source, screen, _) = self.recorder()
        recorder.start()
        #expect(recorder.status == .recording)
        #expect(screen.isHeldAwake)

        source.servicesEnabled = false
        source.changeAuthorization(to: .authorizedWhenInUse)

        #expect(recorder.status == .paused)
        #expect(recorder.refusal == .servicesOff)
        #expect(!screen.isHeldAwake)
        #expect(!source.isUpdating)
    }

    /// A denied error is the refusal even when the status does not explain it,
    /// and the device switch is told apart from this app's grant.
    @Test func aDeniedErrorIsClassifiedRatherThanIgnored() {
        let (recorder, source, _, _) = self.recorder()
        recorder.start()

        source.fail(with: .denied)
        #expect(recorder.refusal == .denied)

        let (other, otherSource, _, _) = self.recorder()
        other.start()
        otherSource.servicesEnabled = false
        otherSource.fail(with: .denied)
        #expect(other.refusal == .servicesOff)
    }

    /// A transient failure is not a refusal: no signal in a building is what
    /// the HUD's red state is for.
    @Test func aTransientFailureRefusesNothing() {
        let (recorder, source, screen, _) = self.recorder()
        recorder.start()

        source.fail(with: .locationUnknown)
        #expect(recorder.refusal == nil)
        #expect(recorder.status == .recording)
        #expect(screen.isHeldAwake)
    }

    /// Fixes reach the contract's filter, and what it turns down is said.
    @Test func fixesReachTheFilterAndItsRefusalsAreReported() {
        let (recorder, source, _, _) = self.recorder()
        recorder.start()

        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_000)
        #expect(recorder.recording.fixQuality == .accepted(accuracyM: 5))

        // Past the accuracy gate.
        source.deliver(latitude: 45.0002, longitude: -63.0, accuracyM: 60, at: 1_001)
        #expect(recorder.recording.fixQuality == .rejected)

        // A kilometre in a second is not a walk, whatever its accuracy says.
        source.deliver(latitude: 45.01, longitude: -63.0, accuracyM: 5, at: 1_002)
        #expect(recorder.recording.fixQuality == .rejected)
    }

    /// What approved decision 3 used to do, and does not since the owner
    /// reopened it on 2026-09-04: leaving the app paused the recording and
    /// said so. A forester walking a stand edge for forty minutes cannot keep
    /// a lit screen in hand, and every pocketing split the track in two.
    ///
    /// The walk goes on. The screen does not: the idle timer is a foreground
    /// matter, so a pocketed phone sleeps normally while its recording runs.
    @Test func leavingTheForegroundKeepsTheWalkAndGivesTheScreenBack() {
        let (recorder, source, screen, background) = self.recorder()
        recorder.start()
        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_000)

        recorder.scenePhaseChanged(isActive: false)
        #expect(recorder.status == .recording)
        #expect(source.isUpdating)
        #expect(background.isRunning)
        #expect(!screen.isHeldAwake)

        // And the fixes that arrive while it is away are the reader's walk,
        // not a straight line across ground nobody covered.
        source.deliver(latitude: 45.0005, longitude: -63.0, accuracyM: 5, at: 1_010)
        #expect(recorder.lastFix?.latitude == 45.0005)

        recorder.scenePhaseChanged(isActive: true)
        #expect(screen.isHeldAwake)
        #expect(recorder.status == .recording)
    }

    /// The idle timer is not held for a recording that is not running. Coming
    /// back to a paused walk must not light the screen indefinitely for a
    /// recording that is taking nothing in.
    @Test func theScreenIsOnlyHeldForARecordingBeingWatched() {
        let (recorder, _, screen, _) = self.recorder()
        recorder.scenePhaseChanged(isActive: true)
        #expect(!screen.isHeldAwake)

        recorder.start()
        recorder.pause()
        #expect(!screen.isHeldAwake)
        recorder.scenePhaseChanged(isActive: true)
        #expect(!screen.isHeldAwake)

        recorder.resume()
        #expect(screen.isHeldAwake)
    }

    /// The session is tied to the recording, not to the app.
    ///
    /// Held while a walk runs and let go the moment it does not: a session
    /// outliving its recording puts the system's blue indicator in the status
    /// bar over a recorder that is taking nothing in, which says the opposite
    /// of what is true. Counted, because the real one is idempotent and a
    /// second start would be a second promise behind one walk.
    @Test func theBackgroundSessionIsHeldForExactlyTheWalk() {
        let (recorder, source, _, background) = self.recorder()
        #expect(!background.isRunning)

        recorder.start()
        #expect(background.isRunning)
        #expect(background.starts == 1)
        // Both halves of the one rule: the session keeps the app running, and
        // this is what makes the manager deliver while it is.
        #expect(source.deliversInBackground)

        recorder.pause()
        #expect(!background.isRunning)
        #expect(!source.deliversInBackground)

        recorder.resume()
        #expect(background.isRunning)
        #expect(background.starts == 2)
        #expect(source.deliversInBackground)

        _ = recorder.stop()
        #expect(!background.isRunning)
        #expect(background.ends == 2)
        #expect(!source.deliversInBackground)
    }

    /// A refusal mid-walk gives back everything the walk was holding. The
    /// indicator must not stay up over a recording CoreLocation has stopped
    /// feeding.
    @Test func aRefusalMidWalkGivesBackTheSessionToo() {
        let (recorder, source, screen, background) = self.recorder()
        recorder.start()
        #expect(background.isRunning)

        source.changeAuthorization(to: .denied)
        #expect(recorder.status == .paused)
        #expect(!background.isRunning)
        #expect(!source.deliversInBackground)
        #expect(!screen.isHeldAwake)
    }


    /// A grant usually arrives from Settings, which means it arrives while the
    /// app is not on screen. Starting standard location updates then does not
    /// start them, so the recording would be a clock running over no fixes —
    /// and `start()` would have lit the idle timer for a screen nobody is
    /// looking at.
    @Test func aGrantThatLandsOffScreenWaitsForTheAppToComeBack() {
        let (recorder, source, screen, background) = self.recorder()
        source.authorizationStatus = .notDetermined
        #expect(recorder.start() == nil)
        #expect(recorder.isWaitingForPermission)

        recorder.scenePhaseChanged(isActive: false)
        source.changeAuthorization(to: .authorizedWhenInUse)

        // Nothing yet: no clock, no CoreLocation, no screen, no session.
        #expect(recorder.status == .idle)
        #expect(source.updateStarts == 0)
        #expect(!screen.isHeldAwake)
        #expect(!background.isRunning)

        // And then the reader comes back.
        recorder.scenePhaseChanged(isActive: true)
        #expect(recorder.status == .recording)
        #expect(source.updateStarts == 1)
        #expect(screen.isHeldAwake)
        #expect(background.isRunning)
    }

    /// The session is not a promise. When it reports that it cannot keep the
    /// app in use, the reader is told — before the phone goes in a pocket,
    /// which is the only moment the telling is worth anything.
    @Test func aSessionThatCannotContinueSaysSoWhileTheWalkIsStillOnScreen() {
        let (recorder, _, _, background) = self.recorder()
        recorder.start()
        #expect(recorder.backgroundNotice == nil)

        background.reportUnavailable("Recording may stop when this app is off screen.")
        #expect(recorder.backgroundNotice == "Recording may stop when this app is off screen.")

        // And it is about this walk, so it goes when the walk does.
        _ = recorder.stop()
        #expect(recorder.backgroundNotice == nil)
    }

    /// A diagnostic arriving for a recording that is no longer running is not
    /// news about anything.
    @Test func aSessionDiagnosticAfterTheWalkIsIgnored() {
        let (recorder, _, _, background) = self.recorder()
        recorder.start()
        _ = recorder.stop()
        background.reportUnavailable("Recording will stop when this app is off screen.")
        #expect(recorder.backgroundNotice == nil)
    }

    /// `stopUpdatingLocation()` does not unsend what CoreLocation has already
    /// queued, and `lastFix` is what Mark reads to decide whether a cached
    /// position is fresh enough to save.
    @Test func aFixArrivingAfterStopIsNotTakenIn() {
        let (recorder, source, _, _) = self.recorder()
        recorder.start()
        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_000)
        _ = recorder.stop()
        #expect(recorder.lastFix == nil)

        source.deliver(latitude: 45.5, longitude: -63.5, accuracyM: 5, at: 1_001)
        #expect(recorder.lastFix == nil)
        #expect(recorder.status == .idle)
    }

    /// A paused walk is the same case: the updates are off, and whatever
    /// arrives now belongs to no segment.
    @Test func aFixArrivingWhilePausedBelongsToNoSegment() {
        let (recorder, source, _, _) = self.recorder()
        recorder.start()
        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_000)
        let during = recorder.lastFix
        #expect(during != nil)

        recorder.pause()
        source.deliver(latitude: 45.5, longitude: -63.5, accuracyM: 5, at: 1_001)
        #expect(recorder.lastFix?.latitude == during?.latitude)
    }

    /// A grant starts the clock THEN, not at the tap that was refused: a walk
    /// that waited two minutes in Settings did not begin two minutes ago.
    @Test func theClockStartsAtTheGrantNotAtTheTap() {
        let (recorder, source, _, _) = self.recorder()
        source.authorizationStatus = .notDetermined
        recorder.start()
        #expect(recorder.recording.status == .idle)

        source.changeAuthorization(to: .authorizedWhenInUse)
        #expect(recorder.recording.status == .recording)
        // Started now, so what has elapsed is what has elapsed since the
        // grant — not since a tap the app refused.
        #expect(recorder.recording.stats(now: Date()).elapsedSeconds < 1)
    }

    /// Stopping hands back the walk and the screen, and leaves a fresh machine
    /// so the next recording starts empty.
    @Test func stoppingReturnsTheWalkAndTheScreen() {
        let (recorder, source, screen, _) = self.recorder()
        recorder.start()
        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_000)
        source.deliver(latitude: 45.0001, longitude: -63.0, accuracyM: 5, at: 1_002)

        let result = recorder.stop()
        #expect(result != nil)
        #expect(recorder.status == .idle)
        #expect(!screen.isHeldAwake)
        #expect(!source.isUpdating)
        #expect(recorder.lastFix == nil)
    }
}
