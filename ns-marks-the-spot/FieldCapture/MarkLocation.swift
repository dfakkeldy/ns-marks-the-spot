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
        /// Blocked by Screen Time or a management profile, not refused by
        /// the reader; there is no Settings page that lifts it.
        case restricted
        /// Location Services are off for the whole device, which CoreLocation
        /// also reports as denied; a different switch from this app's.
        case servicesOff
        /// A fix came back to the request and failed the contract's 10 s /
        /// 50 m rule. Not saved, and said as which half failed.
        case poorFix(accuracyM: Double, reason: PoorFixReason)
        case unavailable
        /// CoreLocation failed for a reason that is not the sky: a network
        /// error, most often. Going outdoors would not repair it.
        case failed
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
            case .restricted:
                return "Location is restricted on this device, for example by Screen Time "
                    + "or a management profile. You can keep using the map."
            case .servicesOff:
                return "Location Services are off for this device. Turn them on in Settings, "
                    + "under Privacy & Security."
            case .poorFix(let accuracyM, let reason):
                switch reason {
                case .rough:
                    return "Your location was found only to within \(Int(accuracyM.rounded(.up))) m, and a mark "
                        + "is saved only within \(Int(CaptureSpec.Mark.maxAccuracyM)) m. Try again outdoors."
                case .old:
                    return "The only location available was too old to save. Try again outdoors."
                case .futureDated:
                    return "The only location available carried a time ahead of this device's clock, so it "
                        + "was not saved. Check the date and time, then try again."
                }
            case .unavailable:
                return "Your location couldn't be found. Try again outdoors."
            case .failed:
                return "Your location couldn't be determined. Try again in a moment."
            case .storageFailed(let reason):
                return reason
            }
        }
    }

    /// The radius as a label that never understates it: rounded up to the
    /// next tenth under ten metres, so ±0.04 m is "±0.1 m" and never
    /// "±0.0 m", and to the next whole metre above.
    static func accuracyLabel(_ accuracyM: Double) -> String {
        accuracyM < 10
            ? String(format: "%.1f", (accuracyM * 10).rounded(.up) / 10)
            : String(Int(accuracyM.rounded(.up)))
    }

    /// What the mark says when the layer refused the fix and the store gave
    /// no reason of its own.
    static let storageFallbackMessage =
        "The mark couldn't be saved to your layer. Free some space and try again."

    /// The message shown while a fix is being requested. Ten silent seconds
    /// after a tap read as a button that did nothing.
    static let acquiringMessage = "Saving a point at your location…"

    /// What an authorization status refuses with, or nil when it does not.
    ///
    /// Denied and restricted are different outcomes: one the reader can
    /// change in Settings, one they cannot; and `.denied` with Location
    /// Services off for the device is a third.
    nonisolated static func refusal(
        for status: CLAuthorizationStatus, servicesEnabled: Bool = true
    ) -> Outcome? {
        switch status {
        case .denied: servicesEnabled ? .denied : .servicesOff
        case .restricted: .restricted
        default: nil
        }
    }

    /// Whether Location Services are on for the device. Injected for tests.
    @ObservationIgnored var servicesEnabled: () -> Bool = { CLLocationManager.locationServicesEnabled() }

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

    /// Which half of the rule a requested fix failed. Told apart, because
    /// the reader can do something about two of them and nothing about the
    /// third: a rough fix wants open sky, an old one another try, and one
    /// dated ahead of the clock says the clock is wrong, not the fix old.
    enum PoorFixReason: Equatable {
        case rough
        case old
        case futureDated
    }

    /// What a fix requested from CoreLocation is worth, by the same 10 s /
    /// 50 m rule as a cached one: a mark is never built from a fix the rule
    /// refused, and the refusal says which half failed. Nil for both when
    /// the location is not a position at all.
    nonisolated static func requestedFix(
        _ location: CLLocation, now: Date
    ) -> (fix: TrackFix?, outcome: Outcome?) {
        guard let fix = TrackFix(location: location) else { return (nil, nil) }
        if MarkFeature.isUsable(fix, now: now) { return (fix, nil) }
        let age = now.timeIntervalSince(fix.timestamp)
        let reason: PoorFixReason =
            if age < 0 {
                .futureDated
            } else if fix.accuracyM > CaptureSpec.Mark.maxAccuracyM {
                .rough
            } else {
                .old
            }
        return (nil, .poorFix(accuracyM: fix.accuracyM, reason: reason))
    }

    /// A usable fix: the first usable candidate, else one requested now.
    /// Nil when permission is refused or no fix arrives.
    func acquireFix(preferring candidates: [TrackFix?], now: Date = Date()) async -> TrackFix? {
        // A new attempt starts clean: a success still on screen from the
        // last one must not stand in for this one's answer.
        outcome = nil
        if let fix = Self.usableFix(among: candidates, now: now) {
            return fix
        }
        let status = manager.authorizationStatus
        if let refusal = Self.refusal(
            for: status, servicesEnabled: status == .denied ? servicesEnabled() : true
        ) {
            outcome = refusal
            return nil
        }
        switch status {
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
        // Held to the rule the cached candidates were: a requested fix that
        // is too rough or too old is not saved as a mark, and the outcome
        // says so. An invalid one (see `TrackFix.init(location:)`) answers
        // with nothing.
        let (fix, outcome) = Self.requestedFix(location, now: Date())
        if let outcome { self.outcome = outcome }
        deliver?(fix)
        deliver = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        // A refusal delivered as a failure is the refusal, not "try outdoors";
        // any other failure names itself, and only "no position" sends the
        // reader outdoors.
        if deliver != nil {
            switch (error as? CLError)?.code {
            case .denied:
                let status = manager.authorizationStatus
                outcome = Self.refusal(
                    for: status, servicesEnabled: status == .denied ? servicesEnabled() : true
                ) ?? .denied
            case .locationUnknown:
                break
            default:
                // Including an error that is not CoreLocation's at all: an
                // unknown failure is not "no position", and the sky will
                // not repair it.
                outcome = .failed
            }
        }
        deliver?(nil)
        deliver = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // A refusal answered mid-request ends it, and names itself: answered
        // with a bare nil it read as a fix that never came. A grant lets the
        // pending requestLocation proceed on its own.
        let status = manager.authorizationStatus
        if let refusal = Self.refusal(
            for: status, servicesEnabled: status == .denied ? servicesEnabled() : true
        ) {
            if deliver != nil {
                outcome = refusal
            } else if let current = outcome, Self.isRefusal(current), current != refusal {
                // The cause changed under a refusal still on screen: said as
                // what it now is.
                outcome = refusal
            }
            deliver?(nil)
            deliver = nil
        } else if let current = outcome, Self.isRefusal(current) {
            // Lifted: the reader went to Settings as the toast told them, and
            // a toast still saying so would be wrong.
            outcome = nil
        }
    }

    /// Re-reads the authorization on return to the foreground: a refusal
    /// still on the toast may name a cause the reader has since changed.
    func reconcileOutcome() {
        guard let current = outcome, Self.isRefusal(current) else { return }
        let status = manager.authorizationStatus
        let refusal = Self.refusal(
            for: status, servicesEnabled: status == .denied ? servicesEnabled() : true
        )
        if let refusal {
            if refusal != current { outcome = refusal }
        } else {
            outcome = nil
        }
    }

    static func isRefusal(_ outcome: Outcome) -> Bool {
        switch outcome {
        case .denied, .restricted, .servicesOff: true
        default: false
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
    nonisolated init?(location: CLLocation) {
        // Off the globe is not a position either, whatever its accuracy.
        guard location.horizontalAccuracy > 0, CLLocationCoordinate2DIsValid(location.coordinate)
        else { return nil }
        self.init(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitudeM: location.verticalAccuracy >= 0 ? location.altitude : nil,
            accuracyM: location.horizontalAccuracy,
            timestamp: location.timestamp
        )
    }
}
