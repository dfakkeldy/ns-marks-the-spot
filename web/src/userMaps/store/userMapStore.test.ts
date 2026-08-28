import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserMapRecord } from "../types";
import { transactionDone, UserMapStore } from "./userMapStore";

function record(id: string, createdAt: string): UserMapRecord {
  return {
    id,
    name: `Map ${id}`,
    source: "geotiff",
    createdAt,
    pixelSize: { width: 8, height: 6 },
    georef: {
      kind: "embedded",
      crs: "EPSG:26920",
      geotransform: [500000, 10, 0, 5000000, 0, -10],
    },
  };
}

describe("UserMapStore", () => {
  let store: UserMapStore;

  beforeEach(async () => {
    // A fresh factory per test = a fresh, isolated database.
    store = await UserMapStore.open(new IDBFactory());
  });

  it("round-trips a record with its blobs", async () => {
    const raster = new Blob(["raster-bytes"]);
    const preview = new Blob(["preview-bytes"], { type: "image/png" });
    await store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), raster, preview);

    const listed = await store.listUserMaps();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Map a");

    expect(await (await store.getPreviewBlob("a"))?.text()).toBe("preview-bytes");
    expect(await (await store.getRasterBlob("a"))?.text()).toBe("raster-bytes");
  });

  it("lists maps oldest-first by createdAt", async () => {
    await store.saveUserMap(record("b", "2026-07-24T02:00:00.000Z"), new Blob(), new Blob());
    await store.saveUserMap(record("a", "2026-07-24T01:00:00.000Z"), new Blob(), new Blob());
    const listed = await store.listUserMaps();
    expect(listed.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("deletes a map and its blobs", async () => {
    await store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), new Blob(), new Blob());
    await store.deleteUserMap("a");
    expect(await store.listUserMaps()).toEqual([]);
    expect(await store.getPreviewBlob("a")).toBeNull();
    expect(await store.getRasterBlob("a")).toBeNull();
  });

  it("returns null blobs for unknown ids", async () => {
    expect(await store.getPreviewBlob("missing")).toBeNull();
  });

  it("updates a record without touching its blobs", async () => {
    const raster = new Blob(["raster-bytes"]);
    const preview = new Blob(["preview-bytes"], { type: "image/png" });
    await store.saveUserMap(record("a", "2026-07-25T00:00:00.000Z"), raster, preview);
    await store.putUserMapRecord({
      ...record("a", "2026-07-25T00:00:00.000Z"),
      georef: {
        kind: "gcp",
        method: "affine",
        gcps: [{ id: "g0", pixel: { x: 1, y: 2 }, map: { lat: 46, lng: -61 } }],
      },
    });
    const [listed] = await store.listUserMaps();
    expect(listed.georef).toMatchObject({ kind: "gcp" });
    expect(await (await store.getRasterBlob("a"))?.text()).toBe("raster-bytes");
  });

  // Two browser tabs on the same origin are two IDBDatabase connections
  // against ONE storage backend — modelled here as two UserMapStore.open()
  // calls sharing a single IDBFactory, rather than the per-test factory the
  // beforeEach above hands out for isolation.
  describe("cross-tab delete versus a queued metadata write", () => {
    let factory: IDBFactory;
    let tabA: UserMapStore;
    let tabB: UserMapStore;

    beforeEach(async () => {
      factory = new IDBFactory();
      tabA = await UserMapStore.open(factory);
      tabB = await UserMapStore.open(factory);
    });

    afterEach(() => {
      tabA.close();
      tabB.close();
    });

    it("drops a metadata write whose row another tab already deleted", async () => {
      const seeded = record("a", "2026-07-26T00:00:00.000Z");
      await tabA.saveUserMap(seeded, new Blob(["raster"]), new Blob(["preview"]));

      // Tab B deletes the map: metadata row AND both blobs.
      await tabB.deleteUserMap("a");

      // Tab A's 400ms debounce timer fires afterwards, still holding the
      // record it captured before the delete. put() is an upsert, so an
      // unguarded write recreates the metadata row for a map whose blobs are
      // gone — a row listUserMaps() returns forever and nothing can render.
      await tabA.putUserMapRecord({
        ...seeded,
        georef: {
          kind: "gcp",
          method: "affine",
          gcps: [{ id: "g0", pixel: { x: 1, y: 2 }, map: { lat: 46, lng: -61 } }],
        },
      });

      // Exact-empty, not `.toHaveLength(0)`-adjacent looseness — and read
      // back from tab A, the connection that just wrote. One listing read is
      // enough: both connections share one backing store, so a second read
      // from tab B could not fail while this one passes, and an assertion no
      // mutation can falsify on its own is noise.
      expect(await tabA.listUserMaps()).toEqual([]);
      // The other half of "orphan": the blobs really are gone, so this
      // scenario is the one described rather than a delete that half-ran.
      // Exact null, since `not.toBeNull()` would also accept an undefined.
      expect(await tabA.getRasterBlob("a")).toBeNull();
      expect(await tabA.getPreviewBlob("a")).toBeNull();
    });

    // ORDERING NOTE for the two tests below. Both `putUserMapRecord` and
    // `deleteUserMap` are `async`, but each opens its IDBTransaction in its
    // FIRST statement, which runs synchronously at call time — before the
    // function ever suspends. fake-indexeddb then runs overlapping
    // transactions in creation order (scope-based FIFO, connection-agnostic:
    // two `open()` calls on one factory share a single backing database). So
    // whichever of the two is CALLED first is the one that runs first, and
    // the two call orders are two genuinely different scenarios. They catch
    // disjoint defects, which is why both are here — see each test.

    it("skips the write when the delete's transaction was created first", async () => {
      // Delete first: tab B's transaction takes the lock, commits, and the
      // row is gone by the time tab A's get runs. This is the ONLY ordering
      // in which the guard's skip branch is reached, so it is the only one
      // that can catch a missing or inverted guard. (Verified: with a blind
      // `put`, or with the condition flipped, this test fails; the write-first
      // test below passes under both, because there the guard is a no-op.)
      const seeded = record("a", "2026-07-26T00:00:00.000Z");
      await tabA.saveUserMap(seeded, new Blob(["raster"]), new Blob(["preview"]));

      const remove = tabB.deleteUserMap("a");
      const write = tabA.putUserMapRecord({ ...seeded, name: "renamed-by-tab-a" });
      await Promise.all([remove, write]);

      // The permanent orphan: an unguarded upsert recreates the row here,
      // with the blobs already gone.
      expect(await tabA.listUserMaps()).toEqual([]);
      expect(await tabA.getRasterBlob("a")).toBeNull();
    });

    it("keeps its check and its write in one transaction when its own transaction was created first", async () => {
      // Write first: tab A's transaction takes the lock, so its get sees the
      // row and the guard's skip branch is NEVER reached — the guard itself
      // is irrelevant to this ordering, and this test correspondingly does
      // not catch a missing or inverted guard.
      //
      // What it does catch is the check-then-write being SPLIT across two
      // transactions, which the sequential test above cannot: split, tab A's
      // readonly get runs first and sees the row, tab B's delete then takes
      // the readwrite lock, and tab A's *separate* write transaction — created
      // only after the get resolved — queues BEHIND that delete and
      // resurrects the row it just "verified". One transaction cannot be
      // interleaved that way, because it holds the maps store throughout.
      const seeded = record("a", "2026-07-26T00:00:00.000Z");
      await tabA.saveUserMap(seeded, new Blob(["raster"]), new Blob(["preview"]));

      const write = tabA.putUserMapRecord({ ...seeded, name: "renamed-by-tab-a" });
      const remove = tabB.deleteUserMap("a");
      await Promise.all([write, remove]);

      // The write lands, then the delete removes row and blobs together —
      // so the correct end state is still empty, and a row surviving here
      // means the delete got in between the check and the write.
      expect(await tabA.listUserMaps()).toEqual([]);
      expect(await tabA.getRasterBlob("a")).toBeNull();
    });

    it("still lands a metadata write when the row is present", async () => {
      // The other half of the race window, and the reason the guard can't
      // simply be "never write": with no delete in flight, tab A's write must
      // commit and be visible to tab B.
      const seeded = record("a", "2026-07-26T00:00:00.000Z");
      await tabA.saveUserMap(seeded, new Blob(["raster"]), new Blob(["preview"]));

      await tabA.putUserMapRecord({ ...seeded, name: "renamed-by-tab-a" });

      const listed = await tabB.listUserMaps();
      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe("renamed-by-tab-a");
      // …and it stayed a metadata-only write.
      expect(await (await tabB.getRasterBlob("a"))?.text()).toBe("raster");
    });
  });

  // Regression coverage for two behaviors that don't match the naive reading
  // of the IndexedDB API (see comments in userMapStore.ts for the evidence):
  // fake-indexeddb never simulates real storage exhaustion, so the "quota"
  // path can't be reached by actually filling up a database. These tests
  // force the two ways an engine can signal QuotaExceededError instead.
  describe("save failure classification", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("classifies a synchronous QuotaExceededError from put() as code 'quota'", async () => {
      // Some engines (Safari, historically) throw QuotaExceededError
      // synchronously from put()/add() rather than failing the transaction
      // asynchronously. This is the first put() call inside saveUserMap.
      vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

      await expect(
        store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), new Blob(), new Blob()),
      ).rejects.toMatchObject({ code: "quota" });
    });

    it("classifies a non-quota synchronous throw from put() as code 'storage-failed'", async () => {
      vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
        throw new DOMException("Nope", "ConstraintError");
      });

      await expect(
        store.saveUserMap(record("a", "2026-07-24T00:00:00.000Z"), new Blob(), new Blob()),
      ).rejects.toMatchObject({ code: "storage-failed" });
    });
  });
});

