import L from "leaflet";
import type { LatLngPoint, PixelSize } from "../transform/projection";
import { buildSrcMesh, drawWarpedImage, type XY } from "./mesh";

export type WarpedRasterLayerOptions = {
  paneName: string;
  opacity: number;
  image: CanvasImageSource;
  imageSize: PixelSize;
  latLngMesh: LatLngPoint[][];
};

/**
 * Canvas overlay that draws a raster through a projected mesh. The canvas is
 * viewport-sized and repositioned after each completed view change (the
 * Leaflet.heat pattern): during a drag the pane carries the canvas, and on
 * moveend it snaps back to the viewport and redraws. Zoom animations jump
 * rather than scale — the spec's accepted v1 trade-off.
 */
export class WarpedRasterLayer extends L.Layer {
  private readonly rasterOptions: WarpedRasterLayerOptions;
  private srcMesh: XY[][];
  private canvas: HTMLCanvasElement | null = null;
  private map: L.Map | null = null;

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
    this.canvas?.remove();
    this.canvas = null;
    this.map = null;
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
    this.redraw();
  }

  setOpacity(opacity: number): void {
    this.rasterOptions.opacity = opacity;
    if (this.canvas) {
      this.canvas.style.opacity = String(opacity);
    }
  }

  private redraw(): void {
    const { canvas, map } = this;
    if (!canvas || !map) {
      return;
    }
    const size = map.getSize();
    const dpr = globalThis.devicePixelRatio || 1;
    // Backing store at device resolution, CSS box at layout resolution, and
    // destination points scaled by dpr — keeps previews sharp on Retina.
    canvas.width = Math.round(size.x * dpr);
    canvas.height = Math.round(size.y * dpr);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint(new L.Point(0, 0)));
    // jsdom (tests) has no 2D context; drawing is a no-op there by design.
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Deliberately NOT latLngToContainerPoint: it routes through
    // latLngToLayerPoint, which does `this.project(latlng)._round()` and snaps
    // every vertex to a whole CSS pixel (leaflet-src.js:4117). That rounding
    // is why a mathematically exact affine stops being one on screen —
    // measured up to 166 m of ground error at zoom 8, a >1 px content break
    // across the cell diagonal because the four corners round independently,
    // and 1-px stepped jitter while a control point is dragged. map.project()
    // does not round, and subtracting the pixel origin and the pane offset
    // reproduces containerPoint exactly, minus the quantisation.
    const origin = map.getPixelOrigin();
    const paneShift = map.containerPointToLayerPoint(new L.Point(0, 0));
    const dstMesh = this.rasterOptions.latLngMesh.map((row) =>
      row.map((ll) => {
        const p = map.project(new L.LatLng(ll.lat, ll.lng), map.getZoom());
        return {
          x: (p.x - origin.x - paneShift.x) * dpr,
          y: (p.y - origin.y - paneShift.y) * dpr,
        };
      }),
    );
    drawWarpedImage(ctx, this.rasterOptions.image, this.srcMesh, dstMesh);
  }
}
