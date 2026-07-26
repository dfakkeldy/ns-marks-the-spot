import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MIN_GCPS_FOR_AFFINE,
  solveAffineFromGcps,
  type AffineParams,
} from "./transform/affine";
import {
  buildGcpLatLngMesh,
  buildTpsLatLngMesh,
  TPS_DRAG_GRID_SIZE,
  TPS_GRID_SIZE,
} from "./transform/gcpMesh";
import type { LatLngPoint, PixelSize } from "./transform/projection";
import {
  residualReport,
  tpsResidualReport,
  type ResidualReport,
  type TpsResidualRefusal,
} from "./transform/residuals";
import { MIN_GCPS_FOR_BENDING_TPS, solveTps } from "./transform/tps";
import type { Gcp, GeoreferenceMethod } from "./types";

export const UNDO_HISTORY_LIMIT = 50;
export const PERSIST_DELAY_MS = 400;

export type PendingPoint =
  | { side: "scan"; pixel: { x: number; y: number } }
  | { side: "map"; map: LatLngPoint }
  | null;

export type GeoreferenceStatus =
  | { kind: "awaiting-map" }
  | { kind: "awaiting-scan" }
  | { kind: "need-more"; remaining: number }
  /** The solve was refused for a reason shared by both solvers: a thin point
   * cloud, a non-finite result, or a transform that squashes one axis past
   * MIN_ANISOTROPY_RATIO. Not "collinear" — none of those three is a straight
   * line on the scan. Two coincident TPS control points is a DIFFERENT
   * refusal, with a different and concrete remedy ("delete the duplicate"
   * rather than "spread your points out"), so it gets its own status below
   * instead of folding in here. */
  | { kind: "degenerate" }
  /** TPS-only: two control points land on the same scan pixel — typically a
   * double-click — which makes the interpolation matrix exactly singular.
   * An affine simply averages duplicates away, so this can arrive even when
   * `params` solved fine. See `solveTps`'s "coincident-points" reason. */
  | { kind: "coincident-points" }
  | { kind: "exact-fit" }
  /**
   * TPS-only: past `MAX_GCPS_FOR_TPS_RESIDUALS` the accuracy figure is refused
   * outright, because leave-one-out is n solves of an O(n^3) system and this
   * memo re-runs on every pointer move of a drag.
   *
   * Its own kind rather than a second use of `exact-fit`, on the taxonomy rule
   * the rest of this union follows — a state earns a kind when its REMEDY
   * differs, not merely its cause. `exact-fit` means "too few points, add
   * one"; this means "too many, and there is nothing to fix — the drape is
   * unaffected". Folded together, a user with 51 control points was told their
   * fit was exact and to add a fourth.
   */
  | { kind: "too-many-points" }
  /**
   * TPS-only: the full set solves and the drape draws, but holding any one
   * point back leaves the rest too thin for `solveTps`, so there is no
   * leave-one-out figure to show. A third remedy again — spread the points
   * out, which is neither "add one" nor "there is nothing to do".
   *
   * Distinct from `degenerate`, and the distinction is the whole point: there
   * the map cannot be pinned down at all, here it is already on screen. Copy
   * that told this user their points "can't pin the map down" would be
   * contradicted by what they are looking at.
   */
  | { kind: "refit-refused" }
  /**
   * `method` is part of the STATE, not re-derived by whoever renders it,
   * because the number means two different things on the two paths and only
   * the producer knows which. Under an affine `rmsMetres` is the fit residual;
   * under a TPS it is leave-one-out, which is measured to overstate true warp
   * error by 1.77x (n=12) to 3.71x (n=4) and to be never optimistic — a
   * conservative UPPER BOUND. Printing it as "RMS" was wrong twice over: it
   * names a fit residual a spline does not have, and it frames a bound as an
   * estimate. Measured case: 4 control points with a true warp error near 65 m
   * displayed "RMS 240 m", which reads as an unusable georeference.
   *
   * Carried here rather than passed alongside to `statusMessage(status, method)`
   * for the reason the rest of this feature follows: two derivations of the
   * same fact can disagree, and a caller holding the wrong one would label the
   * bound as a residual with nothing to catch it.
   */
  | {
      kind: "solved";
      rmsMetres: number;
      count: number;
      method: GeoreferenceMethod;
    };

