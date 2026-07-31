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
