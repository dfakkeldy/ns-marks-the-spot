import type { Gcp, UserMapRecord } from "./types";
import type {
  ResidualReport,
  TpsResidualResult,
} from "./transform/residuals";
import { EARTH_RADIUS_METRES } from "./transform/webMercator";

/**
 * Fixtures shared across the `userMaps` test suites.
 *
 * A `.ts` module rather than a `.test.ts` one so any suite can import it, and
 * deliberately NOT named after any module-private helper that already exists —
 * `residuals.test.ts` has its own `nudgeEast` taking a single `Gcp`, which is
 * why the one below is `nudgeGcpEast` and takes an array plus an index.
 */

/**
 * An irregular control set over a 4000 x 3000 px scan of Cape Breton, warped
 * by a smooth NON-affine bend — hence the name.
 *
 * Both properties are load-bearing:
 *
 *  - **Irregular, not a lattice.** No two points share a row or a column and
 *    no spacing repeats. A fitted lattice is nearly affine by construction —
 *    measured on all three real A.F. Church graticule sets, where a TPS scored
 *    no better than an affine at held-out check points — so a lattice cannot
 *    distinguish a working spline from a working affine.
 *  - **Genuinely bent.** An affine fit leaves 108-391 m of ground residual at
 *    these very control points, so "the TPS interpolates exactly" is a real
 *    claim about the spline rather than something an affine would also satisfy.
 *
 * Measured: `conditionRatio` of the pixel cloud is 0.777, and of the first
 * three points alone 0.864 — both far above `MIN_CONDITION_RATIO`, so slices
 * of this array are safe to use as healthy inputs in refusal tests.
 */
export const BENT: Gcp[] = [
  { id: "b0", pixel: { x: 320, y: 240 }, map: { lat: 46.407181, lng: -61.530755 } },
  { id: "b1", pixel: { x: 3610, y: 300 }, map: { lat: 46.39359, lng: -61.331564 } },
  { id: "b2", pixel: { x: 2180, y: 2830 }, map: { lat: 46.270564, lng: -61.421238 } },
  { id: "b3", pixel: { x: 1870, y: 410 }, map: { lat: 46.395776, lng: -61.436675 } },
  { id: "b4", pixel: { x: 940, y: 1420 }, map: { lat: 46.344717, lng: -61.494514 } },
  { id: "b5", pixel: { x: 2650, y: 1180 }, map: { lat: 46.353788, lng: -61.387588 } },
  { id: "b6", pixel: { x: 3820, y: 2050 }, map: { lat: 46.305077, lng: -61.313447 } },
  { id: "b7", pixel: { x: 610, y: 2560 }, map: { lat: 46.284573, lng: -61.52146 } },
];

/**
 * Six points from the same bent survey with `o4` — and only `o4` — displaced
 * 700 m west of where the bend puts it.
 *
 * The fixture exists to make one measured disagreement reproducible: the
 * AFFINE fit residual and the TPS leave-one-out error rank the points
 * differently, and the affine ranking is the correct one.
 *
 *     affine fit residual (ground m)  165.3 194.1 135.4 112.9 [551.3] 302.4
 *     TPS leave-one-out   (ground m)  213.2 477.5 448.0 329.3  639.4 [1266.9]
 *
 * So `argmax(affine) = 4`, which is the point that was actually moved, while
 * `argmax(leave-one-out) = 5`, which is innocent. Both are decisive rather
 * than marginal — 1.82x and 1.98x clear of their runners-up — so a test built
 * on this fixture is not resting on a coin-flip.
 *
 * That is the whole reason PR 3 ranks the suspect row by the affine residual
 * even while a TPS warp is on screen: a spline interpolates its control points
 * exactly, so an outlier left in a leave-one-out refit is absorbed into the
 * surface's shape and corrupts its NEIGHBOURS' scores rather than its own.
 * A fixture where the two rankings agree would let that regression through.
 */
export const OUTLIER_FIXTURE: Gcp[] = [
  { id: "o0", pixel: { x: 320, y: 240 }, map: { lat: 46.407181, lng: -61.530755 } },
  { id: "o1", pixel: { x: 1870, y: 410 }, map: { lat: 46.395776, lng: -61.436675 } },
  { id: "o2", pixel: { x: 3610, y: 300 }, map: { lat: 46.39359, lng: -61.331564 } },
  { id: "o3", pixel: { x: 940, y: 1420 }, map: { lat: 46.344717, lng: -61.494514 } },
  // Displaced: the bend puts this one at lng -61.387588.
  { id: "o4", pixel: { x: 2650, y: 1180 }, map: { lat: 46.353788, lng: -61.396699 } },
  { id: "o5", pixel: { x: 3820, y: 2050 }, map: { lat: 46.305077, lng: -61.313447 } },
];

/**
 * A stored map whose georeference is a GCP set. `pixelSize` is the ORIGINAL
 * raster's, never the preview's, and it contains every `BENT` pixel.
 *
 * `overrides` replaces whole top-level fields, so a caller wanting an affine
 * record passes the entire `georef` object rather than just its `method`.
 */
export function gcpRecord(overrides: Partial<UserMapRecord> = {}): UserMapRecord {
  return {
    id: "bent",
    name: "Church of Inverness 1888",
    source: "image",
    createdAt: "2026-07-26T00:00:00.000Z",
    pixelSize: { width: 4000, height: 3000 },
    georef: { kind: "gcp", method: "tps", gcps: BENT },
    ...overrides,
  };
}

