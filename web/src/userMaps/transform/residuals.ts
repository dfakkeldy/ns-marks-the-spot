import type { Gcp } from "../types";
import { applyAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import { fromMercator, groundMetresBetween } from "./webMercator";

/**
 * Below this an affine fit passes exactly through every point by
 * construction, so residuals are all zero and mean nothing. The UI says "add
 * a 4th point to check accuracy" rather than showing a misleading 0 m.
 */
export const MIN_GCPS_FOR_RESIDUALS = 4;

export type ResidualReport = {
  /** Per-GCP fit residual in GROUND metres, same order as the input. */
  metresPerGcp: number[];
  rmsMetres: number;
  /**
   * Index of the point that disagrees most with the others, by leave-one-out.
   * NOT the largest fit residual: least squares smears a gross error across
   * every point, so the biggest residual is routinely on an innocent one.
   */
  mostInconsistentIndex: number;
};

/**
 * Distance between where the transform predicts each GCP lands and where the
 * user actually put it, in ground metres.
 *
 * Ground, not Mercator: Mercator inflates by 1/cos(latitude), which is 1.44x
 * at Nova Scotia latitudes, so a Mercator-magnitude residual would overstate
 * every accuracy figure by nearly half.
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
 * Leave-one-out error: refit without each point, then measure how far the
 * remaining points' transform misses it. This is what actually finds a
 * mis-clicked GCP — a point that disagrees with the consensus scores high
 * even when least squares has hidden its fit residual among its neighbours.
 *
 * Needs n >= 4 so that dropping one still leaves the three an affine needs.
 * Returns null when a refit is impossible (too few points, or dropping one
 * leaves the rest collinear).
 */
export function leaveOneOutMetres(gcps: Gcp[]): number[] | null {
  if (gcps.length < MIN_GCPS_FOR_RESIDUALS) {
    return null;
  }
  const scores: number[] = [];
  for (let index = 0; index < gcps.length; index += 1) {
    const rest = gcps.filter((_, other) => other !== index);
    const params = solveAffineFromGcps(rest);
    if (!params) {
      return null;
    }
    const held = gcps[index];
    const predicted = fromMercator(
      applyAffine(params, held.pixel.x, held.pixel.y),
    );
    scores.push(groundMetresBetween(predicted, held.map));
  }
  return scores;
}

/**
 * The numbers the GCP list renders. Displayed residuals are conventional fit
 * residuals — the figure QGIS and Allmaps show, so they are comparable — but
 * the highlighted row is chosen by leave-one-out, because that is the one
 * that reliably points at the bad point.
 */
export function residualReport(
  gcps: Gcp[],
  params: AffineParams,
): ResidualReport | null {
  if (gcps.length < MIN_GCPS_FOR_RESIDUALS) {
    return null;
  }
  const metresPerGcp = residualMetresFor(params, gcps);
  const leaveOneOut = leaveOneOutMetres(gcps) ?? metresPerGcp;
  let mostInconsistentIndex = 0;
  for (let index = 1; index < leaveOneOut.length; index += 1) {
    if (leaveOneOut[index] > leaveOneOut[mostInconsistentIndex]) {
      mostInconsistentIndex = index;
    }
  }
  return {
    metresPerGcp,
    rmsMetres: rmsMetres(metresPerGcp),
    mostInconsistentIndex,
  };
}
