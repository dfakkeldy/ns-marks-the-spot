import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import { UserMapImportError } from "../../errors";
import type { UserVectorLayerRecord } from "../types";
import { PERSIST_DELAY_MS, useVectorEditSession } from "./useVectorEditSession";

function record(id = "layer-1"): UserVectorLayerRecord {
  return {
    id,
    name: `Layer ${id}`,
    source: "geojson",
    origin: { kind: "imported", filename: "x.geojson", importedAt: "2026-07-31T00:00:00.000Z" },
    createdAt: "2026-07-31T00:00:00.000Z",
    revision: 0,
    style: { color: "#d55e00" },
    featureCount: 1,
    bbox: [-64, 44, -63, 45],
  };
}

function collection(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "f1",
        geometry: { type: "Point", coordinates: [-63.5, 44.5] },
        properties: { name: "Camp" },
      },
    ],
  };
}

function harness(overrides: Partial<Parameters<typeof useVectorEditSession>[0]> = {}) {
  const putVectorLayer = vi.fn(async () => {});
  const onLayerChanged = vi.fn();
  const options = {
    records: [record()],
    geometries: { "layer-1": collection() },
    putVectorLayer,
    onLayerChanged,
    ...overrides,
  };
  return { options, putVectorLayer, onLayerChanged };
}

describe("useVectorEditSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no layer being edited", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    expect(result.current.editingId).toBeNull();
    expect(result.current.editingLayer).toBeNull();
  });

  it("opens and closes an edit session for a layer", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    expect(result.current.editingId).toBe("layer-1");
    expect(result.current.editingLayer?.record.id).toBe("layer-1");
    expect(result.current.editingLayer?.data.features).toHaveLength(1);

    act(() => result.current.endEdit());
    expect(result.current.editingId).toBeNull();
  });

  it("opens the session once a just-created layer reaches the list", () => {
    // "New drawing layer" creates the record and immediately asks to edit
    // it, so beginEdit runs against props from the render BEFORE the layer
    // existed. Giving up there left the layer created but the editor shut —
    // which is what the browser showed.
    const { options } = harness({ records: [], geometries: {} });
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useVectorEditSession>[0]) =>
        useVectorEditSession(props),
      { initialProps: options },
    );

    act(() => result.current.beginEdit("layer-1"));
    expect(result.current.editingId).toBe("layer-1");
    expect(result.current.editingLayer).toBeNull();

    rerender({ ...options, records: [record()], geometries: { "layer-1": collection() } });
    expect(result.current.editingLayer?.record.id).toBe("layer-1");
  });

  it("does not re-seed the draft when the list catches up mid-edit", () => {
    const { options } = harness();
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useVectorEditSession>[0]) =>
        useVectorEditSession(props),
      { initialProps: options },
    );
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.renameLayer("Renamed"));

    // applyLayerEdit pushes the edit back into the list; re-seeding from it
    // would be harmless here but would clobber a draft mid-gesture.
    rerender({
      ...options,
      records: [{ ...record(), name: "Renamed" }],
    });
    expect(result.current.editingLayer?.record.name).toBe("Renamed");
  });

  it("debounces geometry writes so a drag does not hit IndexedDB per pointer move", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    const moved: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-60, 46] },
          properties: { name: "Camp" },
        },
      ],
    };
    act(() => {
      result.current.commitGeometry(moved);
      result.current.commitGeometry(moved);
      result.current.commitGeometry(moved);
    });
    expect(putVectorLayer).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(putVectorLayer).toHaveBeenCalledTimes(1);
  });

  it("stamps modifiedAt and bumps the revision on every persisted edit", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    const [savedRecord] = putVectorLayer.mock.calls[0] as unknown as [
      UserVectorLayerRecord,
    ];
    // The revision is the read-only layer's remount key, so an edit that did
    // not bump it would leave the map showing the pre-edit geometry.
    expect(savedRecord.revision).toBe(1);
    expect(savedRecord.modifiedAt).toBeTruthy();
  });

  it("keeps the feature count and bbox in step with edited geometry", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    act(() =>
      result.current.commitGeometry({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "f1",
            geometry: { type: "Point", coordinates: [-61, 46] },
            properties: {},
          },
          {
            type: "Feature",
            id: "f2",
            geometry: { type: "Point", coordinates: [-60, 45] },
            properties: {},
          },
        ],
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    const [savedRecord] = putVectorLayer.mock.calls[0] as unknown as [
      UserVectorLayerRecord,
    ];
    expect(savedRecord.featureCount).toBe(2);
    expect(savedRecord.bbox).toEqual([-61, 45, -60, 46]);
  });

  it("flushes a pending write when the session closes", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));

    await act(async () => {
      result.current.endEdit();
    });
    // Losing the tail of a session is the one moment the debounce would be
    // visible as data loss.
    expect(putVectorLayer).toHaveBeenCalledTimes(1);
  });

  it("keeps editing when a write fails, reporting it instead of blocking", async () => {
    const failing = vi.fn(async () => {
      throw new UserMapImportError("quota", "Storage is full.");
    });
    const { options } = harness({ putVectorLayer: failing });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    expect(result.current.storageError).toMatch(/Storage is full/);
    expect(result.current.editingId).toBe("layer-1");
  });

  // A guarded write that finds no row is the layer being gone, which is a
  // different thing from the disk refusing it. Removing the layer under an
  // open session used to be the ordinary way to reach this; a removal made
  // here is now told to the session, which drops the edit and stays quiet
  // about that layer — so this branch is only reached when another tab did
  // the deleting, and means what it says.
  it("says an edit could not be saved when the layer's row is gone", async () => {
    const { options } = harness({ putVectorLayer: vi.fn(async () => false) });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    expect(result.current.storageError).toMatch(/deleted in another tab/);
    expect(result.current.editingId).toBe("layer-1");
  });

  it("edits a feature's name and description", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() =>
      result.current.updateFeatureDetails("f1", {
        name: "Gate",
        description: "Locked",
      }),
    );

    expect(
      result.current.editingLayer?.data.features[0].properties,
    ).toMatchObject({ name: "Gate", description: "Locked" });
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(putVectorLayer).toHaveBeenCalledTimes(1);
  });

  it("deletes a single feature without touching the others", async () => {
    const twoFeatures: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...collection().features,
        {
          type: "Feature",
          id: "f2",
          geometry: { type: "Point", coordinates: [-62, 45] },
          properties: { name: "Second" },
        },
      ],
    };
    const { options } = harness({ geometries: { "layer-1": twoFeatures } });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.deleteFeature("f1"));

    const remaining = result.current.editingLayer?.data.features ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("f2");
  });

  it("renames a layer", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.renameLayer("Field notes"));

    expect(result.current.editingLayer?.record.name).toBe("Field notes");
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    const [savedRecord] = putVectorLayer.mock.calls[0] as unknown as [
      UserVectorLayerRecord,
    ];
    expect(savedRecord.name).toBe("Field notes");
  });

  it("publishes edits so the read-only layer list can follow along", async () => {
    const { options, onLayerChanged } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.renameLayer("Renamed"));

    // Published synchronously from the commit, not after the debounce: the
    // read-only list must follow the edit as it happens, not 400 ms later.
    expect(onLayerChanged).toHaveBeenCalled();
    const [changedRecord] = onLayerChanged.mock.calls.at(-1) as unknown as [
      UserVectorLayerRecord,
    ];
    expect(changedRecord.name).toBe("Renamed");
  });

  it("ignores edits when no session is open", () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.commitGeometry(collection()));
    act(() => vi.advanceTimersByTime(PERSIST_DELAY_MS));
    expect(putVectorLayer).not.toHaveBeenCalled();
  });
});

