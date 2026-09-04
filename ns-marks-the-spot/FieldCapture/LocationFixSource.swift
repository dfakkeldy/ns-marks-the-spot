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
