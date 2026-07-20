import { describe, expect, it } from "vitest";
import pilot from "./invernessHydroPotential.json";

describe("Inverness hydro terrain-potential pilot data", () => {
  it("contains named watersheds with the three transparent source measurements", () => {
    expect(pilot.type).toBe("FeatureCollection");
    expect(pilot.features.length).toBeGreaterThanOrEqual(15);

    for (const feature of pilot.features) {
      expect(feature.geometry.type).toBe("MultiLineString");
      expect(feature.geometry.coordinates.length).toBeGreaterThan(0);
      expect(feature.properties.watershedName).not.toHaveLength(0);
      expect(feature.properties.drainageAreaKm2).toBeGreaterThan(0);
      expect(feature.properties.elevationDropMetres).toBeGreaterThan(0);
      expect(feature.properties.mainFlowLengthKm).toBeGreaterThan(0);
      expect(feature.properties.averageFallMetresPerKm).toBeGreaterThan(0);
      expect(["low", "moderate", "high", "very-high"]).toContain(
        feature.properties.potentialClass,
      );
    }
  });

  it("identifies the exact source layers and excludes flow and power claims", () => {
    expect(pilot.metadata.watershedDataset).toBe("ynkv-x6rx");
    expect(pilot.metadata.nshnLayers).toEqual([9, 11]);
    expect(pilot.metadata.method).toContain("longest connected route");
    expect(pilot.metadata.limitations).toContain("Not measured flow");
    expect(pilot.metadata.limitations).toContain("power");
  });
});
