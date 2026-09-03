import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
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

  it("imports a KML file, recording its format", async () => {
    const kml = new File(
      [
        '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
          "<Placemark><name>Gate</name><Point><coordinates>-63.5,44.65</coordinates></Point></Placemark>" +
          "</Document></kml>",
      ],
      "trails.kml",
    );
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([kml]));

    expect(result.current.outcomes[0].ok).toBe(true);
    expect(result.current.records[0]).toMatchObject({
      name: "trails",
      source: "kml",
      featureCount: 1,
    });
    expect(result.current.visibleLayers[0].data.features[0].properties?.name).toBe(
      "Gate",
    );
  });

  it("imports a GPX file, recording its format", async () => {
    const gpx = new File(
      [
        '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">' +
          '<wpt lat="45.81" lon="-61.4"><name>Gate</name></wpt></gpx>',
      ],
      "walk.gpx",
    );
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([gpx]));
    expect(result.current.records[0]).toMatchObject({ name: "walk", source: "gpx" });
  });

  it("imports a KMZ archive, recording its format", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const zipped = zipSync({
      "doc.kml": strToU8(
        '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
          "<Placemark><name>Inside</name><Point><coordinates>-63,45</coordinates></Point></Placemark>" +
          "</Document></kml>",
      ),
    });
    const file = new File([zipped.buffer as ArrayBuffer], "places.kmz");
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([file]));
    expect(result.current.records[0]).toMatchObject({ name: "places", source: "kmz" });
  });

  it("imports a zipped shapefile, reprojected and recorded as such", async () => {
    const { zipSync } = await import("fflate");
    const { NAD83_UTM20N_WKT, buildPointShp } = await import(
      "./parsers/shapefileTestFixtures"
    );
    const zipped = zipSync({
      "parcels.shp": buildPointShp([{ x: 500000, y: 5000000 }]),
      "parcels.prj": new TextEncoder().encode(NAD83_UTM20N_WKT),
    });
    const file = new File([zipped.buffer as ArrayBuffer], "ns-export.zip");
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([file]));

    expect(result.current.outcomes[0].ok).toBe(true);
    expect(result.current.records[0]).toMatchObject({
      name: "parcels",
      source: "shapefile-zip",
    });
    const [lon] = (
      result.current.visibleLayers[0].data.features[0].geometry as GeoJSON.Point
    ).coordinates;
    expect(lon).toBeCloseTo(-63, 5);
  });

  it("adds one layer per shapefile when an archive holds several", async () => {
    const { zipSync } = await import("fflate");
    const { NAD83_UTM20N_WKT, buildPointShp } = await import(
      "./parsers/shapefileTestFixtures"
    );
    const prj = new TextEncoder().encode(NAD83_UTM20N_WKT);
    const zipped = zipSync({
      "roads.shp": buildPointShp([{ x: 500000, y: 5000000 }]),
      "roads.prj": prj,
      "wells.shp": buildPointShp([{ x: 600000, y: 5080000 }]),
      "wells.prj": prj,
    });
    const file = new File([zipped.buffer as ArrayBuffer], "bundle.zip");
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([file]));

    expect(result.current.records.map((r) => r.name).sort()).toEqual([
      "roads",
      "wells",
    ]);
    // Each layer is independently toggleable, so each needs its own colour.
    const colours = new Set(result.current.records.map((r) => r.style.color));
    expect(colours.size).toBe(2);
    expect(result.current.outcomes).toHaveLength(1);

    const outcome = result.current.outcomes[0];
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.note).toContain("2 layers");
      // Both layers lack a .dbf; saying so twice is noise, not information.
      const attributeNotes = outcome.note?.match(/attribute table/g) ?? [];
      expect(attributeNotes).toHaveLength(1);
    }
  });

  it("refuses a shapefile with no .prj instead of guessing its projection", async () => {
    const { zipSync } = await import("fflate");
    const { buildPointShp } = await import("./parsers/shapefileTestFixtures");
    const zipped = zipSync({
      "parcels.shp": buildPointShp([{ x: 500000, y: 5000000 }]),
    });
    const file = new File([zipped.buffer as ArrayBuffer], "no-prj.zip");
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(() => result.current.importFiles([file]));

    const outcome = result.current.outcomes[0];
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/\.prj/);
    }
    expect(result.current.records).toHaveLength(0);
  });

  it("exports a layer as GeoJSON and as KML", async () => {
    const downloads: Array<{ filename: string; blob: Blob }> = [];
    const { result } = renderHook(() =>
      useUserVectorLayers({
        ...options(),
        download: (filename, blob) => downloads.push({ filename, blob }),
      }),
    );
    await act(() => result.current.importFiles([geojsonFile("camps.geojson")]));
    const id = result.current.records[0].id;

    await act(() => result.current.exportLayer(id, "geojson"));
    expect(downloads[0].filename).toBe("camps.geojson");
    expect(JSON.parse(await downloads[0].blob.text()).features).toHaveLength(1);

    await act(() => result.current.exportLayer(id, "kml"));
    expect(downloads[1].filename).toBe("camps.kml");
    expect(await downloads[1].blob.text()).toContain("<Placemark>");
  });

  it("creates an empty drawn layer to draw into", async () => {
    const factory = new IDBFactory();
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));

    let created = "";
    await act(async () => {
      created = await result.current.createDrawnLayer();
    });

    expect(created).toBeTruthy();
    const record = result.current.records[0];
    expect(record).toMatchObject({ id: created, source: "drawn", featureCount: 0 });
    expect(record.origin).toMatchObject({ kind: "drawn" });
    expect(record.bbox).toBeNull();
    // Enabled so whatever the user draws appears immediately, and persisted
    // so an empty layer survives a reload before anything is drawn.
    expect(result.current.visibleLayers[0]?.record.id).toBe(created);

    const store = await UserVectorStore.open(factory);
    expect((await store.listVectorLayers())[0].id).toBe(created);
    store.close();
  });

  it("names each new drawn layer distinctly", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(async () => {
      await result.current.createDrawnLayer();
    });
    await act(async () => {
      await result.current.createDrawnLayer();
    });
    const names = result.current.records.map((r) => r.name);
    expect(new Set(names).size).toBe(2);
  });

  it("applies an edited record and geometry to the list", async () => {
    const factory = new IDBFactory();
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    await act(() => result.current.importFiles([geojsonFile()]));
    const original = result.current.records[0];

    const edited: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-60, 46] },
          properties: { name: "Moved" },
        },
      ],
    };
    act(() =>
      result.current.applyLayerEdit(
        { ...original, name: "Renamed", revision: 1 },
        edited,
      ),
    );

    expect(result.current.records[0].name).toBe("Renamed");
    expect(result.current.visibleLayers[0].data.features[0].properties).toEqual({
      name: "Moved",
    });
  });

  it("ignores an export request for a layer that is gone", async () => {
    const downloads: Array<{ filename: string; blob: Blob }> = [];
    const { result } = renderHook(() =>
      useUserVectorLayers({
        ...options(),
        download: (filename, blob) => downloads.push({ filename, blob }),
      }),
    );
    await act(() => result.current.exportLayer("missing", "geojson"));
    expect(downloads).toHaveLength(0);
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

describe("drawn-layer persistence retry", () => {
  it("creates the row on the next edit write after a failed initial save, then reports real failures", async () => {
    // The store's putVectorLayer is deliberately an UPDATE-only guarded
    // write (an absent row means another tab deleted the layer), so a
    // drawing whose INITIAL save failed used to no-op on every later edit:
    // it looked fine all session and vanished with the tab.
    const factory = new IDBFactory();
    let failNextSave = true;
    const realOpen = () => UserVectorStore.open(factory);
    const openStore = async () => {
      const opened = await realOpen();
      return new Proxy(opened, {
        get(target, property, receiver) {
          if (property === "saveVectorLayer" && failNextSave) {
            return async () => {
              failNextSave = false;
              throw new Error("save blocked");
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
    };
    const { result } = renderHook(() => useUserVectorLayers({ openStore }));

    let drawnId = "";
    await act(async () => {
      drawnId = await result.current.createDrawnLayer();
    });
    const record = result.current.records.find(({ id }) => id === drawnId)!;
    expect(record).toBeDefined();

    // First edit write: takes the CREATE path, which now succeeds.
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          id: "f1",
          geometry: { type: "Point" as const, coordinates: [-63, 45] },
          properties: {},
        },
      ],
    };
    await act(async () => {
      await result.current.putVectorLayer(record, collection);
    });

    // The row genuinely exists now: a fresh mount over the same factory
    // loads the drawing back, which the silent no-op never achieved.
    const remounted = renderHook(() => useUserVectorLayers({ openStore }));
    await waitFor(() =>
      expect(
        remounted.result.current.records.some(({ id }) => id === drawnId),
      ).toBe(true),
    );
  });
});

describe("field-capture append", () => {
  function markFeature(id: string): GeoJSON.Feature {
    return {
      type: "Feature",
      id,
      geometry: { type: "Point", coordinates: [-60.91, 46.12] },
      properties: {
        "nsmts:capturedAt": "2026-08-28T14:05:00.000Z",
        "nsmts:accuracyM": 7.4,
      },
    };
  }

  it("creates the Field notes layer once and reuses it, even in one tick", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    let first = "";
    let second = "";
    await act(async () => {
      // Both calls inside one act: the reuse must not depend on a re-render
      // having refreshed the records snapshot in between.
      first = await result.current.ensureFieldNotesLayer();
      second = await result.current.ensureFieldNotesLayer();
    });
    expect(second).toBe(first);
    const record = result.current.records.find(({ id }) => id === first);
    expect(record?.name).toBe("Field notes");
    expect(record?.origin.kind).toBe("drawn");
  });

  it("appends to a just-created layer, stamps modifiedAt, and persists", async () => {
    const factory = new IDBFactory();
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    await act(async () => {
      const id = await result.current.ensureFieldNotesLayer();
      const advanced = await result.current.appendFeatures(id, [
        markFeature("mark-1"),
      ]);
      expect(advanced?.record.featureCount).toBe(1);
      expect(advanced?.record.revision).toBe(1);
      expect(advanced?.record.modifiedAt).toBeTruthy();
      expect(advanced?.record.bbox).toEqual([-60.91, 46.12, -60.91, 46.12]);
      // It reached the device, so the caller may call it saved.
      expect(advanced?.persisted).toBe(true);
    });

    const visible = result.current.visibleLayers.find(
      ({ record }) => record.name === "Field notes",
    );
    expect(visible?.data.features.map(({ id }) => id)).toEqual(["mark-1"]);

    const store = await UserVectorStore.open(factory);
    const listed = await store.listVectorLayers();
    expect(listed).toHaveLength(1);
    expect(listed[0].featureCount).toBe(1);
  });

  it("chains marks within one tick without losing the earlier one", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    await act(async () => {
      const id = await result.current.ensureFieldNotesLayer();
      await result.current.appendFeatures(id, [markFeature("mark-1")]);
      await result.current.appendFeatures(id, [markFeature("mark-2")]);
    });
    const layer = result.current.visibleLayers.find(
      ({ record }) => record.name === "Field notes",
    );
    expect(layer?.data.features.map(({ id }) => id)).toEqual([
      "mark-1",
      "mark-2",
    ]);
    expect(layer?.record.revision).toBe(2);
  });

  it("says a point that could not be written is not saved", async () => {
    const factory = new IDBFactory();
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    let outcome: unknown = "sentinel";
    await act(async () => {
      const id = await result.current.ensureFieldNotesLayer();
      // The device refuses the write: quota, private mode, a closed store.
      // An existing layer takes the put path; the create path is for a
      // drawing whose first save failed.
      const putVectorLayer = vi
        .spyOn(UserVectorStore.prototype, "putVectorLayer")
        .mockRejectedValue(new Error("quota"));
      outcome = await result.current.appendFeatures(id, [markFeature("mark-1")]);
      putVectorLayer.mockRestore();
    });
    expect(outcome).toMatchObject({ persisted: false });
    // The feature is still on the map for this session.
    const layer = result.current.visibleLayers.find(
      ({ record }) => record.name === "Field notes",
    );
    expect(layer?.data.features.map(({ id }) => id)).toEqual(["mark-1"]);
    expect(result.current.storageError).toContain("until you close the tab");
  });

  it("returns null when appending to a layer that is gone", async () => {
    const { result } = renderHook(() => useUserVectorLayers(options()));
    let advanced: unknown = "sentinel";
    await act(async () => {
      advanced = await result.current.appendFeatures("missing", [
        markFeature("mark-1"),
      ]);
    });
    expect(advanced).toBeNull();
  });
});

describe("recorded layers", () => {
  it("saves a recording as a new layer with the raw GPX as its original", async () => {
    const factory = new IDBFactory();
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "track-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [-61, 46],
              [-61, 46.001],
            ],
          },
          properties: { name: "Boundary walk" },
        },
      ],
    };
    let created: unknown;
    await act(async () => {
      created = await result.current.createRecordedLayer({
        name: "Boundary walk",
        collection,
        rawGpx: new Blob(["<gpx/>"], { type: "application/gpx+xml" }),
        startedAt: "2026-08-29T14:00:00.000Z",
        endedAt: "2026-08-29T14:20:00.000Z",
      });
    });

    const record = result.current.records.find(
      ({ name }) => name === "Boundary walk",
    );
    expect(record).toBeDefined();
    expect(record?.source).toBe("recorded");
    expect(record?.origin).toEqual({
      kind: "recorded",
      startedAt: "2026-08-29T14:00:00.000Z",
      endedAt: "2026-08-29T14:20:00.000Z",
    });
    expect(record?.featureCount).toBe(1);
    expect(created).toEqual(record);
    expect(
      result.current.visibleLayers.some(
        ({ record: visible }) => visible.id === record?.id,
      ),
    ).toBe(true);

    const store = await UserVectorStore.open(factory);
    const listed = await store.listVectorLayers();
    expect(listed).toHaveLength(1);
    const original = await store.getOriginalBlob(listed[0].id);
    expect(original).not.toBeNull();
    expect(await original?.text()).toBe("<gpx/>");
  });
});

