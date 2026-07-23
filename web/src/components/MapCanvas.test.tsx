import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type CSSProperties, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBrowserLocation } from "../services/browserLocation";
import { fetchArcGISFeatureOverlay } from "../services/arcGISFeatureOverlay";
import { MapCanvas } from "./MapCanvas";
import { parcelStyleForFeature } from "./parcelStyle";

const mapMock = vi.hoisted(() => ({
  addLayer: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: vi.fn(() => 9),
  getBounds: vi.fn(() => ({
    getWest: () => -62,
    getSouth: () => 45,
    getEast: () => -60,
    getNorth: () => 47,
  })),
  getContainer: vi.fn(() => document.body),
  invalidateSize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeLayer: vi.fn(),
  setZoom: vi.fn(),
}));

const mapEventHandlers = vi.hoisted(() => ({
  click: undefined as
    | ((event: { latlng: { lat: number; lng: number } }) => void)
    | undefined,
}));

const mineralLayerEffectStarts = vi.hoisted(() => vi.fn());

vi.mock("react-leaflet", () => ({
  Circle: ({
    center,
    radius,
  }: {
    center: [number, number];
    radius: number;
  }) => (
    <div
      data-testid="location-accuracy"
      data-center={center.join(",")}
      data-radius={radius}
    />
  ),
  CircleMarker: ({
    center,
    radius,
  }: {
    center: [number, number];
    radius: number;
  }) => (
    <div
      data-testid="location-position"
      data-center={center.join(",")}
      data-radius={radius}
    />
  ),
  GeoJSON: () => <div data-testid="parcel-overlay" />,
  MapContainer: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Pane: ({
    children,
    name,
    style,
  }: PropsWithChildren<{ name: string; style?: CSSProperties }>) => (
    <div data-testid={`pane-${name}`} style={style}>
      {children}
    </div>
  ),
  TileLayer: () => null,
  useMap: () => mapMock,
  useMapEvents: (handlers: typeof mapEventHandlers) => {
    mapEventHandlers.click = handlers.click;
    return mapMock;
  },
}));

vi.mock("../services/browserLocation", () => ({
  getBrowserLocation: vi.fn(),
}));

vi.mock("../services/arcGISFeatureOverlay", () => ({
  fetchArcGISFeatureOverlay: vi.fn(),
}));

vi.mock("./MineralProximityParcelLayer", () => ({
  MineralProximityParcelLayer: ({
    visible,
    onSelectPid,
    onStatusChange,
  }: {
    visible: boolean;
    onSelectPid: (pid: string) => void;
    onStatusChange: (
      status: { status: "loading" } | { status: "ready"; count: number },
    ) => void;
  }) => {
    useEffect(() => {
      if (visible) {
        mineralLayerEffectStarts();
        onStatusChange({ status: "loading" });
      }
    }, [onStatusChange, visible]);

    return visible ? (
      <button
        type="button"
        data-testid="mineral-proximity-layer"
        onClick={() => {
          onStatusChange({ status: "ready", count: 1 });
          onSelectPid("90000001");
        }}
      >
        Derived mineral proximity parcels
      </button>
    ) : null;
  },
}));

const hiddenResourceLayers = {
  "mineral-occurrences": false,
  "mineral-tenure": false,
  "abandoned-mines": false,
  "mineral-proximity-parcels": false,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MapCanvas browser location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrowserLocation).mockResolvedValue({
      latitude: 46.12,
      longitude: -60.91,
      accuracy: 24,
    });
    vi.mocked(fetchArcGISFeatureOverlay).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("renders SVG-backed accuracy and position circles", async () => {
    const user = userEvent.setup();
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Use my location" }));

    expect(await screen.findByTestId("location-accuracy")).toHaveAttribute(
      "data-center",
      "46.12,-60.91",
    );
    expect(screen.getByTestId("location-accuracy")).toHaveAttribute(
      "data-radius",
      "24",
    );
    expect(screen.getByTestId("location-position")).toHaveAttribute(
      "data-radius",
      "8",
    );
    expect(
      screen.getByText("Your location is shown on the map."),
    ).toBeInTheDocument();
  });

  it("dismisses the successful location message after four seconds", async () => {
    vi.useFakeTimers();
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": true,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
      await Promise.resolve();
    });
    expect(
      screen.getByText("Your location is shown on the map."),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_999));
    expect(
      screen.getByText("Your location is shown on the map."),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.queryByText("Your location is shown on the map."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("location-position")).toBeInTheDocument();
  });
});

