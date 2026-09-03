import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type CSSProperties, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArcGISFeatureOverlay } from "../services/arcGISFeatureOverlay";
import type { LiveFix, LiveLocationSnapshot } from "../location/liveLocation";
import {
  MapCanvas,
  IDENTIFY_CLICK_DELAY_MS,
  type MapLayerId,
  type MapLayerStatus,
} from "./MapCanvas";
import { parcelStyleForFeature } from "./parcelStyle";
import type { GeoreferenceBinding } from "../userMaps/components/GeoreferenceMapLayer";

// waitFor's 1000 ms default is a CPU-contention budget, not a correctness one —
// nothing here asserts how *fast* a layer settles, only that it does. Under a
// loaded machine the whole-suite run starves this file enough to blow it; the
// hydro pilot is the first to go because loadInvernessHydroPotential() dynamic-
// imports a 920 KB JSON, so Vite has to transform a real module rather than
// settle a mocked fetch on a microtask. Applied to every waitFor in the file so
// no single call site is left encoding an accidental performance assertion.
const ASYNC_LAYER_TIMEOUT_MS = 5_000;

// Backs the useMap() stub's getPane/createPane below. Originally this stored
// panes for the REAL UserMapLayers' ensurePane; both UserMapLayers and
// GeoreferenceMapLayer are now mocked wholesale in this file (see below), so
// neither exercises it any more. Left in place as a real Map/Set rather than
// bare vi.fn()s in case a future pane-creating layer is exercised directly
// against this useMap() stub instead of through its own mocked component.
const paneElements = vi.hoisted(() => new Map<string, HTMLElement>());

const mapMock = vi.hoisted(() => ({
  addLayer: vi.fn(),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  panTo: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 46.21351, lng: -61.09131 })),
  getBounds: vi.fn((): {
    getWest: () => number;
    getSouth: () => number;
    getEast: () => number;
    getNorth: () => number;
    contains?: (point: [number, number]) => boolean;
  } => ({
    getWest: () => -62,
    getSouth: () => 45,
    getEast: () => -60,
    getNorth: () => 47,
    // The province-wide default holds every fix these tests push.
    contains: () => true,
  })),
  getZoom: vi.fn(() => 9),
  getContainer: vi.fn(() => document.body),
  getSize: vi.fn(() => ({ x: 800, y: 600 })),
  containerPointToLatLng: vi.fn(({ x, y }: { x: number; y: number }) => ({
    lat: 46 + y / 1_000_000,
    lng: -61 + x / 1_000_000,
  })),
  distance: vi.fn(() => 330.7291667),
  invalidateSize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeLayer: vi.fn(),
  setZoom: vi.fn(),
  getPane: vi.fn((name: string) => paneElements.get(name)),
  createPane: vi.fn((name: string) => {
    const el = document.createElement("div");
    paneElements.set(name, el);
    return el;
  }),
}));

const mapEventHandlers = vi.hoisted(() => ({
  click: undefined as
    | ((event: { latlng: { lat: number; lng: number } }) => void)
    | undefined,
  dblclick: undefined as (() => void) | undefined,
}));

const mapContainerProps = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));

const geoJsonProps = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
}));

const circleMarkerProps = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
}));

const tileLayerProps = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
}));

const mineralLayerProps = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));

const oldGrowthLayerProps = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
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
    eventHandlers,
    ...props
  }: {
    center: [number, number];
    radius: number;
    eventHandlers?: {
      click?: (event: { originalEvent: Event }) => void;
    };
  } & Record<string, unknown>) => {
    circleMarkerProps.calls.push({ center, radius, eventHandlers, ...props });
    return (
      <div
        data-testid="location-position"
        data-center={center.join(",")}
        data-radius={radius}
        onClick={(event) =>
          eventHandlers?.click?.({ originalEvent: event.nativeEvent })
        }
      />
    );
  },
  GeoJSON: (props: Record<string, unknown>) => {
    geoJsonProps.calls.push(props);
    return <div data-testid="parcel-overlay" />;
  },
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="location-heading" data-position={position.join(",")} />
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="live-trace" data-count={positions.length} />
  ),
  MapContainer: ({
    children,
    ref,
    ...props
  }: PropsWithChildren<{
    ref?: (map: typeof mapMock | null) => void;
  }>) => {
    mapContainerProps.current = props;
    useEffect(() => {
      ref?.(mapMock);
      return () => ref?.(null);
    }, [ref]);
    return <div>{children}</div>;
  },
  Pane: ({
    children,
    name,
    pane,
    style,
  }: PropsWithChildren<{
    name: string;
    pane?: string;
    style?: CSSProperties;
  }>) => (
    <div data-testid={`pane-${name}`} data-parent-pane={pane} style={style}>
      {children}
    </div>
  ),
  ScaleControl: ({ position }: { position: string }) => (
    <div data-testid="scale-control" data-position={position} />
  ),
  TileLayer: (props: Record<string, unknown> & {
    eventHandlers?: {
      loading?: () => void;
      load?: () => void;
      tileerror?: () => void;
    };
  }) => {
    tileLayerProps.calls.push(props);
    return (
      <div data-testid="tile-layer" data-class-name={props.className}>
        <button type="button" onClick={() => props.eventHandlers?.tileerror?.()}>
          Simulate modern map error
        </button>
        <button type="button" onClick={() => props.eventHandlers?.load?.()}>
          Simulate modern map load
        </button>
      </div>
    );
  },
  useMap: () => mapMock,
  useMapEvents: (handlers: {
    click?: (event: { latlng: { lat: number; lng: number } }) => void;
    dblclick?: () => void;
  }) => {
    if (handlers.click) {
      mapEventHandlers.click = handlers.click;
    }
    if (handlers.dblclick) {
      mapEventHandlers.dblclick = handlers.dblclick;
    }
    return mapMock;
  },
}));

// The live-location service is mocked at the module seam: tests drive the
// watch by pushing snapshots into the captured onChange, exactly the shape
// the real startLiveLocation delivers.
const liveLocationMock = vi.hoisted(() => ({
  onChange: undefined as ((snapshot: unknown) => void) | undefined,
  stop: vi.fn(),
}));

vi.mock("../location/liveLocation", () => ({
  RECORDING_WATCH_OPTIONS: {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20_000,
  },
  startLiveLocation: (onChange: (snapshot: unknown) => void) => {
    liveLocationMock.onChange = onChange;
    onChange({ status: "acquiring", fix: null });
    return { stop: liveLocationMock.stop };
  },
}));

function liveFix(overrides: Partial<LiveFix> = {}): LiveFix {
  return {
    latitude: 46.12,
    longitude: -60.91,
    accuracyM: 24,
    altitudeM: null,
    headingDeg: null,
    speedMps: null,
    timestampMs: Date.now(),
    ...overrides,
  };
}

function pushLiveSnapshot(snapshot: LiveLocationSnapshot) {
  act(() => {
    liveLocationMock.onChange?.(snapshot);
  });
}

function pushLiveFix(overrides: Partial<LiveFix> = {}) {
  pushLiveSnapshot({ status: "active", fix: liveFix(overrides) });
}

vi.mock("../services/arcGISFeatureOverlay", () => ({
  fetchArcGISFeatureOverlay: vi.fn(),
}));

