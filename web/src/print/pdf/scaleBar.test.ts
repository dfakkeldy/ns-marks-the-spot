import { describe, expect, it } from "vitest";
import { buildScaleBar } from "./scaleBar";
import { portraitTemplate } from "./templates/portrait";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const frame = portraitTemplate.mapFrame;

describe("buildScaleBar", () => {
  it("picks a 1/2/5 round length that fits maxWidth", () => {
    const bar = buildScaleBar(bounds, frame, 128);
    const mantissa = bar.metres / 10 ** Math.floor(Math.log10(bar.metres));
    expect([1, 2, 5]).toContain(mantissa);
    expect(bar.widthPoints).toBeGreaterThan(0);
    expect(bar.widthPoints).toBeLessThanOrEqual(128);
  });

  it("labels metres below 1 km and kilometres above", () => {
    expect(buildScaleBar(bounds, frame, 128).label).toMatch(/^\d+(\.\d+)? (m|km)$/u);
  });

  it("computes a plausible denominator for a ~23 km wide frame", () => {
    // 0.3° of longitude at 46.1°N ≈ 23.2 km across 556 pt (≈ 0.196 m).
    const bar = buildScaleBar(bounds, frame, 128);
    expect(bar.denominator).toBeGreaterThan(100_000);
    expect(bar.denominator).toBeLessThan(140_000);
    expect(bar.denominatorLabel).toMatch(/^≈ 1:\d{1,3}(,\d{3})*$/u);
  });

  it("scales the bar width consistently with the denominator", () => {
    const bar = buildScaleBar(bounds, frame, 128);
    // widthPoints * metres-per-point must reproduce bar.metres.
    const metresPerPoint = bar.denominator * (0.0254 / 72);
    expect(bar.widthPoints * metresPerPoint).toBeCloseTo(bar.metres, 6);
  });
});
