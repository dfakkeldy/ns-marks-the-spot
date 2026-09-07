import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contextLayerCatalog, type ContextMapLayer } from "../layers/contextLayerCatalog";
import { ContextImageLayer } from "./ContextImageLayer";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  map: { getZoom: vi.fn(() => 12), on: vi.fn(), off: vi.fn() },
  imageOverlay: vi.fn(),
}));
vi.mock("react-leaflet", () => ({ useMap: () => mocks.map }));
vi.mock("leaflet", () => ({ default: { imageOverlay: mocks.imageOverlay } }));
const layer: ContextMapLayer = {
  ...contextLayerCatalog[0],
  serviceUrl: "/data/regional-test.png", delivery: "static-image", minZoom: 10,
  imageBounds: [[44, -65], [46, -61]], opacity: 0.4, zIndex: 185,
};
function overlayMock() {
  const events = new Map<string, () => void>();
  const overlay = {
    on: vi.fn((name: string, callback: () => void) => { events.set(name, callback); return overlay; }),
    off: vi.fn((name?: string, callback?: () => void) => {
      if (!name) events.clear();
      else if (!callback || events.get(name) === callback) events.delete(name);
      return overlay;
    }),
    setOpacity: vi.fn(), addTo: vi.fn(), remove: vi.fn(),
    fire: (name: string) => events.get(name)?.(),
  };
  return overlay;
}
let overlay: ReturnType<typeof overlayMock>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.handlers.clear(); mocks.map.getZoom.mockReturnValue(12);
  mocks.map.on.mockImplementation((name: string, callback: () => void) => { mocks.handlers.set(name, callback); });
  mocks.map.off.mockImplementation((name: string) => { mocks.handlers.delete(name); });
  overlay = overlayMock(); mocks.imageOverlay.mockReturnValue(overlay);
});
afterEach(cleanup);

describe("ContextImageLayer", () => {
  it("does not create or request imagery while disabled", () => {
    const status = vi.fn(); render(<ContextImageLayer layer={layer} visible={false} onStatusChange={status} />);
    expect(mocks.imageOverlay).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "idle" });
  });

  it("fails closed when the image has no geographic bounds", () => {
    const status = vi.fn(); render(<ContextImageLayer layer={{ ...layer, imageBounds: undefined }} visible onStatusChange={status} />);
    expect(mocks.imageOverlay).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "error" });
  });

  it("keeps loading, ready and source errors distinct and applies the source bounds and opacity", () => {
    const status = vi.fn(); render(<ContextImageLayer layer={layer} visible onStatusChange={status} />);
    expect(mocks.imageOverlay).toHaveBeenCalledWith(layer.serviceUrl, [[44, -65], [46, -61]], {
      pane: "tilePane", opacity: 0.4, zIndex: 185, interactive: false,
    });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "loading" });
    act(() => overlay.fire("load"));
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "ready" });
    act(() => overlay.fire("error"));
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "error" });
  });

  it("hides below the minimum zoom and restores the actual source state when zooming in", () => {
    mocks.map.getZoom.mockReturnValue(9);
    const status = vi.fn(); render(<ContextImageLayer layer={layer} visible onStatusChange={status} />);
    expect(overlay.setOpacity).toHaveBeenLastCalledWith(0);
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "zoom", minZoom: 10 });
    act(() => overlay.fire("error"));
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "zoom", minZoom: 10 });
    mocks.map.getZoom.mockReturnValue(12);
    act(() => mocks.handlers.get("zoomend")?.());
    expect(overlay.setOpacity).toHaveBeenLastCalledWith(0.4);
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "error" });
  });

  it("ignores old image events after disabling the image", () => {
    const status = vi.fn();
    const view = render(<ContextImageLayer layer={layer} visible onStatusChange={status} />);
    view.rerender(<ContextImageLayer layer={layer} visible={false} onStatusChange={status} />);
    expect(overlay.remove).toHaveBeenCalledOnce();
    expect(mocks.handlers.has("zoomend")).toBe(false);
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "idle" });
    status.mockClear();
    act(() => { overlay.fire("load"); overlay.fire("error"); });
    expect(status).not.toHaveBeenCalled();
  });

  it("does not let a replaced source overwrite the new image's loading state", () => {
    const status = vi.fn();
    const view = render(<ContextImageLayer layer={layer} visible onStatusChange={status} />);
    const oldOverlay = overlay;
    const replacement = overlayMock();
    mocks.imageOverlay.mockReturnValueOnce(replacement);
    view.rerender(<ContextImageLayer layer={{ ...layer, serviceUrl: "/data/replacement.png" }} visible onStatusChange={status} />);
    expect(oldOverlay.remove).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "loading" });
    status.mockClear();
    act(() => { oldOverlay.fire("load"); oldOverlay.fire("error"); });
    expect(status).not.toHaveBeenCalled();
    act(() => replacement.fire("load"));
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "ready" });
  });

});