vi.mock("./MineralProximityParcelLayer", () => ({
  MineralProximityParcelLayer: ({
    visible,
    onSelectPid,
    onStatusChange,
    ...props
  }: {
    visible: boolean;
    onSelectPid: (pid: string) => void;
    onStatusChange: (
      status: { status: "loading" } | { status: "ready"; count: number },
    ) => void;
  }) => {
    mineralLayerProps.current = { visible, onSelectPid, onStatusChange, ...props };
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

vi.mock("./OldGrowthPolicyLayer", () => ({
  OldGrowthPolicyLayer: (props: {
    visible: boolean;
    layer: { id: string };
    renderMode: string;
  }) => {
    oldGrowthLayerProps.current = props;
    return props.visible ? (
      <div data-testid="old-growth-policy-layer">{props.layer.id}</div>
    ) : null;
  },
}));

vi.mock("./MeasureTool", () => ({
  MeasureTool: ({
    mode,
    onModeChange,
  }: {
    mode: "off" | "distance" | "area";
    onModeChange: (mode: "off" | "distance" | "area") => void;
  }) => (
    <button
      type="button"
      data-testid="measure-tool"
      data-mode={mode}
      onClick={() => onModeChange(mode === "off" ? "distance" : "off")}
    >
      Toggle measuring
    </button>
  ),
}));

vi.mock("../userMaps/components/UserMapLayers", () => ({
  UserMapLayers: ({
    maps,
    draft,
  }: {
    maps: Array<{ record: { id: string } }>;
    draft?: { record: { id: string } } | null;
  }) => (
    <div
      data-testid="user-map-layers"
      data-count={maps.length}
      data-draft={draft?.record.id ?? "none"}
    />
  ),
}));

vi.mock("../userMaps/components/GeoreferenceMapLayer", () => ({
  GeoreferenceMapLayer: ({
    binding,
  }: {
    binding: { gcps: Array<{ id: string }> };
  }) => (
    <div data-testid="georeference-map-layer" data-gcps={binding.gcps.length} />
  ),
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
  mapMock.getCenter.mockReturnValue({ lat: 46.35, lng: -61.15 });
  mapMock.getZoom.mockReturnValue(9);
  mapMock.getBounds.mockReturnValue({
    getWest: () => -62,
    getSouth: () => 45,
    getEast: () => -60,
    getNorth: () => 47,
    contains: () => true,
  });
  mapContainerProps.current = undefined;
  geoJsonProps.calls.length = 0;
  circleMarkerProps.calls.length = 0;
  tileLayerProps.calls.length = 0;
  mineralLayerProps.current = undefined;
  oldGrowthLayerProps.current = undefined;
  liveLocationMock.onChange = undefined;
});

describe("MapCanvas browser location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

          "place-names": false,

          "main-roads": false,
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
    expect(screen.getByText("Finding your location…")).toBeInTheDocument();
    pushLiveFix();

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
    expect(
      screen.getByText("Location stays on this device."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use my location" }).querySelector("svg"),
    ).not.toBeNull();
  });

  it("clears the watch and the marker when toggled off", async () => {
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Use my location" });
    await user.click(toggle);
    pushLiveFix();
    expect(screen.getByTestId("location-position")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(liveLocationMock.stop).toHaveBeenCalled();
    expect(screen.queryByTestId("location-position")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("resets the toggle and explains when permission is denied", async () => {
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Use my location" });
    await user.click(toggle);
    pushLiveSnapshot({ status: "denied", fix: null });

    expect(
      screen.getByText(
        "Location permission was not granted. You can keep using the map.",
      ),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("dims but keeps the marker through a signal loss", async () => {
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

          "place-names": false,

          "main-roads": false,
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
    const fix = liveFix();
    pushLiveSnapshot({ status: "active", fix });
    pushLiveSnapshot({ status: "signal-lost", fix, reason: "timeout" });

    expect(screen.getByTestId("location-position")).toBeInTheDocument();
    // Never "GPS": the browser names no source. And a device still trying is
    // told apart from one that cannot place itself.
    expect(
      screen.getByText("Your location is taking longer than expected — still trying."),
    ).toBeInTheDocument();

    pushLiveSnapshot({ status: "signal-lost", fix, reason: "unavailable" });
    expect(
      screen.getByText("Your location is unavailable right now — still trying."),
    ).toBeInTheDocument();

    // And a fix that comes back takes the failure down, first one or not.
    pushLiveSnapshot({ status: "active", fix });
    expect(
      screen.getByText("Your location is shown on the map."),
    ).toBeInTheDocument();
  });

  it("follows later fixes with panTo until the user drags, then resumes via the pill", async () => {
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

          "place-names": false,

          "main-roads": false,
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
    pushLiveFix();
    expect(mapMock.flyTo).toHaveBeenCalledWith([46.12, -60.91], 14, {
      animate: true,
    });

    pushLiveFix({ latitude: 46.13 });
    expect(mapMock.panTo).toHaveBeenCalledWith([46.13, -60.91], {
      animate: true,
    });

    const [, dragStartHandler] =
      mapMock.on.mock.calls.filter(([event]) => event === "dragstart").pop() ??
      [];
    expect(dragStartHandler).toBeTypeOf("function");
    act(() => dragStartHandler?.());

    mapMock.panTo.mockClear();
    pushLiveFix({ latitude: 46.14 });
    expect(mapMock.panTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Follow" }));
    pushLiveFix({ latitude: 46.15 });
    expect(mapMock.panTo).toHaveBeenCalledWith([46.15, -60.91], {
      animate: true,
    });
  });

  it("keeps a closer zoom when the first fix arrives, and only pans", async () => {
    const user = userEvent.setup();
    // The reader searched a parcel and is reading it at 16.
    mapMock.getZoom.mockReturnValue(16);
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

          "place-names": false,

          "main-roads": false,
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
    pushLiveFix();

    // The fix is brought into view without throwing the parcel away.
    expect(mapMock.flyTo).not.toHaveBeenCalled();
    expect(mapMock.panTo).toHaveBeenCalledWith([46.12, -60.91], {
      animate: true,
    });
  });

  it("flies to a later fix that drifts out of view, at the zoom the reader has", async () => {
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

          "place-names": false,

          "main-roads": false,
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
    pushLiveFix();
    mapMock.flyTo.mockClear();
    mapMock.panTo.mockClear();

    // The browser corrects itself to somewhere off the screen.
    mapMock.getZoom.mockReturnValue(12);
    mapMock.getBounds.mockReturnValue({
      getWest: () => -62,
      getSouth: () => 45,
      getEast: () => -60,
      getNorth: () => 47,
      contains: () => false,
    });
    pushLiveFix({ latitude: 43.85 });

    // Flown to, not panned across — and the follow keeps the reader's zoom.
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.flyTo).toHaveBeenCalledWith([43.85, -60.91], 12, {
      animate: true,
    });
  });

  it("flies to a fix outside the view rather than panning across the province", async () => {
    const user = userEvent.setup();
    // Reading a parcel in Yarmouth with the device in Cape Breton: Leaflet
    // will not fetch the tiles between, so a pan is the wrong move.
    mapMock.getZoom.mockReturnValue(18);
    mapMock.getBounds.mockReturnValue({
      getWest: () => -66.2,
      getSouth: () => 43.8,
      getEast: () => -66.1,
      getNorth: () => 43.9,
      contains: () => false,
    });
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

          "place-names": false,

          "main-roads": false,
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
    pushLiveFix();

    // And the closer zoom is still the reader's.
    expect(mapMock.flyTo).toHaveBeenCalledWith([46.12, -60.91], 18, {
      animate: true,
    });
    expect(mapMock.panTo).not.toHaveBeenCalled();
  });

  it("arrives without animating when the reader asked for less motion", async () => {
    const user = userEvent.setup();
    // Leaflet animates in JavaScript, where the stylesheet's media rule
    // cannot reach it, so the setting has to be read here.
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
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

          "place-names": false,

          "main-roads": false,
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
    pushLiveFix();

    // Still brought to the fix — it just arrives.
    expect(mapMock.flyTo).toHaveBeenCalledWith([46.12, -60.91], 14, {
      animate: false,
    });
  });

  it("marks the current location with a fresh fix and reports the outcome", async () => {
    const user = userEvent.setup();
    const onMarkLocation = vi
      .fn<(fix: LiveFix | null) => Promise<string | null>>()
      .mockResolvedValue("Point saved to Field notes (±24 m).");
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onMarkLocation={onMarkLocation}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Use my location" }));
    pushLiveFix();
    await user.click(screen.getByRole("button", { name: "Mark my location" }));

    expect(onMarkLocation).toHaveBeenCalledTimes(1);
    expect(onMarkLocation.mock.calls[0][0]).toMatchObject({
      latitude: 46.12,
      longitude: -60.91,
      accuracyM: 24,
    });
    expect(
      await screen.findByText("Point saved to Field notes (±24 m)."),
    ).toBeInTheDocument();
  });

  it("records a track and saves it through the App callback", async () => {
    const user = userEvent.setup();
    const onSaveTrack = vi
      .fn<
        (input: {
          name: string;
          collection: GeoJSON.FeatureCollection;
          rawGpx: Blob;
          startedAt: string;
          endedAt: string;
        }) => Promise<string | null>
      >()
      .mockResolvedValue('Track saved as "Boundary walk".');
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onSaveTrack={onSaveTrack}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Use my location" }));
    pushLiveFix({ accuracyM: 5 });
    await user.click(screen.getByRole("button", { name: "Record a track" }));

    // ~11 m steps at ~11 m/s with 5 m accuracy: every fix passes the filter.
    const base = Date.now();
    pushLiveFix({ accuracyM: 5, latitude: 46.12, timestampMs: base });
    pushLiveFix({ accuracyM: 5, latitude: 46.1201, timestampMs: base + 1_000 });
    pushLiveFix({ accuracyM: 5, latitude: 46.1202, timestampMs: base + 2_000 });

    // The HUD is up, the live trace draws, and the locate toggle is locked.
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.getByTestId("live-trace")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(
      screen.getByText("Stop the track recording first."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(
      screen.getByRole("dialog", { name: "Save track" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save track" }));
    expect(onSaveTrack).toHaveBeenCalledTimes(1);
    const input = onSaveTrack.mock.calls[0][0];
    expect(input.name).toMatch(/^Track /);
    expect(input.collection.features).toHaveLength(1);
    expect(input.collection.features[0].geometry.type).toBe("LineString");
    expect(input.rawGpx).toBeInstanceOf(Blob);
    expect(
      await screen.findByText('Track saved as "Boundary walk".'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Save track" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record a track" }),
    ).toBeInTheDocument();
  });

  it("pauses into segments and discards a recording with confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSaveTrack = vi.fn();
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onSaveTrack={onSaveTrack}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Use my location" }));
    await user.click(screen.getByRole("button", { name: "Record a track" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(
      screen.getByText("Paused — the gap will not be connected."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    // Nothing was recorded, so the dialog offers only Discard.
    expect(
      screen.getByText("Too little movement was recorded to save a track."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save track" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Save track" }),
    ).not.toBeInTheDocument();
    expect(onSaveTrack).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("hands the mark handler null instead of a stale or rough fix", async () => {
    const user = userEvent.setup();
    const onMarkLocation = vi
      .fn<(fix: LiveFix | null) => Promise<string | null>>()
      .mockResolvedValue(null);
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onMarkLocation={onMarkLocation}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Use my location" }));
    // 61 m accuracy is past the 50 m mark cap: the handler must re-request.
    pushLiveFix({ accuracyM: 61 });
    await user.click(screen.getByRole("button", { name: "Mark my location" }));

    expect(onMarkLocation).toHaveBeenCalledWith(null);
  });

  it("offers a retry when modern-map tiles fail", async () => {
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Simulate modern map error" }),
    );
    expect(screen.getByText("Modern map did not load.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.queryByText("Modern map did not load.")).not.toBeInTheDocument();
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

          "place-names": false,

          "main-roads": false,
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
    pushLiveFix();
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

  it("does not carry an interactive location marker into print mode", async () => {
    const user = userEvent.setup();
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

        "place-names": false,

        "main-roads": false,
      },
      resourceLayers: hiddenResourceLayers,
      showModernMap: false,
      showTaxSale: false,
      showHistoricalTaxSales: false,
      onSelectPid: vi.fn(),
      onIdentifyParcel: vi.fn(),
    };
    const { rerender } = render(<MapCanvas {...props} />);

    await user.click(screen.getByRole("button", { name: "Use my location" }));
    pushLiveFix();
    expect(await screen.findByTestId("location-position")).toBeInTheDocument();

    rerender(<MapCanvas {...props} renderMode="print" />);

    expect(screen.queryByTestId("location-position")).not.toBeInTheDocument();
  });
});

describe("MapCanvas viewport reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the centre, zoom, and bounds when the viewport changes", () => {
    const onPositionChange = vi.fn();
    const onViewportChange = vi.fn();
    mapMock.getZoom.mockReturnValue(15);

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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onPositionChange={onPositionChange}
        onViewportChange={onViewportChange}
      />,
    );

    onPositionChange.mockClear();
    onViewportChange.mockClear();
    const [, moveendHandler] = mapMock.on.mock.calls
      .filter(([event]) => event === "moveend")
      .pop() ?? [];

    expect(moveendHandler).toBeTypeOf("function");
    act(() => moveendHandler?.());

    expect(onPositionChange).toHaveBeenCalledWith({
      latitude: 46.35,
      longitude: -61.15,
      zoom: 15,
    });
    expect(onViewportChange).toHaveBeenCalledWith({
      position: { latitude: 46.35, longitude: -61.15, zoom: 15 },
      bounds: { north: 47, east: -60, south: 45, west: -62 },
    });
  });

  it("keeps location recentering out of printable viewport state", async () => {
    const user = userEvent.setup();
    const onPositionChange = vi.fn();
    const onViewportChange = vi.fn();
    mapMock.getCenter.mockReturnValue({ lat: 46.35, lng: -61.15 });
    mapMock.getZoom.mockReturnValue(15);

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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onPositionChange={onPositionChange}
        onViewportChange={onViewportChange}
      />,
    );

    onPositionChange.mockClear();
    onViewportChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    pushLiveFix();
    // This view is already closer than the locate scale, so the fix is
    // panned to rather than flown to; either way it is a location-driven
    // move, which is what this test is about.
    await waitFor(
      () => {
        expect(mapMock.panTo).toHaveBeenCalledWith([46.12, -60.91], {
          animate: true,
        });
      },
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );

    mapMock.getCenter.mockReturnValue({ lat: 46.12, lng: -60.91 });
    mapMock.getZoom.mockReturnValue(15);
    mapMock.getBounds.mockReturnValue({
      getWest: () => -60.96,
      getSouth: () => 46.07,
      getEast: () => -60.86,
      getNorth: () => 46.17,
    });
    const [, zoomendHandler] = mapMock.on.mock.calls
      .filter(([event]) => event === "zoomend")
      .pop() ?? [];
    const [, moveendHandler] = mapMock.on.mock.calls
      .filter(([event]) => event === "moveend")
      .pop() ?? [];

    act(() => {
      zoomendHandler?.({ type: "zoomend" });
      moveendHandler?.({ type: "moveend" });
      zoomendHandler?.({ type: "zoomend" });
    });

    expect(onPositionChange).toHaveBeenLastCalledWith({
      latitude: 46.12,
      longitude: -60.91,
      zoom: 15,
    });
    expect(onViewportChange).not.toHaveBeenCalled();

    mapMock.getCenter.mockReturnValue({ lat: 46.2, lng: -61 });
    mapMock.getZoom.mockReturnValue(15);
    mapMock.getBounds.mockReturnValue({
      getWest: () => -61.05,
      getSouth: () => 46.15,
      getEast: () => -60.95,
      getNorth: () => 46.25,
    });
    act(() => moveendHandler?.({ type: "moveend" }));

    expect(onViewportChange).toHaveBeenLastCalledWith({
      position: { latitude: 46.2, longitude: -61, zoom: 15 },
      bounds: {
        north: 46.25,
        east: -60.95,
        south: 46.15,
        west: -61.05,
      },
    });
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapMock.invalidateSize).toHaveBeenCalledTimes(1), {
      timeout: ASYNC_LAYER_TIMEOUT_MS,
    });
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
    mapEventHandlers.dblclick = undefined;
  });

  it("identifies map-tapped parcels only once property boundaries are visible", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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

          "place-names": false,

          "main-roads": false,
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
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).not.toHaveBeenCalled();

    mapMock.getZoom.mockReturnValue(14);
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    expect(onIdentifyParcel).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).toHaveBeenCalledWith(46.059488, -61.414138);
  });

  it("waits out the double-click window before identifying", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    mapMock.getZoom.mockReturnValue(14);
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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

          "place-names": false,

          "main-roads": false,
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
      mapEventHandlers.click?.({ latlng: { lat: 46.05, lng: -61.41 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS - 1));
    expect(onIdentifyParcel).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onIdentifyParcel).toHaveBeenCalledTimes(1);
  });

  it("never identifies a parcel from a double-click zoom", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    mapMock.getZoom.mockReturnValue(14);
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={onIdentifyParcel}
      />,
    );

    // Browser order for a double-click: click, click, dblclick.
    act(() => {
      mapEventHandlers.click?.({ latlng: { lat: 46.05, lng: -61.41 } });
      mapEventHandlers.click?.({ latlng: { lat: 46.05, lng: -61.41 } });
      mapEventHandlers.dblclick?.();
    });
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS * 2));
    expect(onIdentifyParcel).not.toHaveBeenCalled();
  });

  it("cancels a pending identify when measuring is activated within the debounce window", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    mapMock.getZoom.mockReturnValue(14);
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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

          "place-names": false,

          "main-roads": false,
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
    // Activating measure mode within the debounce window must cancel the
    // pending identify, not just suppress the callback while it's pending.
    fireEvent.click(screen.getByTestId("measure-tool"));
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).not.toHaveBeenCalled();
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

        "place-names": false,

        "main-roads": false,
      },
      resourceLayers: hiddenResourceLayers,
      showModernMap: false,
      showTaxSale: true,
      showHistoricalTaxSales: false,
      onSelectPid: vi.fn(),
      onIdentifyParcel: vi.fn(),
    };
    const { rerender } = render(<MapCanvas {...props} />);

    await waitFor(() => expect(mapMock.fitBounds).toHaveBeenCalledTimes(1), {
      timeout: ASYNC_LAYER_TIMEOUT_MS,
    });
    rerender(<MapCanvas {...props} parcels={{ ...props.parcels }} />);
    expect(mapMock.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("preserves an explicit shared position when tax-sale geometry loads", () => {
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

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [parcel] }}
        taxSalePids={new Set(["50251750"])}
        historicalTaxSalePids={new Set(["50251750"])}
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale
        showHistoricalTaxSales
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        preserveInitialPosition
      />,
    );

    expect(mapMock.fitBounds).not.toHaveBeenCalled();
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

          "place-names": false,

          "main-roads": false,
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

        "place-names": false,

        "main-roads": false,
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

  it("suspends parcel identify and selection while measuring", () => {
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    const onSelectPid = vi.fn();
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
    mapMock.getZoom.mockReturnValue(9); // overview markers render below zoom 12
    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [parcel] }}
        taxSalePids={new Set(["50251750"])}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale
        showHistoricalTaxSales={false}
        onSelectPid={onSelectPid}
        onIdentifyParcel={onIdentifyParcel}
      />,
    );

    fireEvent.click(screen.getByTestId("measure-tool"));

    mapMock.getZoom.mockReturnValue(14);
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).not.toHaveBeenCalled();

    const marker = [...circleMarkerProps.calls]
      .reverse()
      .find((call) => call.eventHandlers !== undefined);
    expect(marker).toBeDefined();
    act(() =>
      (
        marker?.eventHandlers as
          | { click?: (event: { originalEvent: Event }) => void }
          | undefined
      )?.click?.({ originalEvent: new Event("click") }),
    );
    expect(onSelectPid).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("measure-tool")); // back to off
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).toHaveBeenCalledTimes(1);

    const markerAfterToggleOff = [...circleMarkerProps.calls]
      .reverse()
      .find((call) => call.eventHandlers !== undefined);
    expect(markerAfterToggleOff).toBeDefined();
    act(() =>
      (
        markerAfterToggleOff?.eventHandlers as
          | { click?: (event: { originalEvent: Event }) => void }
          | undefined
      )?.click?.({ originalEvent: new Event("click") }),
    );
    expect(onSelectPid).toHaveBeenCalledWith("50251750");
  });
});

