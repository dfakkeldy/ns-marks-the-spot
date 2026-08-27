import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import type { NsprdFeatureCollection } from "../services/nsprd";
import { fetchMineralProximityParcels } from "../services/mineralProximity";
import { MineralProximityParcelLayer } from "./MineralProximityParcelLayer";

const mapHandlers = vi.hoisted(() => ({
  moveend: undefined as (() => void) | undefined,
  zoomend: undefined as (() => void) | undefined,
}));

const mapMock = vi.hoisted(() => ({
  getZoom: vi.fn(() => 11),
  getBounds: vi.fn(() => ({
    getWest: () => -62,
    getSouth: () => 45,
    getEast: () => -60,
    getNorth: () => 47,
  })),
  on: vi.fn((name: "moveend" | "zoomend", handler: () => void) => {
    mapHandlers[name] = handler;
  }),
  off: vi.fn(),
}));

const geoJsonProps = vi.hoisted(() => ({
  current: undefined as
    | {
        pane?: string;
        onEachFeature?: (
          feature: NsprdFeatureCollection["features"][number],
          layer: { bindTooltip: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> },
        ) => void;
      }
    | undefined,
}));

vi.mock("react-leaflet", () => ({
  GeoJSON: (props: typeof geoJsonProps.current) => {
    geoJsonProps.current = props;
    return null;
  },
  useMap: () => mapMock,
}));

vi.mock("leaflet", () => ({
  default: { DomEvent: { stopPropagation: vi.fn() } },
}));

vi.mock("../services/mineralProximity", () => ({
  MINERAL_PROXIMITY_MIN_ZOOM: 12,
  fetchMineralProximityParcels: vi.fn(),
}));

const parcel = (pid: string) => ({
  type: "Feature" as const,
  properties: { PID: pid },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[
      [-61.48, 45.81],
      [-61.47, 45.81],
      [-61.47, 45.82],
      [-61.48, 45.82],
      [-61.48, 45.81],
    ]],
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("MineralProximityParcelLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapHandlers.moveend = undefined;
    mapHandlers.zoomend = undefined;
    mapMock.getZoom.mockReturnValue(11);
    geoJsonProps.current = undefined;
    vi.mocked(fetchMineralProximityParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [parcel("90000001")],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stays idle while hidden", () => {
    const onStatusChange = vi.fn();
    render(
      <MineralProximityParcelLayer
        visible={false}
        onSelectPid={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(fetchMineralProximityParcels).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith({ status: "idle" });
  });

  it("waits until the proximity detail zoom", () => {
    const onStatusChange = vi.fn();
    render(
      <MineralProximityParcelLayer
        visible
        onSelectPid={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(fetchMineralProximityParcels).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith({ status: "zoom", minZoom: 12 });
  });

  it("loads parcels, reports ready, and selects a clicked PID", async () => {
    const onStatusChange = vi.fn();
    const onSelectPid = vi.fn();
    mapMock.getZoom.mockReturnValue(12);
    render(
      <MineralProximityParcelLayer
        visible
        onSelectPid={onSelectPid}
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() =>
      expect(fetchMineralProximityParcels).toHaveBeenCalledWith(
        { west: -62, south: 45, east: -60, north: 47 },
        expect.any(AbortSignal),
      ),
    );
    expect(onStatusChange).toHaveBeenCalledWith({ status: "loading" });
    expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 1 });
    expect(geoJsonProps.current?.pane).toBe("mineral-proximity-parcels-pane");

    const fakeLayer = { bindTooltip: vi.fn(), on: vi.fn() };
    geoJsonProps.current?.onEachFeature?.(parcel("90000001"), fakeLayer);
    // A node rather than a string: Leaflet assigns string tooltip content
    // with innerHTML, so every tooltip built from data this app did not
    // author goes through textTooltip.
    expect(fakeLayer.bindTooltip).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      { sticky: true },
    );
    expect(
      (fakeLayer.bindTooltip.mock.calls[0][0] as HTMLElement).textContent,
    ).toBe("PID 90000001 · within 1 km of a published mineral occurrence");
    const clickHandler = fakeLayer.on.mock.calls.find(([name]) => name === "click")?.[1];
    expect(clickHandler).toBeTypeOf("function");
    const originalEvent = new MouseEvent("click");
    const leafletEvent = { originalEvent };
    (clickHandler as (event: { originalEvent: object }) => void)(leafletEvent);
    // The LEAFLET event, not `event.originalEvent`: only the former makes
    // Leaflet set the `_stopped` flag its map dispatch loop reads, so passing
    // the raw DOM event let the map fire a second, unrequested identify.
    expect(L.DomEvent.stopPropagation).toHaveBeenCalledWith(leafletEvent);
    expect(onSelectPid).toHaveBeenCalledWith("90000001");
  });

  it("uses a monochrome, display-only geometry in print mode", async () => {
    mapMock.getZoom.mockReturnValue(12);
    render(
      <MineralProximityParcelLayer
        visible
        renderMode="print"
        onSelectPid={vi.fn()}
      />,
    );

    await waitFor(() => expect(geoJsonProps.current).toBeDefined());
    expect(geoJsonProps.current).toMatchObject({
      interactive: false,
      style: {
        color: "#222222",
        fillColor: "#e6e6e6",
        fillOpacity: 0.28,
        weight: 2,
        dashArray: "2 3 8 3",
        className: "print-mineral-proximity-parcel",
      },
    });
    expect(geoJsonProps.current?.onEachFeature).toBeUndefined();
  });

  it("reports ready for an empty result", async () => {
    const onStatusChange = vi.fn();
    mapMock.getZoom.mockReturnValue(12);
    vi.mocked(fetchMineralProximityParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [],
    });
    render(
      <MineralProximityParcelLayer
        visible
        onSelectPid={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 0 }),
    );
  });

  it("reports a non-abort request error", async () => {
    const onStatusChange = vi.fn();
    mapMock.getZoom.mockReturnValue(12);
    vi.mocked(fetchMineralProximityParcels).mockRejectedValueOnce(new Error("offline"));
    render(
      <MineralProximityParcelLayer
        visible
        onSelectPid={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith({ status: "error" }),
    );
  });

  it("ignores a stale viewport response", async () => {
    const first = deferred<NsprdFeatureCollection>();
    const second = deferred<NsprdFeatureCollection>();
    const onStatusChange = vi.fn();
    vi.mocked(fetchMineralProximityParcels)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mapMock.getZoom.mockReturnValue(12);

    render(
      <MineralProximityParcelLayer
        visible
        onSelectPid={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );
    act(() => mapHandlers.moveend?.());
    second.resolve({ type: "FeatureCollection", features: [parcel("90000002")] });
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 1 }),
    );
    first.resolve({
      type: "FeatureCollection",
      features: [parcel("90000003"), parcel("90000004")],
    });
    await act(async () => Promise.resolve());
    expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 1 });
  });

  it("removes handlers and aborts the active request on cleanup", () => {
    const pending = deferred<NsprdFeatureCollection>();
    mapMock.getZoom.mockReturnValue(12);
    vi.mocked(fetchMineralProximityParcels).mockReturnValueOnce(pending.promise);
    const { unmount } = render(
      <MineralProximityParcelLayer visible onSelectPid={vi.fn()} />,
    );

    const signal = vi.mocked(fetchMineralProximityParcels).mock.calls[0]?.[1];
    unmount();

    expect(signal?.aborted).toBe(true);
    expect(mapMock.off).toHaveBeenCalledWith("moveend", expect.any(Function));
    expect(mapMock.off).toHaveBeenCalledWith("zoomend", expect.any(Function));
  });
});
