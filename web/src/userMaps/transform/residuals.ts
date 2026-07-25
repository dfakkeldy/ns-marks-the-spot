import type { Gcp } from "../types";
import { applyAffine, type AffineParams } from "./affine";
import { fromMercator, groundMetresBetween } from "./webMercator";

/**
 * Below this an affine fit passes exactly through every point by
 * construction, so residuals are all zero and mean nothing. The UI says "add
 * a 4th point to check accuracy" rather than showing a misleading 0 m.
 *
 * Module-private: the one caller is `residualReport` below, and nothing
 * outside this file makes the decision this threshold governs.
 */
const MIN_GCPS_FOR_RESIDUALS = 4;

/**
 * Below this we report the RMS but accuse nobody.
 *
 * Four points fitting three parameters leave a ONE-DIMENSIONAL residual space:
 * the residual-maker `I - H` has rank `n - p = 1`, so every attainable
 * residual vector is a scalar multiple of a single direction, and that
 * direction comes from the design matrix — the pixel coordinates — alone.
 * Both axes share it, since both share the design. Displacing a different
 * control point rescales that vector; it cannot rotate it.
 *
 * So at four points the largest residual identifies where the user clicked,
 * not which click was wrong, and it is the SAME index whichever point is
 * actually bad. That kills raw residual, leave-one-out (`e/(1-h)`) and
 * studentized (`e/sqrt(1-h)`) together, since all three rank by magnitude
 * along that one fixed direction. A 1104-trial sweep agreed: 24% correct
 * against a 25% baseline. Highlighting a row here would be a coin toss
 * presented as a diagnosis.
 *
 * At five points there are two residual dimensions, the direction can respond
 * to the data, and the same sweep scores 60% against a 20% baseline. That is
 * where the highlight starts earning its place, so that is where it starts.
 *
 * (Earlier revisions argued this from all four leverages being exactly 0.75.
 * That holds only for a symmetric layout — a scalene quad gives
 * [0.871, 0.954, 0.918, 0.258] — so it proved the conclusion for one
 * rectangle. The rank argument above needs no symmetry.)
 */
export const MIN_GCPS_FOR_SUSPECT = 5;

export type ResidualReport = {
  /** Per-GCP fit residual in GROUND metres, same order as the input. */
  metresPerGcp: number[];
  rmsMetres: number;
  /**
   * Index of the worst-fitting point, or null when there are too few points
   * for that to mean anything (see MIN_GCPS_FOR_SUSPECT).
   */
  mostInconsistentIndex: number | null;
};

/**
 * Distance between where the transform predicts each GCP lands and where the
 * user actually put it, in ground metres.
 *
 * Ground, not Mercator: Mercator inflates by 1/cos(latitude), which is 1.44x
 * at Nova Scotia latitudes, so a Mercator-magnitude residual would overstate
 * every accuracy figure by nearly half. Note this makes the figure NOT
 * directly comparable to QGIS's, which reports residuals in the target CRS's
 * own units — Mercator metres for EPSG:3857, i.e. ~1.44x larger here.
 */
export function residualMetresFor(
  params: AffineParams,
  gcps: Gcp[],
): number[] {
  return gcps.map((gcp) => {
    const predicted = fromMercator(applyAffine(params, gcp.pixel.x, gcp.pixel.y));
    return groundMetresBetween(predicted, gcp.map);
  });
}

export function rmsMetres(residuals: number[]): number {
  if (residuals.length === 0) {
    return 0;
  }
  const sumOfSquares = residuals.reduce((total, r) => total + r * r, 0);
  return Math.sqrt(sumOfSquares / residuals.length);
}

/**
 * The numbers the GCP list renders.
 *
 * An earlier design picked the highlighted row by leave-one-out refit, on the
 * theory that least squares smears a gross error across every point and so
 * the largest fit residual accuses an innocent one. The first half is true;
 * the conclusion is not, because the outlier also corrupts each refit that
 * still contains it. Measured over 1104 trials, leave-one-out won 147 times
 * and lost 150 — a wash — while costing an extra affine solve per point on
 * every pointer move of a drag. It was dropped for the plain fit residual.
 */
export function residualReport(
  gcps: Gcp[],
  params: AffineParams,
): ResidualReport | null {
  if (gcps.length < MIN_GCPS_FOR_RESIDUALS) {
    return null;
  }
  const metresPerGcp = residualMetresFor(params, gcps);
  let mostInconsistentIndex: number | null = null;
  if (gcps.length >= MIN_GCPS_FOR_SUSPECT) {
    let worst = 0;
    for (let index = 1; index < metresPerGcp.length; index += 1) {
      if (metresPerGcp[index] > metresPerGcp[worst]) {
        worst = index;
      }
    }
    mostInconsistentIndex = worst;
  }
  return {
    metresPerGcp,
    rmsMetres: rmsMetres(metresPerGcp),
    mostInconsistentIndex,
  };
}
