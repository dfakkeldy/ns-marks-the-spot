import CoreLocation
import Testing

@testable import ns_marks_the_spot

/// Why a recording gets no fixes, told apart.
@Suite("Recording refusals")
@MainActor
struct TrackRecorderRefusalTests {
    @Test func eachRefusalIsItsOwn() {
        #expect(TrackRecorder.refusal(for: .denied, servicesEnabled: true) == .denied)
        #expect(TrackRecorder.refusal(for: .denied, servicesEnabled: false) == .servicesOff)
        #expect(TrackRecorder.refusal(for: .restricted, servicesEnabled: true) == .restricted)
        #expect(TrackRecorder.refusal(for: .authorizedWhenInUse, servicesEnabled: true) == nil)
        #expect(TrackRecorder.refusal(for: .notDetermined, servicesEnabled: true) == nil)
    }

    /// A grant is not a fix: Location Services off for the whole device
    /// refuses a granted app too, and in its own words rather than blaming a
    /// permission the reader gave.
    @Test func theDeviceSwitchRefusesAGrantedApp() {
        for status in [CLAuthorizationStatus.authorizedWhenInUse, .authorizedAlways] {
            #expect(TrackRecorder.refusal(for: status, servicesEnabled: false) == .servicesOff)
            #expect(TrackRecorder.refusal(for: status, servicesEnabled: true) == nil)
        }
        // A restriction is the more specific truth, and the one no Settings
        // page lifts.
        #expect(TrackRecorder.refusal(for: .restricted, servicesEnabled: false) == .restricted)
        // Nothing asked is not something refused: the first prompt is still
        // owed, and the system offers the switch along with it.
        #expect(TrackRecorder.refusal(for: .notDetermined, servicesEnabled: false) == nil)
    }

    /// The classifier is read on the cold-launch authorization callback, and
    /// `CLLocationManager.locationServicesEnabled()` may block its caller on
    /// this main-actor class — so an app that has not been asked yet must not
    /// pay for an answer it discards.
    @Test func theSwitchIsNotConsultedWhereItsAnswerIsUnused() {
        var asked = 0
        let counting = { () -> Bool in
            asked += 1
            return true
        }
        _ = TrackRecorder.refusal(for: .notDetermined, servicesEnabled: counting())
        _ = TrackRecorder.refusal(for: .restricted, servicesEnabled: counting())
        #expect(asked == 0)
        _ = TrackRecorder.refusal(for: .authorizedWhenInUse, servicesEnabled: counting())
        #expect(asked == 1)
    }

    /// A refusal is not a reason to open the map with a recording card: the
    /// authorization delegate fires at cold launch, and a device with the
    /// switch off would greet every reader with one.
    @Test func theRecorderShowsNothingUntilSomebodyAsksToRecord() {
        let source = SwitchedOffFixSource()
        let recorder = TrackRecorder(source: source, screen: UnwatchedScreen())
        #expect(!recorder.isShowingRecorder)

        let refusal = recorder.start()
        #expect(refusal != nil)
        #expect(recorder.isShowingRecorder)
        #expect(!recorder.isActive)

        recorder.dismissRefusal()
        #expect(!recorder.isShowingRecorder)
    }

    /// The destructive weight belongs where the destruction is. Stop ends the
    /// recording and opens the save sheet, where the walk is still there to
    /// keep; Discard is the tap that destroys the only copy of it.
    @Test func discardAsksBeforeItDestroysAWalk() {
        #expect(SaveTrackSheet.discardAsksFirst(keptVertexCount: 1))
        #expect(SaveTrackSheet.discardAsksFirst(keptVertexCount: 400))
        // Nothing drawable was recorded, so the sheet offers no Save and
        // Discard is its only exit: a question with one possible answer is an
        // obstacle, not a safeguard.
        #expect(!SaveTrackSheet.discardAsksFirst(keptVertexCount: 0))
    }

    /// The question names both things that go, and says it cannot be undone.
    @Test func theDiscardQuestionNamesWhatIsLost() {
        #expect(SaveTrackSheet.discardTitle == "Discard this recording?")
        #expect(SaveTrackSheet.discardMessage.contains("track"))
        #expect(SaveTrackSheet.discardMessage.contains("fixes"))
        #expect(SaveTrackSheet.discardMessage.contains("cannot be undone"))
    }

    /// Only the app's own refusal has a Settings page; the words differ.
    @Test func theHudWordsDiffer() {
        let denied = TrackRecordingHUD.refusalText(.denied)
        let restricted = TrackRecordingHUD.refusalText(.restricted)
        let off = TrackRecordingHUD.refusalText(.servicesOff)
        #expect(denied.contains("not granted"))
        #expect(restricted.contains("restricted"))
        #expect(off.contains("Location Services are off"))
        #expect(Set([denied, restricted, off]).count == 3)
    }
}

/// Location Services off for the device, this app granted. The one state that
/// makes `start()` refuse without asking CoreLocation anything.
@MainActor
private final class SwitchedOffFixSource: LocationFixSource {
    var authorizationStatus: CLAuthorizationStatus = .authorizedWhenInUse
    var servicesEnabled = false
    var deliversInBackground = false
    weak var receiver: (any LocationFixReceiver)?
    func requestWhenInUseAuthorization() {}
    func startUpdatingLocation() {}
    func stopUpdatingLocation() {}
}

@MainActor
private final class UnwatchedScreen: ScreenWakeLock {
    var isHeldAwake = false
}
