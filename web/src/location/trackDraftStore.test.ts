import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { BLOBS, openUserContentDatabase } from "../userMaps/store/database";
import { createTrackDraftStore } from "./trackDraftStore";
import type { StopResult } from "./trackRecorder";

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

    expect(read).toEqual(draft());
    expect(read?.segments[0][0].altitudeM).toBeNull();
  });

  it("has nothing to offer once the walk is saved or discarded", async () => {
    const store = createTrackDraftStore(new IDBFactory());
    await store.save(draft());

    await store.clear();

    expect(await store.read()).toBeNull();
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
          rawSegments: [[{ latitude: 46, longitude: -61, accuracyM: 5, timestampMs: 0 }]],
        },
      },
    ],
  ])("refuses %s", async (_label, stored) => {
    const factory = new IDBFactory();
    const store = createTrackDraftStore(factory);
    const database = await openUserContentDatabase(factory);
    const tx = database.transaction(BLOBS, "readwrite");
    tx.objectStore(BLOBS).put(stored, "recording:draft");
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    database.close();

    expect(await store.read()).toBeNull();
  });

  // A walk the user has already saved must not come back as unsaved because
  // a periodic write was still in flight when the session ended.
  it("clears behind a write that was still in flight", async () => {
    const store = createTrackDraftStore(new IDBFactory());

    void store.save(draft());
    await store.clear();

    expect(await store.read()).toBeNull();
  });
});
