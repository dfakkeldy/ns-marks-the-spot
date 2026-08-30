import CoreLocation
import Foundation
import GeoCore
import Observation
import UIKit

/// The app-side shell around the pure `TrackRecording` state machine: it owns
/// the CLLocationManager, keeps the screen awake while a recording runs, and
/// pauses when the app leaves the foreground.
///
/// Foreground-only by decision, not omission: `allowsBackgroundLocationUpdates`
/// stays false, there is no background-location entitlement, and leaving the
/// app auto-pauses with a message rather than silently dropping fixes — a gap
/// the user can see is honest, a straight line across ground nobody walked is
/// not. The web surface behaves the same way when its tab hides.
@MainActor
@Observable
final class TrackRecorder: NSObject {
    /// Why the recording paused itself, when it did. Shown until the user
    /// resumes or stops.
    private(set) var autoPauseMessage: String?

    /// The most recent fix received while the manager runs, whatever its
    /// quality — the HUD's quality dot and Mark's freshness rule read it.
    private(set) var lastFix: TrackFix?

    /// Location permission was refused; the HUD says so instead of
    /// pretending to wait for fixes that will never come.
    private(set) var permissionDenied = false

    private(set) var recording = TrackRecording()

    @ObservationIgnored private let manager = CLLocationManager()

    var status: TrackRecording.Status { recording.status }
    var isActive: Bool { recording.status != .idle }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        // Walking pace: fixes closer together than this are jitter the
        // contract filter would drop anyway.
        manager.distanceFilter = kCLDistanceFilterNone
    }

    func start(now: Date = Date()) {
        guard recording.status == .idle else { return }
        autoPauseMessage = nil
        permissionDenied = false
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        recording.start(now: now)
        manager.startUpdatingLocation()
        // The screen stays on for the walk. Restored on stop and on leaving
        // the foreground — the system owns the idle timer again the moment
        // this app is not actively recording.
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func pause(now: Date = Date()) {
        guard recording.status == .recording else { return }
        recording.pause(now: now)
        manager.stopUpdatingLocation()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func resume(now: Date = Date()) {
        guard recording.status == .paused else { return }
        autoPauseMessage = nil
        recording.resume(now: now)
        manager.startUpdatingLocation()
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func stop(now: Date = Date()) -> TrackRecording.StopResult? {
        let result = recording.stop(now: now)
        // A fresh state machine, so the next recording starts empty: the
        // stopped one keeps its segments and counters in the StopResult, and
        // the web replaces its recorder on stop the same way.
        recording = TrackRecording()
        manager.stopUpdatingLocation()
        UIApplication.shared.isIdleTimerDisabled = false
        autoPauseMessage = nil
        lastFix = nil
        return result
    }

    /// Called from the container's scene-phase handler. Recording is
    /// foreground-only, so anything but `.active` pauses — and says so, since
    /// a silently paused recording reads as a recording.
    func scenePhaseChanged(isActive: Bool) {
        guard !isActive, recording.status == .recording else { return }
        pause()
        autoPauseMessage = "Recording paused while the app was in the background"
    }

    private func receive(_ location: CLLocation) {
        let fix = TrackFix(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            // A negative vertical accuracy means the altitude is invalid;
            // never zero-filled.
            altitudeM: location.verticalAccuracy >= 0 ? location.altitude : nil,
            accuracyM: location.horizontalAccuracy,
            timestamp: location.timestamp
        )
        lastFix = fix
        recording.addFix(fix)
    }
}

// `@preconcurrency`: CLLocationManagerDelegate requirements are nonisolated,
// but the manager is created on the main run loop, so callbacks arrive on the
// main thread and may satisfy the requirements from this main-actor class —
// the same pattern MapController uses.
extension TrackRecorder: @preconcurrency CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            receive(location)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .denied, .restricted:
            permissionDenied = true
        default:
            permissionDenied = false
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        // Transient failures (no signal in a building) are what the HUD's
        // red state is for; nothing to store.
    }
}