describe("MapCanvas overview markers", () => {
  const listedParcel = {
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
  const markerProps = {
    parcels: { type: "FeatureCollection" as const, features: [listedParcel] },
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

      "place-names": false,

      "main-roads": false,
    },
    resourceLayers: hiddenResourceLayers,
    showModernMap: false,
    showTaxSale: true,
    showHistoricalTaxSales: false,
    onIdentifyParcel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks listed parcels at overview zooms and selects on click", async () => {
    const user = userEvent.setup();
    const onSelectPid = vi.fn();
    mapMock.getZoom.mockReturnValue(9);

    render(<MapCanvas {...markerProps} onSelectPid={onSelectPid} />);

    const markers = screen.getAllByTestId("location-position");
    expect(markers).toHaveLength(1);
    expect(screen.queryByTestId("parcel-overlay")).not.toBeInTheDocument();
    const [lat, lng] = markers[0].getAttribute("data-center")!.split(",");
    expect(Number(lat)).toBeCloseTo(46.055, 3);
    expect(Number(lng)).toBeCloseTo(-61.415, 3);

    await user.click(markers[0]);
    expect(onSelectPid).toHaveBeenCalledWith("50251750");
  });

  it("hides markers at parcel-detail zooms where polygons are legible", () => {
    mapMock.getZoom.mockReturnValue(13);

    render(<MapCanvas {...markerProps} onSelectPid={vi.fn()} />);

    expect(screen.queryAllByTestId("location-position")).toHaveLength(0);
    expect(screen.getByTestId("parcel-overlay")).toBeInTheDocument();
  });

  it("hides markers when the event layer is toggled off", () => {
    mapMock.getZoom.mockReturnValue(9);

    render(
      <MapCanvas
        {...markerProps}
        showTaxSale={false}
        onSelectPid={vi.fn()}
      />,
    );

    expect(screen.queryAllByTestId("location-position")).toHaveLength(0);
  });
});

