import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import { sentinel2Layer } from "../layers/sentinel2";
import { ContextTileLayer } from "./ContextTileLayer";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(), inside: true, zoom: 14,
  map: { getZoom: vi.fn(), getBounds: vi.fn(), on: vi.fn(), off: vi.fn() },
  tileLayer: vi.fn(), latLngBounds: vi.fn(),
}));
vi.mock("react-leaflet", () => ({ useMap: () => mocks.map }));
vi.mock("leaflet", () => ({ default: { tileLayer: mocks.tileLayer, latLngBounds: mocks.latLngBounds } }));

const layer: ContextMapLayer = {
  ...sentinel2Layer, attribution: "Province test attribution <without markup>",
  coverageBounds: { west: -61.5, south: 45.85, east: -61.4, north: 45.9 }, minZoom: 10,
};
let events: Map<string, () => void>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.handlers.clear(); mocks.inside = true; mocks.zoom = 14;
  mocks.map.getZoom.mockImplementation(() => mocks.zoom);
  mocks.map.getBounds.mockImplementation(() => ({ intersects: () => mocks.inside }));
  mocks.latLngBounds.mockReturnValue({});
  mocks.map.on.mockImplementation((name: string, fn: () => void) => { mocks.handlers.set(name, fn); });
  events = new Map();
  const tiles = {
    on: vi.fn((name: string, fn: () => void) => { events.set(name, fn); return tiles; }),
    off: vi.fn(), remove: vi.fn(), addTo: vi.fn(), isLoading: vi.fn(() => false),
  };
  mocks.tileLayer.mockReturnValue(tiles);
});

describe("context raster tile boundaries", () => {
  it("requests nothing while off or unconfigured", () => {
    const status = vi.fn();
    const view = render(<ContextTileLayer layer={layer} visible={false} renderMode="interactive" onStatusChange={status} />);
    expect(mocks.tileLayer).not.toHaveBeenCalled();
    view.rerender(<ContextTileLayer layer={{ ...layer, tileUrl: undefined }} visible renderMode="interactive" onStatusChange={status} />);
    expect(mocks.tileLayer).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(layer.id, expect.objectContaining({ status: "source-error" }));
  });

  it("uses the raster's own attribution and bounds and distinguishes coverage from a failed source", () => {
    const status = vi.fn();
    render(<ContextTileLayer layer={layer} visible renderMode="interactive" onStatusChange={status} />);
    expect(mocks.tileLayer).toHaveBeenCalledWith(layer.tileUrl, expect.objectContaining({
      attribution: "Province test attribution &lt;without markup&gt;", noWrap: true,
    }));
    expect(mocks.latLngBounds).toHaveBeenCalledWith([[45.85, -61.5], [45.9, -61.4]]);
    act(() => events.get("tileerror")?.());
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "source-error" });
    act(() => { mocks.inside = false; mocks.handlers.get("moveend")?.(); });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "outside-coverage" });
    act(() => { mocks.inside = true; mocks.handlers.get("moveend")?.(); });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "source-error" });
  });
});
