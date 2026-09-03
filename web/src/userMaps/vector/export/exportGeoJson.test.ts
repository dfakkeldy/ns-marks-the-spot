import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { geojsonExportBlob } from "./exportGeoJson";
import { parseGeoJson } from "../parsers/geojsonSource";

const COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "f1",
      geometry: { type: "Point", coordinates: [-63.5, 44.65] },
      properties: { name: "Pin", description: "A & B <c>" },
    },
  ],
};

describe("geojsonExportBlob", () => {
  it("exports with the GeoJSON media type", () => {
    expect(geojsonExportBlob(COLLECTION).type).toBe("application/geo+json");
  });

  it("round-trips back through the GeoJSON reader unchanged", async () => {
    const text = await geojsonExportBlob(COLLECTION).text();
    const reparsed = parseGeoJson(text);
    expect(reparsed.featureCount).toBe(1);
    expect(reparsed.collection.features[0].properties).toEqual({
      name: "Pin",
      description: "A & B <c>",
    });
    expect(reparsed.collection.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [-63.5, 44.65],
    });
    expect(reparsed.collection.features[0].id).toBe("f1");
  });

  it("pretty-prints so an exported file stays human-readable", async () => {
    expect(await geojsonExportBlob(COLLECTION).text()).toContain("\n");
  });
});

describe("traced provenance", () => {
  it("adds the foreign member when any feature was parcel-traced", async () => {
    const blob = geojsonExportBlob({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "traced",
          geometry: { type: "LineString", coordinates: [[-61, 46], [-61, 46.001]] },
          properties: { "nsmts:traced": "nsprd-parcel" },
        },
      ],
    });
    const parsed = JSON.parse(await blob.text()) as Record<string, unknown>;
    const note = parsed["nsmts:provenance"];
    expect(typeof note).toBe("string");
    expect(note).toContain("Traced boundaries are not a survey.");
    expect(note).toContain("Province of Nova Scotia");
  });

  // An imported file can carry its own "nsmts:traced" with any value. Only
  // the one the spec declares means a vertex came off an NSPRD boundary, and
  // anything else would put the Province's attribution on an export it had
  // nothing to do with.
  it("does not claim NSPRD provenance for another file's traced value", async () => {
    for (const traced of [false, null, "manual", 1]) {
      const blob = geojsonExportBlob({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "imported",
            geometry: { type: "LineString", coordinates: [[-61, 46], [-61, 46.001]] },
            properties: { "nsmts:traced": traced },
          },
        ],
      });
      const parsed = JSON.parse(await blob.text()) as Record<string, unknown>;
      expect(parsed["nsmts:provenance"], `traced: ${String(traced)}`).toBeUndefined();
    }
  });

  it("stays absent when nothing was traced", async () => {
    const blob = geojsonExportBlob({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "plain",
          geometry: { type: "Point", coordinates: [-61, 46] },
          properties: { name: "Gate" },
        },
      ],
    });
    const parsed = JSON.parse(await blob.text()) as Record<string, unknown>;
    expect(parsed["nsmts:provenance"]).toBeUndefined();
  });
});
