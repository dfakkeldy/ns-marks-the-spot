import L from "leaflet";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WarpedRasterLayer } from "./WarpedRasterLayer";

/**
 * Projects lng -63.125..-63 to container x 200..400 and lat 46..45.875 to
 * container y 200..400. The degree offsets (0.125) and the 1600 px/degree
 * scale are exact binary fractions, so the drape's world bbox lands on
 * exactly 1200..1400 — the layer clamps its canvas to that bbox with
 * ceil/floor snapping, and float dust in the fixture would otherwise leak a
 * spurious extra device pixel into the size assertions.
 *
 * Deliberately exposes `project` + `getPixelOrigin` rather than
 * `latLngToContainerPoint`: the real Leaflet rounds inside that helper
 * (`this.project(latlng)._round()`), which quantises every mesh vertex to a
 * whole CSS pixel and breaks the affine the layer relies on. The layer takes
 * the unrounded route, so the stub has to offer it.
 */
function stubMap(paneEl: HTMLElement) {
  const ORIGIN = new L.Point(1000, 1000);
  return {
    getPane: vi.fn(() => paneEl),
    getSize: vi.fn(() => new L.Point(800, 600)),
    getZoom: vi.fn(() => 13),
    getPixelOrigin: vi.fn(() => ORIGIN),
    project: vi.fn(
      (ll: { lat: number; lng: number }) =>
        new L.Point(
          (ll.lng + 63.125) * 1600 + 200 + ORIGIN.x,
          (46 - ll.lat) * 1600 + 200 + ORIGIN.y,
        ),
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
    { lat: 46, lng: -63.125 },
    { lat: 46, lng: -63 },
  ],
  [
    { lat: 45.875, lng: -63.125 },
    { lat: 45.875, lng: -63 },
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

/**
 * Reads a pixel addressed in CONTAINER space (the stub projects lng/lat onto
 * container px 200..400). The canvas does not cover the viewport — it is
 * anchored on the drape's bbox — so container coordinates subtract the
 * canvas's layer anchor first. paneShift is (0,0) in the stub, so container
 * and layer space coincide.
 */
function containerPixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const pos = L.DomUtil.getPosition(canvas);
  return pixelAt(canvas, x - pos.x, y - pos.y);
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

  afterEach(() => {
    // In afterEach, not inline: a failing assertion inside a test that stubs
    // devicePixelRatio would otherwise leak the stub into every later test.
    vi.unstubAllGlobals();
  });

  it("adds a canvas to its pane with the configured opacity", () => {
    makeLayer().onAdd(stubMap(pane));
    expect(paneCanvas(pane).style.opacity).toBe("0.7");
  });

  it("sizes the canvas backing store by devicePixelRatio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    makeLayer().onAdd(stubMap(pane));
    const canvas = paneCanvas(pane);
    // The canvas clamps to the drape bbox (container 200..400 both axes) plus
    // the 3-device-px overdraw margin, which is 1.5 CSS px at dpr 2: 203 CSS
    // px of world -> 406 device px of backing store.
    expect(canvas.width).toBe(406);
    expect(canvas.style.width).toBe("203px");
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
    // Destination box is container x 200..400, y 200..400 for a 2x2 source,
    // so one source texel spans 100 device px and texel centres land at
    // container 250 / 350.
    expect(containerPixel(canvas, 250, 250)).toEqual([255, 0, 0, 255]);
    expect(containerPixel(canvas, 350, 250)).toEqual([0, 255, 0, 255]);
    expect(containerPixel(canvas, 250, 350)).toEqual([0, 0, 255, 255]);
    expect(containerPixel(canvas, 350, 350)).toEqual([255, 255, 255, 255]);
  });

  it("clamps the canvas to the drape bbox and keeps the margin ring clear", () => {
    makeLayer().onAdd(stubMap(pane));
    const canvas = paneCanvas(pane);
    // The drape bbox is container 200..400 plus the 3-px overdraw margin, so
    // the canvas anchors at (197, 197) and is 206 px square: pixels beyond
    // the drape physically do not exist. The outermost margin pixel must stay
    // clear — clip overdraw reaches only 2 of the 3 margin px.
    expect(L.DomUtil.getPosition(canvas)).toEqual(new L.Point(197, 197));
    expect(canvas.width).toBe(206);
    expect(canvas.height).toBe(206);
    expect(pixelAt(canvas, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("projects sub-pixel positions instead of snapping them to whole pixels", () => {
    // Regression guard. The layer used to call latLngToContainerPoint, which
    // is `this.project(latlng)._round()` inside Leaflet. That rounding turned
    // a mathematically exact affine into a stepped one: measured up to 166 m
    // of ground error at zoom 8, a >1 px break along the cell diagonal
    // because each corner rounds independently, and 1-px jitter while a
    // control point is dragged.
    //
    // Asserts the RENDERED RESULT, not the projection call. An earlier version
    // of this test read `map.project`'s mocked return values and checked they
    // differed by 0.25 — but that 0.25 came entirely from the stub's own
    // `lng * 2000` definition, so it would have passed just as happily if the
    // layer had rounded, ignored, or misapplied the point it got back.
    const map = stubMap(pane);
    const layer = makeLayer();
    layer.onAdd(map);
    const canvas = paneCanvas(pane);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas has no 2D context");
    }
    // Read the whole 206-px backing region. The backing origin floors to the
    // device grid, so a 0.25-px eastward mesh shift keeps the anchor at 197
    // while the drawn content moves — exactly the sub-pixel honesty this
    // test guards. (Were the origin to follow the bbox exactly, a rigid
    // shift would ride along invisibly and this test would go blind.)
    const before = Array.from(ctx.getImageData(0, 0, 206, 206).data);

    // 0.00015625 degrees of lng = 0.25 destination px under the stub's
    // 1600x. Under the old rounding this shift vanished and the two frames
    // were byte-identical.
    layer.setLatLngMesh(
      UNIT_MESH.map((row) =>
        row.map((ll) => ({ lat: ll.lat, lng: ll.lng + 0.00015625 })),
      ),
    );
    expect(L.DomUtil.getPosition(paneCanvas(pane)).x).toBe(197);
    const after = Array.from(ctx.getImageData(0, 0, 206, 206).data);

    expect(after).not.toEqual(before);
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
    // The shared diagonal runs from container (400, 200) to (200, 400), i.e.
    // x + y = 600, crossing this scanline at x = 300. Sample across the
    // interior, avoiding the outer 50 px where bilinear smoothing ramps
    // toward the image edge. The canvas anchors at (197, 197), so container
    // (260, 300) is canvas (63, 103).
    const row = ctx.getImageData(63, 103, 80, 1).data;
    const alphas = Array.from({ length: 80 }, (_, i) => row[i * 4 + 3]);
    expect(alphas.every((alpha) => alpha === 255)).toBe(true);
  });

  it("redraws through a new mesh without re-reading the image", () => {
    const layer = makeLayer();
    layer.onAdd(stubMap(pane));
    const canvas = paneCanvas(pane);
    expect(containerPixel(canvas, 250, 250)).toEqual([255, 0, 0, 255]);
    // Shift the whole drape one cell east: lng -63..-62.875 maps to container
    // x 400..600. The canvas re-anchors onto the new bbox (197 -> 397) and
    // the red texel centre lands at container 450.
    layer.setLatLngMesh([
      [
        { lat: 46, lng: -63 },
        { lat: 46, lng: -62.875 },
      ],
      [
        { lat: 45.875, lng: -63 },
        { lat: 45.875, lng: -62.875 },
      ],
    ]);
    expect(L.DomUtil.getPosition(canvas).x).toBe(397);
    expect(containerPixel(canvas, 450, 250)).toEqual([255, 0, 0, 255]);
  });
});
