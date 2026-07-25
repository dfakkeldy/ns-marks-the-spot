import L from "leaflet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WarpedRasterLayer } from "./WarpedRasterLayer";

/**
 * Projects lat/lng onto a tidy on-canvas box so pixel assertions can name
 * exact coordinates: lng -63.1..-63 becomes x 200..400, lat 46..45.9 becomes
 * y 200..400.
 */
function stubMap(paneEl: HTMLElement) {
  return {
    getPane: vi.fn(() => paneEl),
    getSize: vi.fn(() => new L.Point(800, 600)),
    latLngToContainerPoint: vi.fn(
      (ll: { lat: number; lng: number }) =>
        new L.Point((ll.lng + 63.1) * 2000 + 200, (46 - ll.lat) * 2000 + 200),
    ),
    containerPointToLayerPoint: vi.fn(() => new L.Point(0, 0)),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as L.Map;
}

/** 2x2 quadrant fixture: red, green over blue, white. */
function quadrantImage(): HTMLCanvasElement {
  const image = document.createElement("canvas");
  image.width = 2;
  image.height = 2;
  const ctx = image.getContext("2d");
  if (!ctx) {
    throw new Error("fixture needs a 2D context (is the canvas package installed?)");
  }
  const fill = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };
  fill(0, 0, "#ff0000");
  fill(1, 0, "#00ff00");
  fill(0, 1, "#0000ff");
  fill(1, 1, "#ffffff");
  return image;
}

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

function makeLayer(overrides: Partial<{ opacity: number }> = {}) {
  return new WarpedRasterLayer({
    paneName: "user-maps-pane",
    opacity: overrides.opacity ?? 0.7,
    image: quadrantImage(),
    imageSize: { width: 2, height: 2 },
    latLngMesh: UNIT_MESH,
  });
}

function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas has no 2D context");
  }
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

function paneCanvas(pane: HTMLElement): HTMLCanvasElement {
  const canvas = pane.querySelector("canvas");
  if (!canvas) {
    throw new Error("layer did not append a canvas");
  }
  return canvas as HTMLCanvasElement;
}

describe("WarpedRasterLayer", () => {
  let pane: HTMLElement;

  beforeEach(() => {
    pane = document.createElement("div");
  });

  it("adds a canvas to its pane with the configured opacity", () => {
    makeLayer().onAdd(stubMap(pane));
    expect(paneCanvas(pane).style.opacity).toBe("0.7");
  });

  it("sizes the canvas backing store by devicePixelRatio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    makeLayer().onAdd(stubMap(pane));
    const canvas = paneCanvas(pane);
    expect(canvas.width).toBe(1600);
    expect(canvas.style.width).toBe("800px");
    vi.unstubAllGlobals();
  });

  it("subscribes to map view changes and unsubscribes on remove", () => {
    const map = stubMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);
    expect(map.on).toHaveBeenCalledWith(
      "moveend zoomend viewreset resize",
      expect.any(Function),
      layer,
    );
    layer.onRemove(map);
    expect(map.off).toHaveBeenCalledWith(
      "moveend zoomend viewreset resize",
      expect.any(Function),
      layer,
    );
    expect(pane.querySelector("canvas")).toBeNull();
  });

  it("updates opacity in place", () => {
    const layer = makeLayer();
    layer.onAdd(stubMap(pane));
    layer.setOpacity(0.25);
    expect(paneCanvas(pane).style.opacity).toBe("0.25");
  });

  // The tests below are the ones PR 1 could not have: without a real 2D
  // context the layer early-returned, so neither the projection call nor a
  // single drawImage ever executed under test.
  it("draws each source quadrant at its projected destination", () => {
    makeLayer().onAdd(stubMap(pane));
    const canvas = paneCanvas(pane);
    // Destination box is x 200..400, y 200..400 for a 2x2 source, so one
    // source texel spans 100 device px and texel centres land at 250 / 350.
    expect(pixelAt(canvas, 250, 250)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(canvas, 350, 250)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(canvas, 250, 350)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(canvas, 350, 350)).toEqual([255, 255, 255, 255]);
  });

  it("leaves pixels outside the mesh untouched", () => {
    makeLayer().onAdd(stubMap(pane));
    expect(pixelAt(paneCanvas(pane), 50, 50)).toEqual([0, 0, 0, 0]);
  });

  it("draws no seam where the two clipped triangles meet", () => {
    // Each mesh cell is split into two triangles sharing a diagonal. Clipping
    // both to their exact edges leaves each covering ~50% of the boundary
    // pixels, which composites to ~75% alpha and paints a visible hairline
    // grid across the drape. CLIP_OVERDRAW_DEVICE_PX exists to close it.
    makeLayer().onAdd(stubMap(pane));
    const ctx = paneCanvas(pane).getContext("2d");
    if (!ctx) {
      throw new Error("canvas has no 2D context");
    }
    // The shared diagonal runs from (400, 200) to (200, 400), i.e. x + y =
    // 600, crossing this scanline at x = 300. Sample across the interior,
    // avoiding the outer 50 px where bilinear smoothing ramps toward the
    // image edge.
    const row = ctx.getImageData(260, 300, 80, 1).data;
    const alphas = Array.from({ length: 80 }, (_, i) => row[i * 4 + 3]);
    expect(alphas.every((alpha) => alpha === 255)).toBe(true);
  });

  it("redraws through a new mesh without re-reading the image", () => {
    const layer = makeLayer();
    layer.onAdd(stubMap(pane));
    const canvas = paneCanvas(pane);
    expect(pixelAt(canvas, 250, 250)).toEqual([255, 0, 0, 255]);
    // Shift the whole drape one cell east: lng -63.0..-62.9 maps to x
    // 400..600, so the red texel centre moves from 250 to 450.
    layer.setLatLngMesh([
      [
        { lat: 46, lng: -63 },
        { lat: 46, lng: -62.9 },
      ],
      [
        { lat: 45.9, lng: -63 },
        { lat: 45.9, lng: -62.9 },
      ],
    ]);
    expect(pixelAt(canvas, 250, 250)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(canvas, 450, 250)).toEqual([255, 0, 0, 255]);
  });
});
