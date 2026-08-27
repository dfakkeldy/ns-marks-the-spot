import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Feature } from "geojson";
import { USER_VECTOR_PANE } from "../../../components/mapPanes";
import type { UserVectorLayerRecord } from "../types";
import type { VisibleUserVectorLayer } from "../useUserVectorLayers";

type CapturedGeoJsonProps = {
  data: unknown;
  pane?: string;
  renderer?: unknown;
  style?: (feature: Feature) => Record<string, unknown>;
  pointToLayer?: (feature: Feature, latlng: unknown) => unknown;
  onEachFeature?: (feature: Feature, layer: unknown) => void;
};

const captured = vi.hoisted(() => ({
  geoJsonProps: [] as CapturedGeoJsonProps[],
  map: {
    fitBounds: vi.fn(),
    getPane: vi.fn(() => undefined as HTMLElement | undefined),
    createPane: vi.fn(() => document.createElement("div")),
  },
  canvasRenderer: { sentinel: "canvas-renderer" },
  circleMarkers: [] as Array<{ latlng: unknown; options: Record<string, unknown> }>,
}));

vi.mock("react-leaflet", () => ({
  useMap: () => captured.map,
  GeoJSON: (props: CapturedGeoJsonProps) => {
    captured.geoJsonProps.push(props);
    return null;
  },
}));

vi.mock("leaflet", () => ({
  default: {
    canvas: vi.fn(() => captured.canvasRenderer),
    circleMarker: vi.fn((latlng: unknown, options: Record<string, unknown>) => {
      captured.circleMarkers.push({ latlng, options });
      return { isCircleMarker: true };
    }),
  },
}));

import { UserVectorLayers } from "./UserVectorLayers";

function record(id: string, color = "#d55e00"): UserVectorLayerRecord {
  return {
    id,
    name: `Layer ${id}`,
    source: "geojson",
    origin: {
      kind: "imported",
      filename: `${id}.geojson`,
      importedAt: "2026-07-30T00:00:00.000Z",
    },
    createdAt: "2026-07-30T00:00:00.000Z",
    revision: 0,
    style: { color },
    featureCount: 1,
    bbox: [-64, 44, -63, 45],
  };
}

function layer(id: string, properties: Record<string, unknown> = {}): VisibleUserVectorLayer {
  return {
    record: record(id),
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: { type: "Point", coordinates: [-63.5, 44.5] },
          properties,
        },
      ],
    },
  };
}

describe("UserVectorLayers", () => {
  afterEach(() => {
    cleanup();
    captured.geoJsonProps.length = 0;
    captured.circleMarkers.length = 0;
    captured.map.fitBounds.mockClear();
  });

  it("renders one canvas-backed GeoJSON per layer in the user vector pane", () => {
    render(<UserVectorLayers layers={[layer("a"), layer("b")]} />);
    expect(captured.geoJsonProps).toHaveLength(2);
    const feature: Feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-63, 45] },
      properties: {},
    };
    for (const props of captured.geoJsonProps) {
      expect(props.pane).toBe(USER_VECTOR_PANE);
      // The canvas renderer rides in the style's PathOptions (react-leaflet
      // declares no renderer prop on GeoJSON).
      expect(props.style!(feature).renderer).toBe(captured.canvasRenderer);
    }
  });

  it("styles features with the layer color", () => {
    render(<UserVectorLayers layers={[layer("a")]} />);
    const style = captured.geoJsonProps[0].style;
    expect(style).toBeTypeOf("function");
    expect(
      style!({
        type: "Feature",
        geometry: { type: "Point", coordinates: [-63, 45] },
        properties: {},
      }),
    ).toMatchObject({ color: "#d55e00" });
  });

  it("renders points as circle markers pinned to the pane and renderer", () => {
    render(<UserVectorLayers layers={[layer("a")]} />);
    const pointToLayer = captured.geoJsonProps[0].pointToLayer;
    expect(pointToLayer).toBeTypeOf("function");
    pointToLayer!(
      { type: "Feature", geometry: { type: "Point", coordinates: [-63, 45] }, properties: {} },
      { lat: 45, lng: -63 },
    );
    expect(captured.circleMarkers).toHaveLength(1);
    expect(captured.circleMarkers[0].options).toMatchObject({
      pane: USER_VECTOR_PANE,
      renderer: captured.canvasRenderer,
    });
  });

  it("binds a text-only popup and tooltip — HTML in user data never becomes elements", () => {
    render(
      <UserVectorLayers
        layers={[layer("a", { name: "Pin", description: '<img src=x onerror="boom()">' })]}
      />,
    );
    const onEachFeature = captured.geoJsonProps[0].onEachFeature;
    expect(onEachFeature).toBeTypeOf("function");

    const bindPopup = vi.fn();
    const bindTooltip = vi.fn();
    onEachFeature!(
      {
        type: "Feature",
        id: "f1",
        geometry: { type: "Point", coordinates: [-63, 45] },
        properties: { name: "Pin", description: '<img src=x onerror="boom()">' },
      },
      { bindPopup, bindTooltip, on: vi.fn() },
    );

    expect(bindPopup).toHaveBeenCalledTimes(1);
    const content = bindPopup.mock.calls[0][0] as () => HTMLElement;
    const element = typeof content === "function" ? content() : content;
    expect(element.querySelector("img")).toBeNull();
    expect(element.textContent).toContain("<img src=x");
    expect(element.textContent).toContain("a.geojson");

    expect(bindTooltip).toHaveBeenCalledWith(expect.any(HTMLElement), {
      sticky: true,
    });
    const tooltipNode = bindTooltip.mock.calls[0][0] as HTMLElement;
    expect(tooltipNode.textContent).toBe("Pin");
  });

  it("keeps a hostile feature name inert in the tooltip", () => {
    // Leaflet assigns STRING tooltip content with innerHTML, so a name taken
    // from a third-party file used to become live markup on hover.
    const hostile = '<img src=x onerror="boom()">';
    render(<UserVectorLayers layers={[layer("a", { name: hostile })]} />);
    const onEachFeature = captured.geoJsonProps[0].onEachFeature;

    const bindTooltip = vi.fn();
    onEachFeature!(
      {
        type: "Feature",
        id: "f1",
        geometry: { type: "Point", coordinates: [-63, 45] },
        properties: { name: hostile },
      },
      { bindPopup: vi.fn(), bindTooltip, on: vi.fn() },
    );

    const tooltipNode = bindTooltip.mock.calls[0][0] as HTMLElement;
    expect(tooltipNode.querySelector("img")).toBeNull();
    expect(tooltipNode.textContent).toBe(hostile);
  });

  it("fits the map to a layer's bbox when a fit is requested", () => {
    render(
      <UserVectorLayers
        layers={[layer("a")]}
        fitRequest={{ layerId: "a", revision: 1 }}
      />,
    );
    expect(captured.map.fitBounds).toHaveBeenCalledWith(
      [
        [44, -64],
        [45, -63],
      ],
      expect.objectContaining({ maxZoom: expect.any(Number) }),
    );
  });

  it("ignores fit requests for unknown layers", () => {
    render(
      <UserVectorLayers
        layers={[layer("a")]}
        fitRequest={{ layerId: "missing", revision: 1 }}
      />,
    );
    expect(captured.map.fitBounds).not.toHaveBeenCalled();
  });
});
