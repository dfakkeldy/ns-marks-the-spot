import { describe, expect, it } from "vitest";
import pilot from "./invernessHydroPotential.json";

describe("Inverness hydro terrain-potential pilot data", () => {
  it("contains point-screen reaches whose width input can grow downstream", () => {
    expect(pilot.type).toBe("FeatureCollection");
    expect(pilot.metadata.watershedCount).toBeGreaterThanOrEqual(10);
    expect(pilot.features.length).toBeGreaterThan(pilot.metadata.watershedCount);

    for (const feature of pilot.features) {
      expect(feature.geometry.type).toBe("MultiLineString");
      expect(feature.geometry.coordinates.length).toBeGreaterThan(0);
      expect(feature.properties.watershedName).not.toHaveLength(0);
      expect(["tertiary", "tertiary/sub-tertiary"]).toContain(
        feature.properties.catchmentResolution,
      );
      expect(feature.properties.upstreamAreaKm2).toBeGreaterThan(0);
      expect([
        "not-qualified",
        "low",
        "moderate",
        "high",
        "very-high",
      ]).toContain(
        feature.properties.potentialClass,
      );
    }

    const featuresByWatershed = new Map<string, typeof pilot.features>();
    for (const feature of pilot.features) {
      const code = feature.properties.watershedCode;
      featuresByWatershed.set(code, [
        ...(featuresByWatershed.get(code) ?? []),
        feature,
      ]);
    }
    const areaRanges = [...featuresByWatershed.values()].map((features) => {
      const areas = features.map((feature) => feature.properties.upstreamAreaKm2);
      expect(areas.every((area, index) => index === 0 || area >= areas[index - 1]))
        .toBe(true);
      return Math.max(...areas) - Math.min(...areas);
    });
    expect(areaRanges.some((range) => range > 0)).toBe(true);
  });

  it("identifies the official catchment resolution and bounded drop search", () => {
    expect(pilot.metadata.secondaryWatershedDataset).toBe("ynkv-x6rx");
    expect(pilot.metadata.catchmentDatasets).toEqual({
      tertiary: "6htv-yzkm",
      subTertiary: "s4r5-2srh",
    });
    expect(pilot.metadata.minimumCatchmentCoverage).toBe(0.9);
    expect(pilot.metadata.nshnLayers).toEqual([9, 11]);
    expect(pilot.metadata.dropThresholdsMetres).toEqual([10, 25, 50]);
    expect(pilot.metadata.maxDownstreamDistanceKm).toBe(10);
    expect(pilot.metadata.method).toContain("tertiary catchment");
    expect(pilot.metadata.method).toContain("downstream");
    expect(pilot.metadata.limitations).toContain("catchment-resolution");
    expect(pilot.metadata.limitations).toContain("Not measured flow");
    expect(pilot.metadata.limitations).toContain("power");
    expect(
      pilot.features.some(
        (feature) =>
          feature.properties.catchmentResolution === "tertiary/sub-tertiary",
      ),
    ).toBe(true);
  });

  it("retains raw inputs for both qualified and flatter downstream reaches", () => {
    const qualified = pilot.features.find(
      (feature) => feature.properties.potentialClass !== "not-qualified",
    );
    const flatter = pilot.features.find(
      (feature) => feature.properties.potentialClass === "not-qualified",
    );

    expect(qualified?.properties.dropThresholdMetres).toBeGreaterThanOrEqual(10);
    expect(qualified?.properties.downstreamRouteLengthKm).toBeGreaterThan(0);
    expect(qualified?.properties.averageMappedFallMetresPerKm).toBeGreaterThan(0);
    expect(flatter?.properties.dropThresholdMetres).toBeNull();
    expect(flatter?.properties.downstreamRouteLengthKm).toBeNull();
  });
});