export type GeoreferenceSession = {
  gcps: Gcp[];
  pending: PendingPoint;
  params: AffineParams | null;
  mesh: LatLngPoint[][] | null;
  report: ResidualReport | null;
  status: GeoreferenceStatus;
  canUndo: boolean;
  pickScanPoint: (x: number, y: number) => void;
  pickMapPoint: (lat: number, lng: number) => void;
  cancelPending: () => void;
  beginDragGcp: (id: string) => void;
  /**
   * The other half of `beginDragGcp`. Must be driven by Leaflet's real
   * `dragend` on BOTH panes — never by a timer or by "no move for N ms",
   * because a drag released without a final pointer move would then leave
   * the TPS drape on the coarse tier for the rest of the session.
   */
  endDragGcp: (id: string) => void;
  moveGcpOnScan: (id: string, x: number, y: number) => void;
  moveGcpOnMap: (id: string, lat: number, lng: number) => void;
  deleteGcp: (id: string) => void;
  undo: () => void;
  flush: () => void;
  discardPendingWrite: (mapId: string) => void;
};

/**
 * The one place a refused TPS accuracy figure becomes a panel status.
 *
 * A standalone function whose ENTIRE body is a `switch` with no `default`, and
 * that shape is load-bearing: it is what makes TypeScript raise TS2366
 * ("function lacks ending return statement") the moment `TpsResidualRefusal`
 * grows a fourth member. Inlined into the status memo the same switch would
 * simply fall through to the code after it, and a new reason would silently
 * inherit whatever copy came next — which is exactly how this bug was found
 * three separate times, one reason at a time.
 *
 * Deliberately NOT collapsed into a lookup object either: an index signature
 * or a `Record<TpsResidualRefusal, GeoreferenceStatus>` would give the same
 * exhaustiveness for a missing key but not for a missing RETURN, and would
 * lose the room for the per-reason reasoning above each arm.
 */
function tpsRefusalStatus(reason: TpsResidualRefusal): GeoreferenceStatus {
  switch (reason) {
    case "too-few-points":
      // The same claim `exact-fit` makes on the affine path, and true for the
      // same reason: with three points a spline IS the affine through them, so
      // it passes through all of them and there is nothing to hold back.
      return { kind: "exact-fit" };
    case "too-many-points":
      return { kind: "too-many-points" };
    case "refit-refused":
      return { kind: "refit-refused" };
  }
}

/**
 * Ids only need to be unique within one map's GCP list, not globally and
 * not across page loads. But `Gcp.id` IS persisted verbatim into IndexedDB
 * (see `useUserMaps.saveGcps`), so a fresh page load must not restart
 * numbering at 1 while a map's saved points already occupy `gcp-1..gcp-N`
 * — that would mint a duplicate id, and two GCPs sharing an id then move
 * and delete together. The counter is re-seeded from the highest existing
 * `gcp-<n>` id whenever a map is (re)loaded (see the layout effect below).
 * Ids that don't match `gcp-<number>` are ignored rather than parsed into
 * NaN.
 */
function highestGcpNumber(gcps: Gcp[]): number {
  let max = 0;
  for (const gcp of gcps) {
    const match = /^gcp-(\d+)$/.exec(gcp.id);
    if (match) {
      const n = Number(match[1]);
      if (n > max) {
        max = n;
      }
    }
  }
  return max;
}