describe("GPX export", () => {
  it("exports a layer as GPX through the shared download seam", async () => {
    const downloads: Array<{ filename: string; blob: Blob }> = [];
    const { result } = renderHook(() =>
      useUserVectorLayers({
        ...options(),
        download: (filename, blob) => downloads.push({ filename, blob }),
      }),
    );
    await act(() => result.current.importFiles([geojsonFile("camps.geojson")]));
    const id = result.current.records[0].id;

    await act(() => result.current.exportLayer(id, "gpx"));
    expect(downloads[0].filename).toBe("camps.gpx");
    const gpx = await downloads[0].blob.text();
    expect(gpx).toContain('creator="NS Marks The Spot"');
    expect(gpx).toContain("<wpt ");
  });

  it("downloads a recorded layer's raw GPX original", async () => {
    const downloads: Array<{ filename: string; blob: Blob }> = [];
    const { result } = renderHook(() =>
      useUserVectorLayers({
        ...options(),
        download: (filename, blob) => downloads.push({ filename, blob }),
      }),
    );
    let id = "";
    await act(async () => {
      const record = await result.current.createRecordedLayer({
        name: "Boundary walk",
        collection: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "track-1",
              geometry: {
                type: "LineString",
                coordinates: [
                  [-61, 46],
                  [-61, 46.001],
                ],
              },
              properties: {},
            },
          ],
        },
        rawGpx: new Blob(["<gpx>raw</gpx>"], { type: "application/gpx+xml" }),
        startedAt: "2026-08-29T14:00:00.000Z",
        endedAt: "2026-08-29T14:20:00.000Z",
      });
      id = record.id;
    });

    await act(() => result.current.exportRawRecording(id));
    expect(downloads[0].filename).toBe("Boundary walk (raw).gpx");
    expect(await downloads[0].blob.text()).toBe("<gpx>raw</gpx>");
    expect(result.current.storageError).toBeNull();
  });

  it("reports a missing raw recording distinctly instead of downloading", async () => {
    const downloads: Array<{ filename: string; blob: Blob }> = [];
    const { result } = renderHook(() =>
      useUserVectorLayers({
        ...options(),
        download: (filename, blob) => downloads.push({ filename, blob }),
      }),
    );
    // A drawn layer has no original file, standing in for a recorded layer
    // whose original save failed.
    let id = "";
    await act(async () => {
      id = await result.current.createDrawnLayer();
    });
    await act(() => result.current.exportRawRecording(id));
    expect(downloads).toHaveLength(0);
    expect(result.current.storageError).toMatch(/raw recording/i);
  });
});

