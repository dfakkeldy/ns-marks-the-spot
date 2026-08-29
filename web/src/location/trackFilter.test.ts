import { describe, expect, it } from "vitest";
import { applyFix, createTrackFilterState } from "./trackFilter";
import type { LiveFix } from "./liveLocation";

// ~1 m of latitude in degrees, for readable walking-scale test data.
const LAT_METRE = 1 / 111_320;

function fix(overrides: Partial<LiveFix>): LiveFix {
  return {
    latitude: 46,
    longitude: -61,
    accuracyM: 5,
    altitudeM: null,
    headingDeg: null,
    speedMps: null,
    timestampMs: 0,
    ...overrides,
  };
}

describe("applyFix", () => {
  it("rejects fixes past the 25 m accuracy gate and non-positive accuracies", () => {
    const state = createTrackFilterState();
    expect(applyFix(state, fix({ accuracyM: 25.5 })).accepted).toBeNull();
    expect(applyFix(state, fix({ accuracyM: 0 })).accepted).toBeNull();
    expect(applyFix(state, fix({ accuracyM: -1 })).accepted).toBeNull();
    expect(applyFix(state, fix({ accuracyM: 25 })).accepted).not.toBeNull();
  });

  it("rejects teleports over 30 m/s and out-of-order timestamps", () => {
    let state = createTrackFilterState();
    const first = applyFix(state, fix({ timestampMs: 0 }));
    state = first.next;

    // 40 m in 1 s = 40 m/s: a multipath jump, not a truck.
    const teleport = applyFix(
      state,
      fix({ latitude: 46 + 40 * LAT_METRE, timestampMs: 1_000 }),
    );
    expect(teleport.accepted).toBeNull();

    const backwards = applyFix(state, fix({ timestampMs: -1_000 }));
    expect(backwards.accepted).toBeNull();

    // 25 m in 1 s = 25 m/s passes: trucks on woods roads are not teleports.
    const fast = applyFix(
      state,
      fix({ latitude: 46 + 25 * LAT_METRE, timestampMs: 1_000 }),
    );
    expect(fast.accepted).not.toBeNull();
  });

  it("smooths accepted fixes with alpha 0.6 toward the new position", () => {
    let state = createTrackFilterState();
    state = applyFix(state, fix({ latitude: 46, timestampMs: 0 })).next;
    const moved = applyFix(
      state,
      fix({ latitude: 46 + 10 * LAT_METRE, timestampMs: 1_000 }),
    );
    // smoothed = prev + 0.6 × (new − prev) → 6 m of the 10 m step.
    expect(moved.accepted?.lat).toBeCloseTo(46 + 6 * LAT_METRE, 9);
  });

  it("suppresses vertices inside max(2 m, 0.5 × accuracy) of the last kept", () => {
    let state = createTrackFilterState();
    const first = applyFix(state, fix({ timestampMs: 0, accuracyM: 20 }));
    expect(first.kept).toBe(true);
    state = first.next;

    // 9 m of movement, threshold max(2, 0.5×20) = 10 m: accepted, not kept.
    // (EMA pulls the smoothed step to 5.4 m, further inside the threshold.)
    const jitter = applyFix(
      state,
      fix({ latitude: 46 + 9 * LAT_METRE, timestampMs: 1_000, accuracyM: 20 }),
    );
    expect(jitter.accepted).not.toBeNull();
    expect(jitter.kept).toBe(false);
    expect(jitter.next.lastAccepted).not.toBeNull();
    state = jitter.next;

    // Keep walking: cumulative smoothed movement clears the threshold.
    const walked = applyFix(
      state,
      fix({ latitude: 46 + 30 * LAT_METRE, timestampMs: 2_000, accuracyM: 20 }),
    );
    expect(walked.kept).toBe(true);
  });

  it("keeps small movements when the accuracy is tight (2 m floor)", () => {
    let state = createTrackFilterState();
    state = applyFix(state, fix({ timestampMs: 0, accuracyM: 3 })).next;
    // 4 m step with 3 m accuracy: threshold is max(2, 1.5) = 2 m; the
    // smoothed 2.4 m step clears it.
    const step = applyFix(
      state,
      fix({ latitude: 46 + 4 * LAT_METRE, timestampMs: 1_000, accuracyM: 3 }),
    );
    expect(step.kept).toBe(true);
  });
});