describe("MapCanvas sizing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes Leaflet when its mobile container settles to a new size", async () => {
    let notifyResize: (() => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notifyResize = () => callback([], this as unknown as ResizeObserver);
        }

        observe = observe;
        disconnect = disconnect;
      },
    );

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapMock.invalidateSize).toHaveBeenCalledTimes(1));
    expect(observe).toHaveBeenCalledWith(document.body);

    act(() => notifyResize?.());

    expect(mapMock.invalidateSize).toHaveBeenCalledTimes(2);
    expect(mapMock.invalidateSize).toHaveBeenLastCalledWith({ animate: false });
  });
});

describe("MapCanvas parcel discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapMock.getZoom.mockReturnValue(9);
    mapEventHandlers.click = undefined;
  });

  it("identifies map-tapped parcels only once property boundaries are visible", () => {
    const onIdentifyParcel = vi.fn();
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: true,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": true,
          roads: true,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={onIdentifyParcel}
      />,
    );

    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );

    expect(onIdentifyParcel).not.toHaveBeenCalled();

    mapMock.getZoom.mockReturnValue(14);
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );

    expect(onIdentifyParcel).toHaveBeenCalledWith(46.059488, -61.414138);
  });

  it("fits the initial view to the visible tax-sale parcel layer once", async () => {
    const parcel = {
      type: "Feature" as const,
      properties: { PID: "50251750" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-61.42, 46.05],
            [-61.41, 46.05],
            [-61.41, 46.06],
            [-61.42, 46.06],
            [-61.42, 46.05],
          ],
        ],
      },
    };
    const props = {
      parcels: { type: "FeatureCollection" as const, features: [parcel] },
      taxSalePids: new Set(["50251750"]),
      historicalTaxSalePids: new Set<string>(),
      selectedPid: null,
      provinceLayers: {
        "ns-aerial": false,
        nsprd: true,
        "crown-lands": false,
        "flood-risk": false,
        waterfalls: false,
        "water-features": true,
        roads: true,
        buildings: false,
        contours: false,
      },
      resourceLayers: hiddenResourceLayers,
      showModernMap: false,
      showTaxSale: true,
      showHistoricalTaxSales: false,
      onSelectPid: vi.fn(),
      onIdentifyParcel: vi.fn(),
    };
    const { rerender } = render(<MapCanvas {...props} />);

    await waitFor(() => expect(mapMock.fitBounds).toHaveBeenCalledTimes(1));
    rerender(<MapCanvas {...props} parcels={{ ...props.parcels }} />);
    expect(mapMock.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("keeps the current map view when a PID is selected", () => {
    render(
      <MapCanvas
        parcels={{
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { PID: "50251750" },
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-61.42, 46.05],
                    [-61.41, 46.05],
                    [-61.41, 46.06],
                    [-61.42, 46.06],
                    [-61.42, 46.05],
                  ],
                ],
              },
            },
          ],
        }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50251750"
        provinceLayers={{
          "ns-aerial": true,
          nsprd: true,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": true,
          roads: true,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    expect(mapMock.fitBounds).not.toHaveBeenCalled();
    expect(mapMock.setZoom).not.toHaveBeenCalled();
  });

  it("zooms to a PID when an explicit parcel-list focus is requested", () => {
    const parcel = {
      type: "Feature" as const,
      properties: { PID: "50251750" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-61.42, 46.05],
            [-61.41, 46.05],
            [-61.41, 46.06],
            [-61.42, 46.06],
            [-61.42, 46.05],
          ],
        ],
      },
    };
    const props = {
      parcels: { type: "FeatureCollection" as const, features: [parcel] },
      taxSalePids: new Set<string>(),
      historicalTaxSalePids: new Set<string>(),
      selectedPid: "50251750",
      provinceLayers: {
        "ns-aerial": true,
        nsprd: true,
        "crown-lands": false,
        "flood-risk": false,
        waterfalls: false,
        "water-features": true,
        roads: true,
        buildings: false,
        contours: false,
      },
      resourceLayers: hiddenResourceLayers,
      showModernMap: false,
      showTaxSale: false,
      showHistoricalTaxSales: false,
      onSelectPid: vi.fn(),
      onIdentifyParcel: vi.fn(),
      focusRequest: { pid: "50251750", requestId: 1 },
    };
    const { rerender } = render(<MapCanvas {...props} />);

    expect(mapMock.fitBounds).toHaveBeenCalledTimes(1);

    rerender(<MapCanvas {...props} parcels={{ ...props.parcels }} />);
    expect(mapMock.fitBounds).toHaveBeenCalledTimes(1);

    rerender(
      <MapCanvas
        {...props}
        focusRequest={{ pid: "50251750", requestId: 2 }}
      />,
    );
    expect(mapMock.fitBounds).toHaveBeenCalledTimes(2);
  });
});

