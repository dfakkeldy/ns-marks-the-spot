import { describe, expect, it } from "vitest";
import type { Gcp } from "../types";
import { applyAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import {
  MIN_GCPS_FOR_SUSPECT,
  residualMetresFor,
  residualReport,
  rmsMetres,
} from "./residuals";
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
