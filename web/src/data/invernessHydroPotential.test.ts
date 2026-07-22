import { describe, expect, it } from "vitest";
import pilot from "./invernessHydroPotential.json";

describe("Inverness micro-hydro screening pilot data", () => {
  it("contains connected tributary reaches whose width input can grow downstream", () => {
    expect(pilot.type).toBe("FeatureCollection");
    expect(pilot.metadata.watershedCount).toBeGreaterThanOrEqual(10);
    expect(pilot.features.length).toBeGreaterThan(535);
    expect(pilot.metadata.tributaryReachCount).toBeGreaterThan(0);

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
        "below-1kw",
        "kw-1-5",
        "kw-5-15",
        "kw-15-30",
        "kw-30-50",
        "over-50kw",
      ]).toContain(
        feature.properties.potentialClass,
      );
    }
    expect(pilot.metadata.method).toContain("connected tributary network");
  });

  it("identifies the official catchment resolution and bounded drop search", () => {
    expect(pilot.metadata.secondaryWatershedDataset).toBe("ynkv-x6rx");
    expect(pilot.metadata.catchmentDatasets).toEqual({
      tertiary: "6htv-yzkm",
      subTertiary: "s4r5-2srh",
    });
    expect(pilot.metadata.minimumCatchmentCoverage).toBe(0.9);
    expect(pilot.metadata.nshnLayers).toEqual([9, 11]);
    expect(pilot.metadata.dropThresholdsMetres).toEqual([5, 10, 20, 30]);
    expect(pilot.metadata.maxDownstreamDistanceKm).toBe(3);
    expect(pilot.metadata.nominalSpecificDischargeLitresPerSecondPerKm2).toBe(8);
    expect(pilot.metadata.nominalSystemEfficiency).toBe(0.6);
    expect(pilot.metadata.nominalPowerBandKw).toEqual([1, 50]);
    expect(pilot.metadata.method).toContain("tertiary catchment");
    expect(pilot.metadata.method).toContain("downstream");
    expect(pilot.metadata.limitations).toContain("catchment-resolution");
    expect(pilot.metadata.limitations).toContain("not measured flow");
    expect(pilot.metadata.limitations).toContain("not predicted production");
    expect(
      pilot.features.some(
        (feature) =>
          feature.properties.catchmentResolution === "tertiary/sub-tertiary",
      ),
    ).toBe(true);
  });

  it("retains raw inputs for both 1 to 50 kW-scale and flatter reaches", () => {
    const qualified = pilot.features.find(
      (feature) => [
        "kw-1-5",
        "kw-5-15",
        "kw-15-30",
        "kw-30-50",
      ].includes(feature.properties.potentialClass),
    );
    const flatter = pilot.features.find(
      (feature) => feature.properties.potentialClass === "not-qualified",
    );

    expect(qualified?.properties.dropThresholdMetres).toBeGreaterThanOrEqual(5);
    expect(qualified?.properties.downstreamRouteLengthKm).toBeGreaterThan(0);
    expect(qualified?.properties.averageMappedFallMetresPerKm).toBeGreaterThan(0);
    expect(qualified?.properties.nominalFlowLitresPerSecond).toBeGreaterThan(0);
    expect(qualified?.properties.indicativePowerKw).toBeGreaterThanOrEqual(1);
    expect(qualified?.properties.indicativePowerKw).toBeLessThanOrEqual(50);
    expect(flatter?.properties.dropThresholdMetres).toBeNull();
    expect(flatter?.properties.downstreamRouteLengthKm).toBeNull();
  });
});
