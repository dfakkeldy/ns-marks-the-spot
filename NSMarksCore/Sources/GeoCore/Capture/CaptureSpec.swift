import Foundation

/// The field-capture contract constants shared with the web surface.
///
/// Every value here is pinned in
/// `NSMarksCore/Tests/ParityFixtures/Fixtures/field-capture-parity.json` —
/// the web regenerates that fixture from its `captureSpec.ts` and the Swift
/// `FieldCaptureParityTests` asserts these constants against it, so a change
/// on one surface fails the other surface's tests until it catches up (the
/// layer-catalog drift trap, applied to capture). Modules must import these
/// constants rather than restating the numbers.
/// `docs/field-capture-design.md` carries the rationale for each value.
public enum CaptureSpec {
    /// App-owned feature-property namespace; the attribute editor refuses it.
    public static let reservedPrefix = "nsmts:"

    public static let reservedPropertyKeys: [String] = [
        capturedAtKey,
        accuracyKey,
        altitudeKey,
        recordingKey,
        photosKey,
        tracedKey,
        createdAtKey,
        convertedFromPointsKey,
    ]

    public static let capturedAtKey = "nsmts:capturedAt"
    public static let accuracyKey = "nsmts:accuracyM"
    public static let altitudeKey = "nsmts:altitudeM"
    public static let recordingKey = "nsmts:recording"
    public static let photosKey = "nsmts:photos"
    public static let tracedKey = "nsmts:traced"
    public static let createdAtKey = "nsmts:createdAt"
    public static let convertedFromPointsKey = "nsmts:convertedFromPoints"

    /// The only value `nsmts:traced` takes: some vertex was placed by a
    /// parcel snap, and the not-a-survey caveat travels with the feature.
    public static let tracedParcelValue = "nsprd-parcel"

    /// Mark-my-location falls back here when no edit session is open.
    public static let fieldNotesLayerName = "Field notes"
    public static let recordedProvenance = "Recorded on this device"

    public enum Mark {
        /// A watch fix older than this is stale; Mark re-requests instead.
        public static let maxFixAgeMs: Double = 10_000
        /// A fix rougher than this is not worth saving silently; re-request.
        public static let maxAccuracyM: Double = 50
    }

    public enum TrackFilter {
        /// Reject fixes with reported accuracy worse than this (or ≤ 0).
        public static let accuracyGateM: Double = 25
        /// Reject fixes implying speed over this from the last accepted fix.
        public static let maxSpeedMps: Double = 30
        /// Exponential smoothing on accepted fixes, per axis.
        public static let smoothingAlpha: Double = 0.6
        /// Keep a fix only if it moved at least
        /// `max(minSpacingFloorM, spacingAccuracyFactor × accuracy)` metres.
        public static let minSpacingFloorM: Double = 2
        public static let spacingAccuracyFactor: Double = 0.5
    }

    public enum Simplify {
        /// Douglas-Peucker default; below the GPS noise floor.
        public static let defaultToleranceM: Double = 1
        /// User-selectable in the save dialog; 0 = off.
        public static let presetsM: [Double] = [0, 0.5, 1, 2, 5]
    }

    public enum Snap {
        /// Parcel snapping arms at this zoom or closer.
        public static let minZoom = 16
        /// Pixels on web, points on iOS.
        public static let toleranceScreenUnits: Double = 15
        /// A vertex candidate within tolerance beats any edge candidate.
        public static let vertexPriority = "vertex-first"
        /// More parcels in view than this and snapping reports "too many
        /// parcels here, zoom in" and mounts nothing. Fail closed, never a
        /// silent subset.
        public static let maxParcels = 600
        /// Exact string, pinned; rendered wherever the parcel toggle is
        /// visible and in the provenance of `nsmts:traced` features.
        public static let parcelCaveat = "Traced boundaries are not a survey."
    }

    public enum Kmz {
        public static let docEntry = "doc.kml"
        public static let photoDir = "files/"
        public static let descriptionImgWidth = 400
    }
}

/// Timestamps written into features and GPX, in the format the web's
/// `Date.toISOString()` produces (UTC, millisecond precision, `Z` suffix),
/// so a recording made on either surface round-trips identically.
public enum CaptureTime {
    public static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
