import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrowserLocation } from "../services/browserLocation";
import { MapCanvas } from "./MapCanvas";

const mapMock = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  getZoom: vi.fn(() => 9),
  removeLayer: vi.fn(),
  setZoom: vi.fn(),
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
        selectedPid={null}
        provinceLayers={{
          "ns-aerial": false,
          nsprd: false,
          "crown-lands": false,
          "flood-risk": false,
          waterfalls: false,
        }}
        showModernMap
        showTaxSale={false}
        onSelectPid={vi.fn()}
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
