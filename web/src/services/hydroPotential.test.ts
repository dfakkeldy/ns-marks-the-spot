import { describe, expect, it } from "vitest";
import {
  calculateHydroTerrainMetrics,
  hydroLineStyle,
  potentialClassForPercentile,
} from "./hydroPotential";

describe("Inverness hydro terrain-potential calculations", () => {
  it("derives average fall and a transparent dimensionless screening value", () => {
    const metrics = calculateHydroTerrainMetrics({
      upstreamAreaKm2: 24,
      dropThresholdMetres: 25,
      downstreamRouteLengthKm: 1.25,
    });

    expect(metrics.averageFallMetresPerKm).toBe(20);
    expect(metrics.screeningValue).toBeCloseTo(Math.log1p(24) * 20, 8);
  });

  it("increases when either drainage area or average fall increases", () => {
    const baseline = calculateHydroTerrainMetrics({
      upstreamAreaKm2: 10,
      dropThresholdMetres: 10,
      downstreamRouteLengthKm: 1,
    });
    const largerArea = calculateHydroTerrainMetrics({
      upstreamAreaKm2: 100,
      dropThresholdMetres: 10,
      downstreamRouteLengthKm: 1,
    });
    const steeper = calculateHydroTerrainMetrics({
      upstreamAreaKm2: 10,
      dropThresholdMetres: 25,
      downstreamRouteLengthKm: 1,
    });

    expect(largerArea.screeningValue).toBeGreaterThan(baseline.screeningValue);
    expect(steeper.screeningValue).toBeGreaterThan(baseline.screeningValue);
  });

  it("rejects zero or negative source measurements", () => {
    expect(() =>
      calculateHydroTerrainMetrics({
        upstreamAreaKm2: 10,
        dropThresholdMetres: 0,
        downstreamRouteLengthKm: 4,
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
      upstreamAreaKm2: 5,
      potentialClass: "high",
    });
    const large = hydroLineStyle({
      upstreamAreaKm2: 500,
      potentialClass: "high",
    });
    const differentPotential = hydroLineStyle({
      upstreamAreaKm2: 5,
      potentialClass: "low",
    });
    const flatterReach = hydroLineStyle({
      upstreamAreaKm2: 500,
      potentialClass: "not-qualified",
    });

    expect(Number(large.weight)).toBeGreaterThan(Number(small.weight));
    expect(large.color).toBe(small.color);
    expect(differentPotential.color).not.toBe(small.color);
    expect(flatterReach.color).not.toBe(large.color);
  });
});
