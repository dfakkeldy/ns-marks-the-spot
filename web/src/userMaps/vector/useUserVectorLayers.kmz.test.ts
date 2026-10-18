import { IDBFactory } from "fake-indexeddb";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { ProcessedPhoto } from "./photos/photoPipeline";
import { UserPhotoStore } from "./photos/photoStore";
import { readPhotoDescriptors } from "./photos/types";
import { UserVectorStore } from "./store/userVectorStore";
import { useUserVectorLayers, type BulkPhotoEntry } from "./useUserVectorLayers";

/**
 * The whole W9 interchange loop through the real hook: bulk EXIF placement
 * creates a photo layer, KMZ export embeds the stored bytes, and importing
 * that same KMZ re-links the photos under fresh ids. Photo processing is
 * injected because jsdom has no image decoder; everything else — sniffing,
 * archive classification, the photo store, the vector store — is real.
 */

const processed: ProcessedPhoto = {
  full: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7])], {
    type: "image/jpeg",
  }),
  thumb: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
  width: 120,
  height: 90,
};

function harness(factory = new IDBFactory()) {
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  const options = {
    openStore: () => UserVectorStore.open(factory),
    openPhotoStore: () => UserPhotoStore.open(factory),
    processPhoto: async () => processed,
    download: (filename: string, blob: Blob) => {
      downloads.push({ filename, blob });
    },
  };
  return { factory, downloads, options };
}

function entry(name: string, lon: number, capturedAt: string | null = null): BulkPhotoEntry {
  return {
    file: new File([new Uint8Array([1, 2])], name, { type: "image/jpeg" }),
    gps: { lon, lat: 44.6 },
    capturedAt,
  };
}

