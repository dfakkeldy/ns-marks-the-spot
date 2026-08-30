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

export const FIELD_NOTES_LAYER_NAME = FIELD_CAPTURE_SPEC.fieldNotesLayerName;
export const RECORDED_PROVENANCE = FIELD_CAPTURE_SPEC.recordedProvenance;
export const MARK_MAX_FIX_AGE_MS = FIELD_CAPTURE_SPEC.mark.maxFixAgeMs;
export const MARK_MAX_ACCURACY_M = FIELD_CAPTURE_SPEC.mark.maxAccuracyM;

export function serializeFieldCaptureSpec(): string {
  return `${JSON.stringify(FIELD_CAPTURE_SPEC, null, 2)}\n`;
}
