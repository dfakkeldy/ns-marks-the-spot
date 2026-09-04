import CoreLocation
import UIKit

/// What the recorder and the marker need from the device, behind a seam.
///
/// The design document has claimed since N1 that the recorder takes "an
/// injected fix source", and it did not: both classes built a
/// `CLLocationManager` in their initialiser and talked to it directly, so the
/// segmentation, the auto-pause, the idle timer and the refusal states — three
/// of the six device bugs the field review found live in exactly here — could
/// not be driven from a test at all. This is that seam, and it is deliberately
/// the smallest one that admits the whole of what those classes do with
/// CoreLocation rather than a general abstraction over location.
///
/// Not a protocol over `CLLocationManager`: the point is that a test can hand
/// over a scripted sequence of fixes, authorization changes and errors in the
/// order it wants them, which is the order a real device does not offer.
@MainActor
protocol LocationFixSource: AnyObject {
    /// This app's authorization, read rather than waited for: the delegate
    /// reports a status only when it CHANGES, and a refusal already on file
    /// never changes again.
    var authorizationStatus: CLAuthorizationStatus { get }

    /// Whether Location Services are on for the whole device. Separate from
    /// the app's own grant, and separately refusable.
    var servicesEnabled: Bool { get }

    /// Where fixes, authorization changes and failures are delivered.
    var receiver: (any LocationFixReceiver)? { get set }

    /// Whether this source keeps delivering while the app is not on screen.
    ///
    /// `CLLocationManager.allowsBackgroundLocationUpdates`, which Apple
    /// documents as configuring *this manager* for continuous background
    /// delivery. Set only while a recording runs, and cleared with it.
    ///
    /// Permitted under **When In Use**: with `UIBackgroundModes` containing
    /// `location`, a when-in-use app may set this, and iOS shows the reader
    /// that it has. It is not, and must not become, a reason to ask for
    /// Always.
    ///
    /// Set alongside `BackgroundActivity` — see
    /// `TrackRecorder.continuesOffScreen(_:)`, which is the one place both are
    /// set and which says plainly why there are two.
    var deliversInBackground: Bool { get set }

    func requestWhenInUseAuthorization()
    func startUpdatingLocation()
    func stopUpdatingLocation()
}

/// The other half of the seam.
@MainActor
protocol LocationFixReceiver: AnyObject {
    func locationSource(_ source: any LocationFixSource, received location: CLLocation)
    func locationSourceAuthorizationChanged(_ source: any LocationFixSource)
    func locationSource(_ source: any LocationFixSource, failedWith error: any Error)
}

/// The real one.
@MainActor
final class CoreLocationFixSource: NSObject, LocationFixSource {
    private let manager = CLLocationManager()
    weak var receiver: (any LocationFixReceiver)?

    var authorizationStatus: CLAuthorizationStatus { manager.authorizationStatus }

    /// Read here rather than cached. Apple warns that this call can block, so
    /// it is asked only where the answer is used — see `TrackRecorder.refusal`,
    /// which takes it as an autoclosure for exactly that reason.
    var servicesEnabled: Bool { CLLocationManager.locationServicesEnabled() }

    init(desiredAccuracy: CLLocationAccuracy = kCLLocationAccuracyBest) {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = desiredAccuracy
        // Walking pace: fixes closer together than this are jitter the
        // contract filter would drop anyway.
        manager.distanceFilter = kCLDistanceFilterNone
        // The one that would have quietly ended every long walk.
        //
        // `pausesLocationUpdatesAutomatically` defaults to TRUE. CoreLocation
        // watches for the reader standing still and pauses updates to save
        // power — and for a **When In Use** app the pause ends location access
        // until the app is launched again and restarts them. A forester
        // stopping to write a note, or standing at a corner working out where
        // the line goes, would have come back to a recorder still saying
        // "Recording", still counting, and taking nothing in. That is the
        // exact failure this whole change exists to remove, and it would have
        // been worse than the pause it replaced, because the old one said so.
        manager.pausesLocationUpdatesAutomatically = false
        // What the walk is. `.fitness` is CoreLocation's "a person moving on
        // foot", which is what a boundary walk is; it is not a claim about
        // exercise.
        manager.activityType = .fitness
    }

    var deliversInBackground: Bool {
        get { manager.allowsBackgroundLocationUpdates }
        set { manager.allowsBackgroundLocationUpdates = newValue }
    }

    func requestWhenInUseAuthorization() { manager.requestWhenInUseAuthorization() }
    func startUpdatingLocation() { manager.startUpdatingLocation() }
    func stopUpdatingLocation() { manager.stopUpdatingLocation() }

    /// One-shot, for a mark rather than a walk.
    func requestLocation() { manager.requestLocation() }
}

// `@preconcurrency`: CLLocationManagerDelegate requirements are nonisolated,
// but the manager is created on the main run loop, so callbacks arrive on the
// main thread and may satisfy the requirements from this main-actor class —
// the same pattern MapController uses.
extension CoreLocationFixSource: @preconcurrency CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            receiver?.locationSource(self, received: location)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        receiver?.locationSourceAuthorizationChanged(self)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        receiver?.locationSource(self, failedWith: error)
    }
}