describe("useUserVectorLayers KMZ interchange", () => {
  it("creates a photo layer from bulk entries with provenance and stored photos", async () => {
    const { factory, options } = harness();
    const { result } = renderHook(() => useUserVectorLayers(options));

    let outcome: { id: string | null; notes: string[] } = { id: null, notes: [] };
    await act(async () => {
      outcome = await result.current.createPhotoLayer([
        entry("IMG_0001.jpg", -63.5, "2026-08-20T12:00:00Z"),
        entry("IMG_0002.jpg", -63.6),
      ]);
    });

    expect(outcome.id).not.toBeNull();
    expect(outcome.notes).toEqual([]);
    const record = result.current.records[0];
    expect(record.source).toBe("photos");
    expect(record.origin).toMatchObject({ kind: "photo-import", count: 2 });
    expect(record.featureCount).toBe(2);
    expect(result.current.fitRequest?.layerId).toBe(record.id);

    const [layer] = result.current.visibleLayers;
    const [first] = layer.data.features;
    expect(first.geometry).toEqual({
      type: "Point",
      coordinates: [-63.5, 44.6],
    });
    expect(first.properties?.name).toBe("IMG_0001");
    const [descriptor] = readPhotoDescriptors(first.properties);
    expect(descriptor.capturedAt).toBe("2026-08-20T12:00:00Z");
    expect(descriptor.sourceName).toBe("IMG_0001.jpg");

    const photos = await UserPhotoStore.open(factory);
    expect(await photos.getFullBlob(descriptor.id)).not.toBeNull();
  });

  it("still creates the point, with a note, when a photo fails processing", async () => {
    const { options } = harness();
    const { result } = renderHook(() =>
      useUserVectorLayers({
        ...options,
        processPhoto: async () => {
          throw new Error("decode failed");
        },
      }),
    );

    let outcome: { id: string | null; notes: string[] } = { id: null, notes: [] };
    await act(async () => {
      outcome = await result.current.createPhotoLayer([entry("IMG_0009.jpg", -63.4)]);
    });

    expect(outcome.id).not.toBeNull();
    expect(outcome.notes).toEqual([
      expect.stringContaining("IMG_0009.jpg"),
    ]);
    const [layer] = result.current.visibleLayers;
    const [feature] = layer.data.features;
    expect(feature.geometry).toEqual({
      type: "Point",
      coordinates: [-63.4, 44.6],
    });
    expect(readPhotoDescriptors(feature.properties)).toHaveLength(0);
  });

  it("round-trips photos through KMZ export and import with re-minted ids", async () => {
    const { factory, downloads, options } = harness();
    const { result } = renderHook(() => useUserVectorLayers(options));

    await act(async () => {
      await result.current.createPhotoLayer([
        entry("IMG_0042.jpg", -63.5, "2026-08-20T12:00:00Z"),
      ]);
    });
    const sourceRecord = result.current.records[0];
    const [sourceDescriptor] = readPhotoDescriptors(
      result.current.visibleLayers[0].data.features[0].properties,
    );

    await act(async () => {
      await result.current.exportLayer(sourceRecord.id, "kmz");
    });
    expect(result.current.storageError).toBeNull();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe(`${sourceRecord.name}.kmz`);

    const zipped = new Uint8Array(await downloads[0].blob.arrayBuffer());
    const entries = unzipSync(zipped);
    expect(Object.keys(entries).sort()).toEqual([
      "doc.kml",
      `files/${sourceDescriptor.id}.jpg`,
    ]);
    expect(strFromU8(entries["doc.kml"])).toContain(
      `files/${sourceDescriptor.id}.jpg`,
    );

    // Import the very file that was just exported.
    await act(async () => {
      await result.current.importFiles([
        new File([zipped as BlobPart], "roundtrip.kmz", {
          type: "application/vnd.google-earth.kmz",
        }),
      ]);
    });

    expect(result.current.outcomes).toEqual([
      { fileName: "roundtrip.kmz", ok: true, id: expect.any(String) },
    ]);
    expect(result.current.records).toHaveLength(2);
    const imported = result.current.records.find(({ id }) => id !== sourceRecord.id)!;
    expect(imported.source).toBe("kmz");

    const importedData = result.current.visibleLayers.find(
      ({ record }) => record.id === imported.id,
    )!.data;
    const [relinked] = readPhotoDescriptors(importedData.features[0].properties);
    expect(relinked.id).not.toBe(sourceDescriptor.id);
    expect(relinked.href).toBeUndefined();
    expect(relinked.capturedAt).toBe("2026-08-20T12:00:00Z");
    // The viewer img appendix never becomes a user attribute.
    const properties = importedData.features[0].properties as Record<string, unknown>;
    expect(String(properties.description ?? "")).not.toContain("<img");

    const photos = await UserPhotoStore.open(factory);
    expect(await photos.getFullBlob(relinked.id)).not.toBeNull();
  });

  it("notes photos missing from the archive instead of failing the import", async () => {
    const { downloads, options } = harness();
    const { result } = renderHook(() => useUserVectorLayers(options));

    await act(async () => {
      await result.current.createPhotoLayer([entry("IMG_0050.jpg", -63.5)]);
    });
    await act(async () => {
      await result.current.exportLayer(result.current.records[0].id, "kmz");
    });
    const entries = unzipSync(new Uint8Array(await downloads[0].blob.arrayBuffer()));
    // A KMZ that references a photo the archive no longer holds.
    const { zipSync } = await import("fflate");
    const docOnly = zipSync({ "doc.kml": entries["doc.kml"] });

    await act(async () => {
      await result.current.importFiles([
        new File([docOnly as BlobPart], "stripped.kmz"),
      ]);
    });

    expect(result.current.outcomes).toEqual([
      expect.objectContaining({
        fileName: "stripped.kmz",
        ok: true,
        note: expect.stringContaining("missing from the archive"),
      }),
    ]);
    const imported = result.current.records.find(
      ({ source }) => source === "kmz",
    )!;
    const importedData = result.current.visibleLayers.find(
      ({ record }) => record.id === imported.id,
    )!.data;
    expect(readPhotoDescriptors(importedData.features[0].properties)).toHaveLength(0);
  });
});
