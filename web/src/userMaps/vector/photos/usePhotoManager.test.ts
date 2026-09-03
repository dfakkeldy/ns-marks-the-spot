import { IDBFactory } from "fake-indexeddb";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserPhotoStore } from "./photoStore";
import { usePhotoManager, type PhotoAttachOutcome } from "./usePhotoManager";

function file(name: string): File {
  return new File(["bytes"], name, { type: "image/jpeg" });
}

function fakeProcess() {
  return vi.fn(async () => ({
    full: new Blob(["full"], { type: "image/jpeg" }),
    thumb: new Blob(["thumb"], { type: "image/jpeg" }),
    width: 2048,
    height: 1536,
  }));
}

describe("usePhotoManager", () => {
  it("attaches: exif before pipeline, descriptor + transient gps out", async () => {
    const factory = new IDBFactory();
    const readExif = vi.fn(async () => ({
      gps: { lon: -60.91, lat: 46.12 },
      capturedAt: "2026-08-30T14:00:00.000Z",
    }));
    const { result } = renderHook(() =>
      usePhotoManager({
        openStore: () => UserPhotoStore.open(factory),
        process: fakeProcess(),
        readExif,
      }),
    );

    let outcomes: PhotoAttachOutcome[] = [];
    await act(async () => {
      outcomes = await result.current.attachPhotos("layer-1", 0, [
        file("IMG_1.jpg"),
      ]);
    });
    expect(outcomes).toHaveLength(1);
    const outcome = outcomes[0];
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.descriptor).toMatchObject({
        capturedAt: "2026-08-30T14:00:00.000Z",
        sourceName: "IMG_1.jpg",
        width: 2048,
        height: 1536,
      });
      expect(outcome.gps).toEqual({ lon: -60.91, lat: 46.12 });
      const store = await UserPhotoStore.open(factory);
      expect(await store.listLayerPhotos("layer-1")).toHaveLength(1);
      expect(await (await store.getThumbBlob(outcome.descriptor.id))?.text()).toBe(
        "thumb",
      );
    }
  });

  it("enforces the per-feature cap with a named refusal", async () => {
    const { result } = renderHook(() =>
      usePhotoManager({
        openStore: () => UserPhotoStore.open(new IDBFactory()),
        process: fakeProcess(),
        readExif: vi.fn(async () => ({ gps: null, capturedAt: null })),
      }),
    );
    let outcomes: PhotoAttachOutcome[] = [];
    await act(async () => {
      outcomes = await result.current.attachPhotos("layer-1", 20, [
        file("IMG_1.jpg"),
      ]);
    });
    expect(outcomes[0].ok).toBe(false);
    if (!outcomes[0].ok) {
      expect(outcomes[0].message).toContain("20 photos");
    }
  });

  it("reports per-file failures distinctly and keeps going", async () => {
    const process = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("nope"), {
          userMessage: "This photo format can't be displayed in this browser.",
        }),
      )
      .mockResolvedValueOnce({
        full: new Blob(["full"], { type: "image/jpeg" }),
        thumb: new Blob(["thumb"], { type: "image/jpeg" }),
        width: 100,
        height: 100,
      });
    const { result } = renderHook(() =>
      usePhotoManager({
        openStore: () => UserPhotoStore.open(new IDBFactory()),
        process: process as never,
        readExif: vi.fn(async () => ({ gps: null, capturedAt: null })),
      }),
    );
    let outcomes: PhotoAttachOutcome[] = [];
    await act(async () => {
      outcomes = await result.current.attachPhotos("layer-1", 0, [
        file("bad.heic"),
        file("good.jpg"),
      ]);
    });
    expect(outcomes.map(({ ok }) => ok)).toEqual([false, true]);
  });

  it("serves thumb urls from a touch-on-read cache", async () => {
    const factory = new IDBFactory();
    const store = await UserPhotoStore.open(factory);
    await store.savePhoto(
      {
        id: "p1",
        layerId: "layer-1",
        addedAt: "2026-08-30T00:00:00.000Z",
        width: 10,
        height: 10,
        fullBytes: 1,
        thumbBytes: 1,
      },
      new Blob(["full"], { type: "image/jpeg" }),
      new Blob(["thumb"], { type: "image/jpeg" }),
    );
    const { result } = renderHook(() =>
      usePhotoManager({ openStore: () => UserPhotoStore.open(factory) }),
    );
    let first: string | null = null;
    let second: string | null = null;
    await act(async () => {
      first = await result.current.loadThumbUrl("p1");
      second = await result.current.loadThumbUrl("p1");
    });
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    let missing: string | null = "sentinel";
    await act(async () => {
      missing = await result.current.loadThumbUrl("nope");
    });
    expect(missing).toBeNull();
  });

  it("keeps one api identity across renders so consumer effects hold", () => {
    const factory = new IDBFactory();
    const { result, rerender } = renderHook(() =>
      usePhotoManager({ openStore: () => UserPhotoStore.open(factory) }),
    );
    const first = result.current;
    rerender();
    // PhotoLightbox lists the manager in its load effect's deps: a fresh object
    // each render would revoke the open photo's object URL and re-read the
    // full-size blob every time App re-renders.
    expect(result.current).toBe(first);
  });
});
