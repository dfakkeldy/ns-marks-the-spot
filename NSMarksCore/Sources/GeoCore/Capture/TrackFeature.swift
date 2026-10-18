import Foundation

/// Builds the saved track feature from a recording, per the field-capture
/// contract: geometry is the filtered, smoothed, simplified line (one
/// LineString, or a MultiLineString when pause/resume produced segments);
/// per-vertex timestamps ride `coordinateProperties.times` — the togeojson
/// convention, so recorded and GPX-imported tracks are indistinguishable to
/// exporters — and `nsmts:recording` declares exactly what processing the
/// geometry received. The raw GPX original is the unprocessed evidence;
/// geometry stays 2D on purpose (altitude lives in the raw GPX).
/// Ported from `web/src/location/trackFeature.ts`.
public enum TrackFeature {
    public static func buildRecordedTrackFeature(
        _ result: TrackRecording.StopResult,
        name: String,
        simplifyToleranceM: Double,
        id: String = UUID().uuidString
    ) -> GeoJsonFeature? {
        let segments = TrackSimplify.simplifySegments(
            result.segments, toleranceM: simplifyToleranceM
        )
        // A one-vertex segment draws nothing and would corrupt a
        // MultiLineString.
        .filter { $0.count >= 2 }
        guard !segments.isEmpty else { return nil }

        func position(_ point: TrackPoint) -> GeoJsonPosition {
            GeoJsonPosition(lng: point.lng, lat: point.lat)
        }
        func time(_ point: TrackPoint) -> JSONValue {
            .string(CaptureTime.iso(point.timestamp))
        }

        let geometry: GeoJsonGeometry
        let times: JSONValue
        if segments.count == 1 {
            geometry = .lineString(segments[0].map(position))
            times = .array(segments[0].map(time))
        } else {
            geometry = .multiLineString(segments.map { $0.map(position) })
            times = .array(segments.map { .array($0.map(time)) })
        }

        let simplifiedVertexCount = segments.reduce(0) { $0 + $1.count }
        let properties: [String: JSONValue] = [
            "name": .string(name),
            CaptureSpec.recordingKey: .object([
                "startedAt": .string(CaptureTime.iso(result.startedAt)),
                "endedAt": .string(CaptureTime.iso(result.endedAt)),
                "rawFixCount": .number(Double(result.rawFixCount)),
                "acceptedFixCount": .number(Double(result.acceptedFixCount)),
                "simplifiedVertexCount": .number(Double(simplifiedVertexCount)),
                "simplifyToleranceM": .number(simplifyToleranceM),
                "smoothingAlpha": .number(CaptureSpec.TrackFilter.smoothingAlpha),
            ]),
            "coordinateProperties": .object(["times": times]),
        ]

        return GeoJsonFeature(id: id, geometry: geometry, properties: properties)
    }

    /// Default track name: "Track 2026-08-29 14:05" in the device's local
    /// time, matching the web's default.
    public static func defaultTrackName(startedAt: Date, calendar: Calendar = .current)
        -> String
    {
        let parts = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute], from: startedAt
        )
        func pad(_ value: Int?) -> String {
            String(format: "%02d", value ?? 0)
        }
        return "Track \(parts.year ?? 0)-\(pad(parts.month))-\(pad(parts.day))"
            + " \(pad(parts.hour)):\(pad(parts.minute))"
    }
}
