import L from "leaflet";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawWarpedImage, drawWarpedTriangles } from "./mesh";
import { WarpedRasterLayer } from "./WarpedRasterLayer";

// These tests count warp executions, not pixels, so they mock the mesh module
// at the drawWarpedImage / drawWarpedTriangles seam (the pixel-truth tests
// live in WarpedRasterLayer.test.ts against the real renderer). They are in
// their own file because vi.mock is hoisted per-module and would blind that
// file's getImageData assertions.
vi.mock("./mesh", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mesh")>();
  return { ...actual, drawWarpedImage: vi.fn(), drawWarpedTriangles: vi.fn() };
});

const warpCalls = () => vi.mocked(drawWarpedImage).mock.calls.length;
const chunkCalls = () => vi.mocked(drawWarpedTriangles).mock.calls.length;

/**
 * A pannable, zoomable stand-in for L.Map that keeps the projection contract
 * the layer relies on: `project(ll, zoom)` returns absolute world pixels that
 * scale by exactly 2^Δzoom, `getPixelOrigin()` is fixed between zooms while
 * `containerPointToLayerPoint(0, 0)` absorbs pans — which is why a pan must
 * never invalidate the warp. simulatePan/simulateZoom mutate that state and
 * fire the events the layer subscribes to, like the real map would.
 */
function pannableMap(paneEl: HTMLElement, viewOriginStart = new L.Point(1000, 1000)) {
  const SIZE = new L.Point(800, 600);
  const BASE_ZOOM = 13;
  let zoom = BASE_ZOOM;
  let viewOrigin = viewOriginStart; // world px of container (0, 0) at `zoom`
  let pixelOrigin = viewOrigin.round();
  const handlers: Array<() => void> = [];
  const fire = () => handlers.forEach((handler) => handler());
  const map = {
    getPane: () => paneEl,
    getSize: () => SIZE,
    getZoom: () => zoom,
    getPixelOrigin: () => pixelOrigin,
    getZoomScale: (to: number, from: number) => 2 ** (to - from),
    project: (ll: { lat: number; lng: number }) => {
      const scale = 2 ** (zoom - BASE_ZOOM);
      return new L.Point(
        ((ll.lng + 63.1) * 2000 + 1200) * scale,
        ((46 - ll.lat) * 2000 + 1200) * scale,
      );
    },
    containerPointToLayerPoint: () => viewOrigin.subtract(pixelOrigin),
    on: (_types: string, handler: () => void, ctx: unknown) => {
      handlers.push(handler.bind(ctx));
    },
    off: () => {
      handlers.length = 0;
    },
    simulatePan(dx: number, dy: number) {
      viewOrigin = viewOrigin.add(new L.Point(dx, dy));
      fire(); // moveend
    },
    simulateZoom(dz: number) {
      const scale = 2 ** dz;
      const centre = viewOrigin.add(SIZE.divideBy(2));
      viewOrigin = centre.multiplyBy(scale).subtract(SIZE.divideBy(2));
      zoom += dz;
      pixelOrigin = viewOrigin.round();
      fire(); // zoomend (and the viewreset Leaflet fires with it)
    },
  };
  return map as typeof map & L.Map;
}

/** 2x2 drape spanning world px 1200..1400 on both axes at the base zoom. */
const UNIT_MESH = [
  [
    { lat: 46, lng: -63.1 },
    { lat: 46, lng: -63 },
  ],
  [
    { lat: 45.9, lng: -63.1 },
    { lat: 45.9, lng: -63 },
  ],
];

/**
 * Denser lattice over the same span as UNIT_MESH: 8x8 cells = 128 triangles,
 * enough that the chunk-sizing controller is not clamped by the mesh being
 * smaller than one chunk.
 */
const DENSE_MESH = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: 9 }, (_, col) => ({
    lat: 46 - (0.1 * row) / 8,
    lng: -63.1 + (0.1 * col) / 8,
  })),
);

function makeLayer(latLngMesh = UNIT_MESH) {
  const image = document.createElement("canvas");
  image.width = 2;
  image.height = 2;
  return new WarpedRasterLayer({
    paneName: "user-maps-pane",
    opacity: 0.7,
    image,
    imageSize: { width: 2, height: 2 },
    latLngMesh,
  });
}

/**
 * Deterministic requestAnimationFrame: the layer defers its post-zoom re-warp
 * behind a double rAF so the cheap scaled composite paints first, then walks
 * the mesh in budgeted chunks — one drawWarpedTriangles call per frame.
 * flush() drains the queue including callbacks scheduled by callbacks (the
 * double-rAF chain and every follow-up chunk); step() fires exactly one
 * queued frame, which is what chunk-boundary tests need.
 */
