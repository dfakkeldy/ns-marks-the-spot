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
import { buildGcpLatLngMesh, buildTpsLatLngMesh } from "./transform/gcpMesh";
import type { LatLngPoint, PixelSize } from "./transform/projection";
import { residualReport, type ResidualReport } from "./transform/residuals";
import { solveTps } from "./transform/tps";
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
  | { kind: "solved"; rmsMetres: number; count: number };

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
  moveGcpOnScan: (id: string, x: number, y: number) => void;
  moveGcpOnMap: (id: string, lat: number, lng: number) => void;
  deleteGcp: (id: string) => void;
  undo: () => void;
  flush: () => void;
  discardPendingWrite: (mapId: string) => void;
};

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
    // Belongs to the map that just closed, like the history it guards: a
    // stale flag would make the new map's first edit push a spurious step.
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
   */
  const beginDragGcp = useCallback(() => snapshot(), [snapshot]);

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
  const mesh = useMemo(() => {
    if (method === "tps") {
      return tps?.ok ? buildTpsLatLngMesh(tps.params, pixelSize) : null;
    }
    return params ? buildGcpLatLngMesh(params, pixelSize) : null;
  }, [method, params, pixelSize, tps]);
  // Deliberately the AFFINE fit's residuals even under a TPS warp. A spline
  // passes through its control points exactly, so its own fit residual is ~0
  // at every point and carries no signal at all; measured, the affine residual
  // also identifies a displaced point better than TPS leave-one-out at every
  // n >= 5 (62.9% vs 46.8% at n = 8). The honest TPS accuracy figure is a
  // separate, later piece of work.
  const report = useMemo(
    () => (params ? residualReport(gcps, params) : null),
    [gcps, params],
  );

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
    if (!report) {
      // Enough points to solve, too few for residuals to mean anything: an
      // affine passes exactly through three points by construction.
      return { kind: "exact-fit" };
    }
    return {
      kind: "solved",
      rmsMetres: report.rmsMetres,
      count: gcps.length,
    };
  }, [gcps.length, method, params, pending, report, tps]);

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
    moveGcpOnScan,
    moveGcpOnMap,
    deleteGcp,
    undo,
    flush,
    discardPendingWrite,
  };
}
