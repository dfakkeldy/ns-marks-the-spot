import L from "leaflet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WarpedRasterLayer } from "./WarpedRasterLayer";

function stubMap(paneEl: HTMLElement) {
  return {
    getPane: vi.fn(() => paneEl),
    getSize: vi.fn(() => new L.Point(800, 600)),
    latLngToContainerPoint: vi.fn(
      (ll: { lat: number; lng: number }) => new L.Point(ll.lng * 10, ll.lat * 10),
    ),
    containerPointToLayerPoint: vi.fn(() => new L.Point(0, 0)),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as L.Map;
}

function makeLayer() {
  return new WarpedRasterLayer({
    paneName: "user-maps-pane",
    opacity: 0.7,
    image: {} as CanvasImageSource,
    imageSize: { width: 8, height: 6 },
    latLngMesh: [
      [{ lat: 46, lng: -63.1 }, { lat: 46, lng: -63 }],
      [{ lat: 45.9, lng: -63.1 }, { lat: 45.9, lng: -63 }],
    ],
  });
}

describe("WarpedRasterLayer", () => {
  let pane: HTMLElement;

  beforeEach(() => {
    pane = document.createElement("div");
  });

  it("adds a canvas to its pane with the configured opacity", () => {
    makeLayer().onAdd(stubMap(pane));
    const canvas = pane.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.style.opacity).toBe("0.7");
  });

  it("sizes the canvas backing store by devicePixelRatio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    makeLayer().onAdd(stubMap(pane));
    const canvas = pane.querySelector("canvas");
    expect(canvas?.width).toBe(1600);
    expect(canvas?.style.width).toBe("800px");
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
    expect(pane.querySelector("canvas")?.style.opacity).toBe("0.25");
  });
});
