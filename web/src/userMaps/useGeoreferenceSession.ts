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
import { buildGcpLatLngMesh } from "./transform/gcpMesh";
import type { LatLngPoint, PixelSize } from "./transform/projection";
import { residualReport, type ResidualReport } from "./transform/residuals";
import type { Gcp } from "./types";

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
  /** The solve was refused: thin point cloud, non-finite result, or a
   * transform that squashes one axis past MIN_ANISOTROPY_RATIO. Not
   * "collinear" — two of those three are not straight lines on the scan. */
  | { kind: "degenerate" }
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
};

let gcpCounter = 0;

/** Ids only need to be unique within one session's list. */
function nextGcpId(): string {
  gcpCounter += 1;
  return `gcp-${gcpCounter}`;
}

export function useGeoreferenceSession(options: {
  mapId: string | null;
  initialGcps: Gcp[];
  pixelSize: PixelSize;
  onPersist: (mapId: string, gcps: Gcp[]) => void;
  persistDelayMs?: number;
}): GeoreferenceSession {
  const { mapId, pixelSize } = options;
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

  useLayoutEffect(() => {
    gcpsRef.current = gcps;
    pendingRef.current = pending;
  }, [gcps, pending]);

  useLayoutEffect(() => {
    // Undo history belongs to one map. Its DEPTH is reset in the re-seed
    // branch above; its contents are cleared here, for the same
    // no-ref-writes-during-render reason.
    historyRef.current = [];
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
    historyRef.current = [...historyRef.current, gcpsRef.current].slice(
      -UNDO_HISTORY_LIMIT,
    );
    setHistoryDepth(historyRef.current.length);
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
          { id: nextGcpId(), pixel: { x, y }, map: current.map },
        ]);
        setPending(null);
        return;
      }
      setPending({ side: "scan", pixel: { x, y } });
    },
    [commit, setPending, snapshot],
  );

  const pickMapPoint = useCallback(
    (lat: number, lng: number) => {
      const current = pendingRef.current;
      if (current?.side === "scan") {
        snapshot();
        commit([
          ...gcpsRef.current,
          { id: nextGcpId(), pixel: current.pixel, map: { lat, lng } },
        ]);
        setPending(null);
        return;
      }
      setPending({ side: "map", map: { lat, lng } });
    },
    [commit, setPending, snapshot],
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
      commit(
        gcpsRef.current.map((gcp) =>
          gcp.id === id ? { ...gcp, pixel: { x, y } } : gcp,
        ),
      );
    },
    [commit],
  );

  const moveGcpOnMap = useCallback(
    (id: string, lat: number, lng: number) => {
      commit(
        gcpsRef.current.map((gcp) =>
          gcp.id === id ? { ...gcp, map: { lat, lng } } : gcp,
        ),
      );
    },
    [commit],
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
  }, [commit, setPending]);

  // `solveAffineFromGcps` takes the points and nothing else: its acceptance
  // gate normalises against the point cloud's own long axis, not against the
  // raster, so the raster size is not an input to the solve. `pixelSize` is
  // still load-bearing one step later — the mesh is the drape over the
  // ORIGINAL raster, so preview dimensions here would drape the wrong extent.
  const params = useMemo(() => solveAffineFromGcps(gcps), [gcps]);
  const mesh = useMemo(
    () => (params ? buildGcpLatLngMesh(params, pixelSize) : null),
    [params, pixelSize],
  );
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
    if (!params) {
      // Three different refusals arrive here, only one of which is a straight
      // line on the scan — see the type's comment and Task 3.
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
  }, [gcps.length, params, pending, report]);

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
  };
}
