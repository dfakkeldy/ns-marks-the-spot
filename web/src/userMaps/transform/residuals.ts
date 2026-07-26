import type { Gcp } from "../types";
import { applyAffine, solveAffineFromGcps, type AffineParams } from "./affine";
import { applyTps, MIN_GCPS_FOR_TPS, solveTps } from "./tps";
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

/**
 * Below this there is nothing to leave out. One point held back from n leaves
 * `n - 1` for the refit, so the smallest workable set is one larger than
 * `MIN_GCPS_FOR_TPS` — derived from the solver's own floor rather than written
 * down again, so the two cannot drift apart.
 *
 * Module-private for the same reason `MIN_GCPS_FOR_RESIDUALS` is: the one
 * caller is `tpsResidualReport` below.
 */
const MIN_GCPS_FOR_TPS_RESIDUALS = MIN_GCPS_FOR_TPS + 1;

/**
 * Above this the report is refused entirely — a `too-many-points` refusal,
 * never a partial array.
 *
 * Leave-one-out is n solves and a single TPS solve is O(n^3), so cost climbs
 * towards n^4 once per-call overhead stops dominating. Measured in this repo
 * (node 22 under vitest, warm, median of 5 runs, irregular layouts):
 * n = 30 -> 1.5 ms, 40 -> 3.0, 50 -> 6.3, 60 -> 11.7, 80 -> 31.5, 100 -> 68.7,
 * and ~4 s at n = 300. This function runs from a `useMemo` that re-evaluates
 * on every pointer move of a drag, sharing that frame with a mesh rebuild, so
 * 50 is the largest count whose refit stays inside half a 16 ms frame; 60
 * would spend most of a frame on the accuracy column alone.
 *
 * REFUSING THE WHOLE REPORT IS THE ONLY HONEST CAP, because the two
 * cheaper-sounding ones are not actually available:
 *
 *  - "Skip leave-one-out above the cap and report the RMS only" would print
 *    0 m. The RMS here is computed FROM the leave-one-out array, and the fit
 *    residual it would otherwise come from is identically ~0 for a spline that
 *    interpolates its control points. That is the same misleading zero
 *    `MIN_GCPS_FOR_RESIDUALS` exists to refuse at three affine points.
 *  - "Keep the number, drop the suspect highlight" saves nothing: the
 *    highlight is the CHEAP half — a single affine solve — and leave-one-out
 *    is the expensive half.
 *
 * Deferring the refit to pointer-up was the other real candidate, and was
 * rejected on layering rather than on cost: this module is pure and free of
 * Leaflet and React, drag state lives in the hook, and a `dragging` argument
 * would pull UI state into `transform/`. The call site made that choice in the
 * other direction and kept the figure live — see the `report` memo's comment
 * in `useGeoreferenceSession.ts` for the measured reasoning.
 *
 * The array is full or absent because `GcpList` indexes `metresPerGcp` for
 * every row (GcpList.tsx:111) — a short one renders `NaN m` past its end.
 *
 * Refusing here is NOT free at the panel — a refusal is a different sentence
 * from "add a 4th point", and telling them apart is why this function returns
 * a REASON rather than `null`. See `TpsResidualResult`.
 */
export const MAX_GCPS_FOR_TPS_RESIDUALS = 50;

/**
 * Below this we report the leave-one-out figures but accuse nobody.
 *
 * It lands on the same value as `MIN_GCPS_FOR_SUSPECT` and was derived
 * independently: that constant's argument is about the rank of a least-squares
 * residual space, which says nothing about an interpolating spline. This one
 * is measured, on Poisson-disk irregular layouts and never a lattice. n = 4 is
 * a dead wash — 24.98% correct against a 25.00% chance baseline over 32 000
 * pooled trials, CI [24.50, 25.45], and flat across every displacement band
 * including 2-4 km, so no amount of gross error rescues it. n = 5 is the first
 * count that clears chance, 32.4% against 20.0%, and AT n = 5 THE SIGNAL COMES
 * ENTIRELY FROM ERRORS OF ROUGHLY 125 m AND UP: a subtler mis-click is still a
 * coin toss there.
 *
 * Those percentages are leave-one-out's. The suspect is ranked by the affine
 * residual, which scores higher again — see `tpsResidualReport` — so this is a
 * floor on the weaker of the two signals and therefore conservative.
 */
