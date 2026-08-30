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
