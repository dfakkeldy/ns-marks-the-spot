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
