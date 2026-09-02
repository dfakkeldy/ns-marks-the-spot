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
        /// A fix was had and the layer refused it. Carries the store's own
        /// words: a full disk or an unreadable layer is not a GPS problem,
        /// and telling the reader to try again outdoors sends them to fix
        /// the wrong thing.
        case storageFailed(String)

        var message: String {
            switch self {
            case .marked(let layerName, let accuracyM):
                return "Marked in \(layerName) (±\(Int(accuracyM.rounded())) m)"
            case .denied:
                return "Location permission was not granted. You can keep using the map."
            case .unavailable:
                return "Your location couldn't be found. Try again outdoors."
            case .storageFailed(let reason):
                return reason
            }
        }
    }

    /// What the mark says when the layer refused the fix and the store gave
    /// no reason of its own.
    static let storageFallbackMessage =
        "The mark couldn't be saved to your layer. Free some space and try again."

    /// The message shown while a fix is being requested. Ten silent seconds
    /// after a tap read as a button that did nothing.
    static let acquiringMessage = "Finding your position…"

    /// What the last mark attempt came to, for the toast.
    private(set) var outcome: Outcome?
    private(set) var isAcquiring = false

    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var deliver: ((TrackFix?) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        // Ten metres rather than Best: a one-shot request waits for its
        // accuracy before answering, and Best under tree cover or on a cold
        // start is the ten-second wait the user reported. Ten metres is the
        // recorder's "good" band, arrives quickly outdoors, and the saved
        // ±N m label stays honest whatever comes back.
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// The first candidate that passes the contract's freshness and accuracy
    /// rule, in the order offered. Callers pass the recorder's fix first and
    /// the fix behind the map's own user dot second, so a position already on
    /// screen is used before CoreLocation is asked for another.
    nonisolated static func usableFix(among candidates: [TrackFix?], now: Date) -> TrackFix? {
        for case let fix? in candidates where MarkFeature.isUsable(fix, now: now) {
            return fix
        }
        return nil
    }

    /// A usable fix: the first usable candidate, else one requested now.
    /// Nil when permission is refused or no fix arrives.
    func acquireFix(preferring candidates: [TrackFix?], now: Date = Date()) async -> TrackFix? {
        if let fix = Self.usableFix(among: candidates, now: now) {
            return fix
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
        // A rough-but-valid fix is kept: its ± label is honest. An invalid
        // one (see `TrackFix.init(location:)`) answers with nothing.
        deliver?(TrackFix(location: location))
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

extension TrackFix {
    /// The fix a `CLLocation` reports, or nil when it is not one.
    ///
    /// A non-positive horizontal accuracy is CoreLocation's "invalid", not
    /// "perfect": saving it would mark a point the device never actually had
    /// and caption it "±-1 m". A negative vertical accuracy means the altitude
    /// is invalid, and it is never zero-filled.
    init?(location: CLLocation) {
        guard location.horizontalAccuracy > 0 else { return nil }
        self.init(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitudeM: location.verticalAccuracy >= 0 ? location.altitude : nil,
            accuracyM: location.horizontalAccuracy,
            timestamp: location.timestamp
        )
    }
}