describe("points-to-path conversion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function threePoints(): FeatureCollection {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "p1",
          geometry: { type: "Point", coordinates: [-61.0, 46.0] },
          properties: {},
        },
        {
          type: "Feature",
          id: "p2",
          geometry: { type: "Point", coordinates: [-61.0, 46.001] },
          properties: {},
        },
        {
          type: "Feature",
          id: "p3",
          geometry: { type: "Point", coordinates: [-60.999, 46.001] },
          properties: {},
        },
      ],
    };
  }

  it("converts, returns the new id, and offers a one-shot undo", () => {
    const { options } = harness({
      geometries: { "layer-1": threePoints() },
    });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    let createdId: string | null = null;
    act(() => {
      createdId = result.current.convertPoints({
        shape: "area",
        keepSourcePoints: false,
      });
    });
    expect(createdId).toBeTruthy();
    expect(result.current.editingLayer?.data.features).toHaveLength(1);
    expect(result.current.editingLayer?.data.features[0].geometry.type).toBe(
      "Polygon",
    );
    expect(result.current.lastConversion?.label).toBe("Converted 3 points");

    act(() => result.current.undoConversion());
    expect(result.current.editingLayer?.data.features.map(({ id }) => id)).toEqual(
      ["p1", "p2", "p3"],
    );
    // One-shot: the undo commit cleared the slot.
    expect(result.current.lastConversion).toBeNull();
    act(() => result.current.undoConversion());
    expect(result.current.editingLayer?.data.features).toHaveLength(3);
  });

  it("clears the undo on any later commit", () => {
    const { options } = harness({
      geometries: { "layer-1": threePoints() },
    });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => {
      result.current.convertPoints({ shape: "line", keepSourcePoints: true });
    });
    expect(result.current.lastConversion).not.toBeNull();

    act(() => result.current.renameLayer("Renamed"));
    expect(result.current.lastConversion).toBeNull();
  });

  it("returns null without committing when there is too little to convert", () => {
    const { options, onLayerChanged } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    onLayerChanged.mockClear();
    let createdId: string | null = "sentinel";
    act(() => {
      createdId = result.current.convertPoints({
        shape: "area",
        keepSourcePoints: true,
      });
    });
    expect(createdId).toBeNull();
    expect(onLayerChanged).not.toHaveBeenCalled();
  });

  it("persists the conversion through the normal debounced write", async () => {
    const { options, putVectorLayer } = harness({
      geometries: { "layer-1": threePoints() },
    });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() => {
      result.current.convertPoints({ shape: "line", keepSourcePoints: true });
    });
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS + 1);
      await Promise.resolve();
    });
    expect(putVectorLayer).toHaveBeenCalledTimes(1);
    const persisted = (
      putVectorLayer.mock.calls[0] as unknown as [unknown, FeatureCollection]
    )[1];
    expect(persisted.features).toHaveLength(4);
  });
});

