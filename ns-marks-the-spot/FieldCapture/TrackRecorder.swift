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

    /// Why fixes will not come, when they will not: the reader's refusal, a
    /// device restriction, or Location Services off for the whole device.
    /// Three different things to say, and only the first has a Settings page.
    enum Refusal: Equatable, Sendable {
        case denied
        case restricted
        case servicesOff
    }

    /// Set from the authorization status at start and whenever it changes,
    /// so a recording begun with location already refused says so at once
    /// rather than showing a red dot and a ticking clock for fixes that will
    /// never come.
    private(set) var refusal: Refusal?

    var permissionDenied: Bool { refusal != nil }
    var permissionRestricted: Bool { refusal == .restricted }

    /// Whether Location Services are on for the device, read through the
    /// source so a test can say no without a device that says no.
    @ObservationIgnored var servicesEnabled: () -> Bool { { [source] in source.servicesEnabled } }

    /// Location Services off for the whole device refuses a granted app too,
    /// so the switch is read here rather than only under a denial. A
    /// restriction stays a restriction — the more specific truth, and the one
    /// no Settings page lifts — and `.notDetermined` is nothing yet: the
    /// prompt is still owed, and the system offers the switch along with it.
    ///
    /// `@autoclosure` so the switch is asked about only where the answer is
    /// used. `CLLocationManager.locationServicesEnabled()` may block its
    /// caller, this class is `@MainActor`, and the authorization delegate
    /// fires at cold launch — an app at `.notDetermined` must not pay for a
    /// value it discards.
    static func refusal(
        for status: CLAuthorizationStatus,
        servicesEnabled: @autoclosure () -> Bool
    ) -> Refusal? {
        switch status {
        case .restricted: .restricted
        case .notDetermined: nil
        case .denied: servicesEnabled() ? .denied : .servicesOff
        default: servicesEnabled() ? nil : .servicesOff
        }
    }

    private(set) var recording = TrackRecording()

    /// The device, behind a seam. See `LocationFixSource`: the design document
    /// has claimed this was injected since N1, and until now it was a
    /// `CLLocationManager` built in the initialiser — so segmentation, the
    /// auto-pause, the idle timer and every refusal state were untestable, and
    /// three of the six device bugs the field review found live in exactly
    /// those.
    @ObservationIgnored private let source: any LocationFixSource
    /// The screen, behind the same kind of seam, so "the screen must not be
    /// held awake for a session that cannot record" is a rule a test can check.
    @ObservationIgnored private let screen: any ScreenWakeLock

    var status: TrackRecording.Status { recording.status }
    var isActive: Bool { recording.status != .idle }

    /// Whether the recorder has anything to show. A refusal alone is not
    /// enough: the authorization delegate fires at cold launch, so a device
    /// with Location Services off would otherwise greet every reader with a
    /// refusal card for a recording nobody started. `isWaitingForPermission`
    /// is set by `start()`, which only a tap on Record reaches.
    var isShowingRecorder: Bool { isActive || isWaitingForPermission }

    init(
        source: any LocationFixSource = CoreLocationFixSource(),
        screen: any ScreenWakeLock = ApplicationScreenWakeLock()
    ) {
        self.source = source
        self.screen = screen
        super.init()
        source.receiver = self
    }

    /// True while a refused start waits for a grant: granted in Settings and
    /// back, the recording begins then, with the clock started then.
    private(set) var isWaitingForPermission = false

    /// Starts recording, or says why it cannot. A refused start is not a
    /// recording: the clock does not run, nothing is asked of CoreLocation,
    /// and the HUD shows the refusal instead of "Recording". The refusal is
    /// returned as well as kept, so the button can say it out loud on every
    /// attempt.
    @discardableResult
    func start(now: Date = Date()) -> Refusal? {
        guard recording.status == .idle else { return nil }
        autoPauseMessage = nil
        let status = source.authorizationStatus
        // Read now, not waited for: the delegate reports a status only when
        // it changes, and a refusal already on file never changes again. The
        // device-wide switch is read the same way and for the same reason —
        // nothing announces that it was already off — so a reader who granted
        // this app and later turned Location Services off for the device is
        // refused here instead of getting a clock, a red dot and a screen held
        // awake for fixes that cannot arrive.
        refusal = Self.refusal(for: status, servicesEnabled: servicesEnabled())
        if status == .notDetermined {
            if !servicesEnabled() {
                // Nothing to prompt for. iOS does not show this app's
                // permission alert while the device switch is off — it shows
                // its own, and this app's status stays `.notDetermined`, so
                // the callback that follows is neither a refusal nor a grant.
                // Asked and answered with silence is what the reader used to
                // get; the switch is the true thing to say.
                refusal = .servicesOff
                isWaitingForPermission = true
                return .servicesOff
            }
            // Asked, and waited for: the recording begins when the answer
            // comes — the delegate starts it — not now, under a prompt, with
            // a clock running on fixes that cannot arrive yet.
            isWaitingForPermission = true
            source.requestWhenInUseAuthorization()
            return nil
        }
        if let refusal {
            isWaitingForPermission = true
            return refusal
        }
        isWaitingForPermission = false
        recording.start(now: now)
        source.startUpdatingLocation()
        // The screen stays on for the walk. Restored on stop and on leaving
        // the foreground — the system owns the idle timer again the moment
        // this app is not actively recording.
        screen.isHeldAwake = true
        return nil
    }

    func pause(now: Date = Date()) {
        guard recording.status == .recording else { return }
        recording.pause(now: now)
        source.stopUpdatingLocation()
        screen.isHeldAwake = false
    }

    func resume(now: Date = Date()) {
        // Not while refused: resumed, the clock would run on fixes that
        // cannot come, which is the state the pause was there to end.
        guard recording.status == .paused, refusal == nil else { return }
        autoPauseMessage = nil
        recording.resume(now: now)
        source.startUpdatingLocation()
        screen.isHeldAwake = true
    }

    func stop(now: Date = Date()) -> TrackRecording.StopResult? {
        let result = recording.stop(now: now)
        // A fresh state machine, so the next recording starts empty: the
        // stopped one keeps its segments and counters in the StopResult, and
        // the web replaces its recorder on stop the same way.
        recording = TrackRecording()
        source.stopUpdatingLocation()
        screen.isHeldAwake = false
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

    /// What the reader is owed a word about, counted so each is said once:
    /// a refusal that arrived after the tap (the first prompt answered No),
    /// or a recording that began on a grant.
    enum Announcement: Equatable {
        case refused(Refusal)
        case started
    }
    private(set) var announcement: Announcement?
    private(set) var announcementGeneration = 0

    private func announce(_ what: Announcement) {
        announcement = what
        announcementGeneration += 1
    }

    /// The one place a change of refusal meets a recording, from whichever
    /// callback brought it: refused mid-walk pauses, with the reason,
    /// rather than leaving "Recording" with a clock running on fixes that
    /// will not come; a grant lets a waiting start begin. Ordering between
    /// the authorization callback and a denied error no longer matters.
    /// `granted` is whether the status actually allows location now. A
    /// callback carrying `.notDetermined` — the prompt is up, and unanswered
    /// — is neither a refusal nor a grant: the wait goes on, and nothing is
    /// started or said.
    private func apply(refusal newRefusal: Refusal?, granted: Bool) {
        let wasRefused = refusal != nil
        refusal = newRefusal
        if isWaitingForPermission {
            if let newRefusal {
                if !wasRefused { announce(.refused(newRefusal)) }
            } else if granted, recording.status == .idle {
                // Granted while the refused start waited: the recording
                // begins now, and its clock with it.
                start()
                announce(.started)
                return
            }
        }
        guard recording.status == .recording, newRefusal != nil, !wasRefused else { return }
        recording.pause(now: Date())
        source.stopUpdatingLocation()
        screen.isHeldAwake = false
    }

    private func receive(_ location: CLLocation) {
        // Only while a walk is running. `stopUpdatingLocation()` does not
        // unsend what CoreLocation has already queued, and the receiver stays
        // installed — so a straggler arriving after Stop used to put a fix
        // back on a recorder that had just cleared it, and `lastFix` is what
        // Mark reads to decide whether a cached position is fresh enough to
        // save. A paused walk is the same case: the updates are off, and
        // whatever arrives now belongs to no segment.
        guard recording.status == .recording else { return }
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

// The device's side of the seam. Nothing here knows about CLLocationManager
// any more: a test hands over the same three events in whatever order it wants
// to describe, which is the order a real device does not offer.
extension TrackRecorder: LocationFixReceiver {
    func locationSource(_ source: any LocationFixSource, received location: CLLocation) {
        receive(location)
    }

    /// The reader waved the refusal away: nothing is waiting any more.
    func dismissRefusal() {
        refusal = nil
        isWaitingForPermission = false
    }

    /// Whether a recording stopped without a fix because location was
    /// refused during it, for the save sheet's empty-result wording.
    var stoppedWhileRefused: Bool { refusal != nil }

    func locationSourceAuthorizationChanged(_ source: any LocationFixSource) {
        let status = source.authorizationStatus
        apply(
            refusal: Self.refusal(for: status, servicesEnabled: servicesEnabled()),
            granted: status == .authorizedWhenInUse || status == .authorizedAlways
        )
    }

    func locationSource(_ source: any LocationFixSource, failedWith error: any Error) {
        // Transient failures (no signal in a building) are what the HUD's
        // red state is for; nothing to store. A refusal delivered as a
        // failure is the refusal.
        guard (error as? CLError)?.code == .denied else { return }
        let status = source.authorizationStatus
        let servicesOn = servicesEnabled()
        // The status names the refusal when it can; a denied error under a
        // status that does not explain it is still a refusal, and Location
        // Services off for the device is told apart from this app's.
        let classified = Self.refusal(for: status, servicesEnabled: servicesOn)
            ?? (servicesOn ? .denied : .servicesOff)
        apply(refusal: classified, granted: false)
    }
}