/// Whether the screen is held awake, behind a seam for the same reason.
///
/// "The screen must not be held awake for a session that cannot record" is a
/// rule the review found broken, and it was untestable: the recorder wrote
/// straight to `UIApplication.shared`.
@MainActor
protocol ScreenWakeLock: AnyObject {
    var isHeldAwake: Bool { get set }
}

/// The real one: UIKit's idle timer.
@MainActor
final class ApplicationScreenWakeLock: ScreenWakeLock {
    var isHeldAwake: Bool {
        get { UIApplication.shared.isIdleTimerDisabled }
        set { UIApplication.shared.isIdleTimerDisabled = newValue }
    }
}

/// Whether the walk continues while the app is off screen, behind a seam for
/// the same reason as the two above.
///
/// The app was foreground-only by **approved decision 3**, which the owner
/// reopened on 2026-09-04. The reason it was reopened is the whole of why this
/// exists: a forester walking a stand edge for forty minutes cannot keep a lit
/// screen in hand, and every pocketing of the phone split the track into two.
/// The design flagged the battery cost of continuing and never the usability
/// cost of stopping.
///
/// `CLBackgroundActivitySession` rather than `allowsBackgroundLocationUpdates`,
/// which is the smaller of the two privacy postures and deliberately so: it
/// keeps fixes arriving for an app the reader granted **When In Use** only, so
/// no Always prompt is ever raised and the app asks for nothing it did not ask
/// for yesterday. What the reader gets in exchange is the blue indicator in the
/// status bar for as long as a session is held — which is the honest signal
/// that the walk is still being recorded, and the reason this is tied to the
/// recording's own state rather than to the app's lifetime.
@MainActor
protocol BackgroundActivity: AnyObject {
    var isRunning: Bool { get set }

    /// Where the session says it is not doing what it was asked to do.
    ///
    /// `CLBackgroundActivitySession` reports diagnostics — authorization
    /// denied, denied globally, restricted, insufficiently in use, a service
    /// session required — and a wrapper that reduced the whole of that to
    /// "an object exists" would merge *blocked* into *working*. The recorder
    /// would go on saying "Recording" while the phone in the pocket took in
    /// nothing at all, which is the one thing this app's evidence rules do not
    /// permit: an empty answer is not evidence of absence, and a refused
    /// session is not a running one.
    /// Called with the reason the walk will not continue off screen, and with
    /// **nil when it will** — a restriction that clears has to be able to
    /// unsay itself, or the reader is warned for the rest of the walk about
    /// something that stopped being true.
    var onUnavailable: ((String?) -> Void)? { get set }
}

/// The real one. Idempotent on both edges: a session started twice would put a
/// second indicator's worth of promise behind one walk, and invalidating one
/// that was never started is a message to a system service about nothing.
@MainActor
final class LocationBackgroundActivity: BackgroundActivity {
    private var session: CLBackgroundActivitySession?
    private var watch: Task<Void, Never>?

    var onUnavailable: ((String?) -> Void)?

    var isRunning: Bool {
        get { session != nil }
        set {
            guard newValue != (session != nil) else { return }
            if newValue {
                let session = CLBackgroundActivitySession()
                self.session = session
                watchDiagnostics(of: session)
            } else {
                watch?.cancel()
                watch = nil
                session?.invalidate()
                session = nil
            }
        }
    }

    /// Reads the session's own account of itself and reports the first reason
    /// it gives for not working. Reported rather than thrown: the recording is
    /// still running in the foreground, and what the reader needs is to be
    /// told that pocketing the phone will not keep it running.
    private func watchDiagnostics(of session: CLBackgroundActivitySession) {
        watch?.cancel()
        watch = Task { [weak self] in
            do {
                for try await diagnostic in session.diagnostics {
                    guard !Task.isCancelled else { return }
                    // Reported whether or not there is a reason: nil is the
                    // session saying the problem has gone.
                    self?.onUnavailable?(Self.reason(for: diagnostic))
                }
            } catch {
                // The sequence failing is the session ending, which the
                // invalidation has already said everything about. Nothing to
                // report that would not be a second word for the same event.
            }
        }
    }

    /// Each reason in its own words, because they are different problems with
    /// different answers — and none of them is "it is working".
    static func reason(for diagnostic: CLBackgroundActivitySession.Diagnostic) -> String? {
        if diagnostic.authorizationDenied || diagnostic.authorizationDeniedGlobally {
            return "Recording will stop when this app is off screen: location "
                + "permission was not granted."
        }
        if diagnostic.authorizationRestricted {
            return "Recording will stop when this app is off screen: location "
                + "is restricted on this device."
        }
        if diagnostic.insufficientlyInUse {
            return "Recording may stop when this app is off screen. Keep it "
                + "open, or open it again to carry on."
        }
        if diagnostic.serviceSessionRequired {
            return "Recording will stop when this app is off screen: this "
                + "device needs the app open to keep receiving your location."
        }
        return nil
    }
}
