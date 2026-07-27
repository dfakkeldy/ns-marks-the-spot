import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERSIST_DELAY_MS,
  UNDO_HISTORY_LIMIT,
  useGeoreferenceSession,
} from "./useGeoreferenceSession";
import { statusMessage } from "./components/georeferenceStatus";
import {
  BENT,
  collinearExceptOne,
  expectTpsReport,
  irregularGcps,
} from "./testFixtures";
import { applyAffine, solveAffineFromGcps } from "./transform/affine";
import {
  AFFINE_GRID_SIZE,
  TPS_DRAG_GRID_SIZE,
  TPS_GRID_SIZE,
} from "./transform/gcpMesh";
import {
  MAX_GCPS_FOR_TPS_RESIDUALS,
  residualReport,
  tpsResidualReport,
} from "./transform/residuals";
import { solveTps } from "./transform/tps";
import { fromMercator, groundMetresBetween } from "./transform/webMercator";
import type { Gcp, GeoreferenceMethod } from "./types";

const PIXEL_SIZE = { width: 1200, height: 800 };

/** Three points that solve, laid out as a proper triangle. */
const SOLVABLE: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
];

/**
 * `SOLVABLE` plus a fourth point that shares point "a"'s scan pixel exactly —
 * the double-click case — with a distinct map location, so it is not also a
 * duplicate on the destination side.
 *
 * Measured: this 4-point pixel cloud's `conditionRatio` is **0.583**, far
 * above `MIN_CONDITION_RATIO` (5e-3), so `solveAffineFromGcps` succeeds on
 * it. At 4 points (>= `MIN_GCPS_FOR_RESIDUALS`), that means the AFFINE path
 * alone reports `{ kind: "solved", ... }` for this fixture — coincidence
 * only breaks the TPS solve, so a test against this fixture must select
 * `method: "tps"` or it will silently exercise nothing.
 */
const COINCIDENT: Gcp[] = [
  ...SOLVABLE,
  { id: "dup", pixel: { x: 0, y: 0 }, map: { lat: 46.05, lng: -61.15 } },
];

/**
 * Named, and the `initialProps` object annotated with it, so `renderHook`
 * infers `Props` as this and not as the literal's `{ mapId: string }` —
 * otherwise `rerender({ mapId: null, ... })` below fails to typecheck, which
 * `tsc -b` reports and `tsc --noEmit` does not (the solution tsconfig has
 * `"files": []`, so `--noEmit` compiles nothing and exits 0 regardless).
 */
type SessionProps = {
  mapId: string | null;
  initialGcps: Gcp[];
  /** Optional so every existing `rerender({ mapId, initialGcps })` still
   * typechecks — the hook defaults it to "affine" for the same reason. */
  method?: GeoreferenceMethod;
};

function setup(
  initialGcps: Gcp[] = [],
  extra: { method?: GeoreferenceMethod } = {},
) {
  const onPersist = vi.fn();
  const initialProps: SessionProps = { mapId: "map-a", initialGcps, ...extra };
  const hook = renderHook(
    (props: SessionProps) =>
      useGeoreferenceSession({ ...props, pixelSize: PIXEL_SIZE, onPersist }),
    { initialProps },
  );
  return { ...hook, onPersist };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pairing", () => {
  it("completes a GCP scan-first", () => {
    const { result } = setup();
    act(() => result.current.pickScanPoint(100, 200));
    expect(result.current.pending).toEqual({
      side: "scan",
      pixel: { x: 100, y: 200 },
    });
    expect(result.current.status).toEqual({ kind: "awaiting-map" });

    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.pending).toBeNull();
    expect(result.current.gcps).toHaveLength(1);
    expect(result.current.gcps[0]).toMatchObject({
      pixel: { x: 100, y: 200 },
      map: { lat: 46.05, lng: -61.1 },
    });
  });

  it("completes a GCP map-first", () => {
    const { result } = setup();
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.status).toEqual({ kind: "awaiting-scan" });
    act(() => result.current.pickScanPoint(100, 200));
    expect(result.current.gcps).toHaveLength(1);
    expect(result.current.gcps[0].pixel).toEqual({ x: 100, y: 200 });
  });

  it("moves the pending point when the same side is clicked twice", () => {
    const { result } = setup();
    act(() => result.current.pickScanPoint(100, 200));
    act(() => result.current.pickScanPoint(300, 400));
    expect(result.current.pending).toEqual({
      side: "scan",
      pixel: { x: 300, y: 400 },
    });
    expect(result.current.gcps).toHaveLength(0);
  });

  it("cancels a pending point", () => {
    const { result } = setup();
    act(() => result.current.pickScanPoint(100, 200));
    act(() => result.current.cancelPending());
    expect(result.current.pending).toBeNull();
    expect(result.current.gcps).toHaveLength(0);
  });
});

