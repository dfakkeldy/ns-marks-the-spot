import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { BLOBS, openUserContentDatabase } from "../userMaps/store/database";
import { createTrackDraftStore } from "./trackDraftStore";
import type { StopResult } from "./trackRecorder";

/**
 * A walk in the shape the recorder writes it: one stored fix for every fix
 * counted, and no more vertices than there were accepted fixes to make them
 * from. A fixture that could not have come off a recording would prove
 * nothing about what the store gives back.
 */
function draft(): StopResult {
  return {
    segments: [
      [
        { lat: 46, lng: -61, accuracyM: 5, altitudeM: null, timestampMs: 0 },
        { lat: 46.001, lng: -61, accuracyM: 5, altitudeM: 12, timestampMs: 1_000 },
      ],
    ],
    rawSegments: [
      [
        {
          latitude: 46,
          longitude: -61,
          accuracyM: 5,
          altitudeM: null,
          headingDeg: null,
          speedMps: null,
          timestampMs: 0,
        },
        {
          latitude: 46.001,
          longitude: -61,
          accuracyM: 5,
          altitudeM: 12,
          headingDeg: null,
          speedMps: null,
          timestampMs: 1_000,
        },
      ],
    ],
    startedAt: "2026-09-03T00:00:00.000Z",
    endedAt: "2026-09-03T00:00:01.000Z",
    rawFixCount: 2,
    acceptedFixCount: 2,
    distanceM: 111,
    recordingMs: 1_000,
  };
}

