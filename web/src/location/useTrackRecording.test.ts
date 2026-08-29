import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTrackRecording } from "./useTrackRecording";
import type { StopResult } from "./trackRecorder";
import type { LiveFix } from "./liveLocation";

const LAT_METRE = 1 / 111_320;

function fix(latMetres: number, timestampMs: number): LiveFix {
  return {
    latitude: 46 + latMetres * LAT_METRE,
    longitude: -61,
    accuracyM: 5,
    altitudeM: null,
    headingDeg: null,
    speedMps: null,
    timestampMs,
  };
}

describe("useTrackRecording", () => {
  it("never consumes the stale fix already in state when recording starts or resumes", () => {
    // Regression: the fix sitting in state at start/resume arrived before
    // that moment. Feeding it in put a paused-era position into the new
    // segment, and its old timestamp made the next real fix look like a
    // teleport — found live, in the browser, on the first field simulation.
    const stale = fix(0, 0);
    const { result, rerender } = renderHook(
      ({ current }: { current: LiveFix | null }) => useTrackRecording(current),
      { initialProps: { current: stale as LiveFix | null } },
    );

    act(() => result.current.start());
    // Same object still in state after the start re-render: not consumed.
    rerender({ current: stale });

    const walk1 = fix(10, 1_000);
    const walk2 = fix(20, 2_000);
    rerender({ current: walk1 });
    rerender({ current: walk2 });

    act(() => result.current.pause());
    const pausedEra = fix(500, 10_000);
    rerender({ current: pausedEra });
    act(() => result.current.resume());
    // The paused-era fix is still in state after resume: not consumed.
    rerender({ current: pausedEra });

    const walk3 = fix(30, 20_000);
    rerender({ current: walk3 });

    let stopped: StopResult | null = null;
    act(() => {
      stopped = result.current.stop();
    });
    const stopResult = stopped as unknown as StopResult;
    expect(stopResult.rawFixCount).toBe(3);
    expect(stopResult.rawSegments[0].map(({ timestampMs }) => timestampMs)).toEqual([
      1_000, 2_000,
    ]);
    expect(stopResult.rawSegments[1].map(({ timestampMs }) => timestampMs)).toEqual([
      20_000,
    ]);
  });

  it("resets to a fresh recorder after stop so a new session starts clean", () => {
    const { result, rerender } = renderHook(
      ({ current }: { current: LiveFix | null }) => useTrackRecording(current),
      { initialProps: { current: null as LiveFix | null } },
    );
    act(() => result.current.start());
    rerender({ current: fix(10, 1_000) });
    act(() => {
      result.current.stop();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.stats.keptVertexCount).toBe(0);
    expect(result.current.liveSegments).toEqual([]);
  });
});