describe("MapCanvas cartographic furniture", () => {
  const furnitureProps = {
    parcels: { type: "FeatureCollection" as const, features: [] },
    taxSalePids: new Set<string>(),
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

      "place-names": false,

      "main-roads": false,
    },
    resourceLayers: hiddenResourceLayers,
    showModernMap: false,
    showTaxSale: true,
    showHistoricalTaxSales: false,
    onSelectPid: vi.fn(),
    onIdentifyParcel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mapMock.getZoom.mockReturnValue(9);
    mapMock.getCenter.mockReturnValue({ lat: 46.21351, lng: -61.09131 });
  });

  it("shows a bottom-left scale bar", () => {
    render(<MapCanvas {...furnitureProps} />);

    expect(screen.getByTestId("scale-control")).toHaveAttribute(
      "data-position",
      "bottomleft",
    );
  });

  it("shows an approximate representative fraction and updates it with the map", () => {
    render(<MapCanvas {...furnitureProps} />);

    const readout = screen.getByText("Approx. screen scale 1:12,500");
    expect(readout).toHaveAttribute(
      "title",
      expect.stringContaining("96 CSS pixels per inch"),
    );

    mapMock.distance.mockReturnValue(661.4583333);
    act(() => {
      for (const [, handler] of mapMock.on.mock.calls.filter(
        ([event]) => event === "zoomend",
      )) {
        handler();
      }
    });

    expect(readout).toHaveTextContent("Approx. screen scale 1:25,000");
  });

  it("renders the optional old-growth policy layer in its contextual pane", () => {
    render(
      <MapCanvas
        {...furnitureProps}
        forestryLayers={{ "old-growth-policy": true }}
      />,
    );

    expect(screen.getByTestId("old-growth-policy-layer")).toHaveTextContent(
      "old-growth-policy",
    );
    expect(oldGrowthLayerProps.current).toMatchObject({
      visible: true,
      renderMode: "interactive",
    });
    expect(
      screen.getByTestId("pane-old-growth-policy-pane"),
    ).toHaveStyle({ zIndex: "190" });
    expect(
      screen.getByTestId("pane-old-growth-policy-pane"),
    ).toHaveAttribute("data-parent-pane", "tilePane");
  });

  it("shows a copyable centre/zoom readout", async () => {
    const user = userEvent.setup();
    render(<MapCanvas {...furnitureProps} />);

    const readout = screen.getByRole("button", {
      name: "Copy map centre coordinates",
    });
    expect(readout).toHaveTextContent("Z 9 · 46.21351, -61.09131");

    await user.click(readout);
    expect(readout).toHaveTextContent("Copied");
    expect(await window.navigator.clipboard.readText()).toBe(
      "46.21351, -61.09131",
    );
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

          "place-names": false,

          "main-roads": false,
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

  it("recovers interactive roads readiness after a later successful load", () => {
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
          roads: true,
          buildings: false,
          contours: false,

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
      />,
    );

    const roadLayers = mapMock.addLayer.mock.calls.map(
      ([layer]) =>
        layer as {
          fire: (event: string) => void;
        },
    );
    expect(roadLayers).toHaveLength(2);

    act(() => roadLayers[0].fire("tileerror"));
    expect(onLayerStatusChange).toHaveBeenLastCalledWith("roads", {
      status: "error",
    });

    act(() => {
      roadLayers[0].fire("load");
      roadLayers[1].fire("load");
    });
    expect(onLayerStatusChange).toHaveBeenLastCalledWith("roads", {
      status: "ready",
      count: 0,
    });
  });

  it("does not force the overview map inward when default property boundaries are checked", () => {
    mapMock.getZoom.mockReturnValue(9);

    render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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

          "place-names": false,

          "main-roads": false,
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

          "place-names": false,

          "main-roads": false,
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

  it("recovers an interactive ArcGIS resource after a later successful load", () => {
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={{
          ...hiddenResourceLayers,
          "mineral-tenure": true,
        }}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
      />,
    );

    const [tenureLayer] = mapMock.addLayer.mock.calls.map(
      ([layer]) =>
        layer as {
          fire: (event: string) => void;
        },
    );
    expect(tenureLayer).toBeDefined();

    act(() => {
      tenureLayer.fire("tileerror");
      tenureLayer.fire("load");
    });
    expect(onLayerStatusChange).toHaveBeenLastCalledWith("mineral-tenure", {
      status: "ready",
      count: 0,
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

          "place-names": false,

          "main-roads": false,
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

    await waitFor(
      () => expect(fetchArcGISFeatureOverlay).toHaveBeenCalledTimes(1),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
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

          "place-names": false,

          "main-roads": false,
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

          "place-names": false,

          "main-roads": false,
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

    await waitFor(
      () =>
        expect(onResourceLayerStatusChange).toHaveBeenCalledWith(
          "mineral-occurrences",
          { status: "error" },
        ),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
  });

  it("renders derived mineral proximity parcels through the existing PID callback", async () => {
    mapMock.getZoom.mockReturnValue(13);
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

        "place-names": false,

        "main-roads": false,
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

        "place-names": false,

        "main-roads": false,
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

          "place-names": false,

          "main-roads": false,
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
    await waitFor(
      () =>
        expect(onLayerStatusChange).toHaveBeenCalledWith(
          "inverness-hydro-potential",
          { status: "ready", count: 13 },
        ),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
  });
});

describe("MapCanvas well logs", () => {
  const hiddenProvinceLayers = {
    "ns-aerial": false,
    nsprd: false,
    "crown-lands": false,
    "flood-risk": false,
    waterfalls: false,
    "water-features": false,
    roads: false,
    buildings: false,
    contours: false,

    "place-names": false,

    "main-roads": false,
  } as const;

  function renderWellLogs({
    visible,
    filter,
    onLayerStatusChange,
  }: {
    visible: boolean;
    filter?: "surveyed" | "all";
    onLayerStatusChange: (id: MapLayerId, status: MapLayerStatus) => void;
  }) {
    return render(
      <MapCanvas
        parcels={{ type: "FeatureCollection", features: [] }}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid={null}
        provinceLayers={{ ...hiddenProvinceLayers }}
        resourceLayers={hiddenResourceLayers}
        wellLogLayers={{ "ns-well-logs": visible }}
        wellLogAccuracyFilter={filter}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
      />,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mapMock.getZoom.mockReturnValue(13);
    vi.mocked(fetchArcGISFeatureOverlay).mockResolvedValue({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 22,
          geometry: { type: "Point", coordinates: [-63.68, 45.3] },
          properties: { OBJECTID: 22, WELLNUM: "000025", GEOREF_A: 39.4 },
        },
      ],
    });
  });

  it("does not query the well service while the layer is off", () => {
    const onLayerStatusChange = vi.fn();
    renderWellLogs({ visible: false, onLayerStatusChange });

    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
    expect(onLayerStatusChange).toHaveBeenCalledWith("ns-well-logs", {
      status: "idle",
    });
  });

  it("waits for the parcel-detail zoom before querying wells", () => {
    const onLayerStatusChange = vi.fn();
    mapMock.getZoom.mockReturnValue(9);

    renderWellLogs({ visible: true, onLayerStatusChange });

    expect(fetchArcGISFeatureOverlay).not.toHaveBeenCalled();
    expect(onLayerStatusChange).toHaveBeenCalledWith("ns-well-logs", {
      status: "zoom",
      minZoom: 12,
    });
  });

  it("requests surveyed wells by default and never asks for the address column", async () => {
    const onLayerStatusChange = vi.fn();
    renderWellLogs({ visible: true, onLayerStatusChange });

    await waitFor(
      () =>
        expect(onLayerStatusChange).toHaveBeenCalledWith("ns-well-logs", {
          status: "ready",
          count: 1,
        }),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );

    const request = vi.mocked(fetchArcGISFeatureOverlay).mock.calls[0][0];
    expect(request.serviceUrl).toContain("h430ns");
    expect(request.where).toBe("GEOREF_A > 0 AND GEOREF_A <= 50");
    expect(request.orderByFields).toBe("OBJECTID");
    expect(request.outFields).not.toContain("ADDRESS");
  });

  it("widens the query only when approximate locations are requested", async () => {
    const onLayerStatusChange = vi.fn();
    renderWellLogs({ visible: true, filter: "all", onLayerStatusChange });

    await waitFor(
      () => expect(fetchArcGISFeatureOverlay).toHaveBeenCalledTimes(1),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
    expect(vi.mocked(fetchArcGISFeatureOverlay).mock.calls[0][0].where).toBe(
      "1=1",
    );
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

  it("uses deterministic monochrome parcel styles for print maps", () => {
    const context = {
      selectedPid: "15234636",
      taxSalePids: new Set<string>(),
      showTaxSale: false,
      historicalTaxSalePids: new Set(["15161631"]),
      showHistoricalTaxSales: true,
    };

    expect(parcelStyleForFeature(selectedFeature, context, "print")).toMatchObject({
      color: "#000000",
      fillColor: "#d8d8d8",
      fillOpacity: 0.45,
      weight: 4,
      className: "print-selected-parcel",
    });
    expect(
      parcelStyleForFeature(
        { ...selectedFeature, properties: { PID: "15161631" } },
        context,
        "print",
      ),
    ).toMatchObject({ color: "#333333", dashArray: "7 4" });
  });
});

describe("MapCanvas print mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapEventHandlers.click = undefined;
    mapEventHandlers.dblclick = undefined;
  });

  it("disables interaction, location, and identify while fitting printable bounds", () => {
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        renderMode="print"
        fitBounds={{ north: 46.4, east: -61.1, south: 46.3, west: -61.2 }}
      />,
    );

    expect(mapContainerProps.current).toMatchObject({
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy map centre coordinates" })).toBeNull();
    expect(screen.queryByTestId("scale-control")).toBeNull();
    expect(screen.queryByText(/Approx\. screen scale/u)).toBeNull();
    expect(screen.queryByTestId("measure-tool")).toBeNull();
    expect(mapEventHandlers.click).toBeUndefined();
    expect(screen.getByTestId("tile-layer")).toHaveAttribute(
      "data-class-name",
      "print-layer-modern",
    );
    expect(
      mapMock.addLayer.mock.calls.some(
        ([layer]) => layer.options.className === "print-layer-ns-aerial",
      ),
    ).toBe(true);
    expect(mapMock.fitBounds).toHaveBeenCalledWith(
      [[46.3, -61.2], [46.4, -61.1]],
      { padding: [24, 24], maxZoom: 18, animate: false },
    );
  });

  it("renders feature and hydro overlays as monochrome display-only print layers", async () => {
    mapMock.getZoom.mockReturnValue(12);
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={{
          ...hiddenResourceLayers,
          "mineral-occurrences": true,
          "mineral-proximity-parcels": true,
        }}
        hydroPilotLayers={{ "inverness-hydro-potential": true }}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        renderMode="print"
      />,
    );

    await waitFor(
      () =>
        expect(geoJsonProps.calls.some((props) => props.pointToLayer)).toBe(true),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
    const featureLayer = geoJsonProps.calls.find((props) => props.pointToLayer);
    const marker = (featureLayer?.pointToLayer as (
      feature: unknown,
      latlng: [number, number],
    ) => { options: Record<string, unknown> })({}, [46.1, -61.2]);
    expect(featureLayer).toMatchObject({ interactive: false, onEachFeature: undefined });
    expect(marker.options).toMatchObject({
      color: "#111111",
      fillColor: "#e8e8e8",
    });
    await waitFor(
      () =>
        expect(geoJsonProps.calls.some((props) =>
          Boolean((props.data as { metadata?: unknown })?.metadata),
        )).toBe(true),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
    const hydroLayer = geoJsonProps.calls.find(
      (props) => Boolean((props.data as { metadata?: unknown })?.metadata),
    );
    expect(hydroLayer).toMatchObject({ interactive: false, onEachFeature: undefined });
    const printHydroStyle = hydroLayer?.style as (
      feature: unknown,
    ) => Record<string, unknown>;
    const lowHydroStyle = printHydroStyle({
      properties: {
        upstreamAreaKm2: 10,
        potentialClass: "below-1kw",
        networkRole: "tributary",
      },
    });
    const highHydroStyle = printHydroStyle({
      properties: {
        upstreamAreaKm2: 10,
        potentialClass: "kw-30-50",
        networkRole: "trunk",
      },
    });
    expect(lowHydroStyle).toMatchObject({ color: "#222222", opacity: 0.9 });
    expect(highHydroStyle).toMatchObject({ color: "#222222", opacity: 0.9 });
    expect(lowHydroStyle).not.toEqual(highHydroStyle);
    expect(lowHydroStyle.dashArray).not.toBe(highHydroStyle.dashArray);
    expect(mineralLayerProps.current).toMatchObject({
      visible: true,
      renderMode: "print",
    });
  });

  it("keeps print overview markers non-interactive and distinct without colour", () => {
    mapMock.getZoom.mockReturnValue(9);
    const parcels = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: { PID: "10000001" },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[[-61.2, 46.3], [-61.1, 46.3], [-61.1, 46.4], [-61.2, 46.3]]],
          },
        },
        {
          type: "Feature" as const,
          properties: { PID: "20000002" },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[[-61, 46.2], [-60.9, 46.2], [-60.9, 46.3], [-61, 46.2]]],
          },
        },
      ],
    };

    render(
      <MapCanvas
        parcels={parcels}
        taxSalePids={new Set(["10000001"])}
        historicalTaxSalePids={new Set(["20000002"])}
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale
        showHistoricalTaxSales
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        renderMode="print"
      />,
    );

    const overviewMarkers = [
      "print-current-tax-sale-marker",
      "print-historical-tax-sale-marker",
    ].map((className) =>
      [...circleMarkerProps.calls].reverse().find(
        ({ pathOptions }) =>
          (pathOptions as { className?: string })?.className === className,
      ),
    );
    expect(overviewMarkers).toHaveLength(2);
    for (const marker of overviewMarkers) {
      expect(marker?.interactive).toBe(false);
      expect(marker?.eventHandlers).toBeUndefined();
    }
    const markerStyles = overviewMarkers.map((marker) => marker?.pathOptions);
    expect(markerStyles[0]).not.toEqual(markerStyles[1]);
    expect(markerStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ className: "print-current-tax-sale-marker" }),
      expect.objectContaining({ className: "print-historical-tax-sale-marker" }),
    ]));
  });

  it("keeps modern tile errors sticky within a print attempt", () => {
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

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
        renderMode="print"
      />,
    );

    const eventHandlers = tileLayerProps.calls.at(-1)?.eventHandlers as
      | Record<string, () => void>
      | undefined;
    act(() => {
      eventHandlers?.tileerror();
      eventHandlers?.load();
    });

    expect(onLayerStatusChange).toHaveBeenLastCalledWith("modern", {
      status: "error",
    });
  });

  it("requires every physical roads tile sublayer and keeps any error sticky", () => {
    mapMock.getZoom.mockReturnValue(15);
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
          roads: true,
          buildings: false,
          contours: false,

          "place-names": false,

          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap={false}
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
        renderMode="print"
      />,
    );

    const roadLayers = mapMock.addLayer.mock.calls
      .map(([layer]) => layer as {
        options: { className?: string };
        fire: (event: string) => void;
      })
      .filter(({ options }) => options.className === "print-layer-roads");
    expect(roadLayers).toHaveLength(2);

    act(() => roadLayers[0].fire("load"));
    expect(onLayerStatusChange).not.toHaveBeenCalledWith(
      "roads",
      expect.objectContaining({ status: "ready" }),
    );

    act(() => {
      roadLayers[1].fire("tileerror");
      roadLayers[1].fire("load");
    });
    expect(onLayerStatusChange).toHaveBeenLastCalledWith("roads", {
      status: "error",
    });
  });
});

