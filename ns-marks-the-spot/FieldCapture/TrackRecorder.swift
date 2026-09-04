import CoreLocation
import Foundation
import GeoCore
import Observation
import UIKit

/// The app-side shell around the pure `TrackRecording` state machine: it owns
/// the device seams, keeps the screen awake while a recording runs on screen,
/// and keeps the walk running when it is not.
///
/// **This app was foreground-only by approved decision 3, and is not any more.**
/// The owner reopened that decision on 2026-09-04: a forester walking a stand
/// edge for forty minutes cannot keep a lit screen in hand, and every pocketing
/// of the phone split the track. Leaving the app used to pause with a message —
/// honest about the gap, but the gap should not have been there.
///
/// What continues it is a `CLBackgroundActivitySession`, held for exactly as
/// long as a recording is running. Not `allowsBackgroundLocationUpdates` with
/// Always authorization: the session keeps fixes arriving for a **When In Use**
/// grant, so the app raises no new prompt and asks for nothing it did not ask
/// for before. The price is the blue indicator in the status bar while a
/// session is held, which is the right price — it is the reader's own signal
/// that the walk is still being recorded.
///
/// The screen is a separate question and still a foreground one: the idle timer
/// is held while a recording is on screen and given straight back when it is
/// not. The web surface still stops when its tab hides; a browser has no
/// equivalent of this session.
@MainActor
@Observable
final class TrackRecorder: NSObject {
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
    /// The walk's licence to continue off screen, held for exactly as long as
    /// the recording runs. Same seam, same reason: what a recorder does with a
    /// system service is a rule, and a rule wants a test.
    @ObservationIgnored private let background: any BackgroundActivity

    /// Whether the app is on screen. Remembered, because the idle timer is
    /// derived from it and the derivation has to hold at every transition —
    /// not only at the ones a scene-phase callback happens to follow.
    ///
    /// The case that made this necessary: Record tapped with permission
    /// undetermined, the reader leaves for Settings, grants there, and the
    /// authorization callback starts the recording while the app is still
    /// inactive. `start()` used to light the idle timer for an app that is not
    /// on screen.
    @ObservationIgnored private var isSceneActive = true

