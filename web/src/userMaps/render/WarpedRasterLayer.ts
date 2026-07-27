import L from "leaflet";
import type { LatLngPoint, PixelSize } from "../transform/projection";
import {
  buildSrcMesh,
  CLIP_OVERDRAW_DEVICE_PX,
  drawWarpedImage,
  drawWarpedTriangles,
  type XY,
} from "./mesh";

export type WarpedRasterLayerOptions = {
  paneName: string;
  opacity: number;
  image: CanvasImageSource;
  imageSize: PixelSize;
  latLngMesh: LatLngPoint[][];
};

/** Axis-aligned rectangle in Leaflet world pixels at one specific zoom. */
type WorldRect = { min: XY; max: XY };

/**
 * How far the cached warp extends beyond the viewport, as a fraction of the
 * viewport dimension added on each side. 0.5 gives half a viewport of pan
 * slack in every direction before the cache is exhausted and the mesh must
 * be re-warped. Padding trades walk frequency for walk size: the extra
 * pixels make each walk larger (see the class comment's measurements), so
 * mesh-swap warps — invalidated on the next drag frame anyway — skip it
 * entirely (`setLatLngMesh` passes padFactor 0).
 */
const BACKING_PAD_FACTOR = 0.5;

/**
 * Per-dimension cap on the cached canvas, in device pixels. The padding above
 * quadruples the pixel count, and a 1280x800 viewport at dpr 2 would reach
 * 5120x3200 (~16.4 Mpx, 65 MB RGBA) — at the edge of iOS Safari's historical
 * canvas-area limits. Capping each dimension at 4096 keeps that worst case at
 * 4096x3200 (~13 Mpx) while never shrinking below the viewport itself, so a
 * dimension that caps out simply loses pan slack, not coverage.
 */
const MAX_BACKING_DIM_DEVICE_PX = 4096;

/**
 * Margin kept around the drape's projected bbox when the backing canvas is
 * clamped to it: triangle clipping overdraws by CLIP_OVERDRAW_DEVICE_PX past
 * the drape edge, and one more pixel keeps that edge's antialiasing
 * on-canvas.
 */
const DRAPE_MARGIN_DEVICE_PX = CLIP_OVERDRAW_DEVICE_PX + 1;

/**
 * Target wall-clock cost of one chunk of the deferred mesh walk, per
 * animation frame.
 *
 * ~8 ms rather than ~16 ms: a rAF callback shares its ~16.7 ms frame (at
 * 60 Hz) with Leaflet's own handlers and the browser's style, paint, and
 * composite work, so a 16 ms chunk would guarantee dropped frames for the
 * whole refinement while 8 ms leaves roughly half the frame free and merely
 * doubles the (invisible — each chunk lands on already-correct composite
 * content) number of refinement frames. On a 120 Hz display an 8 ms chunk
 * still costs at most one skipped frame per chunk.
 *
 * It is a target, not a measured spend: see refineWarp for why a chunk
 * cannot time itself.
 */
const WARP_CHUNK_BUDGET_MS = 8;

/**
 * Frame delta treated as "this frame was not the bottleneck". A chunk that
 * lands inside a vsync-limited frame reports the vsync interval no matter
 * how little work it did, so growth has to be judged against a frame budget
 * rather than against the chunk target: 20 ms is one 60 Hz frame plus a
 * little slack, so ordinary on-time frames read as headroom and only real
 * overruns shrink the chunk.
 */
const WARP_FRAME_TARGET_MS = 20;

/**
 * Triangles in the first chunk of a sequence, before any frame delta has
 * been observed. Deliberately small: the per-triangle cost spans more than
 * two orders of magnitude (measured on an M1 Pro, 2560x2560 destination:
 * ~0.007 ms/triangle from a 3072x2304 source, ~0.3 ms from a 7200x5400 one,
 * where the source no longer fits the GPU image cache), so the seed has to
 * be survivable in the worst regime and the controller ramps up within a
 * few frames in the best.
 */
const WARP_CHUNK_SEED_TRIANGLES = 24;

/**
 * Per-frame growth factor while frames stay inside the target — additive
 * increase, multiplicative decrease, because the cost curve is not smooth.
 * Measured on an M1 Pro at gridSize 32 with a 7200x5400 source, chunks of
 * 24/96/384 triangles cost 5/3/1 ms and the next step to 1536 cost 199 ms:
 * beyond some working-set size the source stops fitting the GPU image cache
 * and per-triangle cost jumps ~100x. Multiplying the chunk by 4 on every
 * good frame walked straight off that cliff once per refinement; growing by
 * a quarter bounds an overshoot to roughly a quarter of the last good
 * frame's cost.
 */
