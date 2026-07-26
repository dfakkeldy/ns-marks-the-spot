import { describe, expect, it } from "vitest";
import type { Gcp } from "../types";
import { argmax, BENT, OUTLIER_FIXTURE } from "../testFixtures";
import { solveAffineFromGcps, type AffineParams } from "./affine";
import { conditionRatio, MIN_CONDITION_RATIO } from "./conditioning";
import { residualMetresFor } from "./residuals";
import { applyTps, solveTps } from "./tps";
import { fromMercator, groundMetresBetween, toMercator } from "./webMercator";

describe("solveTps", () => {
  it("passes EXACTLY through every control point — the defining property", () => {
    const result = solveTps(BENT);
    expect(result).toEqual({ ok: true, params: expect.anything() });
    if (!result.ok) return;
    for (const gcp of BENT) {
      const got = applyTps(result.params, gcp.pixel.x, gcp.pixel.y);
      const want = toMercator(gcp.map);
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
    }
  });

  it("names each refusal reason distinctly", () => {
    expect(solveTps(BENT.slice(0, 2))).toEqual({ ok: false, reason: "too-few-points" });

    expect(solveTps([...BENT.slice(0, 3), {
      id: "dup", pixel: { ...BENT[0].pixel }, map: { lat: 45.5, lng: -62.0 },
    }])).toEqual({ ok: false, reason: "coincident-points" });

    const line = (pts: number[][]) => solveTps(pts.map(([x,y],i) => ({
      id: `l${i}`, pixel: {x,y}, map: { lat: 46 + y/20000, lng: -61 + x/20000 },
    })));
    for (const pts of [
      [[100,100],[400,400],[900,900]],
      [[100,100],[400,250],[900,500]],
      [[100,300],[500,300],[1200,300]],
    ]) {
      expect(line(pts)).toEqual({ ok: false, reason: "ill-conditioned" });
    }
    expect(line([[100,100],[400,251],[700,399],[1100,602],[1500,798]]))
      .toEqual({ ok: false, reason: "ill-conditioned" });
  });

  it("refuses a thin SCAN cloud on the source alone, exactly as solveAffine does", () => {
    // The case the fixtures above cannot express. They derive each destination
    // FROM its pixel, so their map cloud is degenerate in the same way their
    // scan cloud is, and EITHER half of the conditioning gate would refuse
    // them — measured: deleting the source-side check leaves all four still
    // refused, by the destination-side one.
    //
    // Here the road is thin on the scan while the map points are a healthy
    // spread, so only the SOURCE check can refuse it. It must, because
    // solveAffine refuses the identical points: the two solvers have to agree
    // about which clicks are usable, or switching a map's method changes
    // whether it can be draped at all.
    const road = [[100,100],[400,251],[700,399],[1100,602],[1500,798]];
    const gcps: Gcp[] = road.map(([x, y], index) => ({
      id: `r${index}`,
      pixel: { x, y },
      map: BENT[index].map,
    }));
    expect(conditionRatio(gcps.map((g) => g.pixel))).toBeLessThan(MIN_CONDITION_RATIO);
    expect(conditionRatio(gcps.map((g) => toMercator(g.map)))).toBeGreaterThan(0.3);
    expect(solveAffineFromGcps(gcps)).toBeNull();
    expect(solveTps(gcps)).toEqual({ ok: false, reason: "ill-conditioned" });
  });

  it("refuses a non-finite destination rather than returning unusable params", () => {
    // affine.ts:158 guards this explicitly; TPS must too. A healthy source
    // triangle with one NaN destination otherwise solves to garbage.
    const poisoned = [...BENT.slice(0, 3)];
    poisoned[1] = { ...poisoned[1], map: { lat: Number.NaN, lng: poisoned[1].map.lng } };
    expect(solveTps(poisoned)).toEqual({ ok: false, reason: "non-finite" });
  });

  it("refuses a collapsed DESTINATION even when the scan points are healthy", () => {
    // Three well-spread scan points mapped down one meridian. The source cloud
    // is fine, so the conditioning gate passes; without a destination check this
    // solves to a zero-area drape. affine.ts refuses it via MIN_ANISOTROPY_RATIO.
    const meridian: Gcp[] = [
      { id: "a", pixel: { x: 100, y: 100 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "b", pixel: { x: 900, y: 150 }, map: { lat: 46.2, lng: -61.0 } },
      { id: "c", pixel: { x: 400, y: 800 }, map: { lat: 46.4, lng: -61.0 } },
    ];
    const result = solveTps(meridian);
    expect(result.ok).toBe(false);
  });
});

describe("OUTLIER_FIXTURE", () => {
  it("really does split the affine ranking from the TPS leave-one-out ranking", () => {
    // Pins the fixture rather than the solver. A later task asserts that the
    // suspect row is chosen by the AFFINE fit residual even while a TPS warp is
    // displayed, and that assertion is vacuous on any fixture where the two
    // rankings happen to agree. If this test ever fails, the fixture has
    // drifted and that later assertion has quietly stopped proving anything —
    // re-measure the fixture, do not relax this.
    const affine = residualMetresFor(
      solveAffineFromGcps(OUTLIER_FIXTURE) as AffineParams,
      OUTLIER_FIXTURE,
    );
    const leaveOneOut = OUTLIER_FIXTURE.map((held, index) => {
      const rest = OUTLIER_FIXTURE.filter((_, other) => other !== index);
      const refit = solveTps(rest);
      expect(refit.ok).toBe(true);
      if (!refit.ok) return Number.NaN;
      const predicted = fromMercator(
        applyTps(refit.params, held.pixel.x, held.pixel.y),
      );
      return groundMetresBetween(predicted, held.map);
    });

    // Index 4 is the point that was actually displaced, 700 m west.
    expect(argmax(affine)).toBe(4);
    expect(argmax(leaveOneOut)).toBe(5);
    expect(argmax(affine)).not.toBe(argmax(leaveOneOut));
  });
});
