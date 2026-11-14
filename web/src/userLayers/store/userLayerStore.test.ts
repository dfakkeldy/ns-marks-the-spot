import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { BLOBS, DB_NAME, MAPS, PHOTOS, VECTORS, openUserContentDatabase, request } from "../../userMaps/store/database";
import { UserLayerStore } from "./userLayerStore";
import type { UserLayerRecord } from "../types";

describe("user layer store", () => {
  it("round trips and deletes a layer", async () => {
    const store = await UserLayerStore.open(new IDBFactory());
    const item = { id: "user-layer:1", name: "Test" } as UserLayerRecord;
    await store.put(item); expect(await store.list()).toEqual([item]);
    await store.delete(item.id); expect(await store.list()).toEqual([]); store.close();
  });
  it("keeps existing content when upgrading version 3", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open(DB_NAME, 3);
      open.onupgradeneeded = () => {
        for (const name of [MAPS, VECTORS, PHOTOS]) open.result.createObjectStore(name, { keyPath: "id" });
        open.result.createObjectStore(BLOBS);
      };
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction([MAPS, VECTORS, PHOTOS, BLOBS], "readwrite");
        for (const name of [MAPS, VECTORS, PHOTOS]) tx.objectStore(name).put({ id: name });
        tx.objectStore(BLOBS).put({ id: "draft" }, "recording:draft");
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    const db = await openUserContentDatabase(factory);
    for (const name of [MAPS, VECTORS, PHOTOS]) expect(await request(db.transaction(name).objectStore(name).get(name))).toEqual({ id: name });
    expect(await request(db.transaction(BLOBS).objectStore(BLOBS).get("recording:draft"))).toEqual({ id: "draft" });
    db.close();
  });
});
