import { describe, expect, it } from "vitest";
import {
  FIELD_CAPTURE_SPEC,
  NSMTS_TRACED_PARCEL,
  serializeFieldCaptureSpec,
} from "./captureSpec";
import {
  FULL_JPEG_QUALITY,
  FULL_LONG_EDGE_PX,
  THUMB_JPEG_QUALITY,
  THUMB_LONG_EDGE_PX,
} from "../userMaps/vector/photos/photoPipeline";
import {
  MAX_PHOTOS_PER_FEATURE,
  MAX_PHOTOS_PER_LAYER,
  MAX_PHOTO_FILE_BYTES,
} from "../userMaps/vector/photos/types";

/**
 * Same arrangement as layerParity.test.ts: the fixture lives under the Swift
 * package's test resources so the two surfaces' capture constants can be
 * compared in CI, and it must never ship inside the app bundle.
 */
const FIXTURE_PATH =
  "../../../NSMarksCore/Tests/ParityFixtures/Fixtures/field-capture-parity.json";

describe("field-capture parity fixture", () => {
  it("matches the checked-in fixture the Swift constants are tested against", async () => {
    // Regenerate with `npx vitest run captureSpec -u` after a spec change.
    // A failure here means one surface's constants moved and the other has
    // not caught up — the drift this fixture exists to catch.
    await expect(serializeFieldCaptureSpec()).toMatchFileSnapshot(FIXTURE_PATH);
  });

  it("offers the default simplify tolerance among the presets", () => {
    expect(FIELD_CAPTURE_SPEC.simplify.presetsM).toContain(
      FIELD_CAPTURE_SPEC.simplify.defaultToleranceM,
    );
  });

  it("reserves every namespaced key under the reserved prefix", () => {
    for (const key of FIELD_CAPTURE_SPEC.reservedPropertyKeys) {
      expect(key.startsWith(FIELD_CAPTURE_SPEC.reservedPrefix)).toBe(true);
    }
  });

  it("is the one place the traced value and the photo constants are written", () => {
    // The numbers themselves are checked by the fixture snapshot above and,
    // through it, by the Swift side. What can still rot is the wiring: a
    // module that goes back to hardcoding its own 20 or its own 0.8 would
    // drift silently, because the fixture would never hear about it.
    // Restating the values here would defeat the same purpose, so these
    // compare the exports against the spec rather than against literals.
    expect(NSMTS_TRACED_PARCEL).toBe(FIELD_CAPTURE_SPEC.snap.tracedValue);
    expect(MAX_PHOTOS_PER_FEATURE).toBe(FIELD_CAPTURE_SPEC.photos.maxPerFeature);
    expect(MAX_PHOTOS_PER_LAYER).toBe(FIELD_CAPTURE_SPEC.photos.maxPerLayer);
    expect(MAX_PHOTO_FILE_BYTES).toBe(FIELD_CAPTURE_SPEC.photos.maxFileBytes);
    expect(FULL_LONG_EDGE_PX).toBe(FIELD_CAPTURE_SPEC.photos.fullLongEdgePx);
    expect(FULL_JPEG_QUALITY).toBe(FIELD_CAPTURE_SPEC.photos.fullJpegQuality);
    expect(THUMB_LONG_EDGE_PX).toBe(FIELD_CAPTURE_SPEC.photos.thumbLongEdgePx);
    expect(THUMB_JPEG_QUALITY).toBe(FIELD_CAPTURE_SPEC.photos.thumbJpegQuality);
  });
});
