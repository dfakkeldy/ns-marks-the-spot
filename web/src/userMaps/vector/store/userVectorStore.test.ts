import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { UserMapStore } from "../../store/userMapStore";
import type { UserVectorLayerRecord } from "../types";
import { UserVectorStore } from "./userVectorStore";

function record(id: string, createdAt: string): UserVectorLayerRecord {
  return {
    id,
    name: `Layer ${id}`,
    source: "geojson",
    origin: { kind: "imported", filename: `${id}.geojson`, importedAt: createdAt },
    createdAt,
    revision: 0,
    style: { color: "#c2410c" },
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

describe("UserVectorStore", () => {
  let factory: IDBFactory;
  let store: UserVectorStore;

  beforeEach(async () => {
    factory = new IDBFactory();
    store = await UserVectorStore.open(factory);
  });

  it("round-trips a record with its geometry", async () => {
    await store.saveVectorLayer(record("a", "2026-07-30T00:00:00.000Z"), collection());
    const listed = await store.listVectorLayers();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Layer a");

    const geometry = await store.getGeometry("a");
    expect(geometry?.features[0].properties).toEqual({ name: "Camp" });
  });

  it("keeps the original imported file for provenance", async () => {
    const original = new Blob(['{"type":"FeatureCollection"}'], {
      type: "application/geo+json",
    });
    await store.saveVectorLayer(record("a", "2026-07-30T00:00:00.000Z"), collection(), original);
    expect(await (await store.getOriginalBlob("a"))?.text()).toBe(
      '{"type":"FeatureCollection"}',
    );
  });

  it("returns null geometry and original for unknown ids", async () => {
    expect(await store.getGeometry("missing")).toBeNull();
    expect(await store.getOriginalBlob("missing")).toBeNull();
  });

  it("lists layers oldest-first by createdAt", async () => {
    await store.saveVectorLayer(record("b", "2026-07-30T02:00:00.000Z"), collection());
    await store.saveVectorLayer(record("a", "2026-07-30T01:00:00.000Z"), collection());
    expect((await store.listVectorLayers()).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("deletes a layer with its geometry and original blobs", async () => {
    await store.saveVectorLayer(
      record("a", "2026-07-30T00:00:00.000Z"),
      collection(),
      new Blob(["src"]),
    );
    await store.deleteVectorLayer("a");
    expect(await store.listVectorLayers()).toEqual([]);
    expect(await store.getGeometry("a")).toBeNull();
    expect(await store.getOriginalBlob("a")).toBeNull();
  });

  it("updates via putVectorLayer without resurrecting a deleted layer", async () => {
    const rec = record("a", "2026-07-30T00:00:00.000Z");
    await store.saveVectorLayer(rec, collection());
    await store.deleteVectorLayer("a");
    // The guarded put must see the deleted row and no-op (two-tab race).
    await store.putVectorLayer({ ...rec, revision: 1 }, collection());
    expect(await store.listVectorLayers()).toEqual([]);
    expect(await store.getGeometry("a")).toBeNull();
  });

  it("putVectorLayer updates the record and geometry when the layer exists", async () => {
    const rec = record("a", "2026-07-30T00:00:00.000Z");
    await store.saveVectorLayer(rec, collection());
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
    await store.putVectorLayer({ ...rec, revision: 1 }, edited);
    const listed = await store.listVectorLayers();
    expect(listed[0].revision).toBe(1);
    expect((await store.getGeometry("a"))?.features[0].properties).toEqual({
      name: "Moved",
    });
  });

  it("shares the database with UserMapStore without version conflicts", async () => {
    await store.saveVectorLayer(record("a", "2026-07-30T00:00:00.000Z"), collection());
    const maps = await UserMapStore.open(factory);
    expect(await maps.listUserMaps()).toEqual([]);
    expect((await store.listVectorLayers())[0].id).toBe("a");
    maps.close();
  });
});