const WARP_CHUNK_GROWTH = 1.25;

function intersectRect(a: WorldRect | null, b: WorldRect | null): WorldRect | null {
  if (!a || !b) {
    return null;
  }
  const min = { x: Math.max(a.min.x, b.min.x), y: Math.max(a.min.y, b.min.y) };
  const max = { x: Math.min(a.max.x, b.max.x), y: Math.min(a.max.y, b.max.y) };
  if (min.x >= max.x || min.y >= max.y) {
    return null;
  }
  return { min, max };
}

/** An empty `inner` is contained in anything, including an empty `outer`. */
function containsRect(outer: WorldRect | null, inner: WorldRect | null): boolean {
  if (!inner) {
    return true;
  }
  if (!outer) {
    return false;
  }
  return (
    outer.min.x <= inner.min.x &&
    outer.min.y <= inner.min.y &&
    outer.max.x >= inner.max.x &&
    outer.max.y >= inner.max.y
  );
}

/**
 * One axis of the backing rect: cap the raw span, keep the capped window
 * centred on the viewport, and slide it back inside the raw span when the
 * viewport sits near an edge. The window always covers the visible part of
 * the drape because its length is at least the viewport's.
 */
function clampSpan(
  min: number,
  max: number,
  cap: number,
  viewMin: number,
  viewMax: number,
): [number, number] {
  if (max - min <= cap) {
    return [min, max];
  }
  const centre = (viewMin + viewMax) / 2;
  let lo = centre - cap / 2;
  let hi = centre + cap / 2;
  if (lo < min) {
    hi += min - lo;
    lo = min;
  }
  if (hi > max) {
    lo -= hi - max;
    hi = max;
  }
  return [lo, hi];
}

/**
 * The world rect the cached canvas should cover: the padded viewport clipped
 * to the drape's own bbox (a drape smaller than the padded viewport never
 * pays for pixels it cannot fill — and once its bbox fits entirely, panning
 * can never exhaust the cache at that zoom), with each dimension capped.
 * Null when the drape is entirely outside the padded viewport.
 */
function computeBackingRect(
  view: WorldRect,
  drape: WorldRect,
  dpr: number,
  padFactor: number,
): WorldRect | null {
  const viewW = view.max.x - view.min.x;
  const viewH = view.max.y - view.min.y;
  const padded: WorldRect = {
    min: {
      x: view.min.x - viewW * padFactor,
      y: view.min.y - viewH * padFactor,
    },
    max: {
      x: view.max.x + viewW * padFactor,
      y: view.max.y + viewH * padFactor,
    },
  };
  const raw = intersectRect(padded, drape);
  if (!raw) {
    return null;
  }
  const capX = Math.max(viewW * dpr, MAX_BACKING_DIM_DEVICE_PX) / dpr;
  const capY = Math.max(viewH * dpr, MAX_BACKING_DIM_DEVICE_PX) / dpr;
  const [minX, maxX] = clampSpan(raw.min.x, raw.max.x, capX, view.min.x, view.max.x);
  const [minY, maxY] = clampSpan(raw.min.y, raw.max.y, capY, view.min.y, view.max.y);
  // Snap to the device-pixel grid: the origin floors so a sub-pixel mesh
  // shift moves rendered content instead of silently riding along with the
  // origin, and the size ceils so the snap never crops the drape edge.
  const ox = Math.floor(minX * dpr) / dpr;
  const oy = Math.floor(minY * dpr) / dpr;
  return {
    min: { x: ox, y: oy },
    max: {
      x: ox + Math.ceil((maxX - ox) * dpr) / dpr,
      y: oy + Math.ceil((maxY - oy) * dpr) / dpr,
    },
  };
}