describe("status", () => {
  it("counts down to the three-point minimum", () => {
    const { result } = setup();
    expect(result.current.status).toEqual({ kind: "need-more", remaining: 3 });
    act(() => result.current.pickScanPoint(0, 0));
    act(() => result.current.pickMapPoint(46.1, -61.2));
    expect(result.current.status).toEqual({ kind: "need-more", remaining: 2 });
  });

  it("reports an exact fit at three points instead of a misleading 0 m", () => {
    const { result } = setup(SOLVABLE);
    expect(result.current.status).toEqual({ kind: "exact-fit" });
    expect(result.current.report).toBeNull();
    // Not `.not.toBeNull()`: that passes on `undefined` too, so it would go
    // green against a hook that never returned a mesh at all. Assert the
    // shape — AFFINE_GRID_SIZE is 1, so a solved mesh is a single cell.
    expect(result.current.mesh).toHaveLength(2);
  });

  it("reports RMS from the fourth point on", () => {
    const { result } = setup([
      ...SOLVABLE,
      { id: "d", pixel: { x: 1200, y: 800 }, map: { lat: 46.0, lng: -61.0 } },
    ]);
    expect(result.current.status.kind).toBe("solved");
    // The test is named for the RMS, so assert the RMS. `.not.toBeNull()`
    // passes on `undefined`, and on a report whose numbers are all missing.
    expect(result.current.report?.rmsMetres).toBeGreaterThanOrEqual(0);
    expect(result.current.report?.metresPerGcp).toHaveLength(4);
  });

  it("reports a degenerate SCAN layout rather than drawing a NaN drape", () => {
    const { result } = setup([
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "b", pixel: { x: 100, y: 100 }, map: { lat: 46.1, lng: -61.1 } },
      { id: "c", pixel: { x: 200, y: 200 }, map: { lat: 46.2, lng: -61.2 } },
    ]);
    expect(result.current.status).toEqual({ kind: "degenerate" });
    expect(result.current.mesh).toBeNull();
    expect(result.current.params).toBeNull();
  });

  it("reports a degenerate SOLVE when the map clicks share a meridian", () => {
    // The case source-side checking cannot see: the scan points are a proper
    // triangle, but three map clicks down one meridian are exactly collinear
    // in Mercator, so the linear part is singular, the drape has zero area,
    // and every residual reads a perfect 0 m. MIN_ANISOTROPY_RATIO catches
    // it — which is why this status is not called "collinear".
    const { result } = setup([
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.2, lng: -61.0 } },
    ]);
    expect(result.current.status).toEqual({ kind: "degenerate" });
    expect(result.current.mesh).toBeNull();
  });

  it("lets a pending point take precedence over the count", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(50, 50));
    expect(result.current.status).toEqual({ kind: "awaiting-map" });
  });
});

