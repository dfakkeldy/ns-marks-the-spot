import { describe, expect, it } from "vitest";
import type { Gcp } from "../types";
import { applyAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import {
  MAX_GCPS_FOR_TPS_RESIDUALS,
  MIN_GCPS_FOR_SUSPECT,
  MIN_GCPS_FOR_TPS_SUSPECT,
  residualMetresFor,
  residualReport,
  rmsMetres,
  tpsResidualReport,
} from "./residuals";
import {
  argmax,
  BENT,
  nudgeGcpEast,
  OUTLIER_FIXTURE,
} from "../testFixtures";
import { EARTH_RADIUS_METRES, fromMercator } from "./webMercator";

const TRUTH: AffineParams = [3.5, -1.25, -6790000, 0.75, 4.5, 5780000];

const PIXELS = [
  { x: 0, y: 0 },
  { x: 4096, y: 0 },
  { x: 0, y: 3072 },
  { x: 4096, y: 3072 },
  { x: 1000, y: 2000 },
];

function exactGcps(pixels = PIXELS): Gcp[] {
  return pixels.map((pixel, index) => ({
    id: `g${index}`,
    pixel,
    map: fromMercator(applyAffine(TRUTH, pixel.x, pixel.y)),
  }));
}

/** Moves a GCP's map position east by a known number of GROUND metres. */
function nudgeEast(gcp: Gcp, groundMetres: number): Gcp {
  const degrees =
    groundMetres /
    (EARTH_RADIUS_METRES *
      Math.cos((gcp.map.lat * Math.PI) / 180) *
      (Math.PI / 180));
  return { ...gcp, map: { lat: gcp.map.lat, lng: gcp.map.lng + degrees } };
}

function fit(gcps: Gcp[]): AffineParams {
  return solveAffineFromGcps(gcps) as AffineParams;
}

describe("residualMetresFor", () => {
  it("is zero when every point sits exactly on the transform", () => {
    for (const metres of residualMetresFor(TRUTH, exactGcps())) {
      expect(metres).toBeCloseTo(0, 6);
    }
  });

  it("reports GROUND metres, not the inflated Mercator magnitude", () => {
    // The single most important assertion in this module. A point displaced
    // 100 m east at ~46N is 143.96 Mercator metres away; reporting that
    // figure would overstate the error by 44%.
    const [base] = exactGcps([{ x: 1000, y: 2000 }]);
    const displaced = nudgeEast(base, 100);
    const [metres] = residualMetresFor(TRUTH, [displaced]);
    expect(metres).toBeCloseTo(100, 3);
    expect(metres).not.toBeCloseTo(143.96, 1);
  });
});

describe("rmsMetres", () => {
  it("is the root mean square, not the mean", () => {
    // mean would be 5; RMS of 3,4,5,6,7 is sqrt(27) = 5.196...
    expect(rmsMetres([3, 4, 5, 6, 7])).toBeCloseTo(Math.sqrt(27), 9);
  });

  it("is zero for an empty list", () => {
    expect(rmsMetres([])).toBe(0);
  });
});

describe("residualReport", () => {
  it("is null below four points, because three fit exactly by construction", () => {
    const gcps = exactGcps(PIXELS.slice(0, 3));
    expect(residualReport(gcps, fit(gcps))).toBeNull();
  });

  it("reports an RMS at four points but accuses nobody", () => {
    const gcps = exactGcps(PIXELS.slice(0, 4));
    gcps[3] = nudgeEast(gcps[3], 600);
    const report = residualReport(gcps, fit(gcps));
    expect(report).not.toBeNull();
    expect(report?.rmsMetres).toBeGreaterThan(1);
    expect(report?.mostInconsistentIndex).toBeNull();
  });

  it("would accuse the same point at four whoever is actually wrong", () => {
    // This is the WHY behind the test above, and it is the whole argument for
    // the five-point floor. Four points fitting three parameters leave a
    // one-dimensional residual space, so every residual vector is a multiple
    // of one direction fixed by the pixel LAYOUT. Displacing a different point
    // rescales that vector; it cannot rotate it. The largest residual is
    // therefore a property of where the user clicked, carrying no information
    // about which click was wrong.
    //
    // (An earlier version of this file justified the floor with "every hat
    // leverage is exactly 0.75". That is true only for the symmetric fixture —
    // a scalene layout gives [0.871, 0.954, 0.918, 0.258] — so it proved the
    // claim for one rectangle rather than in general. The argument below needs
    // no symmetry, which is why it replaced it.)
    for (const layout of [
      PIXELS.slice(0, 4),
      [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 0, y: 3000 },
        { x: 1000, y: 1000 },
      ],
      [
        { x: 120, y: 90 },
        { x: 3900, y: 300 },
        { x: 700, y: 2900 },
        { x: 2100, y: 1500 },
      ],
    ]) {
      const shapes = layout.map((_, displaced) => {
        const gcps = exactGcps(layout);
        gcps[displaced] = nudgeEast(gcps[displaced], 600);
        const { metresPerGcp } = residualReport(gcps, fit(gcps)) as NonNullable<
          ReturnType<typeof residualReport>
        >;
        const total = metresPerGcp.reduce((sum, m) => sum + m, 0);
        return metresPerGcp.map((m) => (m / total).toFixed(4)).join(",");
      });
      // One distinct normalised residual pattern across all four displacements
      // means the pattern never depended on the displacement at all.
      expect(new Set(shapes).size, JSON.stringify(shapes)).toBe(1);
    }
  });

  it("names the worst-fitting point from five", () => {
    expect(MIN_GCPS_FOR_SUSPECT).toBe(5);
    const gcps = exactGcps();
    gcps[4] = nudgeEast(gcps[4], 600);
    const report = residualReport(gcps, fit(gcps));
    const { metresPerGcp, mostInconsistentIndex } = report as NonNullable<
      typeof report
    >;
    // Asserts the point that was ACTUALLY displaced, not merely the argmax of
    // the returned array — comparing the report against itself would pass even
    // if the wrong point were named.
    expect(mostInconsistentIndex).toBe(4);
    expect(metresPerGcp[4]).toBeGreaterThan(100);
  });

  it("reports a non-zero RMS once a point disagrees", () => {
    const gcps = exactGcps();
    gcps[3] = nudgeEast(gcps[3], 600);
    expect(
      (residualReport(gcps, fit(gcps)) as NonNullable<ReturnType<typeof residualReport>>)
        .rmsMetres,
    ).toBeGreaterThan(1);
  });

  it("keeps RMS at zero when every point agrees", () => {
    const gcps = exactGcps();
    expect(
      (residualReport(gcps, fit(gcps)) as NonNullable<ReturnType<typeof residualReport>>)
        .rmsMetres,
    ).toBeCloseTo(0, 6);
  });
});