describe("MapCanvas Province overlays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapMock.getZoom.mockReturnValue(16);
  });

  it("adds a dedicated trail and track contrast pass above the roads layer", () => {
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: true,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    expect(mapMock.addLayer).toHaveBeenCalledTimes(2);
  });

  it("does not force the overview map inward when default property boundaries are checked", () => {
    mapMock.getZoom.mockReturnValue(9);

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: true,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    expect(mapMock.setZoom).not.toHaveBeenCalled();
  });

  it("moves to the contour layer's first useful zoom when it is enabled", () => {
    mapMock.getZoom.mockReturnValue(9);

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: true,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    expect(mapMock.setZoom).toHaveBeenCalledWith(13, { animate: true });
  });
});

describe("MapCanvas resource overlays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapMock.getZoom.mockReturnValue(9);
    vi.mocked(fetchArcGISFeatureOverlay).mockResolvedValue({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 70,
          geometry: { type: "Point", coordinates: [-61.2, 46.1] },
          properties: { geo_id: 70, Name: "Example occurrence" },
        },
      ],
    });
  });

  it("loads only the visible feature layer for the current map envelope", async () => {
    const onResourceLayerStatusChange = vi.fn();
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={{
          ...hiddenResourceLayers,
          "mineral-occurrences": true,
        }}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onResourceLayerStatusChange={onResourceLayerStatusChange}
      />,
    );

    await waitFor(() => expect(fetchArcGISFeatureOverlay).toHaveBeenCalledTimes(1));
    expect(fetchArcGISFeatureOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceUrl: expect.stringContaining("mineral_occurrence_database"),
        bounds: { west: -62, south: 45, east: -60, north: 47 },
      }),
    );
    expect(onResourceLayerStatusChange).toHaveBeenLastCalledWith(
      "mineral-occurrences",
      { status: "ready", count: 1 },
    );
  });

  it("waits for the hazard layer's detail zoom before querying", async () => {
    const onResourceLayerStatusChange = vi.fn();
    mapMock.getZoom.mockReturnValue(9);

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={{ ...hiddenResourceLayers, "abandoned-mines": true }}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onResourceLayerStatusChange={onResourceLayerStatusChange}
      />,
    );

    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
    expect(onResourceLayerStatusChange).toHaveBeenCalledWith(
      "abandoned-mines",
      { status: "zoom", minZoom: 11 },
    );
  });

  it("reports one feature source failure without affecting other layers", async () => {
    const onResourceLayerStatusChange = vi.fn();
    vi.mocked(fetchArcGISFeatureOverlay).mockRejectedValueOnce(
      new Error("source unavailable"),
    );

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={{
          ...hiddenResourceLayers,
          "mineral-occurrences": true,
        }}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onResourceLayerStatusChange={onResourceLayerStatusChange}
      />,
    );

    await waitFor(() =>
      expect(onResourceLayerStatusChange).toHaveBeenCalledWith(
        "mineral-occurrences",
        { status: "error" },
      ),
    );
  });

  it("renders derived mineral proximity parcels through the existing PID callback", async () => {
    const onSelectPid = vi.fn();
    const onResourceLayerStatusChange = vi.fn();
    const props = {
      parcels: { type: "FeatureCollection" as const, features: [] },
      taxSalePids: new Set<string>(),
      historicalTaxSalePids: new Set<string>(),
      selectedPid: null,
      provinceLayers: {
        "ns-aerial": false,
        nsprd: false,
        "crown-lands": false,
        "flood-risk": false,
        waterfalls: false,
        "water-features": false,
        roads: false,
        buildings: false,
        contours: false,
      },
      resourceLayers: hiddenResourceLayers,
      showModernMap: false,
      showTaxSale: false,
      showHistoricalTaxSales: false,
      onSelectPid,
      onIdentifyParcel: vi.fn(),
      onResourceLayerStatusChange,
    };
    const { rerender } = render(<MapCanvas {...props} />);

    expect(screen.queryByTestId("mineral-proximity-layer")).not.toBeInTheDocument();

    rerender(
      <MapCanvas
        {...props}
        resourceLayers={{ ...hiddenResourceLayers, "mineral-proximity-parcels": true }}
      />,
    );
    const derivedLayer = screen.getByTestId("mineral-proximity-layer");
    expect(
      derivedLayer.compareDocumentPosition(screen.getByTestId("parcel-overlay")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      Number(screen.getByTestId("pane-mineral-proximity-parcels-pane").style.zIndex),
    ).toBeLessThan(
      Number(screen.getByTestId("pane-established-parcel-overlays-pane").style.zIndex),
    );

    await userEvent.setup().click(derivedLayer);

    expect(onResourceLayerStatusChange).toHaveBeenCalledWith(
      "mineral-proximity-parcels",
      { status: "ready", count: 1 },
    );
    expect(onSelectPid).toHaveBeenCalledWith("90000001");
  });

  it("does not restart the derived parcel layer when stable props rerender", () => {
    const onResourceLayerStatusChange = vi.fn();
    const props = {
      parcels: { type: "FeatureCollection" as const, features: [] },
      taxSalePids: new Set<string>(),
      historicalTaxSalePids: new Set<string>(),
      selectedPid: null,
      provinceLayers: {
        "ns-aerial": false,
        nsprd: false,
        "crown-lands": false,
        "flood-risk": false,
        waterfalls: false,
        "water-features": false,
        roads: false,
        buildings: false,
        contours: false,
      },
      resourceLayers: {
        ...hiddenResourceLayers,
        "mineral-proximity-parcels": true,
      },
      showModernMap: false,
      showTaxSale: false,
      showHistoricalTaxSales: false,
      onSelectPid: vi.fn(),
      onIdentifyParcel: vi.fn(),
      onResourceLayerStatusChange,
    };
    const { rerender } = render(<MapCanvas {...props} />);
    const mineralLoadingReports = () =>
      onResourceLayerStatusChange.mock.calls.filter(
        ([id, status]) =>
          id === "mineral-proximity-parcels" && status.status === "loading",
      );

    expect(mineralLayerEffectStarts).toHaveBeenCalledTimes(1);
    expect(onResourceLayerStatusChange).toHaveBeenCalledWith(
      "mineral-proximity-parcels",
      { status: "loading" },
    );
    expect(mineralLoadingReports()).toHaveLength(1);

    rerender(<MapCanvas {...props} />);

    expect(mineralLayerEffectStarts).toHaveBeenCalledTimes(1);
    expect(mineralLoadingReports()).toHaveLength(1);
  });
});