/**
 * Canvas overlay that draws a raster through a projected mesh.
 *
 * The canvas is not viewport-anchored: it is warped once into a world-pixel
 * rect (`backingRect` — the padded viewport clamped to the drape's bbox) and
 * then left alone while the map pans. At a fixed zoom `map.project()` output
 * is fixed and only pixelOrigin/pane offset move, so a pan translates the
 * already-warped raster; the pane carries the canvas during the drag and
 * `moveend` reduces to a containment check. The full 2·gridSize² clipped
 * drawImage mesh walk only re-runs when the mesh itself changes (every
 * pointer move during a GCP drag — that path is intentionally uncached), the
 * zoom changes, or a pan exhausts the padding.
 *
 * Measured 2026-07-26 (Chrome 148 / ANGLE Metal on an Apple M1 Pro, dpr 2,
 * 1280x800 viewport, this layer on a real Leaflet map, 7200x5400 source,
 * raster completion forced via tiny-canvas readback): pan-end within the
 * slack is 0.0 ms median / 1.4 ms worst over 70 pans at gridSize 32 and 64,
 * with zero mesh walks — replacing the 210 ms-per-pan-end redraw this cache
 * was built to eliminate.
 *
 * The walks that remain are zoom-dependent — what matters is how many
 * triangles land on the backing and how many pixels each covers — and two
 * mechanisms below cut them. Triangles whose grown bbox misses the backing
 * are culled, which is most of them whenever the drape overhangs the
 * canvas: the deep-zoom viewport-capped walk fell from 126 ms to 13–54 ms
 * at gridSize 32 (466 to 27–36 ms at 64). And every walk the layer can
 * defer is deferred behind a composite and then chunked across frames, so
 * the only walks that still block are the first display of a sheet
 * (925 ms at 32) and a mesh swap (57 ms) — the drag tier, uncached by
 * design. The grid-size decision built on these numbers, and the
 * source-size cliff that dominates all of them, live on TPS_GRID_SIZE in
 * gcpMesh.ts.
 */
export class WarpedRasterLayer extends L.Layer {
  private readonly rasterOptions: WarpedRasterLayerOptions;
  private srcMesh: XY[][];
  private canvas: HTMLCanvasElement | null = null;
  private map: L.Map | null = null;
  // What the canvas currently holds. cachedZoom null = nothing valid.
  private cachedZoom: number | null = null;
  private cachedDpr = 1;
  private backingRect: WorldRect | null = null;
  private drapeRect: WorldRect | null = null;
  // Deferred post-zoom re-warp (id of whichever rAF in the chain is live).
  private pendingWarpRaf: number | null = null;

  constructor(options: WarpedRasterLayerOptions) {
    super();
    this.rasterOptions = options;
    this.srcMesh = buildSrcMesh(
      options.imageSize.width,
      options.imageSize.height,
      options.latLngMesh.length - 1,
    );
  }