describe("georeference binding", () => {
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

      "place-names": false,

      "main-roads": false,
    },
    resourceLayers: hiddenResourceLayers,
    showModernMap: false,
    showTaxSale: false,
    showHistoricalTaxSales: false,
    onSelectPid: vi.fn(),
    onIdentifyParcel: vi.fn(),
  };

  const BINDING = {
    gcps: [{ id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } }],
    pending: null,
    draft: {
      record: { id: "scan-1" },
      previewUrl: "blob:scan",
      opacity: 0.7,
      mesh: null,
    },
    focus: null,
    onPickMapPoint: vi.fn(),
    onDragStartGcp: vi.fn(),
    onMoveGcpOnMap: vi.fn(),
  } as unknown as GeoreferenceBinding;

  it("mounts nothing georeferencing-related when no session is open", () => {
    render(<MapCanvas {...props} />);
    expect(screen.queryByTestId("georeference-map-layer")).toBeNull();
    expect(screen.getByTestId("user-map-layers")).toHaveAttribute(
      "data-draft",
      "none",
    );
    expect(document.querySelector(".map-canvas--georeferencing")).toBeNull();
  });

  it("mounts the marker layer and hands the draft to the raster layer", () => {
    render(<MapCanvas {...props} georeference={BINDING} />);
    expect(screen.getByTestId("georeference-map-layer")).toHaveAttribute(
      "data-gcps",
      "1",
    );
    // The live drape. Without this the map under edit simply never draws —
    // and the App-level test that reads "georeferencing: scan-1" out of a
    // mocked MapCanvas would not notice.
    expect(screen.getByTestId("user-map-layers")).toHaveAttribute(
      "data-draft",
      "scan-1",
    );
    // Spec: a crosshair cursor on the map pane while georeferencing.
    expect(
      document.querySelector(".map-canvas--georeferencing"),
    ).not.toBeNull();
  });

  it("takes the measure tool away while a georeferencing session is open", () => {
    // The guard ParcelIdentifyController got and MeasureTool did not — even
    // though the identify guard's own comment cites the measure tool as its
    // precedent. MeasureCapture subscribes to map `click` and to window
    // `keydown` (MeasureTool.tsx), so with measuring live every click during a
    // session appends a measurement vertex AS WELL AS placing a control-point
    // half, and one Escape both clears the measurement and closes the panel.
    // `.measure-control` is at `left: 12px`, behind the 45vw panel, so the
    // user cannot switch it off without closing the georeferencer first.
    //
    // The tool has to be ACTIVE before the session opens: asserting against an
    // "off" MeasureTool proves nothing, since an off one mounts no capture
    // either way (MeasureTool.test.tsx, "captures nothing while off").
    const { rerender } = render(<MapCanvas {...props} />);
    fireEvent.click(screen.getByTestId("measure-tool"));
    expect(screen.getByTestId("measure-tool")).toHaveAttribute(
      "data-mode",
      "distance",
    );

    rerender(<MapCanvas {...props} georeference={BINDING} />);
    expect(screen.queryByTestId("measure-tool")).toBeNull();

    // Closing the session brings it back, still on the mode the user chose —
    // suppression lasts for the session, it is not a silent reset.
    rerender(<MapCanvas {...props} />);
    expect(screen.getByTestId("measure-tool")).toHaveAttribute(
      "data-mode",
      "distance",
    );
  });

  it("suspends parcel identify while a georeferencing session is open", () => {
    // The two tests above leave `provinceLayers.nsprd: false`, which ALSO
    // disables ParcelIdentifyController on its own — so neither can tell
    // "suppressed because georeferencing" apart from "suppressed because
    // nsprd is off". Only a fixture with nsprd TRUE exercises the guard:
    // deleting `&& !georeference` from `ParcelIdentifyController`'s
    // `enabled` at MapCanvas.tsx still passes every one of the 46
    // pre-existing MapCanvas tests, because every one of them leaves nsprd
    // false too.
    vi.useFakeTimers();
    const onIdentifyParcel = vi.fn();
    mapMock.getZoom.mockReturnValue(14); // >= PROPERTY_BOUNDARY_MIN_ZOOM
    const { rerender } = render(
      <MapCanvas
        {...props}
        provinceLayers={{ ...props.provinceLayers, nsprd: true }}
        onIdentifyParcel={onIdentifyParcel}
        georeference={BINDING}
      />,
    );

    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    // A click during georeferencing places a control point; letting it also
    // open the parcel inspector would fight the user for the same gesture,
    // and the popup renders at z-700, over the control points.
    expect(onIdentifyParcel).not.toHaveBeenCalled();

    // Closing the session restores ordinary identify-on-click behaviour.
    rerender(
      <MapCanvas
        {...props}
        provinceLayers={{ ...props.provinceLayers, nsprd: true }}
        onIdentifyParcel={onIdentifyParcel}
      />,
    );
    act(() =>
      mapEventHandlers.click?.({ latlng: { lat: 46.059488, lng: -61.414138 } }),
    );
    act(() => vi.advanceTimersByTime(IDENTIFY_CLICK_DELAY_MS));
    expect(onIdentifyParcel).toHaveBeenCalledWith(46.059488, -61.414138);
  });
});

