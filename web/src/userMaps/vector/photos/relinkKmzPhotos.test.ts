import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { Feature, FeatureCollection } from "geojson";
import type { ProcessedPhoto } from "./photoPipeline";
import { UserPhotoStore } from "./photoStore";
import { relinkKmzPhotos } from "./relinkKmzPhotos";
import { readPhotoDescriptors } from "./types";

const processed: ProcessedPhoto = {
  full: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  thumb: new Blob([new Uint8Array([4])], { type: "image/jpeg" }),
  width: 100,
  height: 80,
};

function kmzFeature(
  photos: Array<Record<string, unknown>>,
  description?: string,
): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-63.5, 44.65] },
    properties: {
      name: "Site",
      ...(description ? { description } : {}),
      // KMZ ExtendedData values arrive as strings from togeojson.
      "nsmts:photos": JSON.stringify(photos),
    },
  };
}

function collectionOf(...features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("relinkKmzPhotos", () => {
  it("re-mints ids, persists rows, and strips the viewer img appendix", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    const result = await relinkKmzPhotos({
      layerId: "layer-1",
      collection: collectionOf(
        kmzFeature(
          [
            {
              id: "old-id",
              href: "files/OLD-ID.jpg",
              capturedAt: "2026-08-01T09:00:00Z",
              sourceName: "IMG_0042.jpg",
            },
          ],
          'Rusted through\n\n<img src="files/OLD-ID.jpg" width="400"/>',
        ),
      ),
      // Archive keys are lowercased by parseKmzWithAssets.
      assets: new Map([["files/old-id.jpg", new Uint8Array([9, 9, 9])]]),
      store,
      process: async () => processed,
    });

    expect(result).toMatchObject({
      linked: 1,
      missingFromArchive: 0,
      undecodable: 0,
      capped: 0,
    });
    const properties = result.collection.features[0].properties as Record<
      string,
      unknown
    >;
    const [descriptor] = readPhotoDescriptors(properties);
    expect(descriptor.id).not.toBe("old-id");
    expect(descriptor.href).toBeUndefined();
    expect(descriptor.capturedAt).toBe("2026-08-01T09:00:00Z");
    expect(descriptor.sourceName).toBe("IMG_0042.jpg");
    expect(descriptor.width).toBe(100);
    expect(properties.description).toBe("Rusted through");
    expect(await store.getFullBlob(descriptor.id)).not.toBeNull();
  });

  it("keeps missing-from-archive distinct and deletes emptied properties", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    const result = await relinkKmzPhotos({
      layerId: "layer-1",
      collection: collectionOf(
        kmzFeature(
          [{ id: "lost", href: "files/lost.jpg" }],
          '<img src="files/lost.jpg" width="400"/>',
        ),
      ),
      assets: new Map(),
      store,
      process: async () => processed,
    });

    expect(result).toMatchObject({ linked: 0, missingFromArchive: 1 });
    const properties = result.collection.features[0].properties as Record<
      string,
      unknown
    >;
    expect(properties["nsmts:photos"]).toBeUndefined();
    // The description held only the appendix, so it goes too rather than
    // leaving an empty attribute behind.
    expect(properties.description).toBeUndefined();
  });

  it("counts failed decodes as undecodable, not missing", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    const result = await relinkKmzPhotos({
      layerId: "layer-1",
      collection: collectionOf(kmzFeature([{ id: "bad", href: "files/bad.jpg" }])),
      assets: new Map([["files/bad.jpg", new Uint8Array([0])]]),
      store,
      process: vi.fn(async () => {
        throw new Error("not an image");
      }),
    });

    expect(result).toMatchObject({
      linked: 0,
      missingFromArchive: 0,
      undecodable: 1,
    });
  });

  it("enforces the per-feature cap as its own distinct count", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    const photos = Array.from({ length: 21 }, (_, index) => ({
      id: `p${index}`,
      href: `files/p${index}.jpg`,
    }));
    const assets = new Map(
      photos.map(({ id }) => [`files/${id}.jpg`, new Uint8Array([1])]),
    );
    const result = await relinkKmzPhotos({
      layerId: "layer-1",
      collection: collectionOf(kmzFeature(photos)),
      assets,
      store,
      process: async () => processed,
    });

    expect(result).toMatchObject({ linked: 20, capped: 1, undecodable: 0 });
    expect(
      readPhotoDescriptors(result.collection.features[0].properties),
    ).toHaveLength(20);
  });

  it("passes features without photo descriptors through untouched", async () => {
    const store = await UserPhotoStore.open(new IDBFactory());
    const feature: Feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-63.5, 44.65] },
      properties: { name: "Plain", note: "no photos here" },
    };
    const result = await relinkKmzPhotos({
      layerId: "layer-1",
      collection: collectionOf(feature),
      assets: new Map([["files/x.jpg", new Uint8Array([1])]]),
      store,
      process: async () => processed,
    });
    expect(result.collection.features[0]).toBe(feature);
    expect(result.linked).toBe(0);
  });
});
