import type { Gcp } from "../types";
import { solveAffine } from "./affine";
import { conditionRatio, MIN_CONDITION_RATIO } from "./conditioning";
import { toMercator, type MercatorPoint } from "./webMercator";

/**
 * A thin-plate spline needs the same three points an affine does — with three
 * it IS an affine, because the bending term has nothing to bend around — so
 * this matches `MIN_GCPS_FOR_AFFINE`. See `solveTps` for the exact sense in
 * which the two solvers agree about which clicks are usable; it is a
 * one-directional guarantee, not symmetry.
 */
export const MIN_GCPS_FOR_TPS = 3;

/**
 * The fewest control points at which a spline actually BENDS — one more than
 * it needs to solve.
 *
 * At exactly `MIN_GCPS_FOR_TPS` the side conditions force every bending weight
 * to zero, so the surface is the affine through those three points, not merely
 * close to it. Measured on the drapes themselves: worst separation between the
 * TPS and affine lattices at n = 3 is **1.317e-9 m**, about 1.4 ULP of a
 * Mercator coordinate.
 *
 * Two callers, and they are the same claim seen from opposite ends:
 *
 *  - **The UI gate.** Below this count the warp toggle is absent (spec), since
 *    a control whose two positions produce identical output is not a choice.
 *    The Allmaps export control does NOT share this gate, despite an earlier
 *    plan draft aligning the two — see `GeoreferencePanel.tsx`'s `showExport`.
 *    Export has no "does it bend" question to answer; it gates on
 *    `MIN_GCPS_FOR_TPS` instead, because that is the fewest points at which
 *    this app's own solver produces a real, exportable drape at all.
 *  - **The mesh fallback.** Below this count BOTH mesh builders draw the affine
 *    lattice for a `tps` record. The output is pixel-identical by the
 *    measurement above, and the cost is not: `TPS_GRID_SIZE` is 32, so a
 *    3-point `tps` record otherwise pays 2 * 32^2 = 2048 clipped full-image
 *    `drawImage` calls per mesh walk — once per zoom settle, padding-
 *    exhausting pan, or edit under the warp cache — in place of 2, and with
 *    the toggle hidden, the user has no way to turn it off.
 */
export const MIN_GCPS_FOR_BENDING_TPS = MIN_GCPS_FOR_TPS + 1;

/**
 * Two control points closer than this in SCAN pixels are treated as the same
 * point. The kernel `U(r) = r^2 log r` is 0 at r = 0, so a duplicated point
 * makes two rows of the interpolation matrix identical and the system exactly
 * singular; a merely NEAR-duplicate makes them nearly identical and the solved
 * weights explode instead, which is worse because it still "succeeds".
 *
 * A millionth of a pixel is far below anything a pointer can express, so this
 * only ever fires on a genuine double-click or a programmatic duplicate.
 */
export const MIN_TPS_SEPARATION = 1e-6;

/**
 * Opaque to callers: the field layout is an implementation detail shared
 * between `solveTps` and `applyTps` and is not persisted anywhere. The stored
 * form of a TPS georeference is its GCP list (`UserMapRecord.georef`), which
 * is re-solved on load — so this type is free to change without a migration.
 *
 * The source coordinates it holds are CENTRED AND SCALED, not raw pixels; see
 * `solveTps` for why that is not optional.
 */
export type TpsParams = {
  readonly count: number;
  /** Normalised source coordinates, one per control point. */
  readonly sourceX: Float64Array;
  readonly sourceY: Float64Array;
  /** `count` kernel weights followed by the 3 affine-tail coefficients. */
  readonly weightsX: Float64Array;
  readonly weightsY: Float64Array;
  readonly centreX: number;
  readonly centreY: number;
  readonly scale: number;
  readonly destinationCentreX: number;
  readonly destinationCentreY: number;
};

export type TpsRefusal =
  | "too-few-points"
  | "coincident-points"
  | "ill-conditioned"
  | "non-finite";

export type TpsSolveResult =
  | { ok: true; params: TpsParams }
  | { ok: false; reason: TpsRefusal };