/**
 * A deterministic, well-conditioned irregular control set of any size, for the
 * cost-cap boundary only. A golden-angle spiral so no two points share a row,
 * a column or a spacing — a lattice would be nearly affine by construction and
 * would make every leave-one-out figure meaninglessly small.
 */
function irregularGcps(count: number): Gcp[] {
  return Array.from({ length: count }, (_, index) => {
    const radius = Math.sqrt((index + 0.5) / count);
    const angle = index * 2.399963229728653;
    const x = 2000 + 1800 * radius * Math.cos(angle);
    const y = 1500 + 1300 * radius * Math.sin(angle);
    return {
      id: `i${index}`,
      pixel: { x, y },
      map: {
        lat: 46.2 + y / 30000 + Math.sin(x / 900) * 0.002,
        lng: -61.6 + x / 20000 + Math.cos(y / 700) * 0.002,
      },
    };
  });
}

describe("tpsResidualReport", () => {
  it("reports one NON-ZERO error per point, unlike the TPS fit residual", () => {
    const report = tpsResidualReport(BENT);
    expect(report).not.toBeNull();
    // Length pinned: an empty array would satisfy a bare for-loop, and GcpList
    // indexes metresPerGcp for every row (GcpList.tsx:111) — it would render NaN.
    expect(report!.metresPerGcp).toHaveLength(BENT.length);
    for (const metres of report!.metresPerGcp) {
      // A METRE, not zero. `> 0` is the obvious assertion and it is very nearly
      // vacuous: mutation-tested, swapping the leave-one-out refit for a
      // full-set solve — the exact regression this test exists to catch — left
      // every value at 5.5e-10 to 2.1e-9 m rather than at 0, because an
      // interpolating spline hits its control points to floating-point noise
      // and not to a hard zero. That mutation SURVIVED `> 0`. BENT's real
      // leave-one-out errors are 108-592 m (measured, all eight), so a
      // one-metre floor has a hundredfold margin over the signal and nine
      // orders of magnitude over the noise.
      expect(metres).toBeGreaterThan(1);
    }
  });

  it("reports GROUND metres, not the 1.4396x-inflated Mercator figure", () => {
    // The expected value comes from a displacement WE choose. An earlier draft
    // asserted `rms < rms * 1.4396 * 0.75`, i.e. `rms < rms * 1.0797` — true for
    // any positive value, so it passed against raw Mercator metres.
    //
    // The fixture is the EXACTLY-AFFINE set, not BENT, and the assertion is on
    // the displaced point rather than on the maximum. Both changes are forced
    // by measurement, and the plan's draft of this test could not have passed:
    //
    //  - BENT's own leave-one-out errors are 108-592 m before anything is
    //    nudged (measured, all eight points), because a spline fitted to seven
    //    points genuinely cannot predict the eighth on a bent survey. A 100 m
    //    nudge therefore does not become the maximum — `max` over
    //    `nudgeGcpEast(BENT, 2, 100)` is 555.9 m, which is untouched b1's
    //    baseline, and the displaced point's own figure moves 257.8 -> 222.7
    //    because the nudge happens to point back towards the prediction.
    //  - On a set that lies exactly on an affine map the spline through the
    //    other points IS that affine (its bending weights solve to zero;
    //    measured leave-one-out 1.1e-9 m), so the held-out prediction lands on
    //    the truth and the displaced point's error is the nudge itself, to
    //    every digit that matters. That is what makes the 100 EXTERNALLY known.
    //  - Even here `max` would be the wrong handle: displacing one point bends
    //    the refits that still contain it, so its five neighbours pick up
    //    4.6-126.1 m of their own. Index the point that was actually moved.
    const displaced = nudgeGcpEast(exactGcps(), 4, 100); // ONE point, 100 ground m
    const worst = tpsResidualReport(displaced)!.metresPerGcp[4];
    expect(worst).toBeCloseTo(100, 3);
    expect(worst).not.toBeCloseTo(143.96, 1); // the Mercator figure
  });

  it("brackets the point-count floor from BOTH sides", () => {
    // A single assertion at 3 points cannot distinguish the guard from its
    // absence: with `< MIN_GCPS_FOR_TPS` the loop still runs, the inner solve on
    // 2 points refuses, and the function returns null anyway.
    expect(tpsResidualReport(BENT.slice(0, 3))).toBeNull();
    // `.not.toBeNull()` would accept `undefined`; assert the shape instead.
    expect(tpsResidualReport(BENT.slice(0, 4))!.metresPerGcp).toHaveLength(4);
  });

  it("ranks the suspect by the AFFINE fit residual, not by the LOO magnitude", () => {
    const report = tpsResidualReport(OUTLIER_FIXTURE)!;
    const affineRanked = argmax(
      residualMetresFor(solveAffineFromGcps(OUTLIER_FIXTURE)!, OUTLIER_FIXTURE),
    );
    expect(report.mostInconsistentIndex).toBe(affineRanked);
    expect(report.mostInconsistentIndex).not.toBe(argmax(report.metresPerGcp));
  });

  it("accuses nobody below five points, on the independently measured floor", () => {
    expect(MIN_GCPS_FOR_TPS_SUSPECT).toBe(5);
    expect(tpsResidualReport(BENT.slice(0, 4))!.mostInconsistentIndex).toBeNull();
    expect(
      tpsResidualReport(BENT.slice(0, 5))!.mostInconsistentIndex,
    ).not.toBeNull();
  });

  it("brackets the cost cap from BOTH sides, and never truncates the array", () => {
    // Above the cap the whole report goes, because there is nothing cheaper to
    // fall back to: a TPS interpolates exactly, so "RMS only" would be 0 m.
    // A short or empty metresPerGcp would render NaN in every row past its end.
    expect(MAX_GCPS_FOR_TPS_RESIDUALS).toBe(50);
    const atCap = tpsResidualReport(irregularGcps(MAX_GCPS_FOR_TPS_RESIDUALS));
    expect(atCap!.metresPerGcp).toHaveLength(MAX_GCPS_FOR_TPS_RESIDUALS);
    expect(
      tpsResidualReport(irregularGcps(MAX_GCPS_FOR_TPS_RESIDUALS + 1)),
    ).toBeNull();
  });
});