function stubRaf() {
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue.delete(id);
  });
  // Frame timestamps are scripted, not read from the clock: the layer sizes
  // its chunks from the delta between them, so a test that wants to model a
  // slow frame has to be able to say so. The scripted clock starts at
  // performance.now() because real rAF timestamps share that time origin,
  // and the layer's first chunk is seeded from it.
  let clock = performance.now();
  const fireNext = (advanceMs = 16) => {
    const next = queue.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!next) {
      return false;
    }
    queue.delete(next[0]);
    clock += advanceMs;
    next[1](clock);
    return true;
  };
  return {
    flush() {
      while (fireNext()) {
        // drained by the loop condition
      }
    },
    step: fireNext,
  };
}

/** Chunk sizes (the maxTriangles argument) in call order. */
const chunkSizes = () =>
  vi.mocked(drawWarpedTriangles).mock.calls.map((call) => call[5]);

describe("WarpedRasterLayer warp caching", () => {
  let pane: HTMLElement;

  beforeEach(() => {
    pane = document.createElement("div");
    vi.mocked(drawWarpedImage).mockClear();
    // The chunk walker's contract is "returns the index to resume from;
    // >= total means done". Infinity reads as done for any grid, so a
    // sequence ends after one chunk unless a test scripts partial progress
    // with mockReturnValueOnce(n).
    vi.mocked(drawWarpedTriangles).mockReset();
    vi.mocked(drawWarpedTriangles).mockReturnValue(Infinity);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not re-warp when a pan ends at the same zoom", () => {
    const map = pannableMap(pane);
    makeLayer().onAdd(map);
    expect(warpCalls()).toBe(1); // the onAdd warp

    map.simulatePan(50, 30);
    map.simulatePan(-120, 80);

    // A pan translates the already-warped raster; the pane carries the canvas
    // and pixelOrigin is untouched, so there is nothing to redraw at all.
    expect(warpCalls()).toBe(1);
  });

  it("composites the stale cache on zoom and defers the chunked re-warp", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    makeLayer().onAdd(map);
    expect(warpCalls()).toBe(1);

    map.simulateZoom(1);

    // The zoomend frame itself must not walk the mesh: the previous warp is
    // scaled by exactly 2^dz in one drawImage, and the true re-warp waits
    // behind a double rAF so that composite reaches the screen first. When it
    // lands it runs as the budgeted chunk walker, never as a blocking
    // full-mesh warp.
    expect(warpCalls()).toBe(1);
    expect(chunkCalls()).toBe(0);
    raf.flush();
    expect(warpCalls()).toBe(1);
    expect(chunkCalls()).toBe(1);
  });

  it("coalesces back-to-back zooms into one deferred re-warp", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    makeLayer().onAdd(map);

    map.simulateZoom(1);
    map.simulateZoom(1);

    // Each zoomend re-composites, but the second cancels the first's pending
    // walk — zooming through several levels back-to-back pays for one warp.
    expect(warpCalls()).toBe(1);
    raf.flush();
    expect(warpCalls()).toBe(1);
    expect(chunkCalls()).toBe(1);
  });

  it("walks the deferred warp in chunks that resume where they stopped", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    makeLayer().onAdd(map);
    // First chunk reports triangle 1 of 2 drawn (budget spent); the second
    // finishes. The layer must schedule exactly one follow-up frame and
    // thread the resume index through.
    vi.mocked(drawWarpedTriangles).mockReturnValueOnce(1);

    map.simulateZoom(1);
    raf.flush();

    expect(chunkCalls()).toBe(2);
    expect(vi.mocked(drawWarpedTriangles).mock.calls[0][4]).toBe(0);
    expect(vi.mocked(drawWarpedTriangles).mock.calls[1][4]).toBe(1);
    expect(warpCalls()).toBe(1);
  });

  it("lets a mesh swap cancel a pending post-zoom re-warp", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);

    map.simulateZoom(1);
    // A GCP drag re-solves and swaps the mesh before the deferred warp runs.
    // The swap warps synchronously (the drag tier is uncached by design) and
    // must supersede the stale scheduled walk, not stack a second one on it.
    layer.setLatLngMesh(
      UNIT_MESH.map((row) => row.map((ll) => ({ lat: ll.lat, lng: ll.lng + 0.001 }))),
    );
    expect(warpCalls()).toBe(2);
    raf.flush();
    expect(warpCalls()).toBe(2);
    expect(chunkCalls()).toBe(0);
  });

  it("shrinks the next chunk after a frame that overran, and grows after a fast one", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    makeLayer(DENSE_MESH).onAdd(map);
    // Never finishes: every chunk reports one triangle drawn, so the
    // sequence keeps running and the sizing controller stays observable.
    vi.mocked(drawWarpedTriangles).mockReturnValue(1);

    map.simulateZoom(1);
    raf.step(); // first deferral stage
    raf.step(); // second stage: chunk 1, at the seed size
    const seed = chunkSizes()[0];
    expect(seed).toBeGreaterThan(0);

    // A frame that took 200 ms — far past any sane budget — must cut the
    // next chunk hard. The JS clock inside the walk cannot see this cost
    // (GPU raster lands after drawImage returns), which is exactly why the
    // signal is the frame delta.
    raf.step(200);
    const afterSlow = chunkSizes()[1];
    expect(afterSlow).toBeLessThan(seed);

    // A frame comfortably inside the budget grows the chunk again.
    raf.step(1);
    expect(chunkSizes()[2]).toBeGreaterThan(afterSlow);
  });

  it("keeps chunk sizes positive when a frame delta is degenerate", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    makeLayer(DENSE_MESH).onAdd(map);
    vi.mocked(drawWarpedTriangles).mockReturnValue(1);

    map.simulateZoom(1);
    raf.step();
    raf.step();
    // Zero and negative deltas are real: a coalesced rAF batch can hand two
    // callbacks the same timestamp, and a clock adjustment can move it
    // backwards. Neither may produce a zero, negative, or non-finite chunk.
    raf.step(0);
    raf.step(-5);
    raf.step(0);
    for (const size of chunkSizes()) {
      expect(Number.isFinite(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(1);
    }
  });

  it("cancels the rest of a chunk sequence when a mesh swap lands mid-walk", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);
    // Every chunk reports "more to do" — the sequence would run forever.
    vi.mocked(drawWarpedTriangles).mockReturnValue(1);

    map.simulateZoom(1);
    raf.step(); // first stage of the double rAF
    raf.step(); // second stage: the first chunk runs and schedules the next
    expect(chunkCalls()).toBe(1);

    layer.setLatLngMesh(
      UNIT_MESH.map((row) => row.map((ll) => ({ lat: ll.lat, lng: ll.lng + 0.001 }))),
    );
    expect(warpCalls()).toBe(2);

    // The scheduled follow-up chunk must be dead: draining every remaining
    // frame may not run the stale walker again.
    raf.flush();
    expect(chunkCalls()).toBe(1);
  });

  it("keeps an in-flight chunk sequence alive across a contained pan", () => {
    const raf = stubRaf();
    const map = pannableMap(pane);
    makeLayer().onAdd(map);
    vi.mocked(drawWarpedTriangles).mockReturnValueOnce(1);

    map.simulateZoom(1);
    raf.step();
    raf.step(); // first chunk runs, second is queued
    expect(chunkCalls()).toBe(1);

    // A pan inside the backing's slack only re-anchors the canvas; it must
    // not cancel (or duplicate) the refinement still in flight.
    map.simulatePan(10, 0);
    raf.flush();
    expect(chunkCalls()).toBe(2);
    expect(warpCalls()).toBe(1);
  });

  it("composites at the same zoom when a pan exhausts the padding, then chunks", () => {
    const raf = stubRaf();
    // Wide drape: world x 1200..15200, far beyond the padded viewport, so the
    // backing canvas is viewport-capped and a long pan can exhaust it.
    const wideMesh = [
      [
        { lat: 46, lng: -63.1 },
        { lat: 46, lng: -56.1 },
      ],
      [
        { lat: 39, lng: -63.1 },
        { lat: 39, lng: -56.1 },
      ],
    ];
    const map = pannableMap(pane);
    makeLayer(wideMesh).onAdd(map);
    expect(warpCalls()).toBe(1);

    // Padding is half a viewport (400 px) each side; 900 px overshoots it.
    // The still-valid part of the old backing is blitted at its new offset
    // (getZoomScale(z, z) is 1, so the zoom composite covers this for free)
    // and the walk lands afterwards in budgeted chunks — the pan gesture
    // itself never blocks on a full-mesh warp.
    map.simulatePan(900, 0);
    expect(warpCalls()).toBe(1);
    expect(chunkCalls()).toBe(0);
    raf.flush();
    expect(warpCalls()).toBe(1);
    expect(chunkCalls()).toBe(1);

    // The fresh backing rect is centred on the new view: slack restored.
    map.simulatePan(50, 0);
    raf.flush();
    expect(warpCalls()).toBe(1);
    expect(chunkCalls()).toBe(1);
  });

  it("keeps the cache when the drape pans fully off-screen and back", () => {
    const map = pannableMap(pane);
    makeLayer().onAdd(map);

    map.simulatePan(5000, 0);
    map.simulatePan(-5000, 0);

    // The canvas is world-anchored and still holds the drape's pixels; a
    // small drape's backing rect contains its whole bbox, so no pan at this
    // zoom can ever invalidate it — even one that leaves it off-screen.
    expect(warpCalls()).toBe(1);
  });

  it("warps mesh swaps into an unpadded backing so drag frames stay viewport-sized", () => {
    const raf = stubRaf();
    // Wide drape (world x 1200.., y 1200.. far beyond the view) so backing
    // extents are visible in the canvas size. Near edges are exact numbers;
    // far edges are clipped by the view long before float dust matters.
    const wideMesh = [
      [
        { lat: 46, lng: -63.1 },
        { lat: 46, lng: -56.1 },
      ],
      [
        { lat: 39, lng: -63.1 },
        { lat: 39, lng: -56.1 },
      ],
    ];
    const map = pannableMap(pane);
    const layer = makeLayer(wideMesh);
    layer.onAdd(map);
    const canvas = pane.querySelector("canvas") as HTMLCanvasElement;
    // View-driven warp: padded viewport (x 600..2200, y 700..1900) clipped to
    // the drape-with-margin (1197..): 1003 x 703.
    expect([canvas.width, canvas.height]).toEqual([1003, 703]);

    // A mesh swap is the GCP-drag hot path: the cache is invalid again on the
    // next pointer move, so padding buys nothing and only multiplies the
    // pixels every drag frame has to paint. It must warp the bare view
    // (x 1000..1800, y 1000..1600) clipped to the drape: 603 x 403.
    layer.setLatLngMesh([
      [
        { lat: 46, lng: -63.1 },
        { lat: 46, lng: -56.1 },
      ],
      [
        { lat: 39.5, lng: -63.1 },
        { lat: 39.5, lng: -56.1 },
      ],
    ]);
    expect([canvas.width, canvas.height]).toEqual([603, 403]);

    // The first view change after the swap restores a padded cache — by
    // compositing the unpadded backing into it and chunking the walk, not by
    // blocking the pan on a synchronous full-mesh warp.
    map.simulatePan(50, 0);
    expect(warpCalls()).toBe(2);
    expect(canvas.width).toBeGreaterThan(1000);
    raf.flush();
    expect(warpCalls()).toBe(2);
    expect(chunkCalls()).toBe(1);
  });

  it("re-warps on every mesh swap (the drag tier stays uncached)", () => {
    const map = pannableMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);

    layer.setLatLngMesh(
      UNIT_MESH.map((row) => row.map((ll) => ({ lat: ll.lat, lng: ll.lng + 0.001 }))),
    );
    layer.setLatLngMesh(
      UNIT_MESH.map((row) => row.map((ll) => ({ lat: ll.lat, lng: ll.lng + 0.002 }))),
    );

    expect(warpCalls()).toBe(3);
  });

  it("updates source and destination geometry as one operation", () => {
    const map = pannableMap(pane);
    const image = document.createElement("canvas");
    image.width = 100;
    image.height = 80;
    const layer = new WarpedRasterLayer({
      paneName: "user-maps-pane",
      opacity: 0.7,
      image,
      imageSize: { width: 100, height: 80 },
      latLngMesh: UNIT_MESH,
      sourceRect: { x: 10, y: 5, width: 70, height: 60 },
    });
    layer.onAdd(map);
    expect(vi.mocked(drawWarpedImage).mock.calls[0][2][0][0]).toEqual({
      x: 10,
      y: 5,
    });

    const nextMesh = UNIT_MESH.map((row) =>
      row.map((point) => ({ ...point, lng: point.lng + 0.001 })),
    );
    layer.setGeometry(
      nextMesh,
      { x: 20, y: 15, width: 50, height: 40 },
    );
    const lastCall = vi.mocked(drawWarpedImage).mock.calls.at(-1)!;
    expect(lastCall[2][0][0]).toEqual({ x: 20, y: 15 });
    expect(lastCall[3]).not.toEqual(
      vi.mocked(drawWarpedImage).mock.calls[0][3],
    );
  });
});