/**
 * A deterministic, well-conditioned irregular control set of any size, for the
 * leave-one-out cost cap — which is now asserted on BOTH sides of the seam, in
 * `residuals.test.ts` against the function and in `useGeoreferenceSession.test.ts`
 * against the status the null report produces. It lives here rather than in
 * either suite so the two cannot drift into testing different point clouds.
 *
 * A golden-angle spiral, so no two points share a row, a column or a spacing.
 * A lattice would be nearly affine by construction — measured on all three real
 * A.F. Church graticule sets — which would make every leave-one-out figure
 * meaninglessly small.
 *
 * Measured at the two sizes the cap tests use: `solveTps` accepts AND
 * `solveAffineFromGcps` succeeds at 50 and at 51 points alike. That is what
 * makes a status assertion at 51 a statement about the cap rather than about a
 * refused solve — otherwise it would short-circuit on `degenerate` and pass for
 * the wrong reason.
 */
export function irregularGcps(count: number): Gcp[] {
  return Array.from({ length: count }, (_, index) => {
    const radius = Math.sqrt((index + 0.5) / count);
    const angle = index * 2.399963229728653;
    const x = 2000 + 1800 * radius * Math.cos(angle);
    const y = 1500 + 1300 * radius * Math.sin(angle);
    return {
      id: `i${index}`,
      pixel: { x, y },
      map: {
        lat: 46.2 + y / 30000 + Math.sin(x / 900) * 0.002,
        lng: -61.6 + x / 20000 + Math.cos(y / 700) * 0.002,
      },
    };
  });
}

/**
 * Unwraps a `TpsResidualResult` in a test that expects numbers, throwing with
 * the refusal REASON when there are none.
 *
 * Shared so both suites report the same way, and a function rather than a bare
 * `!` because the two fail very differently: `result!.report.rmsMetres` on a
 * refusal dies with "Cannot read properties of undefined", several lines from
 * the fixture that caused it and naming nothing useful. This says which of the
 * three refusals fired.
 */
export function expectTpsReport(result: TpsResidualResult): ResidualReport {
  if (!result.ok) {
    throw new Error(`expected a TPS residual report, got: ${result.reason}`);
  }
  return result.report;
}

/**
 * `count` control points of which `count - 1` sit on an exact 45-degree line
 * and one sits well off it — the layout that makes a leave-one-out refit refuse
 * while the full solve is perfectly healthy.
 *
 * Drop the off-line point and the remaining `count - 1` are collinear, so
 * `solveTps` refuses that ONE subset; drop any other and the off-line point is
 * still there to hold the cloud open, so every other subset solves. The full
 * set therefore draws a drape while `tpsResidualReport` can produce no numbers
 * for it — which is a different sentence from "add a 4th point", and the reason
 * `TpsResidualRefusal` exists.
 *
 * Measured across `count` = 4, 5, 6, 8, 12 and 20: `solveTps` and
 * `solveAffineFromGcps` accept the full set at every one (pixel-cloud
 * `conditionRatio` 0.60 / 0.52 / 0.45 at 4 / 8 / 12, far above
 * `MIN_CONDITION_RATIO`), and in every case exactly one subset refuses, with
 * reason `ill-conditioned`. Parameterised by count on purpose: the original
 * note about this path described it as a 4-point curiosity, and it is not.
 *
 * Exactly 45 degrees so the line's x and y deviations are bit-identical and its
 * `conditionRatio` is exactly 0 — see `conditioning.ts`, which documents that
 * an OBLIQUE degenerate line instead lands at ~1e-16 and slips past a
 * pivot-only guard. Nothing here depends on that distinction, but a fixture
 * that sat at 1e-16 would be one solver change away from silently solving.
 *
 * `map` positions come from one affine of the pixel, so the destination cloud
 * is exactly as thin as the source and neither side is doing the refusing by
 * itself.
 */
export function collinearExceptOne(count: number): Gcp[] {
  const onLine = count - 1;
  const toMap = (x: number, y: number) => ({
    lat: 46.4 - y * 0.0001,
    lng: -61.5 + x * 0.00012,
  });
  const gcps: Gcp[] = Array.from({ length: onLine }, (_, index) => {
    const along = 100 + (800 * index) / (onLine - 1);
    return {
      id: `c${index}`,
      pixel: { x: along, y: along },
      map: toMap(along, along),
    };
  });
  gcps.push({ id: "off", pixel: { x: 900, y: 120 }, map: toMap(900, 120) });
  return gcps;
}

/**
 * Index of the largest value, or -1 for an empty list. Ties go to the first
 * index, matching `residualReport`'s strict-greater-than scan — so a caller
 * comparing this against that function's `mostInconsistentIndex` is comparing
 * like with like.
 */
export function argmax(values: number[]): number {
  let best = -1;
  for (let index = 0; index < values.length; index += 1) {
    if (best === -1 || values[index] > values[best]) {
      best = index;
    }
  }
  return best;
}

/**
 * Moves ONE point east by a known number of GROUND metres, returning a new
 * array. The whole point of the index argument is that the rest of the set
 * stays put: translating every point together moves the fit with them, so the
 * displaced point's leave-one-out error would no longer be the externally
 * known distance this helper was asked for.
 */
export function nudgeGcpEast(gcps: Gcp[], index: number, metres: number): Gcp[] {
  return gcps.map((gcp, at) => {
    if (at !== index) {
      return gcp;
    }
    const degrees =
      metres /
      (EARTH_RADIUS_METRES *
        Math.cos((gcp.map.lat * Math.PI) / 180) *
        (Math.PI / 180));
    return { ...gcp, map: { lat: gcp.map.lat, lng: gcp.map.lng + degrees } };
  });
}
