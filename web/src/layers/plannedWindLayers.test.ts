import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "./contextLayerCatalog";
import { PLANNED_WIND_COVERAGE, plannedWindLayers } from "./plannedWindLayers";

type Turbine = {
  id: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
};
const file = JSON.parse(readFileSync("public/wind/planned-turbines.geojson", "utf8")) as { notice: string; features: Turbine[] };
const [layer] = plannedWindLayers;

describe("planned wind turbines", () => {
  it("keeps the layer's caveat and the file's notice identical", () => {
    expect(layer.webCaveat).toBe(file.notice);
  });

  it("places every turbine in Nova Scotia, once, with its published coordinates and source", () => {
    const ids = file.features.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { id, geometry, properties } of file.features) {
      expect(properties.id, id).toBe(id);
      expect(geometry.type, id).toBe("Point");
      const [longitude, latitude] = geometry.coordinates;
      expect(longitude, id).toBeGreaterThan(PLANNED_WIND_COVERAGE.west);
      expect(longitude, id).toBeLessThan(PLANNED_WIND_COVERAGE.east);
      expect(latitude, id).toBeGreaterThan(PLANNED_WIND_COVERAGE.south);
      expect(latitude, id).toBeLessThan(PLANNED_WIND_COVERAGE.north);
      // A turbine number is null where the filing gives none, never invented.
      expect(properties.turbine === null || typeof properties.turbine === "string", id).toBe(true);
      for (const field of ["project", "status", "coords_as_published", "source", "source_locator"]) {
        expect(typeof properties[field], `${id}.${field}`).toBe("string");
        expect(String(properties[field]).length, `${id}.${field}`).toBeGreaterThan(0);
      }
      expect(String(properties.source_url), id).toMatch(/^https:\/\//u);
    }
  });

  it("leaves alternate sites out, so no layout is counted twice", () => {
    expect(file.features.filter(({ properties }) => /^(alternate|unclear)/iu.test(String(properties.layout_role)))).toEqual([]);
  });

  it("is a public-facts layer compiled by the project, drawn hollow because nothing stands yet", () => {
    expect(layer.licence).toBe("public-facts");
    expect(layer.provenance).toBe("project-derived");
    expect(layer.featureRenderer.defaultStyle.marker).toEqual({ glyph: "turbine", hollow: true });
    expect(contextLayerCatalog.some(({ id }) => id === "planned-wind-turbines")).toBe(true);
  });
});