describe("freeform attribute patches", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets string values and deletes undefined ones without aliasing", () => {
    const { options } = harness();
    const original = options.geometries["layer-1"];
    const originalProps = original.features[0].properties;
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    act(() =>
      result.current.updateFeatureProperties("f1", {
        species: "red spruce",
        name: undefined,
      }),
    );
    const patched = result.current.editingLayer?.data.features[0].properties;
    expect(patched).toEqual({ species: "red spruce" });
    // The seed collection's property object is untouched.
    expect(originalProps).toEqual({ name: "Camp" });
    expect(patched).not.toBe(originalProps);
  });

  it("touches only the addressed feature", () => {
    const twoFeatures: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-63.5, 44.5] },
          properties: { name: "Camp" },
        },
        {
          type: "Feature",
          id: "f2",
          geometry: { type: "Point", coordinates: [-63.4, 44.6] },
          properties: { name: "Dock" },
        },
      ],
    };
    const { options } = harness({ geometries: { "layer-1": twoFeatures } });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() =>
      result.current.updateFeatureProperties("f2", { depth: "3 m" }),
    );
    const [first, second] = result.current.editingLayer!.data.features;
    expect(first.properties).toEqual({ name: "Camp" });
    expect(second.properties).toEqual({ name: "Dock", depth: "3 m" });
  });
});

