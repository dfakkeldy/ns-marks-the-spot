import { describe, expect, it } from "vitest";
import type { Gcp } from "../types";
import { applyAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import {
  leaveOneOutMetres,
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

describe("leaveOneOutMetres", () => {
  it("is null below four points", () => {
    expect(leaveOneOutMetres(exactGcps(PIXELS.slice(0, 3)))).toBeNull();
  });

  it("is zero for points that all agree", () => {
    for (const metres of leaveOneOutMetres(exactGcps()) ?? []) {
      expect(metres).toBeCloseTo(0, 6);
    }
  });
});

describe("residualReport", () => {
  it("is null below four points, because three fit exactly by construction", () => {
    const gcps = exactGcps(PIXELS.slice(0, 3));
    const params = solveAffineFromGcps(gcps) as AffineParams;
    expect(residualReport(gcps, params)).toBeNull();
  });

  it("finds the mis-clicked point that the largest fit residual misses", () => {
    // Regression guard for a real property of least squares: a single gross
    // outlier is smeared across every point, so ranking by fit residual
    // routinely accuses an innocent one. Measured on this exact fixture, the
    // largest fit residual is index 0 while the bad point is index 3.
    const gcps = exactGcps();
    gcps[3] = nudgeEast(gcps[3], 600);
    const params = solveAffineFromGcps(gcps) as AffineParams;
    const report = residualReport(gcps, params);
    expect(report).not.toBeNull();

    const { metresPerGcp, mostInconsistentIndex } = report as NonNullable<
      typeof report
    >;
    const largestFitResidual = metresPerGcp.indexOf(Math.max(...metresPerGcp));
    expect(mostInconsistentIndex).toBe(3);
    expect(largestFitResidual).not.toBe(3);
  });

  it("reports a non-zero RMS once a point disagrees", () => {
    const gcps = exactGcps();
    gcps[3] = nudgeEast(gcps[3], 600);
    const params = solveAffineFromGcps(gcps) as AffineParams;
    const report = residualReport(gcps, params);
    expect((report as NonNullable<typeof report>).rmsMetres).toBeGreaterThan(1);
  });

  it("keeps RMS at zero when every point agrees", () => {
    const gcps = exactGcps();
    const params = solveAffineFromGcps(gcps) as AffineParams;
    const report = residualReport(gcps, params);
    expect((report as NonNullable<typeof report>).rmsMetres).toBeCloseTo(0, 6);
  });
});