describe("feature click propagation", () => {
  const parcelCollection = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [[-61.4, 46.05], [-61.3, 46.05], [-61.3, 46.1], [-61.4, 46.05]],
          ],
        },
        properties: { PID: "50292390" },
      },
    ],
  };

  function parcelOverlayHandlers() {
    const overlay = geoJsonProps.calls.find(
      (props) =>
        typeof props.onEachFeature === "function" &&
        (props.data as { features?: Array<{ properties?: { PID?: string } }> })
          ?.features?.some(({ properties }) => properties?.PID === "50292390"),
    );
    expect(overlay).toBeDefined();
    const handlers: Record<string, (event: unknown) => void> = {};
    const bindTooltip = vi.fn();
    (overlay!.onEachFeature as (feature: unknown, layer: unknown) => void)(
      parcelCollection.features[0],
      {
        on: (name: string, handler: (event: unknown) => void) => {
          handlers[name] = handler;
        },
        bindTooltip,
      },
    );
    return { handlers, bindTooltip };
  }

  beforeEach(() => {
    // The parcel geometry overlay renders only above OVERVIEW_MARKER_MAX_ZOOM.
    mapMock.getZoom.mockReturnValue(15);
  });

  it("stops the map's own click dispatch, not merely DOM bubbling", async () => {
    // Leaflet's Map._fireDOMEvent decides whether to keep delivering a click
    // to the map itself by reading `originalEvent._stopped`, and
    // DomEvent.stopPropagation only sets that flag when handed the LEAFLET
    // event. Handed the raw DOM event it calls native stopPropagation() — a
    // no-op for that loop — so every parcel click also fired
    // ParcelIdentifyController's unrequested second identify.
    const onSelectPid = vi.fn();
    render(
      <MapCanvas
        parcels={parcelCollection}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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
          "place-names": false,
          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={onSelectPid}
        onIdentifyParcel={vi.fn()}
      />,
    );

    const { handlers } = parcelOverlayHandlers();
    const originalEvent = new MouseEvent("click", { bubbles: true });
    handlers.click({ originalEvent, latlng: { lat: 46.06, lng: -61.35 } });

    expect(
      (originalEvent as MouseEvent & { _stopped?: boolean })._stopped,
    ).toBe(true);
    expect(onSelectPid).toHaveBeenCalledWith("50292390");
  });

  it("binds the parcel tooltip as an inert node rather than a string", () => {
    render(
      <MapCanvas
        parcels={parcelCollection}
        taxSalePids={new Set()}
        historicalTaxSalePids={new Set()}
        selectedPid="50292390"
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
          "place-names": false,
          "main-roads": false,
        }}
        resourceLayers={hiddenResourceLayers}
        showModernMap
        showTaxSale={false}
        showHistoricalTaxSales={false}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
      />,
    );

    const { bindTooltip } = parcelOverlayHandlers();
    const node = bindTooltip.mock.calls[0][0] as HTMLElement;
    expect(node).toBeInstanceOf(HTMLElement);
    expect(node.textContent).toBe("PID 50292390");
  });
});

