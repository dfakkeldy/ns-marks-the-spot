import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapLayerId, MapLayerStatus } from "../MapCanvas";
import { PrintMap } from "./PrintMap";
import type { PrintSnapshot } from "../../services/printSnapshot";

const mapCanvasProps = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));

vi.mock("../MapCanvas", () => ({
  MapCanvas: (props: Record<string, unknown>) => {
    mapCanvasProps.current = props;
    return <div data-testid="map-canvas" />;
  },
}));

const snapshot = {
  pid: "01234567",
  mode: "current",
  template: "research",
  selectedParcelGeometry: { type: "FeatureCollection", features: [] },
  mapParcels: { type: "FeatureCollection", features: [] },
  taxSalePids: [],
  historicalTaxSalePids: [],
  viewport: {
    position: { latitude: 46.35, longitude: -61.15, zoom: 15 },
    bounds: { north: 46.4, east: -61.1, south: 46.3, west: -61.2 },
  },
  layerIds: ["modern", "roads", "contours", "ns-aerial"],
} as unknown as PrintSnapshot;

function reportLayerStatus(id: MapLayerId, status: MapLayerStatus) {
  const handler = mapCanvasProps.current?.onLayerStatusChange as
    | ((layerId: MapLayerId, layerStatus: MapLayerStatus) => void)
    | undefined;
  handler?.(id, status);
}

describe("PrintMap", () => {
  it("aggregates only printed layer readiness and reports the resolved position", () => {
    const onReadinessChange = vi.fn();
    const onResolvedPosition = vi.fn();

    render(
      <PrintMap
        snapshot={snapshot}
        bounds={{ north: 46.4, east: -61.1, south: 46.3, west: -61.2 }}
        includeAerial={false}
        onReadinessChange={onReadinessChange}
        onResolvedPosition={onResolvedPosition}
      />,
    );

    expect(onReadinessChange).toHaveBeenLastCalledWith({
      status: "loading",
      renderedLayerIds: [],
      failedLayerIds: [],
      belowZoomLayerIds: [],
    });
    act(() => {
      reportLayerStatus("modern", { status: "ready" });
      reportLayerStatus("roads", { status: "error" });
      reportLayerStatus("contours", { status: "zoom", minZoom: 13 });
      reportLayerStatus("ns-aerial", { status: "ready" });
    });

    expect(onReadinessChange).toHaveBeenLastCalledWith({
      status: "error",
      renderedLayerIds: ["modern"],
      failedLayerIds: ["roads"],
      belowZoomLayerIds: ["contours"],
      timedOutLayerIds: [],
    });

    const onPositionChange = mapCanvasProps.current?.onPositionChange as
      | ((value: { latitude: number; longitude: number; zoom: number }) => void)
      | undefined;
    onPositionChange?.({ latitude: 46.35, longitude: -61.15, zoom: 15 });
    expect(onResolvedPosition).toHaveBeenCalledWith({
      latitude: 46.35,
      longitude: -61.15,
      zoom: 15,
    });
  });

  it("passes a display-only print map without browser location or active identify work", () => {
    render(
      <PrintMap
        snapshot={snapshot}
        bounds={{ north: 46.4, east: -61.1, south: 46.3, west: -61.2 }}
        includeAerial={false}
        onReadinessChange={vi.fn()}
        onResolvedPosition={vi.fn()}
      />,
    );

    expect(mapCanvasProps.current).toMatchObject({
      renderMode: "print",
      fitBounds: { north: 46.4, east: -61.1, south: 46.3, west: -61.2 },
      initialPosition: { latitude: 46.35, longitude: -61.15, zoom: 15 },
    });
    expect(mapCanvasProps.current).not.toHaveProperty("browserLocation");
    expect(mapCanvasProps.current?.onIdentifyParcel).toBeTypeOf("function");
    expect(mapCanvasProps.current?.onIdentifyParcel).not.toBe(
      mapCanvasProps.current?.onSelectPid,
    );
  });

  it("renders and tracks a captured derived mineral-proximity layer", () => {
    const onReadinessChange = vi.fn();
    render(
      <PrintMap
        snapshot={{
          ...snapshot,
          layerIds: ["mineral-proximity-parcels"],
        } as PrintSnapshot}
        bounds={{ north: 46.4, east: -61.1, south: 46.3, west: -61.2 }}
        includeAerial={false}
        onReadinessChange={onReadinessChange}
        onResolvedPosition={vi.fn()}
      />,
    );

    expect(
      (mapCanvasProps.current?.resourceLayers as Record<string, boolean>)[
        "mineral-proximity-parcels"
      ],
    ).toBe(true);
    act(() => reportLayerStatus("mineral-proximity-parcels", { status: "ready", count: 1 }));
    expect(onReadinessChange).toHaveBeenLastCalledWith({
      status: "ready",
      renderedLayerIds: ["mineral-proximity-parcels"],
      belowZoomLayerIds: [],
    });
  });

  it("does not claim pending layers rendered when another layer has failed", () => {
    const onReadinessChange = vi.fn();
    render(
      <PrintMap
        snapshot={{ ...snapshot, layerIds: ["modern", "roads", "contours"] } as PrintSnapshot}
        bounds={{ north: 46.4, east: -61.1, south: 46.3, west: -61.2 }}
        includeAerial={false}
        onReadinessChange={onReadinessChange}
        onResolvedPosition={vi.fn()}
      />,
    );

    act(() => {
      reportLayerStatus("modern", { status: "ready" });
      reportLayerStatus("roads", { status: "error" });
    });

    expect(onReadinessChange).toHaveBeenLastCalledWith({
      status: "error",
      renderedLayerIds: ["modern"],
      failedLayerIds: ["roads"],
      belowZoomLayerIds: [],
      timedOutLayerIds: [],
    });
  });

  it("keeps a current-attempt error sticky when a late load callback arrives", () => {
    const onReadinessChange = vi.fn();
    render(
      <PrintMap
        snapshot={{ ...snapshot, layerIds: ["roads"] } as PrintSnapshot}
        bounds={{ north: 46.4, east: -61.1, south: 46.3, west: -61.2 }}
        includeAerial={false}
        onReadinessChange={onReadinessChange}
        onResolvedPosition={vi.fn()}
      />,
    );

    act(() => {
      reportLayerStatus("roads", { status: "error" });
      reportLayerStatus("roads", { status: "ready", count: 9 });
    });

    expect(onReadinessChange).toHaveBeenLastCalledWith({
      status: "error",
      renderedLayerIds: [],
      failedLayerIds: ["roads"],
      belowZoomLayerIds: [],
      timedOutLayerIds: [],
    });
  });
});
