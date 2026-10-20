import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { biodiversityLayers } from "./biodiversityLayers";

describe("biodiversity source contracts", () => {
  it("keeps proposed habitat, identified provincial habitat, critical habitat and ranges distinct", () => {
    const ids = biodiversityLayers.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("ns-sar-core-habitat");
    expect(ids).toContain("eccc-critical-habitat-area");
    expect(ids).toContain("eccc-proposed-critical-habitat-area");
    expect(ids).toContain("dfo-aquatic-critical-habitat");
    expect(ids).toContain("dfo-aquatic-sar-range");
    expect(ids).toContain("ebar-generalized-species-ranges");
    expect(ids).toContain("canadian-national-wetlands-inventory");
    for (const layer of biodiversityLayers) {
      if (layer.id === "canadian-national-wetlands-inventory") {
        expect(layer.exportOptions.layers).toBe("show:1");
        expect(layer.minZoom).toBeGreaterThanOrEqual(13);
        expect(layer.legend).toHaveLength(8);
        continue;
      }
      expect(layer.delivery).toBe("feature-query");
      expect(layer.sourceUrl).toMatch(/^https:\/\//);
      expect(layer.licenceUrl).toMatch(/^https:\/\//);
      expect(layer.outFields).toContain(layer.idField);
    }
  });

  it("ships the audited provincewide public polygon package with source identities", () => {
    const snapshot = JSON.parse(readFileSync(resolve("public/ecology/ns-core-habitat.geojson"), "utf8"));
    expect(snapshot.sourcePublished).toBe("2026-01-30");
    expect(snapshot.displaySimplificationMetres).toBe(20);
    expect(snapshot.features).toHaveLength(3660);
    expect(new Set(snapshot.features.map((feature: { properties: { OBJECTID: number } }) => feature.properties.OBJECTID)).size).toBe(3660);
    expect(snapshot.features.every((feature: { geometry: { type: string }; properties: Record<string, unknown> }) =>
      ["Polygon", "MultiPolygon"].includes(feature.geometry.type)
      && feature.properties.Status === "Identified"
      && typeof feature.properties.CommName === "string"
      && typeof feature.properties.Year === "number"
      && typeof feature.properties.RDoc === "string",
    )).toBe(true);
    const publishedNames = new Set(snapshot.features.map((feature: { properties: { CommName: string } }) => feature.properties.CommName));
    expect(publishedNames.has("Blanding's Turtle")).toBe(false);
    expect(publishedNames.has("Wood Turtle")).toBe(false);
    expect(publishedNames.has("Black Ash")).toBe(false);
  });
});