describe("the recording draft on this device", () => {
  it("round-trips a walk, keeping a null altitude null", async () => {
    const store = createTrackDraftStore(new IDBFactory());

    expect(await store.save(draft())).toBeNull();
    const read = await store.read();

    expect(read).toEqual({ status: "ready", result: draft(), stopped: false });
    expect(
      read.status === "ready" ? read.result.segments[0][0].altitudeM : undefined,
    ).toBeNull();
  });

  // A walk stopped inside the first few seconds, and the last few seconds of
  // any walk, used to exist only in the tab that was about to be reloaded.
  it("keeps a walk written at Stop, and says it is the whole walk", async () => {
    const store = createTrackDraftStore(new IDBFactory());

    expect(await store.save(draft(), true)).toBeNull();

    expect(await store.read()).toEqual({
      status: "ready",
      result: draft(),
      stopped: true,
    });
  });

  it("has nothing to offer once the walk is saved or discarded", async () => {
    const store = createTrackDraftStore(new IDBFactory());
    await store.save(draft());

    await store.clear();

    expect(await store.read()).toEqual({ status: "empty" });
  });

  // Half a walk is worse than none: the save dialog measures and simplifies
  // whatever it is given while it renders.
  it.each([
    ["a version it does not know", { version: 99, result: draft() }],
    [
      "a vertex that is not a position",
      { version: 1, result: { ...draft(), segments: [[{ lat: "x" }]] } },
    ],
    [
      "a raw fix missing its altitude",
      {
        version: 1,
        result: {
          ...draft(),
          rawSegments: [
            [
              draft().rawSegments[0][0],
              { latitude: 46, longitude: -61, accuracyM: 5, timestampMs: 1_000 },
            ],
          ],
        },
      },
    ],
    [
      "a vertex off the globe",
      {
        version: 1,
        result: {
          ...draft(),
          segments: [
            [
              { lat: 999, lng: 999, accuracyM: 5, altitudeM: null, timestampMs: 0 },
              draft().segments[0][1],
            ],
          ],
        },
      },
    ],
    [
      "a fix timestamped past what a date can hold",
      {
        version: 1,
        result: {
          ...draft(),
          rawSegments: [
            [
              draft().rawSegments[0][0],
              { ...draft().rawSegments[0][1], timestampMs: 9e15 },
            ],
          ],
        },
      },
    ],
    [
      "an accuracy no device reported",
      {
        version: 1,
        result: {
          ...draft(),
          rawSegments: [
            [draft().rawSegments[0][0], { ...draft().rawSegments[0][1], accuracyM: -5 }],
          ],
        },
      },
    ],
    [
      "a start time no clock produced",
      { version: 1, result: { ...draft(), startedAt: "just after lunch" } },
    ],
    [
      "a recording of negative length",
      { version: 1, result: { ...draft(), recordingMs: -1_000 } },
    ],
    [
      "a count of GPS fixes that is not whole",
      { version: 1, result: { ...draft(), rawFixCount: 2.5 } },
    ],
    [
      "more GPS fixes claimed than the walk carries",
      { version: 1, result: { ...draft(), rawFixCount: 900, acceptedFixCount: 900 } },
    ],
    [
      "more positions kept than fixes were accepted",
      { version: 1, result: { ...draft(), acceptedFixCount: 1 } },
    ],
    [
      "more fixes accepted than the device ever sent",
      { version: 1, result: { ...draft(), acceptedFixCount: 3 } },
    ],
    [
      "a segment with no raw segment beside it",
      { version: 1, result: { ...draft(), segments: [...draft().segments, []] } },
    ],
  ])("refuses %s, and does not call it an empty device", async (_label, stored) => {
    const factory = new IDBFactory();
    const store = createTrackDraftStore(factory);
    const database = await openUserContentDatabase(factory);
    const tx = database.transaction(BLOBS, "readwrite");
    tx.objectStore(BLOBS).put(stored, "recording:draft");
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    database.close();

    // Not "empty": the key is taken by something, and a new recording
    // overwriting it would destroy whatever that is.
    expect(await store.read()).toEqual({ status: "unreadable" });
  });

  // Resume opens a segment before a single fix has landed in it, and the
  // periodic write can catch the walk exactly there. An empty segment is a
  // real recording, and refusing it would throw away everything walked before
  // it.
  it("keeps a walk whose newest segment has no positions in it yet", async () => {
    const store = createTrackDraftStore(new IDBFactory());
    const resumed: StopResult = {
      ...draft(),
      segments: [...draft().segments, []],
      rawSegments: [...draft().rawSegments, []],
    };

    expect(await store.save(resumed)).toBeNull();

    expect(await store.read()).toEqual({
      status: "ready",
      result: resumed,
      stopped: false,
    });
  });

  // Record notes the moment from this device's clock, while the walk's last
  // moment is a position's own timestamp from the location provider. They are
  // not the same clock, so a walk that really happened can carry the two out
  // of order, and putting them in order here would lose it.
  it("keeps a walk whose last position is stamped before Record was pressed", async () => {
    const store = createTrackDraftStore(new IDBFactory());
    const skewed: StopResult = { ...draft(), endedAt: "2026-09-02T23:59:59.000Z" };

    expect(await store.save(skewed)).toBeNull();

    expect(await store.read()).toEqual({
      status: "ready",
      result: skewed,
      stopped: false,
    });
  });

  // A device that will not open may still be holding a walk. Calling that
  // "nothing here" would let the next recording write straight over it.
  it("tells a device it cannot read from a device with nothing on it", async () => {
    const blocked = {
      open: () => {
        throw new Error("storage is blocked");
      },
    } as unknown as IDBFactory;

    expect(await createTrackDraftStore(blocked).read()).toEqual({
      status: "unreadable",
    });
  });

  // A device that never answers used to hold the queue for the life of the
  // tab: the read sat at its head and every write of the walk waited behind
  // it, in silence, so a reload lost a recording nothing had warned about.
  it("gives up on a device that never opens, so the walk's next write can say so", async () => {
    vi.useFakeTimers();
    try {
      const never = {
        open: () => ({}) as IDBOpenDBRequest,
      } as unknown as IDBFactory;
      const store = createTrackDraftStore(never);

      const read = store.read();
      const write = store.save(draft());
      // Past two operation deadlines: the read gives up, and the write behind
      // it then gets its own turn to.
      await vi.advanceTimersByTimeAsync(10_000);

      expect(await read).toEqual({ status: "unreadable" });
      expect(await write).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  // A walk the user has already saved must not come back as unsaved because
  // a periodic write was still in flight when the session ended.
  it("clears behind a write that was still in flight", async () => {
    const store = createTrackDraftStore(new IDBFactory());

    void store.save(draft());
    await store.clear();

    expect(await store.read()).toEqual({ status: "empty" });
  });
});