export const MIN_GCPS_FOR_TPS_SUSPECT = 5;

/**
 * Refits the spline n times, each time WITHOUT one control point, and measures
 * in ground metres how far the resulting surface misses the point it never
 * saw.
 *
 * A function of this name lived in this file before and was DELETED in
 * `11780341f`. The comment above `residualReport` still records why, that
 * reasoning is correct, and it does not apply here — the measurement SPLITS
 * the two jobs it conflated. PR 2 compared leave-one-out against the plain fit
 * residual FOR AN AFFINE FIT, where both signals exist: over 1104 trials
 * leave-one-out won 147 times and lost 150, a wash, so it lost on cost. A
 * thin-plate spline passes through its control points exactly — that is its
 * defining property — so `residualMetresFor` against a full-set TPS solve is
 * ~0 at every point at every count. Here leave-one-out is not competing with a
 * cheaper signal; it is competing with no signal at all, and the alternative
 * is showing "RMS 0 m" for every TPS map.
 *
 * What it yields is a CONSERVATIVE UPPER BOUND, not a point estimate. Measured
 * against 60 held-out check points, 1200 trials per n: the median ratio of
 * leave-one-out to true warp error is 3.71 at n = 4, 2.20 at n = 8 and 1.77 at
 * n = 12, with a 10th percentile of at least 1.09 everywhere — it overstates by
 * 1.8x-3.7x and is never optimistic. Spearman correlation with true error runs
 * 0.63 (n = 4) to 0.79 (n = 8), which is what makes it worth showing at all.
 * UI copy must therefore read as a bound ("no worse than"), not as the error;
 * that wording is a later task's.
 *
 * Returns null rather than a short array when any refit refuses — dropping a
 * point can leave the rest too thin to solve — because the caller indexes this
 * array per row.
 */
function leaveOneOutMetres(gcps: Gcp[]): number[] | null {
  const metres: number[] = [];
  for (let held = 0; held < gcps.length; held += 1) {
    const solved = solveTps(gcps.filter((_, index) => index !== held));
    if (!solved.ok) {
      return null;
    }
    const { pixel, map } = gcps[held];
    const predicted = fromMercator(applyTps(solved.params, pixel.x, pixel.y));
    metres.push(groundMetresBetween(predicted, map));
  }
  return metres;
}

/**
 * Why a TPS accuracy figure was refused. The three are NOT interchangeable at
 * the panel — they take different copy and imply different remedies — and
 * collapsing them is a bug this module has now shipped twice:
 *
 *  - `too-few-points`: fewer than `MIN_GCPS_FOR_TPS_RESIDUALS`, so there is
 *    nothing to leave out. Remedy: add a point.
 *  - `too-many-points`: past `MAX_GCPS_FOR_TPS_RESIDUALS`, where n refits of an
 *    O(n^3) system would blow the drag frame. Remedy: none — the drape is
 *    unaffected and nothing is wrong with the points.
 *  - `refit-refused`: the full set solves, but holding one point back leaves
 *    the rest too thin for `solveTps`. Remedy: spread the points out. Measured
 *    reachable at n = 4, 5, 6, 8, 12 and 20 with (n-1) points on a line — see
 *    `collinearExceptOne` in `testFixtures.ts`.
 *
 * A REASON rather than `null` because the caller cannot re-derive this. The
 * count-based two are an O(1) length test, but detecting the third from
 * outside would mean running the n leave-one-out solves again — doubling the
 * exact cost `MAX_GCPS_FOR_TPS_RESIDUALS` exists to bound.
 */
export type TpsResidualRefusal =
  | "too-few-points"
  | "too-many-points"
  | "refit-refused";

export type TpsResidualResult =
  | { ok: true; report: ResidualReport }
  | { ok: false; reason: TpsResidualRefusal };

