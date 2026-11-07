import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "./contextLayerCatalog";
import { PLANNED_WIND_COVERAGE, windFilingLayers } from "./plannedWindLayers";

type Turbine = {
  id: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
};
type TurbineFile = { notice: string; features: Turbine[] };
const read = (name: string) => JSON.parse(readFileSync(`public/wind/${name}`, "utf8")) as TurbineFile;
const planned = read("planned-turbines.geojson");
const installed = read("installed-since-2018.geojson");
const [plannedLayer, installedLayer] = windFilingLayers;
const files = [
  { name: "planned", layer: plannedLayer, file: planned },
  { name: "installed since 2018", layer: installedLayer, file: installed },
] as const;

describe.each(files)("$name wind turbines", ({ layer, file }) => {
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

  it("leaves alternate and dropped sites out, so no layout is counted twice", () => {
    expect(file.features.filter(({ properties }) => /^(alternate|unclear|dropped)/iu.test(String(properties.layout_role)))).toEqual([]);
  });

  it("is a public-facts layer compiled by the project", () => {
    expect(layer.licence).toBe("public-facts");
    expect(layer.provenance).toBe("project-derived");
    expect(contextLayerCatalog.some(({ id }) => id === layer.id)).toBe(true);
  });
});

describe("wind turbines from EA filings", () => {
  it("draws planned turbines hollow, because none is operating yet, and built ones filled", () => {
    expect(plannedLayer.featureRenderer.defaultStyle.marker).toEqual({ glyph: "turbine", hollow: true });
    expect(installedLayer.featureRenderer.defaultStyle.marker).toEqual({ glyph: "turbine" });
    expect(planned.features.some(({ properties }) => /^Operating/u.test(String(properties.status)))).toBe(false);
    expect(installed.features.every(({ properties }) => /operat/iu.test(String(properties.status)))).toBe(true);
  });

  it("keeps approvals that may have lapsed off the map", () => {
    const projects = new Set(planned.features.map(({ properties }) => String(properties.project)));
    for (const lapsed of ["Bear Lake Wind Power Project", "Kmtnuk Wind Power Project"]) expect(projects.has(lapsed), lapsed).toBe(false);
  });

  it("puts each position in one file only", () => {
    const plannedIds = new Set(planned.features.map(({ id }) => id));
    expect(installed.features.filter(({ id }) => plannedIds.has(id))).toEqual([]);
  });

  it("says how each built turbine was checked against imagery", () => {
    for (const { id, properties } of installed.features) {
      expect(String(properties.layout_role), id).toMatch(/\(Sentinel-2\)$/u);
    }
  });
});
