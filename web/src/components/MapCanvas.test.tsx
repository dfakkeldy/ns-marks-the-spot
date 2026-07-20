import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  GeoJSON: () => null,
  MapContainer: ({ children }: PropsWithChildren) => <div>{children}</div>,
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

const hiddenResourceLayers = {
  "mineral-occurrences": false,
  "mineral-tenure": false,
  "abandoned-mines": false,
};

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

    mapMock.getZoom.mockReturnValue(10);
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
});

describe("MapCanvas parcel styling", () => {
  const selectedFeature = {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [] },
    properties: { PID: "15234636" },
  };

  it("makes the selected parcel fully opaque only at close zoom", () => {
    const stylingContext = {
      selectedPid: "15234636",
      taxSalePids: new Set(["15234636"]),
      showTaxSale: true,
      historicalTaxSalePids: new Set<string>(),
      showHistoricalTaxSales: false,
    };

    expect(
      parcelStyleForFeature(selectedFeature, {
        ...stylingContext,
        zoom: 14,
      }).fillOpacity,
    ).toBe(0.34);
    expect(
      parcelStyleForFeature(selectedFeature, {
        ...stylingContext,
        zoom: 15,
      }).fillOpacity,
    ).toBe(1);
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
          zoom: 16,
        },
      ).fillOpacity,
    ).toBe(0.3);
  });
});
