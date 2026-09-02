import { describe, expect, it } from "vitest";
import {
  formatAccuracyM,
  isUsableMarkFix,
  markFailureMessage,
  oneShotMarkFix,
} from "./markFix";
import { MARK_MAX_ACCURACY_M, MARK_MAX_FIX_AGE_MS } from "./captureSpec";
import type { BrowserLocation } from "../services/browserLocation";
import type { LiveFix } from "./liveLocation";

const NOW = 1_700_000_000_000;

function position(overrides: Partial<BrowserLocation> = {}): BrowserLocation {
  return {
    latitude: 45.8,
    longitude: -61.47,
    accuracy: 12,
    altitude: null,
    timestampMs: NOW - 2_000,
    ...overrides,
  };
}

describe("a one-shot fix for a mark", () => {
  it("keeps the position's own moment, not the clock's", () => {
    const outcome = oneShotMarkFix(position({ timestampMs: NOW - 5_000 }), NOW);
    expect(outcome).toEqual({
      kind: "fix",
      fix: {
        latitude: 45.8,
        longitude: -61.47,
        accuracyM: 12,
        altitudeM: null,
        headingDeg: null,
        speedMps: null,
        timestampMs: NOW - 5_000,
      },
    });
  });

  it("carries an altitude the device reported", () => {
    const outcome = oneShotMarkFix(position({ altitude: 31.5 }), NOW);
    expect(outcome.kind === "fix" && outcome.fix.altitudeM).toBe(31.5);
  });

  it("refuses a fix rougher than a mark may be, and says how rough", () => {
    const outcome = oneShotMarkFix(position({ accuracy: 500 }), NOW);
    expect(outcome).toEqual({
      kind: "refused",
      message:
        `Your location was found only to within 500 m, and a mark is saved only ` +
        `within ${MARK_MAX_ACCURACY_M} m. Try again outdoors.`,
    });
  });

  it("refuses the cached fix the freshness gate had already refused", () => {
    const outcome = oneShotMarkFix(
      position({ timestampMs: NOW - MARK_MAX_FIX_AGE_MS - 1 }),
      NOW,
    );
    expect(outcome).toEqual({
      kind: "refused",
      message: "The only location available was too old to save. Try again outdoors.",
    });
    // And the bound itself is inside the rule, not outside it.
    expect(
      oneShotMarkFix(position({ timestampMs: NOW - MARK_MAX_FIX_AGE_MS }), NOW).kind,
    ).toBe("fix");
  });

  it("says a fix dated ahead of the clock is a clock problem, not an old fix", () => {
    const outcome = oneShotMarkFix(position({ timestampMs: NOW + 3_600_000 }), NOW);
    expect(outcome.kind).toBe("refused");
    expect(outcome.kind === "refused" && outcome.message).toContain(
      "ahead of this device's clock",
    );
  });

  it("keeps a zero radius, which the Geolocation API allows", () => {
    // Not CoreLocation's "invalid": the web's accuracy is a non-negative
    // radius, an emulator can report zero, and the live watch path takes it.
    expect(oneShotMarkFix(position({ accuracy: 0 }), NOW).kind).toBe("fix");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "treats accuracy %s as no position at all",
    (accuracy) => {
      const outcome = oneShotMarkFix(position({ accuracy }), NOW);
      expect(outcome).toEqual({
        kind: "refused",
        message: "Your location couldn't be found. Try again outdoors.",
      });
    },
  );
});

describe("what a browser failure is told as", () => {
  it("keeps a refusal, a timeout, an outage and a missing API apart", () => {
    const messages = [
      markFailureMessage("denied"),
      markFailureMessage("timeout"),
      markFailureMessage("unavailable"),
      markFailureMessage("unsupported"),
    ];
    expect(new Set(messages).size).toBe(4);
    expect(messages[0]).toContain("permission was not granted");
    expect(messages[1]).toContain("in time");
    expect(messages[2]).toContain("couldn't be found");
    expect(messages[3]).toContain("not available in this browser");
    // Only the refusal is about permission: a timeout must not send
    // somebody into their browser settings to fix a signal problem.
    expect(messages[1]).not.toContain("permission");
    expect(messages[2]).not.toContain("permission");
  });
});

describe("the rule both fix paths are held to", () => {
  function live(overrides: Partial<LiveFix> = {}): LiveFix {
    return {
      latitude: 45.8,
      longitude: -61.47,
      accuracyM: 12,
      altitudeM: null,
      headingDeg: null,
      speedMps: null,
      timestampMs: NOW - 2_000,
      ...overrides,
    };
  }

  it("takes a fresh, tight fix on the globe", () => {
    expect(isUsableMarkFix(live(), NOW)).toBe(true);
    expect(isUsableMarkFix(live({ accuracyM: MARK_MAX_ACCURACY_M }), NOW)).toBe(true);
    expect(
      isUsableMarkFix(live({ timestampMs: NOW - MARK_MAX_FIX_AGE_MS }), NOW),
    ).toBe(true);
  });

  it("refuses what the one-shot would refuse", () => {
    // Future-dated: the watch path used to take this, and stamp it.
    expect(isUsableMarkFix(live({ timestampMs: NOW + 3_600_000 }), NOW)).toBe(false);
    expect(
      isUsableMarkFix(live({ timestampMs: NOW - MARK_MAX_FIX_AGE_MS - 1 }), NOW),
    ).toBe(false);
    expect(isUsableMarkFix(live({ accuracyM: MARK_MAX_ACCURACY_M + 1 }), NOW)).toBe(false);
    expect(isUsableMarkFix(live({ accuracyM: -1 }), NOW)).toBe(false);
    expect(isUsableMarkFix(live({ accuracyM: Number.NaN }), NOW)).toBe(false);
    expect(isUsableMarkFix(live({ latitude: 91 }), NOW)).toBe(false);
    expect(isUsableMarkFix(live({ longitude: Number.POSITIVE_INFINITY }), NOW)).toBe(false);
  });
});

describe("an accuracy label", () => {
  it("never reads tighter than the device reported", () => {
    expect(formatAccuracyM(0.4)).toBe("0.4");
    expect(formatAccuracyM(0.04)).toBe("0.1");
    expect(formatAccuracyM(7.41)).toBe("7.5");
    expect(formatAccuracyM(49.4)).toBe("50");
    expect(formatAccuracyM(12)).toBe("12");
    expect(formatAccuracyM(-1)).toBe("?");
  });
});
