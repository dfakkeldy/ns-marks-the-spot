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
