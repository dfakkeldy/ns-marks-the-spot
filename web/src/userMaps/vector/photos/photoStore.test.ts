import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { UserPhotoStore } from "./photoStore";
import type { PhotoRecord } from "./types";

function record(id: string, layerId = "layer-1"): PhotoRecord {
  return {
    id,
    layerId,
    addedAt: "2026-08-30T00:00:00.000Z",
    sourceName: `${id}.jpg`,
    width: 2048,
    height: 1536,
    fullBytes: 5,
    thumbBytes: 3,
  };
}

function blobs(id: string): { full: Blob; thumb: Blob } {
  return {
    full: new Blob([`full-${id}`], { type: "image/jpeg" }),
    thumb: new Blob([`thumb-${id}`], { type: "image/jpeg" }),
  };
}

describe("UserPhotoStore", () => {
  it("saves and reads a photo's record and both blobs", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    const { full, thumb } = blobs("p1");
    await store.savePhoto(record("p1"), full, thumb);

    expect(await (await store.getFullBlob("p1"))?.text()).toBe("full-p1");
    expect(await (await store.getThumbBlob("p1"))?.text()).toBe("thumb-p1");
    expect(await store.listLayerPhotos("layer-1")).toHaveLength(1);
    expect(await store.getFullBlob("missing")).toBeNull();
  });

  it("deletes one photo with its blobs", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    await store.savePhoto(record("p1"), blobs("p1").full, blobs("p1").thumb);
    await store.deletePhoto("p1");
    expect(await store.listLayerPhotos("layer-1")).toHaveLength(0);
    expect(await store.getFullBlob("p1")).toBeNull();
    expect(await store.getThumbBlob("p1")).toBeNull();
  });

  it("deletes a whole layer's photos and no one else's", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    await store.savePhoto(record("p1"), blobs("p1").full, blobs("p1").thumb);
    await store.savePhoto(
      record("p2", "layer-2"),
      blobs("p2").full,
      blobs("p2").thumb,
    );
    await store.deletePhotosForLayer("layer-1");
    expect(await store.listLayerPhotos("layer-1")).toHaveLength(0);
    expect(await store.listLayerPhotos("layer-2")).toHaveLength(1);
    expect(await store.getFullBlob("p2")).not.toBeNull();
  });

  it("sweeps only the unreferenced rows", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    await store.savePhoto(record("kept"), blobs("kept").full, blobs("kept").thumb);
    await store.savePhoto(
      record("orphan"),
      blobs("orphan").full,
      blobs("orphan").thumb,
    );
    await store.sweepLayerPhotos("layer-1", new Set(["kept"]));
    const remaining = await store.listLayerPhotos("layer-1");
    expect(remaining.map(({ id }) => id)).toEqual(["kept"]);
    expect(await store.getFullBlob("orphan")).toBeNull();
  });
});