describe("solve method", () => {
  it("solves with TPS and lattices at TPS_GRID_SIZE when method is tps", () => {
    const { result } = setup(BENT, { method: "tps" });
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("leaves the affine path at gridSize 1", () => {
    const { result } = setup(BENT, { method: "affine" });
    expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
  });

  it("drops a 3-point tps session back to the AFFINE lattice", () => {
    // The session's own copy of the floor `meshForRecord` applies (Task 3 made
    // these two separate sites, and a fallback in only one of them would let
    // the panel go coarse while every saved layer kept paying). At three
    // points the spline's bending weights are exactly zero, so the drapes are
    // identical — measured 1.317e-9 m apart — while 32x32 costs 2048 clipped
    // full-image draws per redraw against the affine's 2.
    const three = setup(BENT.slice(0, 3), { method: "tps" });
    expect(three.result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
    // Same drape, not merely the same shape: a fallback that changed where the
    // map lands would be a silent georeferencing change, not a cost saving.
    const asAffine = setup(BENT.slice(0, 3), { method: "affine" });
    expect(three.result.current.mesh).toEqual(asAffine.result.current.mesh);
    // A floor, not a disabling: one more point is back on the spline.
    const four = setup(BENT.slice(0, 4), { method: "tps" });
    expect(four.result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("actually uses the SPLINE, not an affine fit lattice-d at 64", () => {
    // Compare the two solvers AT THE SAME PIXEL. An earlier draft compared the
    // mesh midpoint against affine evaluated at (1000, 900) while the harness
    // raster is 1200x800 — so the midpoint is (600, 400) and the assertion
    // compared two DIFFERENT points. It passed whether or not TPS was used.
    const { result } = setup(BENT, { method: "tps" });
    const mesh = result.current.mesh!;
    const mid = mesh.length >> 1;                                  // row index
    const pixelX = (PIXEL_SIZE.width * mid) / (mesh.length - 1);
    const pixelY = (PIXEL_SIZE.height * mid) / (mesh.length - 1);
    const affineAt = fromMercator(applyAffine(solveAffineFromGcps(BENT)!, pixelX, pixelY));
    expect(groundMetresBetween(mesh[mid][mid], affineAt)).toBeGreaterThan(100);
  });

  it("reports coincident-points, not degenerate, when the SPLINE refuses points an affine accepts", () => {
    // `solveTps` refuses a strict superset of what `solveAffine` does, so the
    // status cannot key on the affine solve alone: these two points share a
    // scan pixel (a double-click), which least squares averages away and an
    // interpolating spline cannot. Keying on `params` only, the panel would
    // report a solved fit with an RMS figure over a drape that draws nothing.
    //
    // This refusal gets its own status (Task 4) rather than folding into
    // `degenerate`: unlike a thin cloud or a squashed axis, nothing here is
    // remotely collinear (BENT's own conditionRatio is 0.777), and the
    // remedy is different and concrete — delete the duplicate — not "spread
    // your points out".
    const doubleClicked: Gcp[] = [
      ...BENT,
      { id: "dup", pixel: { x: 320, y: 240 }, map: { lat: 46.407181, lng: -61.530755 } },
    ];
    expect(solveAffineFromGcps(doubleClicked)).not.toBeNull();
    const { result } = setup(doubleClicked, { method: "tps" });
    expect(result.current.status).toEqual({ kind: "coincident-points" });
    expect(result.current.mesh).toBeNull();
    // The same points under the affine method are perfectly placeable, which
    // is what makes this a statement about the METHOD and not about the points.
    const affine = setup(doubleClicked, { method: "affine" });
    expect(affine.result.current.status.kind).toBe("solved");
  });

  it("reports coincident-points on a minimal 4-point fixture, where the baseline trap is that affine alone would call it solved", () => {
    // `COINCIDENT` is `SOLVABLE` (3 points) plus a 4th sharing point "a"'s
    // scan pixel. Measured: that pixel cloud's conditionRatio is 0.583 — far
    // above MIN_CONDITION_RATIO — and 4 points meets MIN_GCPS_FOR_RESIDUALS,
    // so `solveAffineFromGcps` succeeds AND produces a residual report on
    // this exact fixture. A test that omits `method: "tps"` here would
    // observe `{ kind: "solved", ... }` before AND after any fix to the
    // coincident-points handling below — it would never touch `solveTps` at
    // all, so it could not detect its own failure.
    expect(solveAffineFromGcps(COINCIDENT)).not.toBeNull();
    const affineOnly = setup(COINCIDENT, { method: "affine" });
    expect(affineOnly.result.current.status.kind).toBe("solved");

    const { result } = setup(COINCIDENT, { method: "tps" });
    expect(result.current.status).toEqual({ kind: "coincident-points" });
    expect(result.current.mesh).toBeNull();
  });
});

describe("method-aware accuracy report", () => {
  /**
   * Measured on BENT, which is genuinely bent (an affine leaves 109-391 m of
   * ground residual at its own control points):
   *
   *   affine fit residual  163.31 390.82 181.93 163.29 108.79 143.46 274.68 348.44
   *   TPS leave-one-out    196.00 592.52 257.80 123.42 123.91 108.01 373.70 411.91
   *
   * The two arrays disagree by 15.1 m at the closest point and 201.7 m at the
   * worst, and their RMS figures by 75.7 m. That gap is what makes the
   * assertions below discriminating: an assertion that lands on one array
   * cannot also be satisfied by the other, so pointing the TPS branch back at
   * `residualReport` fails rather than passing by coincidence.
   *
   * NOT usable as a discriminator: `mostInconsistentIndex`, which is 1 under
   * BOTH — by design, since `tpsResidualReport` ranks the suspect by the affine
   * residual on purpose. `OUTLIER_FIXTURE` exists for that half and is asserted
   * in `residuals.test.ts`.
   */
  const AFFINE_RMS = 241.982;
  const LOO_RMS = 317.712;

  it("takes a TPS session's numbers from leave-one-out, not from the affine fit", () => {
    const loo = expectTpsReport(tpsResidualReport(BENT));
    const affine = residualReport(BENT, solveAffineFromGcps(BENT)!)!;

    // State the discrimination as data before relying on it. Without this, a
    // future fixture whose two fits happened to agree would leave the
    // assertions below green against either wiring.
    for (let index = 0; index < BENT.length; index += 1) {
      // A metre, not the measured 15.1195 m minimum. The guard's job is to
      // catch a fixture where the two fits COINCIDE; pinning it just under the
      // measured value gives it a 0.8% margin while the assertions it guards
      // have margins of ~15 000x, so it would fire first on innocuous drift.
      expect(
        Math.abs(loo.metresPerGcp[index] - affine.metresPerGcp[index]),
      ).toBeGreaterThan(1);
    }
    expect(affine.rmsMetres).toBeCloseTo(AFFINE_RMS, 2);
    expect(loo.rmsMetres).toBeCloseTo(LOO_RMS, 2);

    const { result } = setup(BENT, { method: "tps" });
    expect(result.current.report!.metresPerGcp).toEqual(loo.metresPerGcp);
    expect(result.current.report!.rmsMetres).toBeCloseTo(LOO_RMS, 2);
    expect(result.current.report!.rmsMetres).not.toBeCloseTo(AFFINE_RMS, 2);
    // The panel's headline number comes off the same report, so pin it here
    // too: "RMS 242 m across 8 points" over a spline drape is the affine
    // figure wearing the spline's clothes.
    expect(result.current.status).toEqual({
      kind: "solved",
      rmsMetres: loo.rmsMetres,
      count: BENT.length,
      // The status carries WHICH fit produced that number, because the two
      // paths need different sentences: leave-one-out overstates true warp
      // error by 1.77x-3.71x and is never optimistic, so it is an upper bound
      // and must not be labelled "RMS". Re-deriving `method` at the render site
      // is what would let the label and the number come from different fits.
      method: "tps",
    });
    expect(statusMessage(result.current.status)).toBe(
      `No worse than ${Math.round(loo.rmsMetres)} m across ${BENT.length} points`,
    );
  });

  it("leaves an AFFINE session on the affine fit residual, unchanged", () => {
    const affine = residualReport(BENT, solveAffineFromGcps(BENT)!)!;
    const { result } = setup(BENT, { method: "affine" });
    expect(result.current.report!.metresPerGcp).toEqual(affine.metresPerGcp);
    expect(result.current.report!.rmsMetres).toBeCloseTo(AFFINE_RMS, 2);
    // The other half of the same claim: an unconditional switch to
    // leave-one-out would pass every assertion above except this one.
    expect(result.current.report!.rmsMetres).not.toBeCloseTo(LOO_RMS, 2);
    // …and the affine sentence is unchanged. `rmsMetres` here IS a fit
    // residual, so "no worse than" would be the wrong word on this path — the
    // bound framing belongs only where the number is leave-one-out.
    expect(statusMessage(result.current.status)).toBe(
      `RMS ${Math.round(AFFINE_RMS)} m across ${BENT.length} points`,
    );
  });

  it("tells a 51-point TPS session the truth instead of asking for a 4th point", () => {
    // The bug `MAX_GCPS_FOR_TPS_RESIDUALS`'s own handoff note warns about, and
    // the first of the THREE reasons `tpsResidualReport` can refuse for to be
    // told apart: back when a missing report meant only "too few points to
    // leave one out", the status memo mapped every refusal to `exact-fit`,
    // whose copy is "Exact fit — add a 4th point to check accuracy."
    const over = irregularGcps(MAX_GCPS_FOR_TPS_RESIDUALS + 1);

    // Premise, asserted rather than assumed: at 51 points BOTH solvers still
    // accept, so the status below is reached through the residual branch. If
    // either refused, the memo would short-circuit on `degenerate` and this
    // test would go green without the cap existing at all.
    expect(solveTps(over).ok).toBe(true);
    expect(solveAffineFromGcps(over)).not.toBeNull();

    const { result } = setup(over, { method: "tps" });
    expect(result.current.report).toBeNull();
    expect(result.current.status).toEqual({ kind: "too-many-points" });
    // No `.not.toBe("exact-fit")` alongside: the toEqual above already implies
    // it, so no input could fail one and pass the other. The statusMessage
    // check below is different — it CAN fail independently, by routing to a
    // new kind whose copy was copy-pasted from `exact-fit`.
    expect(statusMessage(result.current.status)).not.toBe(
      "Exact fit — add a 4th point to check accuracy.",
    );
  });

  it("still reports a real RMS AT the cap, so the boundary is bracketed from both sides", () => {
    // 50 is inside the cap and 51 is outside it. Asserting only the refusal
    // above would pass against a cap of 1 — or against a TPS path that never
    // produced a report at all.
    const atCap = irregularGcps(MAX_GCPS_FOR_TPS_RESIDUALS);
    const { result } = setup(atCap, { method: "tps" });
    expect(result.current.report!.metresPerGcp).toHaveLength(
      MAX_GCPS_FOR_TPS_RESIDUALS,
    );
    expect(result.current.status.kind).toBe("solved");
  });

  it("names a refused refit at EVERY point count, not just the four the first note described", () => {
    // The third reason `tpsResidualReport` can refuse for, and the one that
    // does not follow from a count: the full set solves and the drape draws,
    // but hold any one point back and the rest are collinear. Folded into
    // `exact-fit` — as it was when only the cost cap had been split out — a
    // user with TWELVE control points is told to add a fourth.
    //
    // Swept rather than asserted at n = 4, deliberately. The first version of
    // this finding called it a 4-point curiosity; it is not, and a single
    // count would have understated it in exactly the same way.
    for (const count of [4, 5, 6, 8, 12, 20]) {
      const gcps = collinearExceptOne(count);

      // Premise: this is NOT `degenerate`. Both solvers accept the full set,
      // so the map is on screen and only the accuracy figure is missing.
      expect(solveTps(gcps).ok, `full TPS solve at n=${count}`).toBe(true);
      expect(solveAffineFromGcps(gcps), `full affine at n=${count}`).not.toBeNull();

      const { result } = setup(gcps, { method: "tps" });
      // The drape really does draw — the lattice is built, at the settled
      // tier. This is what makes "the map still draws" in the copy a true
      // statement rather than a hopeful one.
      expect(result.current.mesh!.length - 1, `mesh at n=${count}`).toBe(
        TPS_GRID_SIZE,
      );
      expect(result.current.report, `report at n=${count}`).toBeNull();
      expect(result.current.status, `status at n=${count}`).toEqual({
        kind: "refit-refused",
      });
      expect(statusMessage(result.current.status)).not.toBe(
        "Exact fit — add a 4th point to check accuracy.",
      );
    }
  });

  it("keeps the three TPS refusals on three different messages", () => {
    // The taxonomy in one place. Each of these is reached by its own input,
    // and the point is that no two produce the same sentence: collapsing any
    // pair is the bug this file has now caught twice.
    const messages = [
      setup(BENT.slice(0, 3), { method: "tps" }), // too few to leave one out
      setup(irregularGcps(MAX_GCPS_FOR_TPS_RESIDUALS + 1), { method: "tps" }),
      setup(collinearExceptOne(8), { method: "tps" }),
    ].map(({ result }) => statusMessage(result.current.status));

    expect(new Set(messages).size, JSON.stringify(messages)).toBe(3);
  });

  it("keeps the TPS number live through a drag rather than deferring or blanking it", () => {
    // DECIDED, not inherited (Task 7b). The report memo re-runs on every
    // pointer move, and leave-one-out is n O(n^3) solves — but the cap above
    // is what bounds that, and it was chosen for exactly this frame: measured
    // warm in this repo, the whole report costs 3.0 ms at n = 40 and 6.2-7.2 ms
    // at n = 50, and above 50 it returns null after an O(1) length test. So the
    // worst drag frame spends under half of 16 ms on the accuracy column, next
    // to a mesh already coarsened to TPS_DRAG_GRID_SIZE.
    //
    // Deferring to `dragend` would buy back at most those milliseconds and
    // would cost a lie: the panel would show "RMS 318 m" — the figure for the
    // point's OLD position — while the user watches the drape move under a
    // point they have already dragged 800 m. Blanking it instead swaps the
    // number for "—" and drops the status to `exact-fit`, which is worse.
    const { result } = setup(BENT, { method: "tps" });
    expect(result.current.report!.rmsMetres).toBeCloseTo(LOO_RMS, 2);

    act(() => result.current.beginDragGcp("b4"));
    act(() => result.current.moveGcpOnMap("b4", 46.344717, -61.484514));

    // Mid-drag, pointer still down: the number has already followed the point.
    expect(result.current.report!.metresPerGcp).toHaveLength(BENT.length);
    expect(result.current.report!.rmsMetres).toBeCloseTo(573.05, 1);
    expect(result.current.report!.rmsMetres).not.toBeCloseTo(LOO_RMS, 2);
    expect(result.current.status.kind).toBe("solved");
    // Still the LEAVE-ONE-OUT number and not the affine one: the moved set's
    // affine RMS is 370.53, so a drag-time fallback to the cheaper signal
    // would land here rather than at 573.05.
    expect(result.current.report!.rmsMetres).not.toBeCloseTo(370.53, 1);

    // And releasing changes nothing, because nothing was being withheld.
    const midDrag = result.current.report!.rmsMetres;
    act(() => result.current.endDragGcp("b4"));
    expect(result.current.report!.rmsMetres).toBeCloseTo(midDrag, 9);
  });
});

describe("two-tier mesh density during a drag", () => {
  it("coarsens the TPS lattice while a point is being dragged and restores the fine tier once the pointer settles", () => {
    // A settled TPS redraw is 2 * 32^2 = 2048 clipped `drawImage` calls, each
    // one redrawing the WHOLE source image under a clip (verified at
    // `render/mesh.ts:67-69`). A drag emits state on every pointer move, so
    // the drag tier is 2 * 16^2 = 512 instead.
    const { result } = setup(BENT, { method: "tps" });
    const settled = result.current.mesh!.length - 1;
    expect(settled).toBe(TPS_GRID_SIZE);

    act(() => result.current.beginDragGcp("b0"));
    const dragging = result.current.mesh!.length - 1;
    expect(dragging).toBe(TPS_DRAG_GRID_SIZE);

    // The DIRECTION, not only the two identities. Both assertions above name
    // the constant they compare against, so swapping the two constants'
    // VALUES in `gcpMesh.ts` leaves them green; only this one fails on that
    // mutation as well as on a swap of the two uses in the hook.
    expect(dragging).toBeLessThan(settled);

    // Restored on the real `dragend`, never on a timer: a drag that ends
    // without a final pointer move would otherwise leave the drape coarse
    // for the rest of the session.
    act(() => result.current.endDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("leaves the AFFINE path at its single pixel-exact cell for the whole drag", () => {
    // The two-tier switch is TPS-only on purpose. A pixel->Mercator affine
    // composes with Leaflet's own affine screen transform, so ONE cell is
    // already exact; dropping the affine drape to a 16x16 lattice during a
    // drag would cost 512 draws instead of 2 and buy nothing at all.
    const { result } = setup(BENT, { method: "affine" });
    expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
    act(() => result.current.beginDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
    act(() => result.current.endDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(AFFINE_GRID_SIZE);
  });

  it("pushes exactly ONE undo step for a drag, end included", () => {
    // `endDragGcp` and `beginDragGcp` share a signature, so wiring `dragend`
    // to the wrong one typechecks and lints clean. This is the half of that
    // mistake a mesh assertion cannot see: a second snapshot on release makes
    // one drag cost two Ctrl+Z presses.
    const { result } = setup(SOLVABLE);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnScan("a", 40, 60));
    act(() => result.current.endDragGcp("a"));
    expect(result.current.gcps[0].pixel).toEqual({ x: 40, y: 60 });

    act(() => result.current.undo());
    expect(result.current.gcps[0].pixel).toEqual({ x: 0, y: 0 });
    expect(result.current.canUndo).toBe(false);
  });

  it("forgets a drag left open by a map switch, rather than draping the next map coarse forever", () => {
    // Drag-active is per-SESSION state, so it belongs to the map that owned
    // the drag. Closing the panel mid-drag (the panel unmounts, so no
    // `dragend` ever arrives) must not hand the next map a permanently
    // coarse drape.
    const { result, rerender } = setup(BENT, { method: "tps" });
    act(() => result.current.beginDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);
    rerender({ mapId: "map-b", initialGcps: BENT, method: "tps" });
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("cancels the drag when undo removes the dragged point, rather than pinning the coarse tier until the next drag", () => {
    // Minor F1. Ctrl+Z twice with the pointer still down: the first undo
    // consumes the drag's own snapshot, the second pops PAST the dragged
    // point's creation. The point is gone, React unmounts its marker, and
    // Leaflet's `dragend` — the only thing that clears `dragging` inside a
    // session — never fires. The drape then sits on the ~44 m drag lattice
    // instead of the ~18 m settled one until the next drag happens to reset
    // it. A drag whose subject no longer exists cannot end any other way,
    // so undo itself must cancel it.
    const { result } = setup(BENT, { method: "tps" });
    act(() => result.current.pickScanPoint(1500, 1500));
    act(() => result.current.pickMapPoint(46.33, -61.45));
    const created = result.current.gcps.at(-1)!.id;

    act(() => result.current.beginDragGcp(created));
    act(() => result.current.moveGcpOnScan(created, 1520, 1480));
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);

    // First Ctrl+Z: back to where the drag started. The point is still
    // there and still held, so the drag tier correctly persists.
    act(() => result.current.undo());
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);

    // Second Ctrl+Z: the creation step. The dragged point ceases to exist.
    act(() => result.current.undo());
    expect(result.current.gcps.some((gcp) => gcp.id === created)).toBe(false);
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);

    // The machine is intact: a later drag still coarsens and settles.
    act(() => result.current.beginDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);
    act(() => result.current.endDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("keeps the coarse tier through a mid-drag undo that leaves the dragged point alive", () => {
    // The guard on the OBVIOUS fix for the test above. Clearing `dragging`
    // unconditionally inside undo() restores the fine mesh in the common
    // single-Ctrl+Z-mid-drag case — with the pointer still down and `drag`
    // events still streaming, which is the exact per-pointer-move redraw
    // TPS_DRAG_GRID_SIZE exists to keep inside a frame. As long as the
    // dragged point survives the undo, the drag is still live and the tier
    // must hold.
    const { result } = setup(BENT, { method: "tps" });
    act(() => result.current.beginDragGcp("b0"));
    act(() => result.current.moveGcpOnScan("b0", 300, 260));

    act(() => result.current.undo());
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);

    // Leaflet never saw the pointer go up; the drag keeps firing and every
    // move must still land on the cheap lattice.
    act(() => result.current.moveGcpOnScan("b0", 340, 280));
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);

    act(() => result.current.endDragGcp("b0"));
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("cancels at the depth where the creation is undone, even through a step the drag re-opened", () => {
    // The interaction with the mid-drag-undo machinery (the PR 2 fix): a
    // move after Ctrl+Z re-opens an undo step, so the creation can sit TWO
    // pops down from the top of history. Cancellation must key on "does the
    // dragged point still exist", not on how many undos have happened.
    const { result } = setup(BENT, { method: "tps" });
    act(() => result.current.pickScanPoint(1500, 1500));
    act(() => result.current.pickMapPoint(46.33, -61.45));
    const created = result.current.gcps.at(-1)!.id;

    act(() => result.current.beginDragGcp(created));
    act(() => result.current.moveGcpOnScan(created, 1520, 1480));
    act(() => result.current.undo());
    // Pointer still down: this move re-opens a step above the creation.
    act(() => result.current.moveGcpOnScan(created, 1560, 1440));

    // Pops the re-opened step. The point survives, so the drag is still
    // live and the tier must hold.
    act(() => result.current.undo());
    expect(result.current.gcps.some((gcp) => gcp.id === created)).toBe(true);
    expect(result.current.mesh!.length - 1).toBe(TPS_DRAG_GRID_SIZE);

    // Pops the creation. Now the subject is gone and the drag must cancel.
    act(() => result.current.undo());
    expect(result.current.gcps.some((gcp) => gcp.id === created)).toBe(false);
    expect(result.current.mesh!.length - 1).toBe(TPS_GRID_SIZE);
  });
});

describe("StrictMode", () => {
  it("creates exactly one control point per completed pair", () => {
    // `main.tsx` wraps <App/> in StrictMode and React 19 double-invokes state
    // updaters there. The first version of this hook snapshotted history,
    // minted an id and called setGcps from inside setPending's updater, so a
    // single pair produced TWO coincident GCPs and every action needed two
    // Undo presses — in the browser only. Every other test in this file uses
    // a bare renderHook and passed throughout. This one is the guard.
    const onPersist = vi.fn();
    const { result } = renderHook(
      () =>
        useGeoreferenceSession({
          mapId: "map-a",
          initialGcps: [],
          pixelSize: PIXEL_SIZE,
          onPersist,
        }),
      { wrapper: StrictMode },
    );
    act(() => result.current.pickScanPoint(100, 200));
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.gcps).toHaveLength(1);
    // One undo, not two: the history got exactly one snapshot.
    act(() => result.current.undo());
    expect(result.current.gcps).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("re-opens exactly ONE undo step when Ctrl+Z lands mid-drag", () => {
    // The two `undo` tests below prove the step is re-opened at all. This
    // proves it is re-opened ONCE. React 19 double-invokes state updaters
    // under StrictMode, so a fix that read the "an undo just happened" flag
    // from inside an updater would push two identical history entries and
    // cost two Ctrl+Z presses to escape — the same shape as the bug above,
    // and invisible to a bare renderHook.
    const onPersist = vi.fn();
    const { result } = renderHook(
      () =>
        useGeoreferenceSession({
          mapId: "map-a",
          initialGcps: SOLVABLE,
          pixelSize: PIXEL_SIZE,
          onPersist,
        }),
      { wrapper: StrictMode },
    );
    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));
    act(() => result.current.undo());
    act(() => result.current.moveGcpOnMap("a", 46.14, -61.24));

    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.gcps[0].map).toEqual({ lat: 46.1, lng: -61.2 });
    // One step, not two.
    expect(result.current.canUndo).toBe(false);
  });
});

describe("undo", () => {
  it("cannot undo an untouched session", () => {
    expect(setup(SOLVABLE).result.current.canUndo).toBe(false);
  });

  it("undoes an added point", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(600, 400));
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.gcps).toHaveLength(4);
    act(() => result.current.undo());
    expect(result.current.gcps).toHaveLength(3);
    expect(result.current.canUndo).toBe(false);
  });

  it("undoes a delete", () => {
    const { result } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("b"));
    expect(result.current.gcps).toHaveLength(2);
    act(() => result.current.undo());
    expect(result.current.gcps.map((g) => g.id)).toEqual(["a", "b", "c"]);
  });

  it("collapses a whole drag into ONE undo step", () => {
    // The subtlety that makes undo usable: a marker drag emits state on every
    // pointer move. Snapshotting per move would bury the history under fifty
    // indistinguishable frames.
    const { result } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));
    act(() => result.current.moveGcpOnMap("a", 46.12, -61.22));
    act(() => result.current.moveGcpOnMap("a", 46.13, -61.23));
    expect(result.current.gcps[0].map).toEqual({ lat: 46.13, lng: -61.23 });
    act(() => result.current.undo());
    expect(result.current.gcps[0].map).toEqual({ lat: 46.1, lng: -61.2 });
    expect(result.current.canUndo).toBe(false);
  });

  it("does not strand the point when Ctrl+Z lands MID-drag", () => {
    // A drag snapshots exactly once, on drag start (the test above). Press
    // Ctrl+Z with the pointer still DOWN and that lone snapshot is consumed
    // while Leaflet's drag is still live: the `drag` events that keep
    // arriving then commit further positions with nothing underneath them.
    // The user is parked on a position they never confirmed, with Undo
    // greyed out — no way back. Recorded as "inferred"; this reproduces it.
    const { result } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));

    // Ctrl+Z, pointer still down.
    act(() => result.current.undo());
    expect(result.current.gcps[0].map).toEqual({ lat: 46.1, lng: -61.2 });

    // Leaflet never saw the pointer go up, so the drag keeps firing.
    act(() => result.current.moveGcpOnMap("a", 46.14, -61.24));
    expect(result.current.gcps[0].map).toEqual({ lat: 46.14, lng: -61.24 });

    // The observable requirement: a second Ctrl+Z must still get the user
    // out of a position they never confirmed.
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.gcps[0].map).toEqual({ lat: 46.1, lng: -61.2 });
  });

  it("does not strand the point when Ctrl+Z lands mid-SCAN-drag", () => {
    // The scan-side mirror. Kept separate because moveGcpOnScan and
    // moveGcpOnMap are independent call sites: stubbing one out has already
    // been shown (see the scan-drag test below) to leave the whole suite
    // green, so a fix applied to only one of them would go unnoticed.
    const { result } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("b"));
    act(() => result.current.moveGcpOnScan("b", 900, 120));

    act(() => result.current.undo());
    expect(result.current.gcps[1].pixel).toEqual({ x: 1200, y: 0 });

    act(() => result.current.moveGcpOnScan("b", 640, 480));
    expect(result.current.gcps[1].pixel).toEqual({ x: 640, y: 480 });

    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.gcps[1].pixel).toEqual({ x: 1200, y: 0 });
  });

  it("still collapses a drag that STARTS after an undo", () => {
    // Guards the fix above from over-correcting. Whatever marks "an undo
    // just happened" must be cleared by the next snapshot, or the first
    // move of the NEXT drag pushes a second history entry and one ordinary
    // drag suddenly costs two Undo presses — the exact regression the
    // collapse test exists to prevent, reintroduced by the back door.
    const { result } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("c"));
    act(() => result.current.undo());
    expect(result.current.gcps).toHaveLength(3);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));
    act(() => result.current.moveGcpOnMap("a", 46.12, -61.22));
    expect(result.current.gcps[0].map).toEqual({ lat: 46.12, lng: -61.22 });

    act(() => result.current.undo());
    expect(result.current.gcps[0].map).toEqual({ lat: 46.1, lng: -61.2 });
    expect(result.current.canUndo).toBe(false);
  });

  it("undoes a scan-side drag, which moves ORIGINAL image pixels", () => {
    // Added beyond the brief's list: mutation testing showed `moveGcpOnScan`
    // stubbed out to a no-op passed all 25 of the specified tests, so the
    // scan-side mirror of the drag above had no guard at all.
    const { result } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("b"));
    act(() => result.current.moveGcpOnScan("b", 900, 120));
    expect(result.current.gcps[1].pixel).toEqual({ x: 900, y: 120 });
    // Only the dragged point moves.
    expect(result.current.gcps[0].pixel).toEqual({ x: 0, y: 0 });
    act(() => result.current.undo());
    expect(result.current.gcps[1].pixel).toEqual({ x: 1200, y: 0 });
  });

  it("caps history so a long session cannot grow without bound", () => {
    const { result } = setup(SOLVABLE);
    for (let i = 0; i < UNDO_HISTORY_LIMIT + 10; i += 1) {
      act(() => result.current.deleteGcp("a"));
      act(() => result.current.beginDragGcp("b"));
    }
    let undos = 0;
    while (result.current.canUndo && undos < UNDO_HISTORY_LIMIT + 20) {
      act(() => result.current.undo());
      undos += 1;
    }
    // Not `toBeLessThanOrEqual`: that also passes against a cap of 1, or of
    // 0 — it proves history is bounded, not that it holds UNDO_HISTORY_LIMIT
    // entries. Each loop iteration pushes TWO snapshots (deleteGcp snapshots
    // unconditionally, even once "a" no longer exists to delete; beginDragGcp
    // snapshots too), so UNDO_HISTORY_LIMIT + 10 iterations push well past
    // the cap and the trailing window holds exactly UNDO_HISTORY_LIMIT.
    expect(undos).toBe(UNDO_HISTORY_LIMIT);
  });
});