export function useGeoreferenceSession(options: {
  mapId: string | null;
  initialGcps: Gcp[];
  pixelSize: PixelSize;
  onPersist: (mapId: string, gcps: Gcp[]) => void;
  persistDelayMs?: number;
  /**
   * Which solver draws the live drape. Defaults to "affine" so existing
   * callers are unaffected — and because it is the right default: a spline
   * costs an O(n^3) factorisation per edit and a 64x64 lattice per redraw to
   * buy nothing at all on a scan that is not actually bent.
   */
  method?: GeoreferenceMethod;
}): GeoreferenceSession {
  const { mapId, pixelSize } = options;
  const method = options.method ?? "affine";
  const persistDelay = options.persistDelayMs ?? PERSIST_DELAY_MS;
  const [gcps, setGcpsState] = useState<Gcp[]>(options.initialGcps);
  const [pending, setPendingState] = useState<PendingPoint>(null);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [seededFor, setSeededFor] = useState<string | null>(mapId);
  /**
   * "A control point is being dragged right now." Per SESSION, not per point:
   * Leaflet allows exactly one drag at a time (`Draggable._dragging` is a
   * static), so a set of ids could never hold more than one entry, and a
   * second `beginDragGcp` arriving before an `endDragGcp` should simply leave
   * the session dragging.
   *
   * Plain state rather than a ref mirror because nothing reads it outside
   * render — the mesh memo below is its only consumer, and `setDragging`
   * takes a VALUE, never an updater, so StrictMode's double invocation has
   * nothing to double.
   */
  const [dragging, setDragging] = useState(false);

  // React's documented "adjust state when a prop changes": a CONDITIONAL
  // setState during render. Not an effect — `set-state-in-effect` is an error
  // here, and an effect would also render one frame of the previous map's
  // points over the new map. Verified lint-clean against this repo's config.
  // Only STATE is reset here; the ref mirrors below cannot be written during
  // render (also a lint error) and are reconciled in layout effects instead.
  if (mapId !== seededFor) {
    setSeededFor(mapId);
    setGcpsState(options.initialGcps);
    setPendingState(null);
    setHistoryDepth(0);
    // A drag belongs to the map that owned it. Closing the panel mid-drag
    // unmounts the marker, so no `dragend` ever arrives — and a flag left set
    // would drape the NEXT map at the coarse tier indefinitely.
    setDragging(false);
  }

  // --- Ref mirrors --------------------------------------------------------
  //
  // Every mutator reads the current points and the pending half-point from
  // these, never from a setState updater. That is what keeps updaters pure,
  // which is what makes StrictMode's double invocation harmless. They are
  // written eagerly by the writers below (so two mutations in one tick see
  // each other) and reconciled from state in a layout effect (so the
  // render-time re-seed above lands before any handler can run — layout
  // effects flush during commit, before the browser yields to events).
  const gcpsRef = useRef(gcps);
  const pendingRef = useRef<PendingPoint>(null);
  const historyRef = useRef<Gcp[][]>([]);
  /**
   * "The last thing that happened was an undo." Set by `undo`, cleared by
   * `snapshot`.
   *
   * A drag snapshots exactly ONCE, on drag start, so that one drag collapses
   * into one undo step. Ctrl+Z with the pointer still down consumes that lone
   * snapshot while Leaflet's drag is still live, and every `drag` event after
   * it commits a new position with nothing underneath it — the user ends up
   * parked on a position they never confirmed and Undo is greyed out. This
   * flag makes the FIRST move after an undo re-open a step, so the restored
   * state stays reachable; clearing it in `snapshot` is what keeps the REST
   * of that drag (and any later drag) collapsed into a single step.
   */
  const undoConsumedSnapshotRef = useRef(false);
  // The next `gcp-<n>` number to mint. Lives in a ref, not state: minting
  // happens inside pickScanPoint/pickMapPoint (event handlers), and those
  // mutators read from refs rather than state for the same reason the rest
  // of this file does — see the comment on the ref mirrors below.
  const nextGcpNumberRef = useRef(1);

  useLayoutEffect(() => {
    gcpsRef.current = gcps;
    pendingRef.current = pending;
  }, [gcps, pending]);

  useLayoutEffect(() => {
    // Undo history AND the id counter both belong to one map, so both are
    // reset here (not in the render-time re-seed above), for the same
    // no-ref-writes-during-render reason: history's DEPTH is state and is
    // reset up there, but its contents are a ref, cleared here.
    //
    // The counter reads gcpsRef.current rather than options.initialGcps so
    // this effect's deps can stay `[seededFor]` — it must fire only on an
    // actual map switch, not on every edit, and gcpsRef.current already
    // holds the freshly-reseeded list by the time this runs: the mirror
    // effect above runs first in the same commit (effects run in
    // declaration order) and just wrote it there.
    historyRef.current = [];
    // Belongs to the map that just closed, like the history it guards.
    // DEFENSIVE, not load-bearing: deleting this line leaves the whole suite
    // green, because every edit kind reachable as a new map's FIRST edit
    // snapshots — and snapshotting clears the flag — before it consumes it.
    // The residue would only bite on a move that arrives WITHOUT a preceding
    // drag-start, which no path in `ScanPane` or `GeoreferenceMapLayer`
    // currently produces. Kept because a new mover need only forget the
    // drag-start to make it reachable, and the symptom (map B's first edit
    // silently not undoable) is invisible until a user hits Ctrl+Z.
    undoConsumedSnapshotRef.current = false;
    nextGcpNumberRef.current = highestGcpNumber(gcpsRef.current) + 1;
  }, [seededFor]);

  const onPersistRef = useRef(options.onPersist);
  const timerRef = useRef<number | null>(null);
  // One dirty entry PER MAP, not one slot. A single slot only survives a
  // *late* flush, not an *interrupted* one: the first edit on map B
  // overwrites map A's pending payload and restarts the shared timer, so A's
  // write is simply lost (measured: `persist calls: [["map-b", 1]]`). Keyed
  // by id, every map touched inside the window still gets exactly one write.
  const dirtyRef = useRef(new Map<string, Gcp[]>());

  useLayoutEffect(() => {
    // Layout, not passive, per the Global Constraint on refs read by
    // in-flight work: the debounce timer can fire in the same frame as a
    // re-render, and a passive effect is scheduled asynchronously.
    onPersistRef.current = options.onPersist;
  }, [options.onPersist]);

  const writeDirty = useCallback(() => {
    const dirty = dirtyRef.current;
    if (dirty.size === 0) {
      return;
    }
    // Snapshot and clear BEFORE calling out: onPersist re-enters React state
    // (App's saveGcps), and anything it schedules must not be dropped here.
    const entries = [...dirty.entries()];
    dirty.clear();
    for (const [id, next] of entries) {
      // The id travels with the payload, so a write that lands after the
      // session has moved on still goes to the right record.
      onPersistRef.current(id, next);
    }
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    writeDirty();
  }, [writeDirty]);

  /**
   * Drops the queued write for one map WITHOUT performing it — the delete
   * counterpart to `flush`. Keyed, not a blanket clear: `dirtyRef` holds one
   * entry per map precisely so an interrupted session does not lose another
   * map's write, and deleting map A must not cancel map B's.
   */
  const discardPendingWrite = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    if (dirtyRef.current.size === 0 && timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * IndexedDB writes are debounced because a marker drag changes state on
   * every pointer move; committing each one would put a transaction on the
   * main thread dozens of times a second. `flush` covers the two moments
   * where losing the tail would be visible: closing the panel, and unmount.
   */
  const schedulePersist = useCallback(
    (next: Gcp[]) => {
      if (mapId === null) {
        return;
      }
      dirtyRef.current.set(mapId, next);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        writeDirty();
      }, persistDelay);
    },
    [mapId, persistDelay, writeDirty],
  );

  useEffect(() => flush, [flush]);

  /** The single write path: mirror, render, schedule. */
  const commit = useCallback(
    (next: Gcp[]) => {
      gcpsRef.current = next;
      setGcpsState(next);
      schedulePersist(next);
    },
    [schedulePersist],
  );

  const setPending = useCallback((next: PendingPoint) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  /** Snapshot BEFORE a change, so undo restores the prior state. */
  const snapshot = useCallback(() => {
    // Any new step supersedes the "an undo just happened" flag, whoever
    // pushed it — drag start, a delete, or a completed pair.
    undoConsumedSnapshotRef.current = false;
    historyRef.current = [...historyRef.current, gcpsRef.current].slice(
      -UNDO_HISTORY_LIMIT,
    );
    setHistoryDepth(historyRef.current.length);
  }, []);

  /**
   * Called by both move handlers before they commit. The branch lives OUT
   * HERE rather than inside a setState updater, for the same reason as
   * everything else in this file: StrictMode double-invokes updaters.
   */
  const reopenStepIfUndoInterrupted = useCallback(() => {
    if (undoConsumedSnapshotRef.current) {
      snapshot();
    }
  }, [snapshot]);

  /** Reads-then-increments the ref seeded above. Never called during render. */
  const mintGcpId = useCallback(() => {
    const id = `gcp-${nextGcpNumberRef.current}`;
    nextGcpNumberRef.current += 1;
    return id;
  }, []);

  const pickScanPoint = useCallback(
    (x: number, y: number) => {
      // Read the pending half-point from the ref and branch OUT HERE. Doing
      // this inside setPending's updater is what produced two coincident
      // GCPs per pair under StrictMode.
      const current = pendingRef.current;
      if (current?.side === "map") {
        snapshot();
        commit([
          ...gcpsRef.current,
          { id: mintGcpId(), pixel: { x, y }, map: current.map },
        ]);
        setPending(null);
        return;
      }
      setPending({ side: "scan", pixel: { x, y } });
    },
    [commit, mintGcpId, setPending, snapshot],
  );

  const pickMapPoint = useCallback(
    (lat: number, lng: number) => {
      const current = pendingRef.current;
      if (current?.side === "scan") {
        snapshot();
        commit([
          ...gcpsRef.current,
          { id: mintGcpId(), pixel: current.pixel, map: { lat, lng } },
        ]);
        setPending(null);
        return;
      }
      setPending({ side: "map", map: { lat, lng } });
    },
    [commit, mintGcpId, setPending, snapshot],
  );

  const cancelPending = useCallback(() => setPending(null), [setPending]);

  /**
   * Called on drag START only. Snapshotting per pointer move would make undo
   * useless: one drag would fill the entire history with frames that differ
   * by a pixel.
   *
   * The `id` parameter is DELIBERATELY ignored, as it is in `endDragGcp`: the
   * signature exists so both handlers drop straight onto a marker's
   * `(id: string) => void` slot, but drag-active is per-session state (see
   * `dragging` above) and undo snapshots the whole list, so neither needs to
   * know which point moved.
   */
  const beginDragGcp = useCallback(() => {
    setDragging(true);
    snapshot();
  }, [snapshot]);

  /**
   * Called on drag END only, from Leaflet's real `dragend`.
   *
   * It must NOT snapshot: `beginDragGcp` already opened the step, and a
   * second one here would make a single drag cost two Ctrl+Z presses.
   * Ignores its `id` for the reason given on `beginDragGcp`.
   */
  const endDragGcp = useCallback(() => {
    setDragging(false);
  }, []);

  const moveGcpOnScan = useCallback(
    (id: string, x: number, y: number) => {
      reopenStepIfUndoInterrupted();
      commit(
        gcpsRef.current.map((gcp) =>
          gcp.id === id ? { ...gcp, pixel: { x, y } } : gcp,
        ),
      );
    },
    [commit, reopenStepIfUndoInterrupted],
  );

  const moveGcpOnMap = useCallback(
    (id: string, lat: number, lng: number) => {
      reopenStepIfUndoInterrupted();
      commit(
        gcpsRef.current.map((gcp) =>
          gcp.id === id ? { ...gcp, map: { lat, lng } } : gcp,
        ),
      );
    },
    [commit, reopenStepIfUndoInterrupted],
  );

  const deleteGcp = useCallback(
    (id: string) => {
      snapshot();
      commit(gcpsRef.current.filter((gcp) => gcp.id !== id));
    },
    [commit, snapshot],
  );

  const undo = useCallback(() => {
    const past = historyRef.current;
    if (past.length === 0) {
      return;
    }
    historyRef.current = past.slice(0, -1);
    setHistoryDepth(historyRef.current.length);
    commit(past[past.length - 1]);
    setPending(null);
    // Set LAST, and never inside `commit`: a drag that outlives this undo
    // must be able to re-open a step (see the ref's comment). `commit` does
    // not snapshot today, but ordering it after makes that independent of
    // whether it ever does.
    undoConsumedSnapshotRef.current = true;
  }, [commit, setPending]);

  // `solveAffineFromGcps` takes the points and nothing else: its acceptance
  // gate normalises against the point cloud's own long axis, not against the
  // raster, so the raster size is not an input to the solve. `pixelSize` is
  // still load-bearing one step later — the mesh is the drape over the
  // ORIGINAL raster, so preview dimensions here would drape the wrong extent.
  const params = useMemo(() => solveAffineFromGcps(gcps), [gcps]);
  /**
   * Solved only when TPS is the chosen method — it is an O(n^3) factorisation
   * (measured: 10.3 ms at n = 300) and this memo re-runs on every pointer move
   * of a drag. `null` therefore means "not asked", never "refused"; refusal is
   * the `{ ok: false }` arm, which is why every branch below tests `method`
   * rather than testing this for null.
   */
  const tps = useMemo(
    () => (method === "tps" ? solveTps(gcps) : null),
    [gcps, method],
  );
  // The gridSize difference is not a tuning knob: an affine warp composes with
  // Leaflet's own affine screen transform, so ONE cell is pixel-exact and
  // AFFINE_GRID_SIZE stays 1. A spline bends between its control points, so a
  // real lattice is required rather than merely denser.
  //
  // And the TPS lattice — only the TPS lattice — is TWO-TIER. Each mesh cell
  // costs two clipped `drawImage` calls that each redraw the ENTIRE source
  // image, so a settled `TPS_GRID_SIZE` redraw is 8 192 of them; a drag emits
  // state on every pointer move, which `TPS_DRAG_GRID_SIZE` brings down to
  // 512 while still clearing half a CSS pixel at the zoom a user occupies
  // while dragging. The affine path deliberately does NOT switch tiers: one
  // cell is already exact, so a coarse "drag tier" there would cost 512 draws
  // in place of 2 and buy precisely nothing.
  //
  // And below MIN_GCPS_FOR_BENDING_TPS a `tps` session takes the AFFINE
  // lattice, because at three points the spline's bending weights are exactly
  // zero and the two drapes agree to 1.317e-9 m — so the only thing 64x64 buys
  // there is 8 192 draws in place of 2. The same fallback lives in
  // `meshForRecord`; Task 3 established these as two separate sites, and a
  // session-only version would coarsen the panel while every saved layer went
  // on paying.
  const mesh = useMemo(() => {
    if (method === "tps" && gcps.length >= MIN_GCPS_FOR_BENDING_TPS) {
      return tps?.ok
        ? buildTpsLatLngMesh(
            tps.params,
            pixelSize,
            dragging ? TPS_DRAG_GRID_SIZE : TPS_GRID_SIZE,
          )
        : null;
    }
    return params ? buildGcpLatLngMesh(params, pixelSize) : null;
  }, [dragging, gcps.length, method, params, pixelSize, tps]);
  /**
   * Method-aware, because the two fits have completely different residual
   * signals and only one of them is ever non-zero.
   *
   * `tpsResidualReport` takes the POINTS, not `tps.params`, and that asymmetry
   * with `residualReport` is the whole substance of this branch: it re-solves
   * the spline n times, each time WITHOUT one control point, and measures how
   * far the surface misses the point it never saw. A spline interpolates its
   * control points exactly, so a full-set fit residual — the number the affine
   * path reports — reads ~0 m at every point at every count, and showing it
   * under a TPS drape would print "RMS 0 m" for a visibly bent map.
   *
   * The two halves of what that function returns still come from different
   * fits: the COLUMN is leave-one-out, and `mostInconsistentIndex` is the plain
   * affine fit residual, which is measured to find a displaced point better
   * (62.9% vs 46.8% at n = 8) and costs one solve rather than n. That split
   * lives inside `tpsResidualReport`; nothing here needs to know about it.
   *
   * NOT suppressed or deferred while a control point is dragged, unlike the
   * mesh above, and that is a decision rather than an omission. This memo does
   * re-run on every pointer move — but `MAX_GCPS_FOR_TPS_RESIDUALS` was chosen
   * for exactly this frame, so the cost is bounded by construction: measured
   * warm in this repo the whole report is 3.0 ms at n = 40 and 6.2-7.2 ms at
   * n = 50, and past 50 it returns null after an O(1) length test, so the
   * 4-second n = 300 case cannot arise. Under half a 16 ms frame, next to a
   * mesh already coarsened to TPS_DRAG_GRID_SIZE. Deferring to `dragend` would
   * buy those milliseconds back and pay for them in honesty: the panel would
   * keep displaying the accuracy of the point's OLD position while the user
   * watches the drape follow its new one.
   */
  const tpsReport = useMemo(
    () => (method === "tps" ? tpsResidualReport(gcps) : null),
    [gcps, method],
  );
  /**
   * The unwrapped half, which is all `GcpList` and this hook's public surface
   * ever needed: `ResidualReport | null`, unchanged. The REASON a TPS report is
   * missing stays behind in `tpsReport` for the status memo, because that is
   * the only consumer that can act on it.
   */
  const report = useMemo<ResidualReport | null>(() => {
    if (method === "tps") {
      return tpsReport?.ok ? tpsReport.report : null;
    }
    return params ? residualReport(gcps, params) : null;
  }, [gcps, method, params, tpsReport]);

  const status = useMemo<GeoreferenceStatus>(() => {
    // A pending half-point is the most urgent thing to tell the user about,
    // so it outranks the point count.
    if (pending?.side === "scan") {
      return { kind: "awaiting-map" };
    }
    if (pending?.side === "map") {
      return { kind: "awaiting-scan" };
    }
    if (gcps.length < MIN_GCPS_FOR_AFFINE) {
      return { kind: "need-more", remaining: MIN_GCPS_FOR_AFFINE - gcps.length };
    }
    if (tps && !tps.ok && tps.reason === "coincident-points") {
      // Pulled out ahead of the shared `degenerate` bucket below (Task 4):
      // unlike a thin cloud or a squashed axis, two coincident scan points
      // are not remotely collinear, and the remedy is different and
      // concrete — delete the duplicate — so this gets its own status
      // rather than a message that tells the user to "spread points out".
      return { kind: "coincident-points" };
    }
    if (!params || (method === "tps" && !tps?.ok)) {
      // Every refusal shared by BOTH solvers arrives here — see the type's
      // comment. Coincident TPS control points are handled separately, just
      // above, because that one refusal has a different, concrete remedy.
      //
      // The second clause is not redundant, and the implication runs one way
      // only: `solveTps` refuses a strict SUPERSET of what `solveAffine` does
      // (its destination gate IS a `solveAffine` call, and its source gate is
      // the same `conditionRatio` check). Beyond coincidence, `solveTps` also
      // solves its OWN (n+3)x(n+3) interpolation system, which can turn out
      // singular even when the affine system and both conditioning gates are
      // healthy — an affine-only test would report "solved" for a spline that
      // refused, and the panel would show a solved status over a drape that
      // draws nothing.
      return { kind: "degenerate" };
    }
    if (tpsReport && !tpsReport.ok) {
      // Every TPS refusal, told apart by the reason the solver handed back
      // rather than by a predicate re-derived out here. Re-deriving is not
      // actually available: `refit-refused` is only knowable by running the n
      // leave-one-out solves, which is the exact cost the cap exists to bound.
      return tpsRefusalStatus(tpsReport.reason);
    }
    if (!report) {
      // Affine path only — the TPS path returned above whether or not it has
      // numbers. Enough points to solve, too few for residuals to mean
      // anything: an affine passes exactly through three points by
      // construction.
      return { kind: "exact-fit" };
    }
    return {
      kind: "solved",
      rmsMetres: report.rmsMetres,
      count: gcps.length,
      // Straight from the same `method` that chose `report` five lines up, so
      // the label and the number cannot come from different fits.
      method,
    };
  }, [gcps.length, method, params, pending, report, tps, tpsReport]);

  return {
    gcps,
    pending,
    params,
    mesh,
    report,
    status,
    canUndo: historyDepth > 0,
    pickScanPoint,
    pickMapPoint,
    cancelPending,
    beginDragGcp,
    endDragGcp,
    moveGcpOnScan,
    moveGcpOnMap,
    deleteGcp,
    undo,
    flush,
    discardPendingWrite,
  };
}
