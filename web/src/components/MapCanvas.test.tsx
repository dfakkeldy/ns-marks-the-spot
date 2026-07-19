import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrowserLocation } from "../services/browserLocation";
import { MapCanvas } from "./MapCanvas";
import { parcelStyleForFeature } from "./parcelStyle";

const mapMock = vi.hoisted(() => ({
  addLayer: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: vi.fn(() => 9),
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

describe("MapCanvas browser location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrowserLocation).mockResolvedValue({
      latitude: 46.12,
      longitude: -60.91,
      accuracy: 24,
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
    mapEventHandlers.click = undefined;
  });

  it("identifies the parcel under a map tap when property boundaries are visible", () => {
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
        showModernMap={false}
        showTaxSale
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={onIdentifyParcel}
      />,
    );

    act(() => mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }));

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
