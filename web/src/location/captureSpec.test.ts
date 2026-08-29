import { describe, expect, it } from "vitest";
import { FIELD_CAPTURE_SPEC, serializeFieldCaptureSpec } from "./captureSpec";

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
});
