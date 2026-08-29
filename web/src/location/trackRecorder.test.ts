import { describe, expect, it } from "vitest";
import { createTrackRecorder } from "./trackRecorder";
import type { LiveFix } from "./liveLocation";

const LAT_METRE = 1 / 111_320;

function fix(latMetres: number, timestampMs: number, accuracyM = 5): LiveFix {
  return {
    latitude: 46 + latMetres * LAT_METRE,
    longitude: -61,
    accuracyM,
    altitudeM: null,
    headingDeg: null,
    speedMps: null,
    timestampMs,
    ...{},
  };
}

function clock(startMs: number) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advanceTo: (ms: number) => {
      nowMs = ms;
    },
  };
}

describe("createTrackRecorder", () => {
  it("collects vertices, counts raw and accepted fixes, and sums distance", () => {
    const time = clock(0);
    const recorder = createTrackRecorder(time.now);
    recorder.start();
    recorder.addFix(fix(0, 0));
    recorder.addFix(fix(10, 1_000));
    recorder.addFix(fix(20, 2_000));
    recorder.addFix(fix(20, 3_000, 40)); // gated: accuracy over 25 m

    time.advanceTo(3_500);
    const stats = recorder.stats();
    expect(stats.status).toBe("recording");
    expect(stats.keptVertexCount).toBe(3);
    expect(stats.elapsedMs).toBe(3_500);
    // Smoothed steps: 6 m then 8.4 m of the two 10 m moves.
    expect(stats.distanceM).toBeCloseTo(14.4, 1);

    const result = recorder.stop();
    expect(result?.rawFixCount).toBe(4);
    expect(result?.acceptedFixCount).toBe(3);
    expect(result?.segments).toHaveLength(1);
  });

  it("closes a segment on pause and opens a fresh one on resume", () => {
    const time = clock(0);
    const recorder = createTrackRecorder(time.now);
    recorder.start();
    recorder.addFix(fix(0, 0));
    recorder.addFix(fix(10, 1_000));

    time.advanceTo(2_000);
    recorder.pause();
    time.advanceTo(60_000); // a minute of standing around, not recorded
    recorder.resume();
    recorder.addFix(fix(100, 61_000));
    recorder.addFix(fix(110, 62_000));

    time.advanceTo(63_000);
    const result = recorder.stop();
    expect(result?.segments).toHaveLength(2);
    expect(result?.rawSegments).toHaveLength(2);
    // Paused time stays out of the recording clock.
    expect(result?.recordingMs).toBe(2_000 + 3_000);
    // Fresh filter state per segment: the second segment's first vertex is
    // the raw resume position, not smoothed toward the pre-pause track.
    expect(result?.segments[1][0].lat).toBeCloseTo(46 + 100 * LAT_METRE, 9);
  });

  it("appends the last accepted fix when a segment closes (final-fix rule)", () => {
    const recorder = createTrackRecorder(() => 0);
    recorder.start();
    recorder.addFix(fix(0, 0, 20));
    // 9 m: accepted but spacing-suppressed under max(2, 0.5×20) = 10 m.
    recorder.addFix(fix(9, 1_000, 20));

    const result = recorder.stop();
    expect(result?.segments[0]).toHaveLength(2);
    expect(result?.segments[0][1].timestampMs).toBe(1_000);
  });

  it("ignores fixes while paused or idle and reports them in no count", () => {
    const recorder = createTrackRecorder(() => 0);
    expect(recorder.addFix(fix(0, 0))).toBe(false);
    recorder.start();
    recorder.pause();
    expect(recorder.addFix(fix(0, 0))).toBe(false);
    const result = recorder.stop();
    expect(result?.rawFixCount).toBe(0);
  });

  it("returns null from stop when never started", () => {
    expect(createTrackRecorder(() => 0).stop()).toBeNull();
  });
});
