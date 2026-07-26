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
 * How thin a control-point layout may get before we refuse to solve from it,
 * as the ratio between the point cloud's narrowest and widest RMS extent —
 * i.e. `sqrt(lambdaMin / lambdaMax)` of the centred 2x2 scatter matrix, which
 * is the reciprocal condition number of the design.
 *
 * The obvious test — determinant against the product of the normal matrix's
 * diagonal — is NOT this, and does not work. That ratio reduces algebraically
 * to `1 - r^2` for the Pearson correlation of the centred pixels, which is
 * scale-invariant but not a conditioning measure: it goes blind whenever the
 * points lie near a coordinate axis. Measured, an exactly singular horizontal
 * layout reported a perfectly healthy `1 - r^2 = 0.25`, while the identical
 * degeneracy rotated to 45 degrees was correctly rejected. Points clicked
 * along a scan's top neatline are the layout users actually produce.
 *
 * Normalising against the point cloud's own long axis — rather than against
 * the image — is the second correction, and it matters. Dividing by the image
 * diagonal silently folded a COVERAGE question into what claims to be a RANK
 * question, and the two disagree: a 1000x100 px control corridor on a
 * 24000x18000 scan is full rank with only 10:1 anisotropy, yet scored 1.7e-3
 * against the image and was refused with "too close to a straight line" — a
 * statement that was simply false about that layout.
 *
 * Measured separation, which is what set the value:
 *
 *     near-collinear 45deg     8.4e-9   reject
 *     points along a neatline  1.4e-3   reject
 *     -------------------------------- 5e-3
 *     elongated map, worst     2.9e-2   accept
 *     1000x100 corridor        1.0e-1   accept
 *     healthy triangle         5.3e-1   accept
 *
 * The margins are 3.5x below and 5.8x above, against 4.3x/5.1x for the old
 * image-normalised form — and, unlike it, the ordering now tracks actual
 * conditioning instead of inverting it.
 *
 * This gate is about RANK — whether the points determine a transform at all.
 * It is deliberately NOT a check on over-extrapolation: three points huddled
 * in 200 px of a 4096 px scan score 5.8e-1 and pass, because their SHAPE is
 * fine even though the fit is stretched 20x beyond them. That is a real risk,
 * but it is a different one, and it belongs on the reported accuracy rather
 * than on the solve. Conflating them is what produced the corridor bug above.
 */
export const MIN_CONDITION_RATIO = 5e-3;

/**
 * Smallest ratio between the solved transform's two scale axes. Three map
 * clicks down a meridian are exactly collinear in Mercator while the SOURCE
 * points look textbook, so no amount of source-side checking catches them —
 * the linear part comes out singular, the drape collapses to zero area, and
 * every residual reads zero, i.e. a perfect fit. No plausible historical-map
 * georeference squashes one axis 50:1.
 */
