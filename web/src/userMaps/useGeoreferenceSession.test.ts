import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERSIST_DELAY_MS,
  UNDO_HISTORY_LIMIT,
  useGeoreferenceSession,
} from "./useGeoreferenceSession";
import type { Gcp } from "./types";

const PIXEL_SIZE = { width: 1200, height: 800 };

/** Three points that solve, laid out as a proper triangle. */
const SOLVABLE: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
];

/**
 * Named, and the `initialProps` object annotated with it, so `renderHook`
 * infers `Props` as this and not as the literal's `{ mapId: string }` —
 * otherwise `rerender({ mapId: null, ... })` below fails to typecheck, which
 * `tsc -b` reports and `tsc --noEmit` does not (the solution tsconfig has
 * `"files": []`, so `--noEmit` compiles nothing and exits 0 regardless).
 */
type SessionProps = { mapId: string | null; initialGcps: Gcp[] };

function setup(initialGcps: Gcp[] = []) {
  const onPersist = vi.fn();
  const initialProps: SessionProps = { mapId: "map-a", initialGcps };
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