/** `U(r) = r^2 log r`, given `r^2` — so no square root is ever taken. */
function kernel(squaredRadius: number): number {
  // U(0) = 0 by the limit, and `log 0` is -Infinity, so the zero case must be
  // branched rather than computed. Every diagonal entry of the matrix hits it.
  return squaredRadius > 0 ? 0.5 * squaredRadius * Math.log(squaredRadius) : 0;
}

/**
 * Thin-plate spline through every control point, solved in Web Mercator
 * metres exactly as `solveAffine` is.
 *
 * The surface is `f(x,y) = a0 + a1*x + a2*y + sum_i w_i * U(|p - p_i|)`, with
 * the side conditions `sum w_i = sum w_i*x_i = sum w_i*y_i = 0` that stop the
 * bending term from duplicating the affine tail. That is the standard
 * `(n+3) x (n+3)` system; x and y are solved separately against one shared
 * factorisation, since only the right-hand side differs between them.
 *
 * CONDITIONING IS REQUIRED IN BOTH SENSES, and they are different things.
 *
 * *Numerically*: sources are centred on their centroid and scaled to unit RMS
 * radius, and destinations have their centroid subtracted. Raw inputs are
 * image pixels (~1e4) against Mercator metres (~7e6), and `r^2 log r` at
 * pixel magnitudes puts entries spanning many orders of magnitude into one
 * matrix. Measured, normalised, the interpolation residual is 5.11e-11 m;
 * without it an n = 500 system at Mercator magnitudes is not reliably
 * solvable at all.
 *
 * *As a refusal*: a cloud too thin to determine a transform is rejected up
 * front by the shared `conditionRatio` gate, at the same threshold
 * `solveAffine` uses. Do NOT lean on the elimination pivot for this. Measured,
 * an oblique collinear cloud gives a pivot of ~1e-16, `Math.abs(1e-16) > 0` is
 * true, and it solves — producing a drape a 1 px nudge moves 12.2 km.
 *
 * THE AGREEMENT WITH `solveAffine` IS ONE-DIRECTIONAL, and only the guaranteed
 * direction may be relied on:
 *
 *   Everything `solveAffine` refuses, `solveTps` refuses.
 *
 * That holds by construction rather than by coincidence, because the
 * destination check below IS a `solveAffine` call. Matching thresholds instead
 * does not work, and an earlier revision of this file proved it: affine guards
 * its destination with `MIN_ANISOTROPY_RATIO` on the SOLVED TRANSFORM's
 * singular values, while this function guarded its own with
 * `MIN_CONDITION_RATIO` on the destination POINT CLOUD's shape — different
 * quantities under unrelated thresholds. Measured, the whole band between them
 * diverged: a georeference squashed 100:1, i.e. a near-zero-area drape, was
 * refused by affine and ACCEPTED here, because the cloud threshold is 4x looser
 * on that axis.
 *
 * The converse does NOT hold and cannot. An interpolating spline additionally
 * refuses coincident control points, which make two rows of its matrix
 * identical, and a singular interpolation matrix — neither of which constrains
 * a least-squares fit, which simply averages duplicates away. So `solveTps`
 * refuses a strict superset. Nothing may claim symmetry.
 *
 * Refusals are ordered so every reason is reachable and so the cheap ones run
 * first: count, coincidence, source conditioning, destination finiteness, the
 * delegated affine check, the solve, then a finiteness backstop.
 */
