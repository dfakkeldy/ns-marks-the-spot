import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../errors";
import { UserVectorStore } from "./store/userVectorStore";
import { MAX_VECTOR_FILE_BYTES, useUserVectorLayers } from "./useUserVectorLayers";

function geojsonFile(name = "camps.geojson", lon = -63.5): File {
  return new File(
    [
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, 44.5] },
            properties: { name: "Camp" },
          },
        ],
      }),
    ],
    name,
    { type: "application/geo+json" },
  );
}

function options(factory = new IDBFactory()) {
  return { openStore: () => UserVectorStore.open(factory) };
}

describe("useUserVectorLayers", () => {
  it("imports a GeoJSON file into an enabled, visible layer with provenance", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([geojsonFile()]));

    expect(result.current.outcomes).toEqual([
      expect.objectContaining({ fileName: "camps.geojson", ok: true }),
    ]);
    expect(result.current.records).toHaveLength(1);
    const record = result.current.records[0];
    expect(record.name).toBe("camps");
    expect(record.source).toBe("geojson");
    expect(record.origin).toMatchObject({ kind: "imported", filename: "camps.geojson" });
    expect(record.style.color).toMatch(/^#/);
    expect(record.featureCount).toBe(1);

    expect(result.current.visibleLayers).toHaveLength(1);
    expect(result.current.visibleLayers[0].data.features[0].properties).toEqual({
      name: "Camp",
    });
    expect(result.current.fitRequest?.layerId).toBe(record.id);
  });

  it("cycles distinct layer colors across imports", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([geojsonFile("a.geojson", -63)]));
    await act(() => result.current.importFiles([geojsonFile("b.geojson", -62)]));
    const [a, b] = result.current.records;
    expect(a.style.color).not.toBe(b.style.color);
  });

  it("reports a parse failure without adding a layer", async () => {
    const bad = new File(["{broken"], "broken.geojson");
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([bad]));
    expect(result.current.outcomes).toEqual([
      expect.objectContaining({ fileName: "broken.geojson", ok: false }),
    ]);
    expect(result.current.records).toHaveLength(0);
  });

  it("tells the user KML/GPX support is coming rather than calling the file broken", async () => {
    const kml = new File(['<?xml version="1.0"?><kml/>'], "trails.kml");
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([kml]));
    const outcome = result.current.outcomes[0];
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/later update/i);
    }
  });

  it("refuses files over the size cap without reading them", async () => {
    const big = geojsonFile("huge.geojson");
    Object.defineProperty(big, "size", { value: MAX_VECTOR_FILE_BYTES + 1 });
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([big]));
    const outcome = result.current.outcomes[0];
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/50 MB/);
    }
  });

  it("keeps the layer for the session when saving fails, with a note", async () => {
    const failingStore = {
      listVectorLayers: async () => [],
      saveVectorLayer: async () => {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this layer stays available until you close the tab.",
        );
      },
      deleteVectorLayer: async () => {},
      getGeometry: async () => null,
      getOriginalBlob: async () => null,
      putVectorLayer: async () => {},
      close: () => {},
    } as unknown as UserVectorStore;
    const { result } = renderHook(() =>
      useUserVectorLayers({ openStore: async () => failingStore }),
    );
    await act(() => result.current.importFiles([geojsonFile()]));

    const outcome = result.current.outcomes[0];
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.note).toMatch(/Storage is full/);
    }
    expect(result.current.visibleLayers).toHaveLength(1);
  });

  it("clears previous outcomes when called with no files (router contract)", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([geojsonFile()]));
    expect(result.current.outcomes).toHaveLength(1);
    await act(() => result.current.importFiles([]));
    expect(result.current.outcomes).toHaveLength(0);
  });

  it("persists enablement and honors it in visibleLayers", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([geojsonFile()]));
    const id = result.current.records[0].id;

    act(() => result.current.setEnabled(id, false));
    expect(result.current.visibleLayers).toHaveLength(0);
    expect(
      JSON.parse(localStorage.getItem("user-vector-ui-state-v1") ?? "{}")[id],
    ).toEqual({ enabled: false });

    act(() => result.current.setEnabled(id, true));
    expect(result.current.visibleLayers).toHaveLength(1);
  });

  it("loads persisted layers on mount", async () => {
    const factory = new IDBFactory();
    const first = renderHook(() => useUserVectorLayers(options(factory)));
    await act(() => first.result.current.importFiles([geojsonFile()]));
    const id = first.result.current.records[0].id;
    first.unmount();

    const second = renderHook(() => useUserVectorLayers(options(factory)));
    await waitFor(() => expect(second.result.current.records).toHaveLength(1));
    expect(second.result.current.records[0].id).toBe(id);
    await waitFor(() => expect(second.result.current.visibleLayers).toHaveLength(1));
  });

  it("removes a layer everywhere", async () => {
    const factory = new IDBFactory();
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    await act(() => result.current.importFiles([geojsonFile()]));
    const id = result.current.records[0].id;

    await act(() => result.current.removeLayer(id));
    expect(result.current.records).toHaveLength(0);
    expect(result.current.visibleLayers).toHaveLength(0);
    expect(result.current.fitRequest).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("user-vector-ui-state-v1") ?? "{}")[id],
    ).toBeUndefined();

    const store = await UserVectorStore.open(factory);
    expect(await store.listVectorLayers()).toEqual([]);
    store.close();
  });
});
