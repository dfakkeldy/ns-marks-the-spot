import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gcp } from "../types";

type MarkerCall = {
  position: [number, number];
  draggable?: boolean;
  interactive?: boolean;
  pane?: string;
  icon: { options: { className?: string; html?: string } };
  eventHandlers?: {
    dragstart?: () => void;
    drag?: (event: {
      target: { getLatLng: () => { lat: number; lng: number } };
    }) => void;
  };
};

const markerCalls = vi.hoisted(() => [] as MarkerCall[]);
const scanHandlers = vi.hoisted(() => ({
  click: null as ((event: { latlng: { lat: number; lng: number } }) => void) | null,
}));
const stubMap = vi.hoisted(() => ({ setView: vi.fn(), getZoom: vi.fn(() => 0) }));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: PropsWithChildren) => (
    <div data-testid="scan-map">{children}</div>
  ),
  ImageOverlay: ({ url }: { url: string }) => (
    <div data-testid="scan-image" data-url={url} />
  ),
  Marker: (props: MarkerCall) => {
    markerCalls.push(props);
    return (
      <div
        data-testid="scan-marker"
        data-position={props.position.join(",")}
        data-draggable={String(props.draggable ?? false)}
        data-interactive={String(props.interactive ?? true)}
        data-icon-class={props.icon.options.className ?? ""}
        data-handlers={Object.keys(props.eventHandlers ?? {}).sort().join(",")}
      />
    );
  },
  useMap: () => stubMap,
  useMapEvent: (
    type: string,
    handler: (event: { latlng: { lat: number; lng: number } }) => void,
  ) => {
    if (type === "click") {
      scanHandlers.click = handler;
    }
    return stubMap;
  },
}));

import { ScanPane } from "./ScanPane";

const PIXEL_SIZE = { width: 1200, height: 800 };
const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 637, y: 415 }, map: { lat: 46.1, lng: -61.2 } },
];

function renderPane(props: Partial<Parameters<typeof ScanPane>[0]> = {}) {
  const onPickPoint = vi.fn();
  const onDragStartGcp = vi.fn();
  const onMoveGcp = vi.fn();
  const utils = render(
    <ScanPane
      previewUrl="blob:scan"
      pixelSize={PIXEL_SIZE}
      gcps={GCPS}
      pending={null}
      focus={null}
      onPickPoint={onPickPoint}
      onDragStartGcp={onDragStartGcp}
      onMoveGcp={onMoveGcp}
      selectedGcpId={null}
      {...props}
    />,
  );
  return { ...utils, onPickPoint, onDragStartGcp, onMoveGcp };
}

describe("ScanPane", () => {
  beforeEach(() => {
    markerCalls.length = 0;
    scanHandlers.click = null;
  });

  it("renders under the root class the stylesheet targets", () => {
    // styles.css builds the panel's grid around `.georeference-scan` and the
    // narrow breakpoint keys off it. Renaming it would kill those rules
    // silently — the style tests regex the CSS and cannot see the DOM, and
    // Task 10's panel test asserts a class its own ScanPane mock invents.
    const { container } = renderPane();
    expect(container.querySelector(".georeference-scan")).not.toBeNull();
  });

  it("turns a click into ORIGINAL image pixels", () => {
    // CRS.Simple: pixel (x, y) is latLng(-y, x).
    const { onPickPoint } = renderPane();
    scanHandlers.click?.({ latlng: { lat: -415, lng: 637 } });
    expect(onPickPoint).toHaveBeenCalledWith(637, 415);
  });

  it("clamps a click made off the raster", () => {
    // maxBounds constrains the view, not the coordinate; letterboxed map is
    // clickable at minZoom={-4}. An unclamped -40 persists to IndexedDB.
    const { onPickPoint } = renderPane();
    scanHandlers.click?.({ latlng: { lat: 12, lng: -40 } });
    expect(onPickPoint).toHaveBeenCalledWith(0, 0);
    scanHandlers.click?.({ latlng: { lat: -950, lng: 1400 } });
    expect(onPickPoint).toHaveBeenLastCalledWith(1200, 800);
  });

  it("makes every placed point draggable and numbered", () => {
    renderPane();
    expect(markerCalls).toHaveLength(1);
    expect(markerCalls[0].draggable).toBe(true);
    expect(markerCalls[0].position).toEqual([-415, 637]);
    expect(markerCalls[0].icon.options.className).toBe("gcp-marker");
    expect(markerCalls[0].icon.options.html).toContain("1");
  });

  it("snapshots undo on dragstart, not only on drag", () => {
    // useGeoreferenceSession's beginDragGcp is the ONLY scan-side entry into
    // undo history. Wire `drag` and forget `dragstart` and every test still
    // passes, while one Ctrl+Z leaps back past the whole drag.
    const { onDragStartGcp, onMoveGcp } = renderPane();
    expect(Object.keys(markerCalls[0].eventHandlers ?? {}).sort()).toEqual([
      "drag",
      "dragstart",
    ]);
    markerCalls[0].eventHandlers?.dragstart?.();
    expect(onDragStartGcp).toHaveBeenCalledWith("a");
    markerCalls[0].eventHandlers?.drag?.({
      target: { getLatLng: () => ({ lat: -300, lng: 500 }) },
    });
    expect(onMoveGcp).toHaveBeenCalledWith("a", 500, 300);
  });

  it("clamps a drag that leaves the raster", () => {
    const { onMoveGcp } = renderPane();
    markerCalls[0].eventHandlers?.drag?.({
      target: { getLatLng: () => ({ lat: 30, lng: 1500 }) },
    });
    expect(onMoveGcp).toHaveBeenCalledWith("a", 1200, 0);
  });

  it("keeps a marker's icon and handlers stable across re-renders", () => {
    // react-leaflet calls marker.setIcon() when `icon` changes identity and
    // re-runs off()/on() when `eventHandlers` does — its deps are
    // `[element, eventHandlers]`. Fresh literals do both on every render,
    // i.e. once per pointer move of a drag.
    const { rerender, onPickPoint, onDragStartGcp, onMoveGcp } = renderPane();
    rerender(
      <ScanPane
        previewUrl="blob:scan"
        pixelSize={PIXEL_SIZE}
        gcps={GCPS}
        pending={null}
        focus={null}
        onPickPoint={onPickPoint}
        onDragStartGcp={onDragStartGcp}
        onMoveGcp={onMoveGcp}
        selectedGcpId={null}
      />,
    );
    expect(markerCalls).toHaveLength(2);
    expect(markerCalls[1].icon).toBe(markerCalls[0].icon);
    expect(markerCalls[1].eventHandlers).toBe(markerCalls[0].eventHandlers);
  });

  it("draws the pending half-point hollow and out of the way", () => {
    renderPane({
      gcps: [],
      pending: { side: "scan", pixel: { x: 10, y: 20 } },
    });
    expect(markerCalls).toHaveLength(1);
    expect(markerCalls[0].icon.options.className).toContain(
      "gcp-marker--pending",
    );
    // Non-interactive: a pending marker under the cursor must not swallow the
    // click that is trying to move it.
    expect(markerCalls[0].interactive).toBe(false);
  });
});