describe("persistence", () => {
  it("debounces writes instead of hitting IndexedDB every pointer move", () => {
    const { result, onPersist } = setup(SOLVABLE);
    act(() => result.current.beginDragGcp("a"));
    act(() => result.current.moveGcpOnMap("a", 46.11, -61.21));
    act(() => result.current.moveGcpOnMap("a", 46.12, -61.22));
    expect(onPersist).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0]).toBe("map-a");
    expect(onPersist.mock.calls[0][1][0].map).toEqual({
      lat: 46.12,
      lng: -61.22,
    });
  });

  it("does not persist the initial state", () => {
    const { onPersist } = setup(SOLVABLE);
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS * 3);
    });
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("flushes a pending write immediately on demand", () => {
    const { result, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    act(() => result.current.flush());
    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it("flushes on unmount so closing the panel never loses the last edit", () => {
    const { result, unmount, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    unmount();
    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it("writes a late flush to the map it came from, not the map now open", () => {
    // The hook lives in App and outlives any one panel. Without the id on the
    // dirty entry, opening map B within the debounce window would save map
    // A's control points onto map B.
    const { result, rerender, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    rerender({ mapId: "map-b", initialGcps: [] });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0]).toBe("map-a");
  });

  it("keeps BOTH maps' edits when the session switches mid-debounce", () => {
    // The test above only covers a *late* flush, not an *interrupted* one.
    // With a single dirty slot and a single timer, the first edit on map B
    // overwrites map A's pending write and the timer restarts: measured
    // `persist calls: [["map-b", 1]]` — map A's deletion silently gone. One
    // dirty entry per map id is what fixes it.
    const { result, rerender, onPersist } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    rerender({ mapId: "map-b", initialGcps: [] });
    act(() => result.current.pickScanPoint(10, 20));
    act(() => result.current.pickMapPoint(46.0, -61.0));
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(2);
    const byMap = new Map(
      onPersist.mock.calls.map(([id, gcps]) => [id as string, gcps as Gcp[]]),
    );
    expect(byMap.get("map-a")).toHaveLength(2); // "a" removed from three
    expect(byMap.get("map-b")).toHaveLength(1);
  });
});

describe("discardPendingWrite", () => {
  it("drops a queued write when its map is deleted", () => {
    const { result, onPersist } = setup(SOLVABLE);
    act(() => {
      result.current.moveGcpOnScan("a", 10, 20);
    });
    act(() => {
      result.current.discardPendingWrite("map-a");
    });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS * 2);
    });
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("keeps another map's queued write when one map is discarded", () => {
    // dirtyRef is keyed per map on purpose (Task 7). A blanket clear() would
    // pass the test above and silently lose the OTHER map's edits — exactly
    // the bug the per-map keying was introduced to fix.
    const { result, rerender, onPersist } = setup(SOLVABLE);
    act(() => {
      result.current.moveGcpOnScan("a", 10, 20);
    });
    rerender({ mapId: "map-b", initialGcps: SOLVABLE });
    act(() => {
      result.current.moveGcpOnScan("a", 30, 40);
    });
    act(() => {
      result.current.discardPendingWrite("map-b");
    });
    act(() => {
      vi.advanceTimersByTime(PERSIST_DELAY_MS * 2);
    });
    expect(onPersist.mock.calls.map(([id]) => id)).toEqual(["map-a"]);
  });
});

describe("switching maps", () => {
  it("re-seeds from the new map instead of carrying the old one's points", () => {
    const { result, rerender } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    expect(result.current.gcps).toHaveLength(2);

    rerender({ mapId: "map-b", initialGcps: [] });
    expect(result.current.gcps).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it("drops a half-finished pair so it cannot bridge two maps", () => {
    // A scan pixel from map A paired with a map click made while map B is
    // open would be a control point belonging to neither.
    const { result, rerender } = setup(SOLVABLE);
    act(() => result.current.pickScanPoint(10, 20));
    expect(result.current.pending).not.toBeNull();
    rerender({ mapId: "map-b", initialGcps: [] });
    expect(result.current.pending).toBeNull();
  });

  it("never lets undo on the new map restore the old map's points", () => {
    // Added beyond the brief's list. Resetting only the history DEPTH looks
    // right — `canUndo` is false the moment map B opens — but map A's
    // snapshot is still sitting underneath. The first edit on map B pushes on
    // top of it, so the SECOND undo commits map A's control points onto map B
    // and the debounce then persists them there. Dropping the historyRef
    // clear passed all 25 of the brief's tests; it fails this one.
    const { result, rerender } = setup(SOLVABLE);
    act(() => result.current.deleteGcp("a"));
    rerender({ mapId: "map-b", initialGcps: [] });
    act(() => result.current.pickScanPoint(10, 20));
    act(() => result.current.pickMapPoint(46.0, -61.0));
    expect(result.current.gcps).toHaveLength(1);

    act(() => result.current.undo());
    expect(result.current.gcps).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it("re-seeds when the same map is reopened after an outside edit", () => {
    const { result, rerender } = setup(SOLVABLE);
    rerender({ mapId: null, initialGcps: [] });
    expect(result.current.gcps).toEqual([]);
    rerender({ mapId: "map-a", initialGcps: SOLVABLE });
    expect(result.current.gcps).toHaveLength(3);
  });
});

describe("gcp id minting", () => {
  it("does not reuse an id already present in a freshly seeded session", () => {
    // Regression test: `Gcp.id` is persisted verbatim into IndexedDB (see
    // useUserMaps.saveGcps), but the counter that minted it used to be a
    // page-load-scoped module variable. A browser reload restarted it at 1
    // while a map's saved points already held ids gcp-1..gcp-3, so the next
    // point minted a DUPLICATE id — after which deleteGcp/moveGcpOnScan/
    // moveGcpOnMap, which all match by id, acted on both points at once.
    const existing: Gcp[] = [
      { id: "gcp-1", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
      { id: "gcp-2", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "gcp-3", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
    ];
    const { result } = setup(existing);
    act(() => result.current.pickScanPoint(500, 500));
    act(() => result.current.pickMapPoint(46.05, -61.1));
    expect(result.current.gcps).toHaveLength(4);

    // Assert uniqueness across the whole list rather than one specific
    // string, so this survives a change in the numbering scheme.
    const ids = result.current.gcps.map((gcp) => gcp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