describe("transactionDone", () => {
  // A minimal stand-in for IDBTransaction exposing only what transactionDone
  // reads/assigns, so this test can deterministically drive the exact event
  // ordering IndexedDB implementations use: the "error" event bubbles from a
  // failed request to the transaction *before* `tx.error` is populated, and
  // `tx.error` is only set once the transaction actually aborts afterward.
  function fakeTransaction() {
    return {
      error: null as DOMException | null,
      oncomplete: null as (() => void) | null,
      // transactionDone must not assign a rejecting `onerror` handler at all
      // (see the comment on transactionDone in userMapStore.ts) — but a
      // *test double* still needs a slot to assign to, to prove that. Real
      // IndexedDB implementations always fire `error` before `abort`, so any
      // handler assigned here runs before `onabort` below.
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };
  }

  it("resolves once oncomplete fires", async () => {
    const tx = fakeTransaction();
    const promise = transactionDone(tx as unknown as IDBTransaction);
    tx.oncomplete?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects with the error onabort supplies, not the null seen by an earlier error event", async () => {
    const tx = fakeTransaction();
    const promise = transactionDone(tx as unknown as IDBTransaction);

    // Real engines fire the transaction's "error" event, bubbled from the
    // failed request, while tx.error is still null — it's only populated
    // once the transaction actually aborts, moments later. Firing both here,
    // in that order, proves transactionDone ignores whatever (if anything)
    // it assigned to onerror: a Promise settles on its first resolve/reject,
    // so if onerror rejected with the not-yet-populated tx.error, this test
    // would see `null` instead of the real DOMException onabort supplies.
    tx.onerror?.();
    tx.error = new DOMException("Quota exceeded", "QuotaExceededError");
    tx.onabort?.();

    await expect(promise).rejects.toMatchObject({ name: "QuotaExceededError" });
  });

  it("rejects with a fallback Error if the transaction aborts with no error set", async () => {
    const tx = fakeTransaction();
    const promise = transactionDone(tx as unknown as IDBTransaction);
    tx.onabort?.();
    await expect(promise).rejects.toThrow("transaction aborted");
  });
});
