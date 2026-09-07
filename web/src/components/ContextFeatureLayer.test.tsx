import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type L from "leaflet";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import { fetchArcGISFeatureOverlay } from "../services/arcGISFeatureOverlay";
import { ContextFeatureLayer } from "./ContextFeatureLayer";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  map: {
    getZoom: vi.fn(() => 12),
    getBounds: vi.fn(() => ({ getWest: () => -62, getSouth: () => 45, getEast: () => -61, getNorth: () => 46 })),
    getPane: vi.fn(), createPane: vi.fn(), on: vi.fn(), off: vi.fn(),
  },
  geoJSON: vi.fn(), circleMarker: vi.fn(),
}));
vi.mock("react-leaflet", () => ({ useMap: () => mocks.map }));
vi.mock("leaflet", () => ({ default: { geoJSON: mocks.geoJSON, circleMarker: mocks.circleMarker } }));
vi.mock("../services/arcGISFeatureOverlay", () => ({ fetchArcGISFeatureOverlay: vi.fn() }));
const layer = contextLayerCatalog.find(({ id }) => id === "karst-risk")!;
const feature: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>> = {
  type: "Feature", properties: { OBJECTID: 1, rank_1: "High Risk" },
  geometry: { type: "Point", coordinates: [-61.5, 45.5] },
};
const collection: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> = { type: "FeatureCollection", features: [feature] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let pane: HTMLDivElement;
let rendered: { addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks(); mocks.handlers.clear(); mocks.map.getZoom.mockReturnValue(12);
  pane = document.createElement("div"); mocks.map.getPane.mockReturnValue(undefined); mocks.map.createPane.mockReturnValue(pane);
  mocks.map.on.mockImplementation((name: string, callback: () => void) => { mocks.handlers.set(name, callback); });
  mocks.map.off.mockImplementation((name: string) => { mocks.handlers.delete(name); });
  rendered = { addTo: vi.fn(), remove: vi.fn() }; rendered.addTo.mockReturnValue(rendered);
  mocks.geoJSON.mockReturnValue(rendered);
  vi.mocked(fetchArcGISFeatureOverlay).mockResolvedValue(collection);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function mount(visible = true, renderMode: "print" | "interactive" = "interactive") {
  const status = vi.fn();
  const view = render(<ContextFeatureLayer layer={layer} visible={visible} renderMode={renderMode} onStatusChange={status} />);
  return { status, ...view };
}
function geometryOptions(): L.GeoJSONOptions { return mocks.geoJSON.mock.calls.at(-1)![1] as L.GeoJSONOptions; }

describe("ContextFeatureLayer", () => {
  it("never queries disabled or below-zoom layers", () => {
    const hidden = mount(false);
    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
    expect(hidden.status).toHaveBeenLastCalledWith(layer.id, { status: "idle" });
    hidden.unmount(); mocks.map.getZoom.mockReturnValue(layer.minZoom - 1);
    const distant = mount();
    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
    expect(distant.status).toHaveBeenLastCalledWith(layer.id, { status: "zoom", minZoom: layer.minZoom });
  });

  it("keeps source fills in the catalogue image stacking order beneath parcel and road lines", () => {
    const tilePane = document.createElement("div");
    mocks.map.getPane.mockImplementation((name) => name === "tilePane" ? tilePane : undefined);
    mount();
    expect(mocks.map.createPane).toHaveBeenCalledWith(`context-${layer.id}`, tilePane);
    expect(pane.style.zIndex).toBe(String(layer.zIndex));
  });

  it("queries only current viewport bounds with descriptor fields and an abort signal", async () => {
    const { status } = mount();
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "loading" });
    expect(fetchArcGISFeatureOverlay).toHaveBeenCalledWith({
      serviceUrl: layer.serviceUrl, bounds: { west: -62, south: 45, east: -61, north: 46 },
      outFields: layer.outFields, idField: layer.idField, orderByFields: layer.idField, signal: expect.any(AbortSignal),
    });
    await waitFor(() => expect(status).toHaveBeenLastCalledWith(layer.id, { status: "ready", count: 1 }));
  });

  it("reports successful empty results separately from source errors", async () => {
    vi.mocked(fetchArcGISFeatureOverlay).mockResolvedValueOnce({ type: "FeatureCollection", features: [] });
    const empty = mount();
    await waitFor(() => expect(empty.status).toHaveBeenLastCalledWith(layer.id, { status: "ready", count: 0 }));
    empty.unmount(); vi.mocked(fetchArcGISFeatureOverlay).mockRejectedValueOnce(new Error("source unavailable"));
    const failed = mount();
    await waitFor(() => expect(failed.status).toHaveBeenLastCalledWith(layer.id, { status: "error" }));
  });

  it("cancels old viewport queries and ignores stale success", async () => {
    const old = deferred<typeof collection>(); const current = deferred<typeof collection>();
    vi.mocked(fetchArcGISFeatureOverlay).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { status } = mount(); const signal = vi.mocked(fetchArcGISFeatureOverlay).mock.calls[0][0].signal!;
    act(() => mocks.handlers.get("moveend")?.()); expect(signal.aborted).toBe(true);
    await act(async () => { current.resolve(collection); await current.promise; });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "ready", count: 1 }); status.mockClear();
    await act(async () => { old.resolve({ type: "FeatureCollection", features: [] }); await old.promise; });
    expect(status).not.toHaveBeenCalled(); expect(mocks.geoJSON).toHaveBeenCalledTimes(1);
  });

  it("removes existing geometry and suspends queries below zoom", async () => {
    const { status } = mount(); await waitFor(() => expect(mocks.geoJSON).toHaveBeenCalledOnce());
    mocks.map.getZoom.mockReturnValue(layer.minZoom - 1); act(() => mocks.handlers.get("moveend")?.());
    expect(rendered.remove).toHaveBeenCalledOnce(); expect(fetchArcGISFeatureOverlay).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "zoom", minZoom: layer.minZoom });
  });

  it("aborts on unmount, removes listeners and ignores late source rejection", async () => {
    const request = deferred<typeof collection>(); vi.mocked(fetchArcGISFeatureOverlay).mockReturnValueOnce(request.promise);
    const view = mount(); const signal = vi.mocked(fetchArcGISFeatureOverlay).mock.calls[0][0].signal!;
    view.unmount(); view.status.mockClear();
    expect(signal.aborted).toBe(true); expect(mocks.handlers.has("moveend")).toBe(false);
    await act(async () => { request.reject(new Error("aborted")); await request.promise.catch(() => undefined); });
    expect(view.status).not.toHaveBeenCalled(); expect(mocks.geoJSON).not.toHaveBeenCalled();
  });

  it("times out a stalled source as an error rather than an empty result", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchArcGISFeatureOverlay).mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const { status } = mount(); await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(status).toHaveBeenLastCalledWith(layer.id, { status: "error" }); expect(mocks.geoJSON).not.toHaveBeenCalled();
  });

  it("keeps labels as text and excludes polygons and points from editing and snapping", async () => {
    mount(); await waitFor(() => expect(mocks.geoJSON).toHaveBeenCalledOnce());
    const options = geometryOptions(); expect(pane.style.zIndex).toBe(String(layer.zIndex));
    expect((options.style as L.StyleFunction)(feature)).toMatchObject({ snapIgnore: true, pmIgnore: true });
    options.pointToLayer?.(feature, { lat: 45.5, lng: -61.5 } as L.LatLng);
    expect(mocks.circleMarker.mock.calls[0][1]).toMatchObject({ snapIgnore: true, pmIgnore: true, interactive: true });
    const bindPopup = vi.fn();
    options.onEachFeature?.({ ...feature, properties: { rank_1: '<img src=x onerror="alert(1)">' } }, { bindPopup } as unknown as L.Layer);
    const popup = bindPopup.mock.calls[0][0] as HTMLElement;
    expect(popup.textContent).toContain('<img src=x onerror="alert(1)">'); expect(popup.querySelector("img")).toBeNull();
    expect(popup.textContent).toContain(layer.sourceDate); expect(popup.textContent).toContain(layer.webCaveat);
    expect(popup.querySelector("a")).toHaveAttribute("href", layer.sourceUrl);
    expect(popup.querySelector("a")).toHaveAttribute("rel", "noreferrer");
  });

  it("disables print interaction and popups while retaining snap exclusion", async () => {
    mount(true, "print"); await waitFor(() => expect(mocks.geoJSON).toHaveBeenCalledOnce());
    const options = geometryOptions(); expect(options.interactive).toBe(false); expect(options.onEachFeature).toBeUndefined();
    expect(pane.style.pointerEvents).toBe("none");
    expect((options.style as L.StyleFunction)(feature)).toMatchObject({ color: "#969696", snapIgnore: true, pmIgnore: true });
  });
});