describe("MapCanvas micro-hydro pilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the checked-in pilot only when its independent layer is visible", async () => {
    const onLayerStatusChange = vi.fn();

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
          "water-features": false,
          roads: false,
          buildings: false,
          contours: false,
        }}
        resourceLayers={hiddenResourceLayers}
        hydroPilotLayers={{ "inverness-hydro-potential": true }}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
      />,
    );

    expect(onLayerStatusChange).toHaveBeenCalledWith(
      "inverness-hydro-potential",
      { status: "loading" },
    );
    await waitFor(() =>
      expect(onLayerStatusChange).toHaveBeenCalledWith(
        "inverness-hydro-potential",
        { status: "ready", count: 13 },
      ),
    );
    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
  });
});

describe("MapCanvas parcel styling", () => {
  const selectedFeature = {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [] },
    properties: { PID: "15234636" },
  };

  it("keeps the selected parcel fill transparent and adds a glowing outline", () => {
    const stylingContext = {
      selectedPid: "15234636",
      taxSalePids: new Set(["15234636"]),
      showTaxSale: true,
      historicalTaxSalePids: new Set<string>(),
      showHistoricalTaxSales: false,
    };

    const style = parcelStyleForFeature(selectedFeature, stylingContext);

    expect(style.fillOpacity).toBe(0);
    expect(style.className).toContain("selected-parcel-outline");
    expect(style.className).toContain("selected-parcel-outline--current");
  });

  it("uses the transparent glowing outline for historical selections", () => {
    const style = parcelStyleForFeature(selectedFeature, {
      selectedPid: "15234636",
      taxSalePids: new Set(),
      showTaxSale: false,
      historicalTaxSalePids: new Set(["15234636"]),
      showHistoricalTaxSales: true,
    });

    expect(style.fillOpacity).toBe(0);
    expect(style.className).toContain("selected-parcel-outline");
    expect(style.className).toContain("selected-parcel-outline--historical");
  });

  it("does not make unselected tax-sale parcels opaque", () => {
    expect(
      parcelStyleForFeature(
        {
          ...selectedFeature,
          properties: { PID: "15161631" },
        },
        {
          selectedPid: "15234636",
          taxSalePids: new Set(["15161631"]),
          showTaxSale: true,
          historicalTaxSalePids: new Set<string>(),
          showHistoricalTaxSales: false,
        },
      ).fillOpacity,
    ).toBe(0.3);
  });
});