describe("photo cleanup", () => {
  it("removing a layer removes its photo rows and blobs", async () => {
    const factory = new IDBFactory();
    const { UserPhotoStore } = await import("./photos/photoStore");
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    await act(() => result.current.importFiles([geojsonFile("camps.geojson")]));
    const layerId = result.current.records[0].id;

    const photos = await UserPhotoStore.open(factory);
    await photos.savePhoto(
      {
        id: "photo-1",
        layerId,
        addedAt: "2026-08-30T00:00:00.000Z",
        width: 10,
        height: 10,
        fullBytes: 1,
        thumbBytes: 1,
      },
      new Blob(["full"], { type: "image/jpeg" }),
      new Blob(["thumb"], { type: "image/jpeg" }),
    );

    await act(() => result.current.removeLayer(layerId));
    expect(await photos.listLayerPhotos(layerId)).toHaveLength(0);
    expect(await photos.getFullBlob("photo-1")).toBeNull();
  });

  it("the session write path sweeps rows no descriptor references", async () => {
    const factory = new IDBFactory();
    const { UserPhotoStore } = await import("./photos/photoStore");
    const { result } = renderHook(() => useUserVectorLayers(options(factory)));
    await act(() => result.current.importFiles([geojsonFile("camps.geojson")]));
    const layerId = result.current.records[0].id;
    const record = result.current.records[0];

    const photos = await UserPhotoStore.open(factory);
    for (const id of ["referenced", "orphan"]) {
      await photos.savePhoto(
        {
          id,
          layerId,
          addedAt: "2026-08-30T00:00:00.000Z",
          width: 10,
          height: 10,
          fullBytes: 1,
          thumbBytes: 1,
        },
        new Blob(["full"], { type: "image/jpeg" }),
        new Blob(["thumb"], { type: "image/jpeg" }),
      );
    }

    await act(() =>
      result.current.putVectorLayer(record, {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "f1",
            geometry: { type: "Point", coordinates: [-63.5, 44.5] },
            properties: {
              "nsmts:photos": [{ id: "referenced", width: 10, height: 10 }],
            },
          },
        ],
      }),
    );
    // The sweep is fire-and-forget behind the put; give it a beat.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    const remaining = await photos.listLayerPhotos(layerId);
    expect(remaining.map(({ id }) => id)).toEqual(["referenced"]);
  });
});
