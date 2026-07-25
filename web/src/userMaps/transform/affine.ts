import type { Gcp } from "../types";
import type { PixelSize } from "./projection";
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
 * measured as the cloud's narrowest RMS extent over the image diagonal.
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
 * Normalising against the IMAGE rather than against the points themselves is
 * the deliberate part: how good a fit has to be depends on how far it is
 * being extrapolated across the raster it warps.
 *
 * Measured separation, which is what set the value:
 *
 *     near-collinear 45deg     3.4e-9   reject
 *     points along a neatline  4.6e-4   reject
 *     -------------------------------- 2e-3
 *     elongated map, worst     1.0e-2   accept
 *     healthy triangle         2.4e-1   accept
 *
 * This gate is about RANK — whether the points determine a transform at all.
 * It is NOT a check on over-extrapolation: three points huddled in 200 px of
 * a 4096 px scan score 1.3e-2 and pass, because their SHAPE is fine even
 * though the fit is being stretched 20x beyond them. No threshold catches
 * both without also rejecting honestly elongated maps. Clustered points need
 * their own warning, on the reported accuracy rather than on the solve.
 */
export const MIN_SPREAD_RATIO = 2e-3;

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
  extent: PixelSize,
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

  // Narrowest RMS extent of the point cloud: the smaller eigenvalue of the
  // centred 2x2 scatter matrix, which is rotation-invariant by construction —
  // unlike the diagonal terms, which is where the correlation test went wrong.
  const trace = sumXX + sumYY;
  const eigenGap = Math.hypot(sumXX - sumYY, 2 * sumXY);
  const smallestEigenvalue = Math.max((trace - eigenGap) / 2, 0);
  const spreadRatio =
    Math.sqrt(smallestEigenvalue / n) /
    Math.hypot(extent.width, extent.height);
  // Negated so NaN falls through to the rejection, the way the old guard did.
  if (!(spreadRatio > MIN_SPREAD_RATIO)) {
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
  if (!Number.isFinite(a + b + d + e)) {
    return null;
  }
  if (anisotropyRatio(a, b, d, e) < MIN_ANISOTROPY_RATIO) {
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
 */
function anisotropyRatio(a: number, b: number, d: number, e: number): number {
  const frobeniusSquared = a * a + b * b + d * d + e * e;
  const absDeterminant = Math.abs(a * e - b * d);
  const discriminant = Math.max(
    frobeniusSquared * frobeniusSquared - 4 * absDeterminant * absDeterminant,
    0,
  );
  const root = Math.sqrt(discriminant);
  const largerSquared = (frobeniusSquared + root) / 2;
  const smallerSquared = (frobeniusSquared - root) / 2;
  if (largerSquared <= 0) {
    return 0;
  }
  return Math.sqrt(smallerSquared / largerSquared);
}

/**
 * GCPs are persisted in WGS84 so a saved map stays portable (and maps 1:1
 * onto an Allmaps annotation), but solving in degrees would skew east-west
 * against north-south by ~cos(latitude). Projection happens here, at the
 * boundary, so no caller has to remember.
 *
 * `pixelSize` is the ORIGINAL raster's size — the same space the GCP pixels
 * live in — and is what the spread gate normalises against.
 */
export function solveAffineFromGcps(
  gcps: Gcp[],
  pixelSize: PixelSize,
): AffineParams | null {
  return solveAffine(
    gcps.map((gcp) => ({ src: gcp.pixel, dst: toMercator(gcp.map) })),
    pixelSize,
  );
}