export function solveTps(gcps: Gcp[]): TpsSolveResult {
  const count = gcps.length;
  if (count < MIN_GCPS_FOR_TPS) {
    return { ok: false, reason: "too-few-points" };
  }

  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const dx = gcps[i].pixel.x - gcps[j].pixel.x;
      const dy = gcps[i].pixel.y - gcps[j].pixel.y;
      if (Math.hypot(dx, dy) < MIN_TPS_SEPARATION) {
        return { ok: false, reason: "coincident-points" };
      }
    }
  }

  const pixels = gcps.map((gcp) => gcp.pixel);
  // Negated so NaN falls through to the rejection rather than past it. The
  // delegated `solveAffine` call below applies this same gate to these same
  // points, so this line changes no ACCEPT/REJECT verdict; it is here to
  // reject a hopeless layout before paying for a Mercator pass and an affine
  // solve.
  //
  // It does, however, set reason PRECEDENCE, so deleting it is not free. It
  // sits above the destination-finiteness loop, so for a doubly-degenerate
  // layout — road-thin pixels AND one NaN destination — the line present
  // reports `ill-conditioned` and the line deleted reports `non-finite`.
  if (!(conditionRatio(pixels) > MIN_CONDITION_RATIO)) {
    return { ok: false, reason: "ill-conditioned" };
  }

  const destinations = gcps.map((gcp) => toMercator(gcp.map));

  // Before the delegation, because `solveAffine` folds a non-finite
  // destination into the same `null` it uses for a degenerate one, and this
  // function has a distinct reason for it that callers surface differently.
  for (const destination of destinations) {
    if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y)) {
      return { ok: false, reason: "non-finite" };
    }
  }

  // THE destination gate, and deliberately not a second `conditionRatio` call.
  // Asking `solveAffine` the question makes "everything affine refuses, this
  // refuses" true by construction; two hand-matched thresholds measuring two
  // different quantities cannot be, and were not — see this function's doc
  // comment for the 100:1 drape that slipped between them.
  const affine = solveAffine(
    gcps.map((gcp, index) => ({ src: gcp.pixel, dst: destinations[index] })),
  );
  if (affine === null) {
    return { ok: false, reason: "ill-conditioned" };
  }

  let centreX = 0;
  let centreY = 0;
  for (const pixel of pixels) {
    centreX += pixel.x;
    centreY += pixel.y;
  }
  centreX /= count;
  centreY /= count;

  let squaredSpread = 0;
  for (const pixel of pixels) {
    squaredSpread += (pixel.x - centreX) ** 2 + (pixel.y - centreY) ** 2;
  }
  const scale = Math.sqrt(squaredSpread / count);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return { ok: false, reason: "ill-conditioned" };
  }

  const sourceX = new Float64Array(count);
  const sourceY = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    sourceX[i] = (pixels[i].x - centreX) / scale;
    sourceY[i] = (pixels[i].y - centreY) / scale;
  }

  let destinationCentreX = 0;
  let destinationCentreY = 0;
  for (const destination of destinations) {
    destinationCentreX += destination.x;
    destinationCentreY += destination.y;
  }
  destinationCentreX /= count;
  destinationCentreY /= count;

  const size = count + 3;
  const matrix = new Float64Array(size * size);
  const rhsX = new Float64Array(size);
  const rhsY = new Float64Array(size);
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      matrix[i * size + j] = kernel(
        (sourceX[i] - sourceX[j]) ** 2 + (sourceY[i] - sourceY[j]) ** 2,
      );
    }
    // The affine tail's columns, and the same block transposed below it as the
    // side conditions. The bottom-right 3x3 stays zero.
    matrix[i * size + count] = 1;
    matrix[i * size + count + 1] = sourceX[i];
    matrix[i * size + count + 2] = sourceY[i];
    matrix[count * size + i] = 1;
    matrix[(count + 1) * size + i] = sourceX[i];
    matrix[(count + 2) * size + i] = sourceY[i];

    rhsX[i] = destinations[i].x - destinationCentreX;
    rhsY[i] = destinations[i].y - destinationCentreY;
  }

  if (!solveInPlace(matrix, size, rhsX, rhsY)) {
    // A backstop, not the gate: `conditionRatio` above is what actually
    // catches thin clouds, because a pivot can be a plausible 1e-16 for a
    // layout that is degenerate in every way that matters.
    return { ok: false, reason: "ill-conditioned" };
  }

  // A backstop rather than a gate. Every destination was checked finite above
  // and the system was solvable, so reaching this needs a pathology none of
  // the earlier checks name. Tested per coefficient rather than on a sum, for
  // the reason affine.ts:111-121 records: `1e200 + -1e200 + -1e200 + 1e200` is 0,
  // so a summed guard waves an exactly singular system through.
  for (let i = 0; i < size; i += 1) {
    if (!Number.isFinite(rhsX[i]) || !Number.isFinite(rhsY[i])) {
      return { ok: false, reason: "non-finite" };
    }
  }

  return {
    ok: true,
    params: {
      count,
      sourceX,
      sourceY,
      weightsX: rhsX,
      weightsY: rhsY,
      centreX,
      centreY,
      scale,
      destinationCentreX,
      destinationCentreY,
    },
  };
}

