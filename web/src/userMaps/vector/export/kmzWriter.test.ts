import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { buildKmzBlob } from "./kmzWriter";

function pointWithPhotos(
  name: string,
  photos: Array<Record<string, unknown>> | null,
  description?: string,
): FeatureCollection["features"][number] {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-63.5, 44.65] },
    properties: {
      name,
      ...(description ? { description } : {}),
      ...(photos ? { "nsmts:photos": photos } : {}),
    },
  };
}

async function unzip(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("buildKmzBlob", () => {
  it("writes doc.kml plus one stored jpg per attached photo", async () => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        pointWithPhotos(
          "Culvert",
          [{ id: "p1", capturedAt: "2026-08-29T10:00:00Z", width: 100, height: 80 }],
          "Rusted through",
        ),
      ],
    };
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const result = buildKmzBlob("Field", collection, new Map([["p1", bytes]]));

    expect(result.photosEmbedded).toBe(1);
    expect(result.photosMissing).toBe(0);
    const entries = await unzip(result.blob);
    expect(Object.keys(entries).sort()).toEqual(["doc.kml", "files/p1.jpg"]);
    expect(Array.from(entries["files/p1.jpg"])).toEqual(Array.from(bytes));

    const doc = strFromU8(entries["doc.kml"]);
    // The ExtendedData descriptor is the KMZ form: internal fields plus href.
    expect(doc).toContain('"href":"files/p1.jpg"');
    expect(doc).toContain('"capturedAt":"2026-08-29T10:00:00Z"');
    // The description keeps the user's text and appends the viewer img tag.
    expect(doc).toContain("Rusted through");
    expect(doc).toContain('<img src="files/p1.jpg" width="400"/>');
  });

  it("drops descriptors whose bytes are unavailable and reports the count", async () => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        pointWithPhotos("Gate", [{ id: "p2" }, { id: "gone" }]),
      ],
    };
    const result = buildKmzBlob(
      "Field",
      collection,
      new Map([["p2", new Uint8Array([9, 9])]]),
    );

    expect(result.photosEmbedded).toBe(1);
    expect(result.photosMissing).toBe(1);
    const entries = await unzip(result.blob);
    expect(Object.keys(entries).sort()).toEqual(["doc.kml", "files/p2.jpg"]);
    // No dangling reference anywhere in the document: not in ExtendedData,
    // not as an img tag.
    const doc = strFromU8(entries["doc.kml"]);
    expect(doc).not.toContain("gone");
    expect(doc).toContain('"href":"files/p2.jpg"');
  });

  it("removes the photos property entirely when no photo on a feature resolves", async () => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [pointWithPhotos("Bare", [{ id: "gone" }])],
    };
    const result = buildKmzBlob("Field", collection, new Map());

    expect(result.photosEmbedded).toBe(0);
    expect(result.photosMissing).toBe(1);
    const entries = await unzip(result.blob);
    expect(Object.keys(entries)).toEqual(["doc.kml"]);
    expect(strFromU8(entries["doc.kml"])).not.toContain("nsmts:photos");
  });

  it("exports a photo-free layer as a plain single-entry KMZ", async () => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [pointWithPhotos("Plain", null)],
    };
    const result = buildKmzBlob("Field", collection, new Map());

    expect(result.photosEmbedded).toBe(0);
    expect(result.photosMissing).toBe(0);
    const entries = await unzip(result.blob);
    expect(Object.keys(entries)).toEqual(["doc.kml"]);
    expect(strFromU8(entries["doc.kml"])).toContain("Plain");
  });
});
