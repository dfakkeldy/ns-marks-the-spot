import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, MAPS, BLOBS, VECTORS, openUserContentDatabase } from "./database";
import { UserMapStore } from "./userMapStore";

describe("openUserContentDatabase", () => {
  it("creates the maps, blobs, and vectors object stores", async () => {
    const db = await openUserContentDatabase(new IDBFactory());
    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      [BLOBS, MAPS, VECTORS].sort(),
    );
    db.close();
  });

  it("upgrades a version-1 database in place, preserving existing rows", async () => {
    const factory = new IDBFactory();

    // Build the schema exactly as DB_VERSION 1 shipped it: maps + blobs only.
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(MAPS, { keyPath: "id" });
        req.result.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = v1.transaction([MAPS, BLOBS], "readwrite");
      tx.objectStore(MAPS).put({ id: "m1", name: "Old map", createdAt: "2026-01-01" });
      tx.objectStore(BLOBS).put({ data: new ArrayBuffer(4), type: "image/png" }, "m1:preview");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    v1.close();

    const db = await openUserContentDatabase(factory);
    expect(db.version).toBe(DB_VERSION);
    expect(Array.from(db.objectStoreNames)).toContain(VECTORS);
    const kept = await new Promise<unknown>((resolve, reject) => {
      const req = db
        .transaction(MAPS, "readonly")
        .objectStore(MAPS)
        .get("m1");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(kept).toMatchObject({ id: "m1", name: "Old map" });
    db.close();
  });

  it("shares one version with UserMapStore so both open without VersionError", async () => {
    const factory = new IDBFactory();
    const db = await openUserContentDatabase(factory);
    db.close();

    // If UserMapStore still opened with its own (lower) version constant this
    // would reject with VersionError; the shared open path is what keeps the
    // raster store working after the vector store bumps the schema.
    const store = await UserMapStore.open(factory);
    expect(await store.listUserMaps()).toEqual([]);
    store.close();
  });
});
