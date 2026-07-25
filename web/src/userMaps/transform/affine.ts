import type { Gcp } from "../types";
import { toMercator, type MercatorPoint } from "./webMercator";

/** X = p0*x + p1*y + p2 ; Y = p3*x + p4*y + p5. Pixels in, Mercator out. */
export type AffineParams = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export const MIN_GCPS_FOR_AFFINE = 3;

/**
 * How degenerate a point layout has to be before we refuse it. The test
 * compares the centred normal matrix's determinant against the product of
 * its diagonal, so this is a dimensionless conditioning ratio rather than an
 * absolute tolerance — it behaves the same for an 800 px scan and a
 * 20,000 px one.
 */
const COLLINEARITY_EPSILON = 1e-10;

export function applyAffine(
  params: AffineParams,
  x: number,
  y: number,
): MercatorPoint {
  return {
    x: params[0] * x + params[1] * y + params[2],
    y: params[3] * x + params[4] * y + params[5],
  };
}

/**
 * Least-squares affine fit, solved on CENTRED coordinates.
 *
 * Centring both sides on their centroids is not cosmetic. Raw inputs here are
 * image pixels (up to ~2e4) against Mercator metres (~7e6); the uncentred
 * normal matrix mixes terms spanning twelve orders of magnitude and loses
 * most of its precision to cancellation. Centring decouples translation from
 * the linear part, leaving a well-conditioned 2x2 solve plus an exact
 * translation recovered from the centroids.
 */
export function solveAffine(
  pairs: { src: { x: number; y: number }; dst: MercatorPoint }[],
): AffineParams | null {
  const n = pairs.length;
  if (n < MIN_GCPS_FOR_AFFINE) {
    return null;
  }

  let centroidX = 0;
  let centroidY = 0;
  let centroidDstX = 0;
  let centroidDstY = 0;
  for (const pair of pairs) {
    centroidX += pair.src.x;
    centroidY += pair.src.y;
    centroidDstX += pair.dst.x;
    centroidDstY += pair.dst.y;
  }
  centroidX /= n;
  centroidY /= n;
  centroidDstX /= n;
  centroidDstY /= n;

  let sumXX = 0;
  let sumXY = 0;
  let sumYY = 0;
  let sumXdX = 0;
  let sumYdX = 0;
  let sumXdY = 0;
  let sumYdY = 0;
  for (const pair of pairs) {
    const x = pair.src.x - centroidX;
    const y = pair.src.y - centroidY;
    const dx = pair.dst.x - centroidDstX;
    const dy = pair.dst.y - centroidDstY;
    sumXX += x * x;
    sumXY += x * y;
    sumYY += y * y;
    sumXdX += x * dx;
    sumYdX += y * dx;
    sumXdY += x * dy;
    sumYdY += y * dy;
  }

  const determinant = sumXX * sumYY - sumXY * sumXY;
  if (
    sumXX === 0 ||
    sumYY === 0 ||
    !(Math.abs(determinant) > COLLINEARITY_EPSILON * sumXX * sumYY)
  ) {
    // Collinear, coincident, or too close to either to trust.
    return null;
  }

  const a = (sumXdX * sumYY - sumYdX * sumXY) / determinant;
  const b = (sumYdX * sumXX - sumXdX * sumXY) / determinant;
  const d = (sumXdY * sumYY - sumYdY * sumXY) / determinant;
  const e = (sumYdY * sumXX - sumXdY * sumXY) / determinant;
  return [
    a,
    b,
    centroidDstX - a * centroidX - b * centroidY,
    d,
    e,
    centroidDstY - d * centroidX - e * centroidY,
  ];
}

/**
 * GCPs are persisted in WGS84 so a saved map stays portable (and maps 1:1
 * onto an Allmaps annotation), but solving in degrees would skew east-west
 * against north-south by ~cos(latitude). Projection happens here, at the
 * boundary, so no caller has to remember.
 */
export function solveAffineFromGcps(gcps: Gcp[]): AffineParams | null {
  return solveAffine(
    gcps.map((gcp) => ({ src: gcp.pixel, dst: toMercator(gcp.map) })),
  );
}
