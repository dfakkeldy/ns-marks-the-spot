import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRACK_DRAFT_INTERVAL_MS,
  type TrackDraftFailure,
  type TrackDraftStore,
} from "./trackDraftStore";
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
  it("never consumes the stale fix already in state when recording starts or resumes", async () => {
    // Regression: the fix sitting in state at start/resume arrived before
    // that moment. Feeding it in put a paused-era position into the new
    // segment, and its old timestamp made the next real fix look like a
    // teleport — found live, in the browser, on the first field simulation.
    const stale = fix(0, 0);
    // Its own device copy: nothing here is about storage, and the shared
    // store would carry state between the tests in this file.
    const double = draftStoreDouble();
    const { result, rerender } = renderHook(
      ({ current }: { current: LiveFix | null }) =>
        useTrackRecording(current, double.store),
      { initialProps: { current: stale as LiveFix | null } },
    );

    await settled();
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

  it("resets to a fresh recorder after stop so a new session starts clean", async () => {
    const double = draftStoreDouble();
    const { result, rerender } = renderHook(
      ({ current }: { current: LiveFix | null }) =>
        useTrackRecording(current, double.store),
      { initialProps: { current: null as LiveFix | null } },
    );
    await settled();
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

/** An in-memory stand-in for the device's copy of the walk. */
function draftStoreDouble(initial: StopResult | null = null) {
  let held = initial;
  let heldStopped = false;
  let failure: TrackDraftFailure | null = null;
  let unreadable = false;
  let refuseClear: TrackDraftFailure | null = null;
  const store: TrackDraftStore = {
    save: async (draft, stopped = false) => {
      if (failure) return failure;
      held = draft;
      heldStopped = stopped;
      return null;
    },
    read: async () =>
      unreadable
        ? { status: "unreadable" }
        : held
          ? { status: "ready", result: held, stopped: heldStopped }
          : { status: "empty" },
    clear: async () => {
      if (refuseClear) return refuseClear;
      held = null;
      return null;
    },
  };
  return {
    store,
    held: () => held,
    heldStopped: () => heldStopped,
    refuse: (next: TrackDraftFailure | null) => {
      failure = next;
    },
    refuseClear: (next: TrackDraftFailure | null) => {
      refuseClear = next;
    },
    beUnreadable: () => {
      unreadable = true;
    },
  };
}

/** The one-time device read settles on a microtask; Record waits for it. */
async function settled() {
  await act(async () => {});
}

function stopped(): StopResult {
  return {
    segments: [
      [
        { lat: 46, lng: -61, accuracyM: 5, altitudeM: null, timestampMs: 0 },
        { lat: 46.001, lng: -61, accuracyM: 5, altitudeM: null, timestampMs: 1_000 },
      ],
    ],
    rawSegments: [[fix(0, 0), fix(10, 1_000)]],
    startedAt: "2026-09-03T00:00:00.000Z",
    endedAt: "2026-09-03T00:00:01.000Z",
    rawFixCount: 2,
    acceptedFixCount: 2,
    distanceM: 111,
    recordingMs: 1_000,
  };
}

describe("keeping the walk on this device", () => {
  // Every case here injects its own store double, so nothing reaches the
  // shared one — and jsdom has no IndexedDB to clear it through.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the walk so far while it runs", async () => {
    vi.useFakeTimers();
    const double = draftStoreDouble();
    const { result, rerender } = renderHook(
      ({ current }: { current: LiveFix | null }) =>
        useTrackRecording(current, double.store),
      { initialProps: { current: null as LiveFix | null } },
    );

    await settled();
    act(() => result.current.start());
    // The fix already in state when recording starts is deliberately skipped,
    // so the walk begins with the next two.
    rerender({ current: fix(0, 0) });
    rerender({ current: fix(10, 1_000) });
    rerender({ current: fix(20, 2_000) });
    await act(async () => {
      vi.advanceTimersByTime(TRACK_DRAFT_INTERVAL_MS);
    });

    expect(double.held()?.rawSegments[0]).toHaveLength(3);
  });

  it("tells a recovered walk from a stopped one", async () => {
    const recovered = draftStoreDouble(stopped());
    const { result } = renderHook(() =>
      useTrackRecording(null, recovered.store),
    );

    await waitFor(() => expect(result.current.unsaved).not.toBeNull());
    expect(result.current.unsaved?.interrupted).toBe(true);

    // A walk the user stopped is written too, and marked as the whole walk,
    // so a reload before it is saved offers it back without the caveat that
    // belongs to a walk cut short.
    const fresh = draftStoreDouble();
    const second = renderHook(
      ({ current }: { current: LiveFix | null }) =>
        useTrackRecording(current, fresh.store),
      { initialProps: { current: null as LiveFix | null } },
    );
    await settled();
    act(() => second.result.current.start());
    second.rerender({ current: fix(0, 0) });
    second.rerender({ current: fix(10, 1_000) });
    second.rerender({ current: fix(20, 2_000) });
    act(() => second.result.current.stop());

    expect(second.result.current.unsaved?.interrupted).toBe(false);
    expect(fresh.held()).not.toBeNull();
    expect(fresh.heldStopped()).toBe(true);

    // And a third session reading that same copy off the device agrees.
    const third = renderHook(() => useTrackRecording(null, fresh.store));
    await settled();
    expect(third.result.current.unsaved?.interrupted).toBe(false);
  });

  it("reports a refused write and takes the warning back down", async () => {
    vi.useFakeTimers();
    const double = draftStoreDouble();
    double.refuse("quota");
    const { result, rerender } = renderHook(
      ({ current }: { current: LiveFix | null }) =>
        useTrackRecording(current, double.store),
      { initialProps: { current: null as LiveFix | null } },
    );

    await settled();
    act(() => result.current.start());
    rerender({ current: fix(0, 0) });
    rerender({ current: fix(10, 1_000) });
    rerender({ current: fix(20, 2_000) });
    await act(async () => {
      vi.advanceTimersByTime(TRACK_DRAFT_INTERVAL_MS);
    });
    expect(result.current.draftError).toBe("quota");

    double.refuse(null);
    rerender({ current: fix(30, 3_000) });
    await act(async () => {
      vi.advanceTimersByTime(TRACK_DRAFT_INTERVAL_MS);
    });
    expect(result.current.draftError).toBeNull();
  });

  // The device holds one recording under one key. Starting a new walk before
  // the old one has been read would write straight over it.
  it("will not start a recording until the device has answered", async () => {
    const double = draftStoreDouble(stopped());
    const { result } = renderHook(() => useTrackRecording(null, double.store));

    expect(result.current.restore).toBe("pending");
    act(() => result.current.start());
    expect(result.current.status).toBe("idle");

    await settled();
    expect(result.current.restore).toBe("settled");
    expect(result.current.unsaved?.interrupted).toBe(true);
    act(() => result.current.start());
    expect(result.current.status).toBe("recording");
  });

  it("says a device could not be read rather than treating it as empty", async () => {
    const double = draftStoreDouble();
    double.beUnreadable();
    const { result } = renderHook(() => useTrackRecording(null, double.store));

    await settled();

    expect(result.current.restore).toBe("unreadable");
    expect(result.current.unsaved).toBeNull();
  });

  // A discard the device refused is not a discard: the walk comes back on the
  // next load, so the user is told now rather than surprised then.
  it("reports a copy the device would not delete, and can be asked again", async () => {
    const double = draftStoreDouble(stopped());
    double.refuseClear("failed");
    const { result } = renderHook(() => useTrackRecording(null, double.store));
    await settled();

    act(() => result.current.clearUnsaved());
    await settled();
    expect(result.current.unsaved).toBeNull();
    expect(result.current.clearError).toBe("failed");
    expect(double.held()).not.toBeNull();

    double.refuseClear(null);
    act(() => result.current.retryClear());
    await settled();
    expect(result.current.clearError).toBeNull();
    expect(double.held()).toBeNull();
  });

  // The one key belongs to whatever is recording now. Before this, a refusal
  // that landed after the next walk started put "Delete it" on screen over a
  // running recording, and pressing it deleted that walk's copy.
  it("never offers to delete a copy once the next walk owns the device key", async () => {
    const double = draftStoreDouble(stopped());
    double.refuseClear("failed");
    const { result } = renderHook(() => useTrackRecording(null, double.store));
    await settled();

    // Saved, then straight back out walking. Nothing runs between these two
    // calls, so the device's refusal is still in flight when Record is pressed.
    act(() => {
      result.current.clearUnsaved();
      result.current.start();
    });
    await settled();

    expect(result.current.status).toBe("recording");
    expect(result.current.clearError).toBeNull();
  });

  it("writes nothing for a walk too short to save", async () => {
    vi.useFakeTimers();
    const double = draftStoreDouble();
    const { result } = renderHook(() => useTrackRecording(null, double.store));

    await settled();
    act(() => result.current.start());
    act(() => result.current.pause());
    await act(async () => {
      vi.advanceTimersByTime(TRACK_DRAFT_INTERVAL_MS * 2);
    });

    expect(double.held()).toBeNull();
  });
});
