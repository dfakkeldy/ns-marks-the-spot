import CoreLocation
import Foundation
import GeoCore
import Observation

/// One-tap "mark my location": takes the recorder's current fix when it is
/// fresh and tight enough (the contract's 10 s / 50 m rule), otherwise asks
/// CoreLocation for one fix and marks that.
///
/// Its own small object rather than part of the recorder because marking
/// works whether or not a recording is running — the recorder's manager only
/// produces fixes while recording, and a mark must not have to start one.
@MainActor
@Observable
final class MarkLocation: NSObject {
    enum Outcome: Equatable {
        case marked(layerName: String, accuracyM: Double)
        case denied
        case unavailable

        var message: String {
            switch self {
            case .marked(let layerName, let accuracyM):
                return "Marked in \(layerName) (±\(Int(accuracyM.rounded())) m)"
            case .denied:
                return "Location permission was not granted. You can keep using the map."
            case .unavailable:
                return "Your location couldn't be found. Try again outdoors."
            }
        }
    }

    /// What the last mark attempt came to, for the toast.
    private(set) var outcome: Outcome?
    private(set) var isAcquiring = false

    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var deliver: ((TrackFix?) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// A usable fix: the supplied one if fresh, else one requested now.
    /// Nil when permission is refused or no fix arrives.
    func acquireFix(preferring current: TrackFix?, now: Date = Date()) async -> TrackFix? {
        if let current, MarkFeature.isUsable(current, now: now) {
            return current
        }
        switch manager.authorizationStatus {
        case .denied, .restricted:
            outcome = .denied
            return nil
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        default:
            break
        }
        isAcquiring = true
        defer { isAcquiring = false }
        return await withCheckedContinuation { continuation in
            // A second tap while one request is out answers the first with
            // nothing rather than leaking its continuation.
            deliver?(nil)
            deliver = { fix in continuation.resume(returning: fix) }
            manager.requestLocation()
        }
    }

    func report(_ outcome: Outcome) {
        self.outcome = outcome
    }

    func clearOutcome() {
        outcome = nil
    }
}

extension MarkLocation: @preconcurrency CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let fix = TrackFix(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitudeM: location.verticalAccuracy >= 0 ? location.altitude : nil,
            accuracyM: location.horizontalAccuracy,
            timestamp: location.timestamp
        )
        deliver?(fix)
        deliver = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        deliver?(nil)
        deliver = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // A refusal answered mid-request ends it; a grant lets the pending
        // requestLocation proceed on its own.
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            deliver?(nil)
            deliver = nil
        }
    }
}
