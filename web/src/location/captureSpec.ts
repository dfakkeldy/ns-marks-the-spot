/**
 * The field-capture contract constants shared with the native app. Every
 * value here is pinned in NSMarksCore/Tests/ParityFixtures/Fixtures/
 * field-capture-parity.json (captureSpec.test.ts regenerates it, the Swift
 * FieldCaptureParityTests asserts against it), so a change on one surface
 * fails the other surface's tests until it catches up — the same drift trap
 * the layer catalog uses. Modules must import these constants rather than
 * restating the numbers. docs/field-capture-design.md is the rationale.
 */
export const FIELD_CAPTURE_SPEC = {
  schema: 1,
  /** App-owned feature-property namespace; the attribute editor refuses it. */
  reservedPrefix: "nsmts:",
  reservedPropertyKeys: [
    "nsmts:capturedAt",
    "nsmts:accuracyM",
    "nsmts:altitudeM",
    "nsmts:recording",
    "nsmts:photos",
    "nsmts:traced",
    "nsmts:createdAt",
    "nsmts:convertedFromPoints",
  ],
  /** Mark-my-location falls back here when no edit session is open. */
  fieldNotesLayerName: "Field notes",
  recordedProvenance: "Recorded on this device",
  mark: {
    /** A watch fix older than this is stale; Mark re-requests instead. */
    maxFixAgeMs: 10_000,
    /** A fix rougher than this is not worth saving silently; re-request. */
    maxAccuracyM: 50,
  },
  trackFilter: {
    accuracyGateM: 25,
    maxSpeedMps: 30,
    smoothingAlpha: 0.6,
    minSpacingFloorM: 2,
    spacingAccuracyFactor: 0.5,
  },
  simplify: {
    defaultToleranceM: 1,
    presetsM: [0, 0.5, 1, 2, 5],
  },
  snap: {
    minZoom: 16,
    toleranceScreenUnits: 15,
    vertexPriority: "vertex-first",
    maxParcels: 600,
    parcelCaveat: "Traced boundaries are not a survey.",
    /**
     * The only value `nsmts:traced` takes: some vertex was placed by a
     * parcel snap, and the not-a-survey caveat travels with the feature.
     * The snap-target layer carries the same string as its
     * `nsmtsSnapSource` option, so writer and reader cannot drift apart.
     */
    tracedValue: "nsprd-parcel",
  },
  photos: {
    /** Contract caps; refusal messages name them. */
    maxPerFeature: 20,
    maxPerLayer: 500,
    maxFileBytes: 50 * 1024 * 1024,
    /**
     * Every ingested photo is re-encoded to this, which is also the privacy
     * mechanism: the re-encode leaves the EXIF behind, GPS included.
     */
    fullLongEdgePx: 2_048,
    fullJpegQuality: 0.8,
    thumbLongEdgePx: 256,
    thumbJpegQuality: 0.7,
  },
  kmz: {
    /** The KML document entry, DEFLATE-compressed. */
    docEntry: "doc.kml",
    /** Photo entries: `files/<photoId>.jpg`, STORED (already compressed). */
    photoDir: "files/",
    /** Width attribute on the description's viewer-facing img appendix. */
    descriptionImgWidth: 400,
  },
} as const;

export const NSMTS_CAPTURED_AT = "nsmts:capturedAt";
export const NSMTS_ACCURACY_M = "nsmts:accuracyM";
export const NSMTS_ALTITUDE_M = "nsmts:altitudeM";
export const NSMTS_TRACED = "nsmts:traced";
export const NSMTS_TRACED_PARCEL = FIELD_CAPTURE_SPEC.snap.tracedValue;

export const FIELD_NOTES_LAYER_NAME = FIELD_CAPTURE_SPEC.fieldNotesLayerName;
export const RECORDED_PROVENANCE = FIELD_CAPTURE_SPEC.recordedProvenance;
export const MARK_MAX_FIX_AGE_MS = FIELD_CAPTURE_SPEC.mark.maxFixAgeMs;
export const MARK_MAX_ACCURACY_M = FIELD_CAPTURE_SPEC.mark.maxAccuracyM;

export function serializeFieldCaptureSpec(): string {
  return `${JSON.stringify(FIELD_CAPTURE_SPEC, null, 2)}\n`;
}