describe("MapCanvas live conditions overlays", () => {
  const hiddenProvinceLayers = {
    "ns-aerial": false,
    nsprd: false,
    "crown-lands": false,
    "flood-risk": false,
    waterfalls: false,
    "water-features": false,
    roads: false,
    buildings: false,
    contours: false,
    "place-names": false,
    "main-roads": false,
  };
  const radarCapabilitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities xmlns="http://www.opengis.net/wms">
  <Capability><Layer>
    <Name>RADAR_1KM_RRAI</Name>
    <Dimension name="time" units="ISO8601" default="2026-08-29T15:54:00Z">2026-08-29T12:54:00Z/2026-08-29T15:54:00Z/PT6M</Dimension>
  </Layer></Capability>
</WMS_Capabilities>`;

  const baseProps = {
    parcels: { type: "FeatureCollection" as const, features: [] },
    taxSalePids: new Set<string>(),
    historicalTaxSalePids: new Set<string>(),
    selectedPid: null,
    provinceLayers: hiddenProvinceLayers,
    resourceLayers: hiddenResourceLayers,
    showModernMap: false,
    showTaxSale: false,
    showHistoricalTaxSales: false,
  };

  type WmsLikeLayer = { wmsParams?: { layers?: string; time?: string } };
  const addedWmsRadarLayer = (): WmsLikeLayer | undefined =>
    mapMock.addLayer.mock.calls
      .map(([layer]) => layer as WmsLikeLayer)
      .find((layer) => layer?.wmsParams?.layers === "RADAR_1KM_RRAI");
  const cameraGeoJsonCall = () =>
    geoJsonProps.calls.find(
      (call) =>
        (call.data as { features?: unknown[] } | undefined)?.features
          ?.length === 57,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the bundled camera count when the camera layer is on", () => {
    const onLayerStatusChange = vi.fn();
    render(
      <MapCanvas
        {...baseProps}
        liveConditionsLayers={{ "highway-cameras": true, "weather-radar": false }}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
      />,
    );

    expect(onLayerStatusChange).toHaveBeenCalledWith("highway-cameras", {
      status: "ready",
      count: 57,
    });
    expect(cameraGeoJsonCall()).toBeDefined();
    expect(addedWmsRadarLayer()).toBeUndefined();
  });

  it("adds the GeoMet WMS layer and pins the frame time from capabilities", async () => {
    const onLayerStatusChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(radarCapabilitiesXml),
      }),
    );
    render(
      <MapCanvas
        {...baseProps}
        liveConditionsLayers={{ "highway-cameras": false, "weather-radar": true }}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        onLayerStatusChange={onLayerStatusChange}
      />,
    );

    expect(onLayerStatusChange).toHaveBeenCalledWith("weather-radar", {
      status: "loading",
    });
    const radarLayer = addedWmsRadarLayer();
    expect(radarLayer).toBeDefined();
    await waitFor(
      () =>
        expect(radarLayer?.wmsParams?.time).toBe("2026-08-29T15:54:00Z"),
      { timeout: ASYNC_LAYER_TIMEOUT_MS },
    );
  });

  it("renders neither live overlay in print mode", () => {
    render(
      <MapCanvas
        {...baseProps}
        liveConditionsLayers={{ "highway-cameras": true, "weather-radar": true }}
        onSelectPid={vi.fn()}
        onIdentifyParcel={vi.fn()}
        renderMode="print"
      />,
    );

    expect(addedWmsRadarLayer()).toBeUndefined();
    expect(cameraGeoJsonCall()).toBeUndefined();
  });
});
