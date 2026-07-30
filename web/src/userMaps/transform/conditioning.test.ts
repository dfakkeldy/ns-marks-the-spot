import { describe, expect, it } from "vitest";
import { BENT } from "../testFixtures";
import { conditionRatio, MIN_CONDITION_RATIO } from "./conditioning";

describe("conditionRatio", () => {
  it("scores a healthy scattered cloud above the refusal threshold", () => {
    expect(conditionRatio(BENT.map((g) => g.pixel))).toBeGreaterThan(0.3);
  });

  it("scores a road with 2px scatter BELOW the threshold", () => {
    // Measured: affine refuses this at 2.166e-3 while an unconditioned TPS
    // accepts it, and a 1px nudge then moves a drape corner 12.2 km.
    const road = [[100,100],[400,251],[700,399],[1100,602],[1500,798]].map(([x,y]) => ({x,y}));
    expect(conditionRatio(road)).toBeCloseTo(2.166e-3, 5);
    expect(conditionRatio(road)).toBeLessThan(MIN_CONDITION_RATIO);
  });

  it("scores an exactly collinear cloud at zero, at THREE orientations", () => {
    // One angle is not enough. At 45 degrees xs[i] and ys[i] are bit-identical,
    // the arithmetic cancels exactly, and a pivot-only check refuses by luck.
    // The OBLIQUE case is the one that escapes it. Measured.
    const line = (pts: number[][]) => conditionRatio(pts.map(([x,y]) => ({x,y})));
    expect(line([[100,100],[400,400],[900,900]])).toBe(0);   // 45 deg
    expect(line([[100,100],[400,250],[900,500]])).toBe(0);   // oblique
    expect(line([[100,300],[500,300],[1200,300]])).toBe(0);  // horizontal
  });
});
