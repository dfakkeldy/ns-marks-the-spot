import { describe, expect, it } from "vitest";
import type { Gcp } from "../types";
import { applyAffine, solveAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import { fromMercator } from "./webMercator";

/** Rotation + scale + translation, in Mercator metres. */
const TRUTH: AffineParams = [3.5, -1.25, -6790000, 0.75, 4.5, 5780000];

const PIXELS = [
  { x: 0, y: 0 },
  { x: 4096, y: 0 },
  { x: 0, y: 3072 },
  { x: 4096, y: 3072 },
  { x: 1000, y: 2000 },
];

function exactPairs(pixels = PIXELS) {
  return pixels.map((src) => ({ src, dst: applyAffine(TRUTH, src.x, src.y) }));
}

function gcpsFrom(pixels = PIXELS): Gcp[] {
  return pixels.map((pixel, index) => ({
    id: `g${index}`,
    pixel,
    map: fromMercator(applyAffine(TRUTH, pixel.x, pixel.y)),
  }));
}

describe("solveAffine", () => {
  it("recovers an invented transform to machine precision", () => {
    const solved = solveAffine(exactPairs());
    expect(solved).not.toBeNull();
    for (let i = 0; i < 6; i += 1) {
      expect((solved as AffineParams)[i]).toBeCloseTo(TRUTH[i], 6);
    }
  });

  it("fits three non-collinear points exactly", () => {
    const pairs = exactPairs(PIXELS.slice(0, 3));
    const solved = solveAffine(pairs);
    expect(solved).not.toBeNull();
    for (const { src, dst } of pairs) {
      const predicted = applyAffine(solved as AffineParams, src.x, src.y);
      expect(predicted.x).toBeCloseTo(dst.x, 6);
      expect(predicted.y).toBeCloseTo(dst.y, 6);
    }
  });

  it("returns null for fewer than three points", () => {
    expect(solveAffine(exactPairs(PIXELS.slice(0, 2)))).toBeNull();
    expect(solveAffine([])).toBeNull();
  });

  it("returns null for collinear points instead of a NaN transform", () => {
    // Three points on a straight line leave the affine underdetermined: the
    // normal matrix is singular, and dividing by its determinant would fill
    // the mesh with NaN and silently blank the drape.
    const collinear = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 200 },
    ];
    expect(solveAffine(exactPairs(collinear))).toBeNull();
  });

  it("returns null for near-collinear points", () => {
    const nearlyCollinear = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 200.0000001 },
    ];
    expect(solveAffine(exactPairs(nearlyCollinear))).toBeNull();
  });

  it("returns null when every point shares one position", () => {
    const degenerate = [
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ];
    expect(solveAffine(exactPairs(degenerate))).toBeNull();
  });

  it("least-squares fits noisy points rather than failing", () => {
    const pairs = exactPairs();
    pairs[3] = {
      src: pairs[3].src,
      dst: { x: pairs[3].dst.x + 500, y: pairs[3].dst.y - 300 },
    };
    const solved = solveAffine(pairs);
    expect(solved).not.toBeNull();
    // Close to truth but not equal to it: the outlier pulls the fit by
    // ~0.066 here, so this deliberately asserts the loose band.
    expect((solved as AffineParams)[0]).toBeCloseTo(TRUTH[0], 0);
    expect((solved as AffineParams)[0]).not.toBe(TRUTH[0]);
  });
});

describe("solveAffineFromGcps", () => {
  it("projects stored WGS84 GCPs into Mercator before solving", () => {
    const solved = solveAffineFromGcps(gcpsFrom());
    expect(solved).not.toBeNull();
    for (let i = 0; i < 6; i += 1) {
      expect((solved as AffineParams)[i]).toBeCloseTo(TRUTH[i], 3);
    }
  });

  it("returns null below the three-point minimum", () => {
    expect(solveAffineFromGcps(gcpsFrom(PIXELS.slice(0, 2)))).toBeNull();
  });

  it("does not solve in degrees", () => {
    // A degrees-based solve would be skewed by ~cos(latitude) east-west
    // against north-south. Feeding it exact Mercator-derived GCPs and
    // recovering the Mercator truth proves the conversion happened.
    const solved = solveAffineFromGcps(gcpsFrom()) as AffineParams;
    const predicted = applyAffine(solved, 2048, 1536);
    const expectedPoint = applyAffine(TRUTH, 2048, 1536);
    expect(predicted.x).toBeCloseTo(expectedPoint.x, 3);
    expect(Math.abs(predicted.x)).toBeGreaterThan(1000);
  });
});
