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
