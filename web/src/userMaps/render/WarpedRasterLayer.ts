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
  private readonly srcMesh: XY[][];
  private canvas: HTMLCanvasElement | null = null;
  private map: L.Map | null = null;

  constructor(options: WarpedRasterLayerOptions) {
    super();
    this.rasterOptions = options;
    const rows = options.latLngMesh.length - 1;
    this.srcMesh = buildSrcMesh(
      options.imageSize.width,
      options.imageSize.height,
      rows,
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
    const dstMesh = this.rasterOptions.latLngMesh.map((row) =>
      row.map((ll) => {
        const p = map.latLngToContainerPoint(new L.LatLng(ll.lat, ll.lng));
        return { x: p.x * dpr, y: p.y * dpr };
      }),
    );
    drawWarpedImage(ctx, this.rasterOptions.image, this.srcMesh, dstMesh);
  }
}
