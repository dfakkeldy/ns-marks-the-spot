import Foundation

/// A GPS mark is an ordinary user-layer Point whose provenance rides in the
/// reserved `nsmts:` properties — capture time and reported accuracy — so the
/// callout can say "Marked from GPS on this device (±N m)" and an export
/// carries the same honesty. The id is assigned here because photo
/// descriptors and per-feature lookups key off feature ids.
/// Ported from `web/src/location/markFeature.ts`.
public enum MarkFeature {
    public static func buildGpsMarkFeature(
        _ fix: TrackFix, id: String = UUID().uuidString
    ) -> GeoJsonFeature {
        var properties: [String: JSONValue] = [
            CaptureSpec.capturedAtKey: .string(CaptureTime.iso(fix.timestamp)),
            CaptureSpec.accuracyKey: .number(fix.accuracyM),
        ]
        if let altitude = fix.altitudeM {
            properties[CaptureSpec.altitudeKey] = .number(altitude)
        }
        return GeoJsonFeature(
            id: id,
            geometry: .point(
                GeoJsonPosition(lng: fix.longitude, lat: fix.latitude, altitude: fix.altitudeM)
            ),
            properties: properties
        )
    }

    /// The contract's mark freshness rule: a watch fix is only saved silently
    /// when it is younger than `maxFixAgeMs` and at least as tight as
    /// `maxAccuracyM`; otherwise the caller re-requests a fix.
    public static func isUsable(_ fix: TrackFix, now: Date) -> Bool {
        let ageMs = now.timeIntervalSince(fix.timestamp) * 1_000
        return ageMs >= 0 && ageMs <= CaptureSpec.Mark.maxFixAgeMs
            && fix.accuracyM > 0 && fix.accuracyM <= CaptureSpec.Mark.maxAccuracyM
    }
}
