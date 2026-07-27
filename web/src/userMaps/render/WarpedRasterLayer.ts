import L from "leaflet";
import type { LatLngPoint, PixelSize } from "../transform/projection";
import {
  buildSrcMesh,
  CLIP_OVERDRAW_DEVICE_PX,
  drawWarpedImage,
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
 * 1280x800 viewport, this layer on a real Leaflet map, raster completion
 * forced via tiny-canvas readback): pan-end within the slack is 0.0 ms
 * median / 1.4 ms worst over 70 pans at gridSize 32 and 64, with zero mesh
 * walks — replacing the 210 ms-per-pan-end redraw this cache was built to
 * eliminate — and the post-zoom scaled composite is 6–9 ms at either grid.
 * The walks that remain are zoom-dependent (what matters is how many
 * triangles land on the backing and how many pixels each covers): at
 * gridSize 32, 126 ms when the backing is viewport-capped and 795 ms at the
 * zoom where the drape just fills it. The grid-size decision built on these
 * numbers lives on TPS_GRID_SIZE in gcpMesh.ts.
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
      if (this.cachedZoom === zoom) {
        if (containsRect(this.backingRect, intersectRect(this.viewRect(map), this.drapeRect))) {
          // The cached warp still covers everything visible. Re-anchoring is
          // the only work left, and only viewreset actually moves the pixel
          // origin.
          this.positionCanvas();
          return;
        }
      } else if (this.backingRect) {
        // Web Mercator world pixels scale by exactly 2^dz, so the cached
        // warp scaled in one drawImage is geometrically correct at the new
        // zoom — merely resampled. Show that immediately and run the real
        // mesh walk only after it has painted.
        this.compositeScaled(zoom, dpr);
        this.scheduleWarp();
        return;
      }
    }
    this.warpNow();
  }

  /**
   * Repaint the cached warp scaled from cachedZoom to newZoom, re-anchored
   * on a backing rect computed for the new view. The canvas must be
   * snapshotted first because resizing it clears it.
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
   * whichever stage is live, so back-to-back zooms coalesce into one walk.
   */
  private scheduleWarp(): void {
    this.cancelScheduledWarp();
    this.pendingWarpRaf = requestAnimationFrame(() => {
      this.pendingWarpRaf = requestAnimationFrame(() => {
        this.pendingWarpRaf = null;
        this.warpNow();
      });
    });
  }

  private cancelScheduledWarp(): void {
    if (this.pendingWarpRaf !== null) {
      cancelAnimationFrame(this.pendingWarpRaf);
      this.pendingWarpRaf = null;
    }
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
    // Deliberately NOT latLngToContainerPoint: it routes through
    // latLngToLayerPoint, which does `this.project(latlng)._round()` and snaps
    // every vertex to a whole CSS pixel (leaflet-src.js:4117). That rounding
    // is why a mathematically exact affine stops being one on screen —
    // measured up to 166 m of ground error at zoom 8, a >1 px content break
    // across the cell diagonal because the four corners round independently,
    // and 1-px stepped jitter while a control point is dragged. map.project()
    // does not round, and world pixels relative to the backing origin
    // reproduce containerPoint exactly, minus the quantisation.
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
    const drape: WorldRect = {
      min: { x: minX - margin, y: minY - margin },
      max: { x: maxX + margin, y: maxY + margin },
    };
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
