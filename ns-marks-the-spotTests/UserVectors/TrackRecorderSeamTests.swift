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

/// The seam the design document has claimed since N1 and did not have.
@Suite("Track recorder, driven")
@MainActor
struct TrackRecorderSeamTests {
    private func recorder() -> (TrackRecorder, ScriptedFixSource, SpyScreen) {
        let source = ScriptedFixSource()
        let screen = SpyScreen()
        return (TrackRecorder(source: source, screen: screen), source, screen)
    }

    /// The rule the field review found broken: a session that cannot record
    /// must not hold the screen awake, and must ask CoreLocation for nothing.
    @Test func aRefusedStartTouchesNothing() {
        let (recorder, source, screen) = self.recorder()
        source.authorizationStatus = .denied

        #expect(recorder.start() == .denied)
        #expect(recorder.status == .idle)
        #expect(!screen.isHeldAwake)
        #expect(source.updateStarts == 0)
        #expect(!source.didRequestAuthorization)
        // And it says so, so the button can repeat it on every attempt.
        #expect(recorder.isShowingRecorder)
    }

    /// The device-wide switch refuses a granted app, in its own words.
    @Test func theDeviceSwitchRefusesAGrantedApp() {
        let (recorder, source, screen) = self.recorder()
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
        let (recorder, source, _) = self.recorder()
        source.authorizationStatus = .notDetermined
        source.servicesEnabled = false

        #expect(recorder.start() == .servicesOff)
        #expect(!source.didRequestAuthorization)
    }

    /// Granted while a refused start waited: the recording begins THEN, with
    /// its clock started then.
    @Test func aGrantStartsTheWaitingRecording() {
        let (recorder, source, screen) = self.recorder()
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
        let (recorder, source, screen) = self.recorder()
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
        let (recorder, source, _) = self.recorder()
        recorder.start()

        source.fail(with: .denied)
        #expect(recorder.refusal == .denied)

        let (other, otherSource, _) = self.recorder()
        other.start()
        otherSource.servicesEnabled = false
        otherSource.fail(with: .denied)
        #expect(other.refusal == .servicesOff)
    }

    /// A transient failure is not a refusal: no signal in a building is what
    /// the HUD's red state is for.
    @Test func aTransientFailureRefusesNothing() {
        let (recorder, source, screen) = self.recorder()
        recorder.start()

        source.fail(with: .locationUnknown)
        #expect(recorder.refusal == nil)
        #expect(recorder.status == .recording)
        #expect(screen.isHeldAwake)
    }

    /// Fixes reach the contract's filter, and what it turns down is said.
    @Test func fixesReachTheFilterAndItsRefusalsAreReported() {
        let (recorder, source, _) = self.recorder()
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

    /// Leaving the foreground pauses and gives the screen back; the recorder
    /// is foreground-only by decision, and the gap is said rather than
    /// silently bridged.
    @Test func leavingTheForegroundPausesAndSaysSo() {
        let (recorder, source, screen) = self.recorder()
        recorder.start()
        source.deliver(latitude: 45.0, longitude: -63.0, accuracyM: 5, at: 1_000)

        recorder.scenePhaseChanged(isActive: false)
        #expect(recorder.status == .paused)
        #expect(!screen.isHeldAwake)
        #expect(recorder.autoPauseMessage != nil)
        #expect(!source.isUpdating)
    }

    /// Stopping hands back the walk and the screen, and leaves a fresh machine
    /// so the next recording starts empty.
    @Test func stoppingReturnsTheWalkAndTheScreen() {
        let (recorder, source, screen) = self.recorder()
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