    /// Why continuing off screen will not work, when the system says it will
    /// not. Shown while a recording runs, and cleared when it stops.
    ///
    /// Distinct from `refusal`, which is about fixes not coming at all. This
    /// is the narrower and easier-to-miss one: fixes are arriving now and will
    /// stop the moment the phone goes in a pocket.
    private(set) var backgroundNotice: String?

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
        screen: any ScreenWakeLock = ApplicationScreenWakeLock(),
        background: any BackgroundActivity = LocationBackgroundActivity()
    ) {
        self.source = source
        self.screen = screen
        self.background = background
        super.init()
        source.receiver = self
        // A session that says it is not providing background access must not
        // read as one that is.
        background.onUnavailable = { [weak self] reason in
            guard let self, recordingIsRunning() else { return }
            backgroundNotice = reason
        }
    }

    private func recordingIsRunning() -> Bool { recording.status == .recording }

    /// True while a refused start waits for a grant: granted in Settings and
    /// back, the recording begins then, with the clock started then.
    private(set) var isWaitingForPermission = false

    /// A grant that landed while the app was off screen, owed a start when it
    /// comes back. See `apply(refusal:granted:)`.
    @ObservationIgnored private var startsOnReturn = false

    /// Starts recording, or says why it cannot. A refused start is not a
    /// recording: the clock does not run, nothing is asked of CoreLocation,
    /// and the HUD shows the refusal instead of "Recording". The refusal is
    /// returned as well as kept, so the button can say it out loud on every
    /// attempt.
    @discardableResult
    func start(now: Date = Date()) -> Refusal? {
        guard recording.status == .idle else { return nil }
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
        // The screen stays on while the walk is on screen — derived, never
        // asserted: a grant that arrives while the app is in Settings reaches
        // here with nothing on screen to keep awake.
        reconcileScreen()
        // And the walk continues when it is not on screen.
        continuesOffScreen(true)
        return nil
    }

    func pause(now: Date = Date()) {
        guard recording.status == .recording else { return }
        recording.pause(now: now)
        source.stopUpdatingLocation()
        reconcileScreen()
        continuesOffScreen(false)
    }

    func resume(now: Date = Date()) {
        // Not while refused: resumed, the clock would run on fixes that
        // cannot come, which is the state the pause was there to end.
        guard recording.status == .paused, refusal == nil else { return }
        recording.resume(now: now)
        source.startUpdatingLocation()
        reconcileScreen()
        continuesOffScreen(true)
    }

    func stop(now: Date = Date()) -> TrackRecording.StopResult? {
        let result = recording.stop(now: now)
        // A fresh state machine, so the next recording starts empty: the
        // stopped one keeps its segments and counters in the StopResult, and
        // the web replaces its recorder on stop the same way.
        recording = TrackRecording()
        source.stopUpdatingLocation()
        reconcileScreen()
        continuesOffScreen(false)
        backgroundNotice = nil
        lastFix = nil
        return result
    }

    /// Called from the container's scene-phase handler.
    ///
    /// This used to pause the recording and say so. Since decision 3 was
    /// reopened it does not: the walk goes on, and the blue indicator in the
    /// status bar is what says so — put there by the system, not by this app,
    /// which is a stronger claim than any message of ours.
    ///
    /// What is still foreground-only is the screen. The idle timer is held
    /// while a recording is being watched and handed straight back when the
    /// app goes away, so a phone in a pocket sleeps normally while its walk
    /// carries on.
    func scenePhaseChanged(isActive: Bool) {
        isSceneActive = isActive
        // The walk a grant in Settings promised. Begun here rather than at the
        // callback, so its clock starts when fixes do.
        if isActive, startsOnReturn, recording.status == .idle, refusal == nil {
            startsOnReturn = false
            start()
            announce(.started)
            return
        }
        reconcileScreen()
    }

    /// The idle timer, derived from the two facts it depends on and asserted
    /// nowhere else. Held for a recording being watched; handed back the
    /// moment either half stops being true.
    private func reconcileScreen() {
        screen.isHeldAwake = isSceneActive && recording.status == .recording
    }

    /// Whether the walk goes on while the app is not on screen. Two switches,
    /// set in one place so they can never disagree.
    ///
    /// **They are two documented mechanisms, not two halves of one.** Apple
    /// describes `allowsBackgroundLocationUpdates` as configuring a
    /// `CLLocationManager` for continuous background delivery, and
    /// `CLBackgroundActivitySession` as keeping a **When In Use** app in use
    /// so that it may receive location in the background. Either is described
    /// as sufficient. This recorder is manager-based, which argues for the
    /// first; the session is the modern API and the one the reopened decision
    /// named, and it is what reports back when the system will not honour the
    /// request — see `BackgroundActivity.onUnavailable`, which is the only
    /// route by which the reader learns that pocketing the phone will stop the
    /// walk.
    ///
    /// So both, deliberately, and the redundancy is stated rather than hidden:
    /// **nothing here has been run on a device**, and a walk with a real phone
    /// in a real pocket is what should decide whether one of the two can go.
    /// Until then, removing either would be removing something on a guess.
    ///
    /// Held for exactly the length of a running recording and for nothing
    /// else: an app that is not recording must not be an app showing the
    /// indicator.
    private func continuesOffScreen(_ on: Bool) {
        source.deliversInBackground = on
        background.isRunning = on
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
                // Granted while the refused start waited. The recording begins
                // now — unless "now" is while the reader is still in Settings,
                // which is where the grant usually comes from: standard
                // location updates started with the app in the background do
                // not start, and the recording would be a clock running over
                // no fixes. It waits for the app to come back, and the clock
                // starts then, which is the instant fixes actually begin.
                guard isSceneActive else {
                    startsOnReturn = true
                    return
                }
                start()
                announce(.started)
                return
            }
        }
        guard recording.status == .recording, newRefusal != nil, !wasRefused else { return }
        recording.pause(now: Date())
        source.stopUpdatingLocation()
        reconcileScreen()
        // And the licence to continue off screen. A refused walk that kept it
        // would leave the system's blue indicator up over a recorder
        // CoreLocation has stopped feeding — the reader would be told, by iOS
        // itself, that a recording is running that is not.
        continuesOffScreen(false)
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