  onAdd(map: L.Map): this {
    this.map = map;
    const pane = map.getPane(this.rasterOptions.paneName);
    if (!pane) {
      return this;
    }
    this.canvas = document.createElement("canvas");
    this.canvas.style.opacity = String(this.rasterOptions.opacity);
    this.canvas.style.pointerEvents = "none";
    pane.appendChild(this.canvas);
    map.on("moveend zoomend viewreset resize", this.redraw, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off("moveend zoomend viewreset resize", this.redraw, this);
    this.cancelScheduledWarp();
    this.canvas?.remove();
    this.canvas = null;
    this.map = null;
    this.cachedZoom = null;
    return this;
  }

  /**
   * Swaps the warp geometry and redraws, without touching `image`. The
   * georeferencer re-solves on every pointer move during a GCP drag, so the
   * hot path must never re-decode the bitmap. The source lattice is rebuilt
   * too: a caller may legitimately change grid density (affine drapes use a
   * 1x1 grid, a thin-plate spline needs a dense one).
   */
  setLatLngMesh(latLngMesh: LatLngPoint[][]): void {
    this.rasterOptions.latLngMesh = latLngMesh;
    this.srcMesh = buildSrcMesh(
      this.rasterOptions.imageSize.width,
      this.rasterOptions.imageSize.height,
      latLngMesh.length - 1,
    );
    this.cachedZoom = null;
    // Unpadded: during a GCP drag the mesh changes again on the next pointer
    // move, so pan slack bought here is thrown away before it is ever used —
    // while its extra pixels would be painted on EVERY drag frame. Measured
    // at the drag tier (gridSize 16, zoom where the drape fills the padded
    // viewport): 214 ms per frame padded, 34 ms unpadded. The first pan or
    // zoom after the mesh settles rebuilds the padded cache.
    this.warpNow(0);
  }

  setOpacity(opacity: number): void {
    this.rasterOptions.opacity = opacity;
    if (this.canvas) {
      this.canvas.style.opacity = String(opacity);
    }
  }

  /** World rect of the current viewport at the current zoom. */
  private viewRect(map: L.Map): WorldRect {
    const origin = map.getPixelOrigin();
    const paneShift = map.containerPointToLayerPoint(new L.Point(0, 0));
    const size = map.getSize();
    const min = { x: origin.x + paneShift.x, y: origin.y + paneShift.y };
    return { min, max: { x: min.x + size.x, y: min.y + size.y } };
  }

  /** Anchor the canvas at the backing origin in layer space. */
  private positionCanvas(): void {
    const { canvas, map, backingRect } = this;
    if (!canvas || !map || !backingRect) {
      return;
    }
    const origin = map.getPixelOrigin();
    L.DomUtil.setPosition(
      canvas,
      new L.Point(backingRect.min.x - origin.x, backingRect.min.y - origin.y),
    );
  }

  private redraw(): void {
    const { canvas, map } = this;
    if (!canvas || !map) {
      return;
    }
    const dpr = globalThis.devicePixelRatio || 1;
    const zoom = map.getZoom();
    if (this.cachedZoom !== null && this.cachedDpr === dpr) {
      if (
        this.cachedZoom === zoom &&
        containsRect(this.backingRect, intersectRect(this.viewRect(map), this.drapeRect))
      ) {
        // The cached warp still covers everything visible. Re-anchoring is
        // the only work left, and only viewreset actually moves the pixel
        // origin.
        this.positionCanvas();
        return;
      }
      if (this.backingRect) {
        // Web Mercator world pixels scale by exactly 2^dz, so the cached
        // warp scaled in one drawImage is geometrically correct at the new
        // zoom — merely resampled. The same drawImage with scale 2^0 = 1
        // covers a pan that exhausted the padding: the old backing is still
        // exact where it overlaps the recentred one. Either way, show the
        // composite immediately and refine it with the chunked mesh walk
        // only after it has painted — the gesture never blocks on a walk.
        this.compositeScaled(zoom, dpr);
        this.scheduleWarp();
        return;
      }
    }
    this.warpNow();
  }

  /**
   * Repaint the cached warp scaled from cachedZoom to newZoom (scale 1 when
   * they are equal — the padding-exhausted-pan blit), re-anchored on a
   * backing rect computed for the new view. The canvas must be snapshotted
   * first because resizing it clears it.
   */
  private compositeScaled(newZoom: number, dpr: number): void {
    const { canvas, map, backingRect, drapeRect } = this;
    if (!canvas || !map || !backingRect || !drapeRect || this.cachedZoom === null) {
      return;
    }
    const scale = map.getZoomScale(newZoom, this.cachedZoom);
    const oldRect = backingRect;
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    let snapshot: HTMLCanvasElement | null = null;
    if (oldWidth > 0 && oldHeight > 0 && canvas.getContext("2d")) {
      snapshot = document.createElement("canvas");
      snapshot.width = oldWidth;
      snapshot.height = oldHeight;
      snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
    }
    // The margin baked into drapeRect scales along with it; the deferred
    // warp recomputes it exactly, and until then it only pads a placeholder.
    const scaledDrape: WorldRect = {
      min: { x: drapeRect.min.x * scale, y: drapeRect.min.y * scale },
      max: { x: drapeRect.max.x * scale, y: drapeRect.max.y * scale },
    };
    const newBacking = computeBackingRect(
      this.viewRect(map),
      scaledDrape,
      dpr,
      BACKING_PAD_FACTOR,
    );
    this.cachedZoom = newZoom;
    this.cachedDpr = dpr;
    this.drapeRect = scaledDrape;
    this.backingRect = newBacking;
    if (!newBacking) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.width = "0px";
      canvas.style.height = "0px";
      return;
    }
    const widthDevice = Math.round((newBacking.max.x - newBacking.min.x) * dpr);
    const heightDevice = Math.round((newBacking.max.y - newBacking.min.y) * dpr);
    canvas.width = widthDevice;
    canvas.height = heightDevice;
    canvas.style.width = `${widthDevice / dpr}px`;
    canvas.style.height = `${heightDevice / dpr}px`;
    this.positionCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx || !snapshot) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(
      snapshot,
      0,
      0,
      oldWidth,
      oldHeight,
      (oldRect.min.x * scale - newBacking.min.x) * dpr,
      (oldRect.min.y * scale - newBacking.min.y) * dpr,
      (oldRect.max.x - oldRect.min.x) * scale * dpr,
      (oldRect.max.y - oldRect.min.y) * scale * dpr,
    );
    // Release the snapshot's backing store now instead of waiting for GC —
    // at the viewport cap it holds ~50 MB.
    snapshot.width = 0;
    snapshot.height = 0;
  }

  /**
   * Run the mesh walk after the next paint. A single rAF fires BEFORE the
   * pending frame paints, so the scaled composite would never reach the
   * screen; the second rAF is the first callback guaranteed to run after it.
   * Re-scheduling (another zoom) or a synchronous warp (a mesh swap) cancels
   * whichever stage is live — including a chunk mid-sequence — so
   * back-to-back zooms coalesce into one walk.
   */
  private scheduleWarp(): void {
    this.cancelScheduledWarp();
    this.pendingWarpRaf = requestAnimationFrame(() => {
      this.pendingWarpRaf = requestAnimationFrame((timestamp) => {
        this.pendingWarpRaf = null;
        this.refineWarp(timestamp);
      });
    });
  }

  private cancelScheduledWarp(): void {
    if (this.pendingWarpRaf !== null) {
      cancelAnimationFrame(this.pendingWarpRaf);
      this.pendingWarpRaf = null;
    }
  }

  /**
   * Projects the mesh at `zoom` and derives the margin-padded drape bbox.
   *
   * Deliberately NOT latLngToContainerPoint: it routes through
   * latLngToLayerPoint, which does `this.project(latlng)._round()` and snaps
   * every vertex to a whole CSS pixel (leaflet-src.js:4117). That rounding
   * is why a mathematically exact affine stops being one on screen —
   * measured up to 166 m of ground error at zoom 8, a >1 px content break
   * across the cell diagonal because the four corners round independently,
   * and 1-px stepped jitter while a control point is dragged. map.project()
   * does not round, and world pixels relative to the backing origin
   * reproduce containerPoint exactly, minus the quantisation.
   */
  private projectMesh(
    map: L.Map,
    zoom: number,
    dpr: number,
  ): { dstWorld: XY[][]; drape: WorldRect } {
    const dstWorld = this.rasterOptions.latLngMesh.map((row) =>
      row.map((ll) => {
        const p = map.project(new L.LatLng(ll.lat, ll.lng), zoom);
        return { x: p.x, y: p.y };
      }),
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const row of dstWorld) {
      for (const p of row) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    const margin = DRAPE_MARGIN_DEVICE_PX / dpr;
    return {
      dstWorld,
      drape: {
        min: { x: minX - margin, y: minY - margin },
        max: { x: maxX + margin, y: maxY + margin },
      },
    };
  }

  /**
   * Deferred mesh walk, spread across animation frames. The composite that
   * preceded it already sized and positioned the canvas and filled it with
   * geometrically correct (merely resampled) content, so each chunk draws
   * its triangles straight over its own clip region — no clearRect, and the
   * canvas is never resized here (resizing clears it, which would drop the
   * composite and every finished chunk). pendingWarpRaf carries the whole
   * chain, so a mesh swap's warpNow, another zoom's composite, or onRemove
   * cancels an in-flight sequence exactly the way it cancels the initial
   * double-rAF deferral.
   *
   * Chunk size is measured in triangles and adapted between frames, because
   * a chunk cannot time itself: clipped drawImage returns once the command
   * is queued and the raster lands afterwards, so a walk reporting 8 ms of
   * elapsed JS time was measured costing 750 ms of completed GPU work
   * (M1 Pro, gridSize 32, 7200x5400 source). The rAF timestamp of the NEXT
   * frame does include that cost, so the controller divides the observed
   * delta by the triangles that produced it and re-solves the count for
   * WARP_CHUNK_BUDGET_MS. Frames at or under WARP_FRAME_TARGET_MS are
   * treated as having headroom (a vsync-limited frame reports ~16.7 ms
   * whatever it did), and growth is capped so one fast frame cannot produce
   * a multi-second one.
   *
   * Known cosmetic residue: the composite's backing came from the SCALED old
   * drape, whose baked-in margin scaled along with it, so after a zoom-in up
   * to ~2^dz · CLIP_OVERDRAW_DEVICE_PX device px of the old rim can sit
   * outside the exact drape where no triangle repaints it (and after a
   * zoom-out the backing can end ~1 px short of the exact margin, cropping
   * that edge's antialiasing). Both are bounded by the scaled margin, sit at
   * the sheet's paper border, and are replaced by the next full warp.
   */
  private refineWarp(startTimestamp: number): void {
    const { canvas, map, backingRect } = this;
    if (!canvas || !map) {
      return;
    }
    if (!backingRect || this.cachedZoom === null) {
      // Nothing composited to refine (the drape sat outside the padded
      // viewport). warpNow recomputes state exactly and is trivially cheap
      // in precisely this case.
      this.warpNow();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const dpr = this.cachedDpr;
    const { dstWorld, drape } = this.projectMesh(map, this.cachedZoom, dpr);
    // The composite tracked only a scaled placeholder of the drape; store
    // the exactly recomputed bbox so later containment checks stay honest.
    // The backing rect is NOT recomputed — the canvas is already sized and
    // anchored to it, and it must not be resized mid-refinement.
    this.drapeRect = drape;
    const dstMesh = dstWorld.map((row) =>
      row.map((p) => ({
        x: (p.x - backingRect.min.x) * dpr,
        y: (p.y - backingRect.min.y) * dpr,
      })),
    );
    const total = (this.srcMesh.length - 1) * (this.srcMesh[0].length - 1) * 2;
    let next = 0;
    let chunk = WARP_CHUNK_SEED_TRIANGLES;
    let lastTimestamp: number | null = null;
    const drawChunk = (timestamp: number) => {
      if (lastTimestamp !== null) {
        const delta = timestamp - lastTimestamp;
        if (delta > WARP_FRAME_TARGET_MS) {
          // Overran: the previous chunk's completed cost is visible in the
          // delta, so re-solve the count against the per-triangle rate.
          chunk = Math.max(1, Math.round((chunk * WARP_CHUNK_BUDGET_MS) / delta));
        } else {
          chunk = Math.min(total, Math.max(chunk + 1, Math.round(chunk * WARP_CHUNK_GROWTH)));
        }
      }
      lastTimestamp = timestamp;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      next = drawWarpedTriangles(
        ctx,
        this.rasterOptions.image,
        this.srcMesh,
        dstMesh,
        next,
        chunk,
      );
      if (next < total) {
        this.pendingWarpRaf = requestAnimationFrame(drawChunk);
      } else {
        this.pendingWarpRaf = null;
      }
    };
    drawChunk(startTimestamp);
  }

  /** Full mesh walk into a freshly computed backing rect. */
  private warpNow(padFactor = BACKING_PAD_FACTOR): void {
    this.cancelScheduledWarp();
    const { canvas, map } = this;
    if (!canvas || !map) {
      return;
    }
    const dpr = globalThis.devicePixelRatio || 1;
    const zoom = map.getZoom();
    const { dstWorld, drape } = this.projectMesh(map, zoom, dpr);
    const backing = computeBackingRect(this.viewRect(map), drape, dpr, padFactor);
    this.cachedZoom = zoom;
    this.cachedDpr = dpr;
    this.drapeRect = drape;
    this.backingRect = backing;
    if (!backing) {
      // Drape entirely outside the padded viewport: hold no pixels. The
      // containment check re-warps as soon as a pan brings it back.
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.width = "0px";
      canvas.style.height = "0px";
      return;
    }
    // Integer by construction (computeBackingRect snaps to the device grid);
    // round only sheds float dust.
    const widthDevice = Math.round((backing.max.x - backing.min.x) * dpr);
    const heightDevice = Math.round((backing.max.y - backing.min.y) * dpr);
    canvas.width = widthDevice;
    canvas.height = heightDevice;
    canvas.style.width = `${widthDevice / dpr}px`;
    canvas.style.height = `${heightDevice / dpr}px`;
    this.positionCanvas();
    // jsdom (tests) has no 2D context; drawing is a no-op there by design.
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, widthDevice, heightDevice);
    const dstMesh = dstWorld.map((row) =>
      row.map((p) => ({
        x: (p.x - backing.min.x) * dpr,
        y: (p.y - backing.min.y) * dpr,
      })),
    );
    drawWarpedImage(ctx, this.rasterOptions.image, this.srcMesh, dstMesh);
  }
}
