import { describe, expect, it } from "vitest";
import {
  calculateHydroTerrainMetrics,
  hydroLineStyle,
  potentialClassForPercentile,
} from "./hydroPotential";

describe("Inverness hydro terrain-potential calculations", () => {
  it("derives average fall and a transparent dimensionless screening value", () => {
    const metrics = calculateHydroTerrainMetrics({
      drainageAreaKm2: 24,
      elevationDropMetres: 180,
      mainFlowLengthKm: 12,
    });

    expect(metrics.averageFallMetresPerKm).toBe(15);
    expect(metrics.screeningValue).toBeCloseTo(Math.log1p(24) * 15, 8);
  });

  it("increases when either drainage area or average fall increases", () => {
    const baseline = calculateHydroTerrainMetrics({
      drainageAreaKm2: 10,
      elevationDropMetres: 100,
      mainFlowLengthKm: 10,
    });
    const largerArea = calculateHydroTerrainMetrics({
      drainageAreaKm2: 100,
      elevationDropMetres: 100,
      mainFlowLengthKm: 10,
    });
    const steeper = calculateHydroTerrainMetrics({
      drainageAreaKm2: 10,
      elevationDropMetres: 200,
      mainFlowLengthKm: 10,
    });

    expect(largerArea.screeningValue).toBeGreaterThan(baseline.screeningValue);
    expect(steeper.screeningValue).toBeGreaterThan(baseline.screeningValue);
  });

  it("rejects zero or negative source measurements", () => {
    expect(() =>
      calculateHydroTerrainMetrics({
        drainageAreaKm2: 10,
        elevationDropMetres: 0,
        mainFlowLengthKm: 4,
      }),
    ).toThrow("positive");
  });

  it("assigns the four relative pilot classes by percentile", () => {
    expect(potentialClassForPercentile(0)).toBe("low");
    expect(potentialClassForPercentile(0.249)).toBe("low");
    expect(potentialClassForPercentile(0.25)).toBe("moderate");
    expect(potentialClassForPercentile(0.5)).toBe("high");
    expect(potentialClassForPercentile(0.75)).toBe("very-high");
    expect(potentialClassForPercentile(1)).toBe("very-high");
  });

  it("uses drainage area for line width and potential class for colour", () => {
    const small = hydroLineStyle({
      drainageAreaKm2: 5,
      potentialClass: "high",
    });
    const large = hydroLineStyle({
      drainageAreaKm2: 500,
      potentialClass: "high",
    });
    const differentPotential = hydroLineStyle({
      drainageAreaKm2: 5,
      potentialClass: "low",
    });

    expect(Number(large.weight)).toBeGreaterThan(Number(small.weight));
    expect(large.color).toBe(small.color);
    expect(differentPotential.color).not.toBe(small.color);
  });
});
