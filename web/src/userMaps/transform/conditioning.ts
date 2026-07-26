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
 * Reciprocal condition number of a point cloud: the ratio of its narrowest to
 * its widest RMS extent, in [0, 1]. Zero for an exactly collinear cloud, one
 * for a perfectly isotropic one.
 *
 * It takes bare POINTS rather than `Gcp`s or solver pairs because both callers
 * need it on a different shape of input — `solveAffine` has
 * `{src, dst}` pairs and passes `pairs.map(p => p.src)`, `solveTps` has
 * `Gcp`s and passes `gcps.map(g => g.pixel)` — and because `solveTps` runs it
 * a second time over its DESTINATIONS, which are Mercator metres and not
 * pixels at all. A `Gcp[]` signature could serve none of those three.
 *
 * Both solvers must gate on the same number. Measured, a TPS with no
 * conditioning gate accepts a 5-point road layout that `solveAffine` refuses
 * at 2.166e-3, and a 1 px nudge on that layout then moves a drape corner
 * 12.2 km. Two solvers disagreeing about whether the same clicks are usable is
 * the bug this module exists to prevent.
 *
 * Do NOT substitute a pivot check in a solver for this. Measured, the exactly
 * collinear 45-degree cloud `(100,100) (400,400) (900,900)` has bit-identical
 * x and y deviations, so its elimination pivot cancels to exactly 0 and a
 * pivot-only guard refuses it by luck; rotate the same degenerate line oblique
 * to `(100,100) (400,250) (900,500)` and the pivot lands at ~1e-16, which
 * `Math.abs(pivot) > 0` waves straight through. This function returns exactly
 * 0 for both.
 */
export function conditionRatio(
  points: ReadonlyArray<{ x: number; y: number }>,
): number {
  const n = points.length;
  if (n === 0) {
    return 0;
  }

  let centroidX = 0;
  let centroidY = 0;
  for (const point of points) {
    centroidX += point.x;
    centroidY += point.y;
  }
  centroidX /= n;
  centroidY /= n;

  let sumXX = 0;
  let sumXY = 0;
  let sumYY = 0;
  for (const point of points) {
    const x = point.x - centroidX;
    const y = point.y - centroidY;
    sumXX += x * x;
    sumXY += x * y;
    sumYY += y * y;
  }

  // Eigenvalues of the centred 2x2 scatter matrix — the point cloud's widest
  // and narrowest RMS extents. Rotation-invariant by construction, unlike the
  // diagonal terms, which is where the correlation test went wrong.
  const trace = sumXX + sumYY;
  const eigenGap = Math.hypot(sumXX - sumYY, 2 * sumXY);
  const largestEigenvalue = (trace + eigenGap) / 2;
  const smallestEigenvalue = Math.max((trace - eigenGap) / 2, 0);
  if (!(largestEigenvalue > 0)) {
    return 0; // every point sits on the centroid, or a coordinate is NaN
  }
  return Math.sqrt(smallestEigenvalue / largestEigenvalue);
}
