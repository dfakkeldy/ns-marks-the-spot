import { describe, expect, it } from "vitest";
import type { Gcp } from "../types";
import { applyAffine, solveAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import { fromMercator } from "./webMercator";

/** Rotation + scale + translation, in Mercator metres. */
const TRUTH: AffineParams = [3.5, -1.25, -6790000, 0.75, 4.5, 5780000];

const SIZE = { width: 4096, height: 3072 };

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
    const solved = solveAffine(exactPairs(), SIZE);
    expect(solved).not.toBeNull();
    for (let i = 0; i < 6; i += 1) {
      expect((solved as AffineParams)[i]).toBeCloseTo(TRUTH[i], 6);
    }
  });

  it("fits three non-collinear points exactly", () => {
    const pairs = exactPairs(PIXELS.slice(0, 3));
    const solved = solveAffine(pairs, SIZE);
    expect(solved).not.toBeNull();
    for (const { src, dst } of pairs) {
      const predicted = applyAffine(solved as AffineParams, src.x, src.y);
      expect(predicted.x).toBeCloseTo(dst.x, 6);
      expect(predicted.y).toBeCloseTo(dst.y, 6);
    }
  });

  it("returns null for fewer than three points", () => {
    expect(solveAffine(exactPairs(PIXELS.slice(0, 2)), SIZE)).toBeNull();
    expect(solveAffine([], SIZE)).toBeNull();
  });

  it("returns null for collinear points instead of a NaN transform", () => {
    // Three points on a straight line leave the affine underdetermined: the
    // normal matrix is singular, and dividing by its determinant would fill
    // the mesh with NaN and silently blank the drape.
    const collinear = [
      { x: 0, y: 0 },
      { x: 2048, y: 1536 },
      { x: 4096, y: 3072 },
    ];
    expect(solveAffine(exactPairs(collinear), SIZE)).toBeNull();
  });

  it("rejects a near-collinear layout in EVERY orientation", () => {
    // Regression guard for a real defect. The original gate compared the
    // determinant against the product of the normal matrix's diagonal, which
    // reduces to the Pearson correlation of the centred pixels — blind
    // whenever the points lie near a coordinate axis. The 45-degree case was
    // rejected while the identical degeneracy laid flat was ACCEPTED, and
    // points clicked along a scan's neatline are the layout users produce.
    const orientations = {
      diagonal: [
        { x: 0, y: 0 },
        { x: 2048, y: 1536 },
        { x: 4096, y: 3072.0001 },
      ],
      horizontal: [
        { x: 0, y: 0 },
        { x: 2048, y: 0.0001 },
        { x: 4096, y: 0 },
      ],
      vertical: [
        { x: 0, y: 0 },
        { x: 0.0001, y: 1536 },
        { x: 0, y: 3072 },
      ],
    };
    for (const [name, pixels] of Object.entries(orientations)) {
      expect(solveAffine(exactPairs(pixels), SIZE), name).toBeNull();
    }
  });

  it("returns null when every point shares one position", () => {
    const degenerate = [
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ];
    expect(solveAffine(exactPairs(degenerate), SIZE)).toBeNull();
  });

  it("still solves points huddled in one corner — a KNOWN gap, not coverage", () => {
    // Documents the boundary rather than claiming it. A 200 px triangle on a
    // 4096 px scan scores 1.3e-2 on the spread ratio, above any threshold
    // that still accepts an honestly elongated map (worst case 1.0e-2). Its
    // SHAPE is fine; what is wrong is that the fit is stretched 20x beyond
    // the points, so a 1 px click error moves the far corner ~1 km. That
    // needs a warning on the reported accuracy, not a rejection here. If a
    // clustered-points warning lands and this starts returning null, delete
    // this test rather than loosening the gate.
    const huddle = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 100, y: 300 },
    ];
    expect(solveAffine(exactPairs(huddle), SIZE)).not.toBeNull();
  });

  it("still solves an honestly elongated map", () => {
    // The spread gate must not punish a map that is genuinely a strip — a
    // river survey, a rail corridor — where the points span what there is.
    const strip = { width: 24000, height: 600 };
    const pairs = exactPairs([
      { x: 0, y: 0 },
      { x: 24000, y: 0 },
      { x: 12000, y: 600 },
    ]);
    expect(solveAffine(pairs, strip)).not.toBeNull();
  });

  it("rejects map points that are collinear even when the scan points are not", () => {
    // Three clicks straight down a meridian are exactly collinear in
    // Mercator. No amount of source-side checking sees this: the source
    // layout is textbook. The solved transform is singular, the drape
    // collapses to zero area, and every residual reads zero — a perfect fit.
    const pairs = [
      { src: { x: 0, y: 0 }, dst: { x: -6790000, y: 5780000 } },
      { src: { x: 4096, y: 0 }, dst: { x: -6790000, y: 5790000 } },
      { src: { x: 0, y: 3072 }, dst: { x: -6790000, y: 5800000 } },
    ];
    expect(solveAffine(pairs, SIZE)).toBeNull();
  });

  it("rejects a non-finite destination instead of returning half a transform", () => {
    // Unguarded this returns [3.5, -1.25, -6790000, NaN, NaN, NaN]: the
    // source-side checks all pass, so the NaN only reaches the mesh, where
    // Leaflet throws "Invalid LatLng object" from inside a moveend handler.
    const pairs = exactPairs(PIXELS.slice(0, 3));
    const broken = [
      pairs[0],
      { src: pairs[1].src, dst: { x: pairs[1].dst.x, y: Number.NaN } },
      pairs[2],
    ];
    expect(solveAffine(broken, SIZE)).toBeNull();
  });

  it("least-squares fits noisy points rather than failing", () => {
    const pairs = exactPairs();
    pairs[3] = {
      src: pairs[3].src,
      dst: { x: pairs[3].dst.x + 500, y: pairs[3].dst.y - 300 },
    };
    const solved = solveAffine(pairs, SIZE);
    expect(solved).not.toBeNull();
    // Close to truth but not equal to it: the outlier pulls the fit by
    // ~0.066 here, so this deliberately asserts the loose band.
    expect((solved as AffineParams)[0]).toBeCloseTo(TRUTH[0], 0);
    expect((solved as AffineParams)[0]).not.toBe(TRUTH[0]);
  });

  it("accepts a mirrored transform, which is a legitimate scan orientation", () => {
    const mirrored: AffineParams = [-3.5, 0, -6790000, 0, 4.5, 5780000];
    const pairs = PIXELS.map((src) => ({
      src,
      dst: applyAffine(mirrored, src.x, src.y),
    }));
    const solved = solveAffine(pairs, SIZE);
    expect(solved).not.toBeNull();
    expect((solved as AffineParams)[0]).toBeCloseTo(-3.5, 6);
  });
});

describe("solveAffineFromGcps", () => {
  it("projects stored WGS84 GCPs into Mercator before solving", () => {
    const solved = solveAffineFromGcps(gcpsFrom(), SIZE);
    expect(solved).not.toBeNull();
    for (let i = 0; i < 6; i += 1) {
      expect((solved as AffineParams)[i]).toBeCloseTo(TRUTH[i], 3);
    }
  });

  it("returns null below the three-point minimum", () => {
    expect(solveAffineFromGcps(gcpsFrom(PIXELS.slice(0, 2)), SIZE)).toBeNull();
  });

  it("does not solve in degrees", () => {
    // A degrees-based solve would be skewed by ~cos(latitude) east-west
    // against north-south. Feeding it exact Mercator-derived GCPs and
    // recovering the Mercator truth proves the conversion happened.
    const solved = solveAffineFromGcps(gcpsFrom(), SIZE) as AffineParams;
    const predicted = applyAffine(solved, 2048, 1536);
    const expectedPoint = applyAffine(TRUTH, 2048, 1536);
    expect(predicted.x).toBeCloseTo(expectedPoint.x, 3);
    expect(Math.abs(predicted.x)).toBeGreaterThan(1000);
  });
});