/**
 * Gaussian elimination with partial pivoting, in place, over the two
 * right-hand sides at once — the matrix is the same for x and y, so factoring
 * it twice would double an O(n^3) cost that is already the expensive half of a
 * drag frame (measured: 56 ms at n = 500).
 *
 * Returns false rather than producing Infinities when a pivot column is empty.
 */
function solveInPlace(
  matrix: Float64Array,
  size: number,
  rhsX: Float64Array,
  rhsY: Float64Array,
): boolean {
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(matrix[row * size + column]) >
        Math.abs(matrix[pivotRow * size + column])
      ) {
        pivotRow = row;
      }
    }
    const pivot = matrix[pivotRow * size + column];
    if (!(Math.abs(pivot) > 0) || !Number.isFinite(pivot)) {
      return false;
    }
    if (pivotRow !== column) {
      for (let k = column; k < size; k += 1) {
        const swap = matrix[column * size + k];
        matrix[column * size + k] = matrix[pivotRow * size + k];
        matrix[pivotRow * size + k] = swap;
      }
      const swapX = rhsX[column];
      rhsX[column] = rhsX[pivotRow];
      rhsX[pivotRow] = swapX;
      const swapY = rhsY[column];
      rhsY[column] = rhsY[pivotRow];
      rhsY[pivotRow] = swapY;
    }
    for (let row = column + 1; row < size; row += 1) {
      const factor = matrix[row * size + column] / pivot;
      if (factor === 0) {
        continue;
      }
      for (let k = column; k < size; k += 1) {
        matrix[row * size + k] -= factor * matrix[column * size + k];
      }
      rhsX[row] -= factor * rhsX[column];
      rhsY[row] -= factor * rhsY[column];
    }
  }

  for (let row = size - 1; row >= 0; row -= 1) {
    let sumX = rhsX[row];
    let sumY = rhsY[row];
    for (let k = row + 1; k < size; k += 1) {
      sumX -= matrix[row * size + k] * rhsX[k];
      sumY -= matrix[row * size + k] * rhsY[k];
    }
    rhsX[row] = sumX / matrix[row * size + row];
    rhsY[row] = sumY / matrix[row * size + row];
  }
  return true;
}

/**
 * Evaluates the spline at one ORIGINAL-image pixel, returning Web Mercator
 * metres — the same contract `applyAffine` has, so the mesh builder does not
 * care which method produced the transform.
 *
 * Cost is linear in the control-point count, and this runs once per mesh
 * vertex: measured, 4 225 vertices against n = 300 is 12.05 ms.
 */
export function applyTps(
  params: TpsParams,
  x: number,
  y: number,
): MercatorPoint {
  const { count, sourceX, sourceY, weightsX, weightsY } = params;
  const normalisedX = (x - params.centreX) / params.scale;
  const normalisedY = (y - params.centreY) / params.scale;

  let px =
    weightsX[count] +
    weightsX[count + 1] * normalisedX +
    weightsX[count + 2] * normalisedY;
  let py =
    weightsY[count] +
    weightsY[count + 1] * normalisedX +
    weightsY[count + 2] * normalisedY;

  for (let i = 0; i < count; i += 1) {
    const bend = kernel(
      (normalisedX - sourceX[i]) ** 2 + (normalisedY - sourceY[i]) ** 2,
    );
    px += weightsX[i] * bend;
    py += weightsY[i] * bend;
  }

  return {
    x: px + params.destinationCentreX,
    y: py + params.destinationCentreY,
  };
}