describe("photos and point moves", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes and clears photo descriptors", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    act(() =>
      result.current.setFeaturePhotos("f1", [
        { id: "p1", width: 10, height: 10 },
      ]),
    );
    expect(
      result.current.editingLayer?.data.features[0].properties?.["nsmts:photos"],
    ).toEqual([{ id: "p1", width: 10, height: 10 }]);

    act(() => result.current.setFeaturePhotos("f1", []));
    expect(
      result.current.editingLayer?.data.features[0].properties,
    ).not.toHaveProperty("nsmts:photos");
  });

  it("moves a Point and recomputes the layer's bbox", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    act(() => result.current.moveFeaturePoint("f1", [-60.9, 46.1]));
    const feature = result.current.editingLayer?.data.features[0];
    expect(feature?.geometry).toEqual({
      type: "Point",
      coordinates: [-60.9, 46.1],
    });
    expect(result.current.editingLayer?.record.bbox).toEqual([
      -60.9, 46.1, -60.9, 46.1,
    ]);
  });

  // Moving a mark to a photo's coordinate is still a move: the capture time
  // and the reported accuracy describe where the device was, not where the
  // photo was taken, and a callout reading them off the new position would
  // claim a fix that was never made there. The rule lives on commit, which is
  // the one path every geometry write goes through, so it holds here as it
  // does for a dragged point.
  it("takes a mark's fix provenance off a point moved to a photo's location", () => {
    const { options } = harness({
      geometries: {
        "layer-1": {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "f1",
              geometry: { type: "Point", coordinates: [-61, 46, 31.5] },
              properties: {
                "nsmts:capturedAt": "2026-09-03T00:00:00.000Z",
                "nsmts:accuracyM": 5,
                "nsmts:altitudeM": 31.5,
                name: "Corner post",
              },
            },
          ],
        },
      },
    });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    act(() => result.current.moveFeaturePoint("f1", [-63, 45]));

    const moved = result.current.editingLayer?.data.features[0];
    expect(moved?.properties).toEqual({ name: "Corner post" });
    expect(moved?.geometry).toEqual({ type: "Point", coordinates: [-63, 45] });
  });

  it("a photo that finishes after another was removed does not bring the removed one back", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));
    act(() =>
      result.current.setFeaturePhotos("f1", [{ id: "pA", width: 10, height: 10 }]),
    );

    // Captured while photo A was still on the feature, the way a strip mid-
    // attach holds the callbacks from the render the file was picked in.
    const midAttach = result.current.attachFeaturePhotos;
    act(() => result.current.setFeaturePhotos("f1", []));

    act(() => {
      midAttach("layer-1", "f1", [{ id: "pB", width: 20, height: 20 }]);
    });

    expect(
      result.current.editingLayer?.data.features[0].properties?.["nsmts:photos"],
    ).toEqual([{ id: "pB", width: 20, height: 20 }]);
  });

  it("a photo whose feature is gone is handed back and said out loud rather than rebuilding the feature", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    const midAttach = result.current.attachFeaturePhotos;
    act(() => result.current.deleteFeature("f1"));

    let discarded: Array<{ id: string }> = [];
    act(() => {
      discarded = midAttach("layer-1", "f1", [
        { id: "pB", sourceName: "IMG_9.jpg", width: 20, height: 20 },
      ]);
    });

    // The feature stays deleted, and the photo comes back for the caller to
    // take out of the store rather than living on as a dangling descriptor.
    expect(result.current.editingLayer?.data.features).toHaveLength(0);
    expect(discarded).toEqual([
      { id: "pB", sourceName: "IMG_9.jpg", width: 20, height: 20 },
    ]);
    expect(result.current.discardedPhotos).toHaveLength(1);
    expect(result.current.discardedPhotos[0].message).toContain("IMG_9.jpg");

    act(() => result.current.dismissDiscardedPhoto("pB"));
    expect(result.current.discardedPhotos).toEqual([]);
  });

  // The reader can dismiss the discard notice while the delete is still
  // running. A failure arriving after that used to have nothing to attach
  // itself to and said nothing at all.
  it("still reports a failed cleanup after its first notice was dismissed", () => {
    const { options } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    const midAttach = result.current.attachFeaturePhotos;
    act(() => result.current.deleteFeature("f1"));
    act(() => {
      midAttach("layer-1", "f1", [{ id: "pB", width: 20, height: 20 }]);
    });
    act(() => result.current.dismissDiscardedPhoto("pB"));
    expect(result.current.discardedPhotos).toEqual([]);

    act(() => result.current.notePhotoCleanupFailure("pB"));

    expect(result.current.discardedPhotos).toHaveLength(1);
    expect(result.current.discardedPhotos[0].message).toContain(
      "still on this device",
    );
  });

  it("a photo is never added to another layer's feature of the same id", () => {
    const { options } = harness({
      records: [record(), record("layer-2")],
      geometries: { "layer-1": collection(), "layer-2": collection() },
    });
    const { result } = renderHook(() => useVectorEditSession(options));
    act(() => result.current.beginEdit("layer-1"));

    const midAttach = result.current.attachFeaturePhotos;
    act(() => result.current.endEdit());
    act(() => result.current.beginEdit("layer-2"));

    act(() => {
      midAttach("layer-1", "f1", [{ id: "pB", width: 20, height: 20 }]);
    });

    expect(
      result.current.editingLayer?.data.features[0].properties,
    ).not.toHaveProperty("nsmts:photos");
    expect(result.current.discardedPhotos).toHaveLength(1);
  });
});