/**
 * The numbers the GCP list renders under a TPS warp. The success arm carries
 * the same `ResidualReport` shape the affine path returns, so `GcpList` needs
 * no change once the caller unwraps it.
 *
 * The two halves come from DIFFERENT fits, and that is the whole point:
 *
 *  - `metresPerGcp` and `rmsMetres` are leave-one-out, per the helper above —
 *    the only non-zero signal an interpolating spline has.
 *  - `mostInconsistentIndex` is the plain AFFINE fit residual, even though a
 *    spline is what is on screen. Measured on this project's own data, paired
 *    on identical trials: at n = 8 the affine residual finds the displaced
 *    point 62.9% of the time against leave-one-out's 46.8%, with 943
 *    affine-only wins to 299 leave-one-out-only, z = -18.3; it holds in all
 *    three truth conditions (at n = 12, affine-only truth: 91.7% vs 69.9%).
 *    The mechanism is the interpolation property again: an outlier left in a
 *    refit is absorbed into the spline's SHAPE, bending the surface around
 *    itself, which corrupts its NEIGHBOURS' scores far more than least-squares
 *    smearing does — so leave-one-out tends to accuse an innocent neighbour.
 *    `OUTLIER_FIXTURE` is that disagreement made reproducible. Affine is also
 *    the cheaper of the two: one solve per pointer move instead of n.
 *
 * So the highlighted row is often NOT the largest number in the column. That
 * is what the row's shipped copy already claims — "Disagrees most with the
 * other points" is a consistency claim, not a largest-error one. Do not "fix"
 * the mismatch by re-ranking to match the displayed magnitudes.
 */
export function tpsResidualReport(gcps: Gcp[]): TpsResidualResult {
  if (gcps.length < MIN_GCPS_FOR_TPS_RESIDUALS) {
    return { ok: false, reason: "too-few-points" };
  }
  if (gcps.length > MAX_GCPS_FOR_TPS_RESIDUALS) {
    return { ok: false, reason: "too-many-points" };
  }

  // Ahead of the n refits, because it is one cheap solve and it can rule the
  // whole report out: `solveTps` refuses everything `solveAffine` refuses (its
  // destination gate IS a `solveAffine` call), so a refusal here means there is
  // no spline on screen to report an accuracy for.
  //
  // Reported as `refit-refused` rather than earning a fourth reason, and the
  // justification is structural, not statistical: the session's status memo
  // evaluates the IDENTICAL `solveAffineFromGcps(gcps)` first and returns
  // `degenerate`, so no caller can ever surface this branch's copy. Sampling
  // agrees — over 40 000 clouds across four geometry families at n = 4..8,
  // all 29 777 trials where the full-set affine refused also had a refit
  // refuse, zero counterexamples — but the proof is what makes it safe.
  //
  // Do NOT restate this as "removing a point from a cloud too thin to fit
  // cannot thicken it". That rule is FALSE: pixels
  // (0,0) (0,1) (1,0) (100000,0.5) score 6.6e-6 as a set and ~0.5 once the far
  // point is dropped, an ~80 000x thickening, and 10 059 of those 40 000
  // trials had some subset at least 5x thicker than its parent. The
  // implication survives only because the OTHER subsets still contain the far
  // point and stay thin — which is a much weaker thing to lean on than the
  // unreachability above.
  const affine = solveAffineFromGcps(gcps);
  if (affine === null) {
    return { ok: false, reason: "refit-refused" };
  }

  const metresPerGcp = leaveOneOutMetres(gcps);
  if (metresPerGcp === null) {
    return { ok: false, reason: "refit-refused" };
  }

  let mostInconsistentIndex: number | null = null;
  if (gcps.length >= MIN_GCPS_FOR_TPS_SUSPECT) {
    const fitResiduals = residualMetresFor(affine, gcps);
    let worst = 0;
    for (let index = 1; index < fitResiduals.length; index += 1) {
      if (fitResiduals[index] > fitResiduals[worst]) {
        worst = index;
      }
    }
    mostInconsistentIndex = worst;
  }

  return {
    ok: true,
    report: {
      metresPerGcp,
      rmsMetres: rmsMetres(metresPerGcp),
      mostInconsistentIndex,
    },
  };
}