export const MIN_ANISOTROPY_RATIO = 1 / 50;

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

  // Eigenvalues of the centred 2x2 scatter matrix — the point cloud's widest
  // and narrowest RMS extents. Rotation-invariant by construction, unlike the
  // diagonal terms, which is where the correlation test went wrong.
  const trace = sumXX + sumYY;
  const eigenGap = Math.hypot(sumXX - sumYY, 2 * sumXY);
  const largestEigenvalue = (trace + eigenGap) / 2;
  const smallestEigenvalue = Math.max((trace - eigenGap) / 2, 0);
  if (largestEigenvalue <= 0) {
    return null; // every point sits on the centroid
  }
  const conditionRatio = Math.sqrt(smallestEigenvalue / largestEigenvalue);
  // Negated so NaN falls through to the rejection rather than past it.
  if (!(conditionRatio > MIN_CONDITION_RATIO)) {
    return null;
  }

  const determinant = sumXX * sumYY - sumXY * sumXY;
  const a = (sumXdX * sumYY - sumYdX * sumXY) / determinant;
  const b = (sumYdX * sumXX - sumXdX * sumXY) / determinant;
  const d = (sumXdY * sumYY - sumYdY * sumXY) / determinant;
  const e = (sumYdY * sumXX - sumXdY * sumXY) / determinant;

  // A non-finite DESTINATION slips past every source-side check above, and
  // yields a half-finite transform rather than an obvious failure. Left
  // unguarded, buildGcpLatLngMesh emits {lat: NaN} and Leaflet throws
  // "Invalid LatLng object" from inside a moveend handler — on every pan.
  // projection.ts does the same check on the embedded path.
  //
  // Tested per coefficient, not on their sum: `1e200 + -1e200 + -1e200 +
  // 1e200` is 0, so a summed guard waves through the exactly singular matrix
  // [[1e200, -1e200], [-1e200, 1e200]].
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(d) ||
    !Number.isFinite(e)
  ) {
    return null;
  }
  // Also negated, and for the same reason the spread gate is: at overflow
  // scale the ratio comes back NaN, and `NaN < MIN` is false — so the plain
  // comparison ADMITTED a singular transform instead of refusing it.
  if (!(anisotropyRatio(a, b, d, e) >= MIN_ANISOTROPY_RATIO)) {
    return null;
  }

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
 * Ratio of the smaller to the larger singular value of the 2x2 linear part —
 * how far the transform squashes one axis relative to the other. Zero when
 * the transform is singular, which is the case worth catching.
 *
 * The singular values come from `|M|_F^2 = s1^2 + s2^2` and `|det M| = s1*s2`,
 * so `s^2 = (F^2 +/- sqrt(F^4 - 4det^2)) / 2`. Two numerical details make the
 * difference between that identity being right and this function being right:
 *
 *  - The coefficients are rescaled first. `F^2` overflows to Infinity for a
 *    matrix of 1e200s, `det` goes NaN, and the ratio then returns NaN — which
 *    the caller's comparison read as "not below the threshold". Rescaling is
 *    exact (a power-of-nothing division cancels out of a ratio) and caps
 *    `F^2` at 4.
 *  - The result is `|det| / sMax^2`, NOT `sqrt(sMin^2 / sMax^2)`. Both are the
 *    same in exact arithmetic, but `sMin^2 = (F^2 - root) / 2` cancels
 *    catastrophically exactly where the gate is load-bearing: as s2/s1 falls,
 *    `root` approaches `F^2`. Measured, the subtractive form returned a flat 0
 *    for `diag(1, 1e-9)` where this one returns 1e-9.
 */
function anisotropyRatio(a: number, b: number, d: number, e: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(d), Math.abs(e));
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return 0;
  }
  const sa = a / scale;
  const sb = b / scale;
  const sd = d / scale;
  const se = e / scale;

  const frobeniusSquared = sa * sa + sb * sb + sd * sd + se * se;
  const absDeterminant = Math.abs(sa * se - sb * sd);
  const discriminant = Math.max(
    frobeniusSquared * frobeniusSquared - 4 * absDeterminant * absDeterminant,
    0,
  );
  const largerSquared = (frobeniusSquared + Math.sqrt(discriminant)) / 2;
  if (!(largerSquared > 0)) {
    return 0;
  }
  return absDeterminant / largerSquared;
}

/**
 * GCPs are persisted in WGS84 so a saved map stays portable (and maps 1:1
 * onto an Allmaps annotation), but solving in degrees would skew east-west
 * against north-south by ~cos(latitude). Projection happens here, at the
 * boundary, so no caller has to remember.
 *
 * GCP pixels must be in the ORIGINAL raster's coordinate space, never the
 * preview's. Nothing here can detect the difference — a preview-space GCP set
 * solves cleanly and lands the map in the wrong place.
 */
export function solveAffineFromGcps(gcps: Gcp[]): AffineParams | null {
  return solveAffine(
    gcps.map((gcp) => ({ src: gcp.pixel, dst: toMercator(gcp.map) })),
  );
}