describe("a write that fails with no panel to show it", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const twoLayers = () => ({
    records: [record(), record("layer-2")],
    geometries: { "layer-1": collection(), "layer-2": collection() },
  });

  it("names the layer in a failure the panel is no longer there to show", async () => {
    const { options } = harness({
      putVectorLayer: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      result.current.endEdit();
    });

    expect(result.current.editingLayer).toBeNull();
    expect(result.current.storageError).toBeNull();
    expect(Object.keys(result.current.closedSessionErrors)).toEqual(["layer-1"]);
    expect(result.current.closedSessionErrors["layer-1"]).toContain("Layer layer-1");
  });

  it("keeps a write that fails after Done out of the next layer's panel", async () => {
    let reject: ((error: unknown) => void) | undefined;
    const { options } = harness({
      ...twoLayers(),
      putVectorLayer: vi.fn(
        () =>
          new Promise<void>((_, rejectWrite) => {
            reject = rejectWrite;
          }),
      ),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    act(() => result.current.endEdit());
    act(() => result.current.beginEdit("layer-2"));
    await act(async () => {
      reject?.(new UserMapImportError("quota", "Storage is full."));
    });

    // The panel on screen belongs to layer-2, and this failure does not.
    expect(result.current.storageError).toBeNull();
    expect(result.current.closedSessionErrors["layer-1"]).toContain("Layer layer-1");
  });

  it("reports both layers when two edits are lost", async () => {
    const { options } = harness({
      ...twoLayers(),
      putVectorLayer: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    for (const layerId of ["layer-1", "layer-2"]) {
      act(() => result.current.beginEdit(layerId));
      act(() => result.current.commitGeometry(collection()));
      await act(async () => {
        result.current.endEdit();
      });
    }

    // A full disk fails every layer's write, and the second must not erase
    // the first.
    expect(Object.keys(result.current.closedSessionErrors).sort()).toEqual([
      "layer-1",
      "layer-2",
    ]);
    expect(result.current.closedSessionErrors["layer-2"]).toContain("Layer layer-2");
  });

  it("clears a layer's notice when a later write for it lands", async () => {
    let fail = true;
    const { options } = harness({
      putVectorLayer: vi.fn(async () => {
        if (fail) throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      result.current.endEdit();
    });
    expect(result.current.closedSessionErrors["layer-1"]).toBeDefined();

    fail = false;
    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.renameLayer("Field notes"));
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    // The edit reached the device after all, so the map stops saying it did
    // not.
    expect(result.current.closedSessionErrors).toEqual({});
  });

  it("keeps one layer's notice out of another layer's success", async () => {
    const { options } = harness({
      ...twoLayers(),
      putVectorLayer: vi.fn(async (layer: UserVectorLayerRecord) => {
        if (layer.id === "layer-1") throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      result.current.endEdit();
    });
    act(() => result.current.beginEdit("layer-2"));
    act(() => result.current.commitGeometry(collection()));
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    expect(result.current.closedSessionErrors["layer-1"]).toBeDefined();
  });
});

describe("a layer the user asked to remove", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const twoLayers = () => ({
    records: [record(), record("layer-2")],
    geometries: { "layer-1": collection(), "layer-2": collection() },
  });

  it("drops the unsaved edit instead of writing it into a layer being removed", async () => {
    const { options, putVectorLayer } = harness();
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    act(() => result.current.abandonLayer("layer-1"));
    await act(async () => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });

    // Remove is not Done: nothing is worth saving into a layer the user has
    // just asked to delete, and the write would race the delete.
    expect(putVectorLayer).not.toHaveBeenCalled();
    expect(result.current.editingId).toBeNull();
  });

  it("does not blame another tab for a deletion this tab performed", async () => {
    let answer: ((wrote: boolean) => void) | undefined;
    const { options } = harness({
      putVectorLayer: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    // Done starts the write; Remove lands while it is still converting the
    // geometry, so the guarded update finds the row already gone.
    act(() => result.current.endEdit());
    act(() => result.current.abandonLayer("layer-1"));
    await act(async () => {
      answer?.(false);
    });

    expect(result.current.closedSessionErrors).toEqual({});
    expect(result.current.storageError).toBeNull();
  });

  it("still reports a layer another tab deleted while a different layer is removed here", async () => {
    let answer: ((wrote: boolean) => void) | undefined;
    const { options } = harness({
      ...twoLayers(),
      putVectorLayer: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-1"));
    act(() => result.current.commitGeometry(collection()));
    act(() => result.current.endEdit());
    act(() => result.current.abandonLayer("layer-2"));
    await act(async () => {
      answer?.(false);
    });

    // Nothing this tab did explains layer-1's missing row.
    expect(result.current.closedSessionErrors["layer-1"]).toContain(
      "deleted in another tab",
    );
  });

  it("leaves a session open on the layer that was not removed", () => {
    const { options } = harness(twoLayers());
    const { result } = renderHook(() => useVectorEditSession(options));

    act(() => result.current.beginEdit("layer-2"));
    act(() => result.current.abandonLayer("layer-1"));

    expect(result.current.editingId).toBe("layer-2");
    expect(result.current.editingLayer?.record.id).toBe("layer-2");
  });
});
