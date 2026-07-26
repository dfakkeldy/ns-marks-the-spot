import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import L from "leaflet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gcp } from "../types";

type MarkerCall = {
  position: [number, number];
  draggable?: boolean;
  interactive?: boolean;
  icon: { options: { className?: string; html?: string } };
  eventHandlers?: {
    dragstart?: () => void;
    drag?: (event: {
      target: { getLatLng: () => { lat: number; lng: number } };
    }) => void;
  };
};

type MapContainerCall = {
  crs?: unknown;
  bounds?: unknown;
  maxBounds?: unknown;
  minZoom?: number;
  maxZoom?: number;
  zoomSnap?: number;
  className?: string;
  attributionControl?: boolean;
};

const markerCalls = vi.hoisted(() => [] as MarkerCall[]);
const mapContainerCalls = vi.hoisted(() => [] as MapContainerCall[]);
const imageOverlayCalls = vi.hoisted(
  () => [] as { url: string; bounds: unknown }[],
);
const scanHandlers = vi.hoisted(() => ({
  click: null as ((event: { latlng: { lat: number; lng: number } }) => void) | null,
}));
// Every handler passed to useMapEvent("click", ...), in call order — lets the
// re-render test below tell "same memoised handler" apart from "fresh
// function every render" the same way it already does for marker icon,
// eventHandlers, and position.
const clickHandlerCalls = vi.hoisted(
  () => [] as Array<(event: { latlng: { lat: number; lng: number } }) => void>,
);
const stubMap = vi.hoisted(() => ({ setView: vi.fn(), getZoom: vi.fn(() => 0) }));

vi.mock("react-leaflet", () => ({
  // Records every prop but `children`: an earlier mock took only `children`,
  // so deleting crs={L.CRS.Simple}, maxBounds, minZoom, maxZoom, or zoomSnap
  // from ScanPane left the whole suite green — the CRS itself went untested.
  MapContainer: ({
    children,
    ...props
  }: PropsWithChildren<MapContainerCall>) => {
    mapContainerCalls.push(props);
    return <div data-testid="scan-map">{children}</div>;
  },
  ImageOverlay: ({ url, bounds }: { url: string; bounds: unknown }) => {
    imageOverlayCalls.push({ url, bounds });
    return <div data-testid="scan-image" data-url={url} />;
  },
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
      clickHandlerCalls.push(handler);
    }
    return stubMap;
  },
}));

import { ScanPane } from "./ScanPane";

const PIXEL_SIZE = { width: 1200, height: 800 };
// Three points, not one: several defects below only diverge from correct
// behaviour once there is more than one GCP to mis-order or mis-match (see
// "makes every placed point draggable and numbered" and "marks the selected
// GCP's icon" below).
const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 637, y: 415 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 200, y: 100 }, map: { lat: 46.2, lng: -61.3 } },
  { id: "c", pixel: { x: 900, y: 700 }, map: { lat: 46.3, lng: -61.4 } },
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
    mapContainerCalls.length = 0;
    imageOverlayCalls.length = 0;
    clickHandlerCalls.length = 0;
    scanHandlers.click = null;
    stubMap.setView.mockClear();
    stubMap.getZoom.mockReset().mockReturnValue(0);
  });

  it("renders under the root class the stylesheet targets", () => {
    // styles.css builds the panel's grid around `.georeference-scan` and the
    // narrow breakpoint keys off it. Renaming it would kill those rules
    // silently — the style tests regex the CSS and cannot see the DOM, and
    // Task 10's panel test asserts a class its own ScanPane mock invents.
    const { container } = renderPane();
    expect(container.querySelector(".georeference-scan")).not.toBeNull();
  });

  it("wears the tab-panel identity its caller hands down, on the root the stylesheet grids", () => {
    // GeoreferencePanel is the caller, and GeoreferencePanel.test.tsx mocks
    // THIS component — its mock echoes these three attributes so the tab
    // round trip is assertable over there. That echo is only honest because
    // of this test: without it ScanPane could ignore `tabPanel` outright, the
    // panel's Scan tab would carry an `aria-controls` naming an id no element
    // in the document has, and the whole suite would stay green.
    //
    // The role goes on `.georeference-scan` ITSELF, which is why the prop is
    // passed down at all: that div is a direct grid child of
    // `.georeference-panel` (styles.css sets explicit grid-template-columns
    // and -rows on it), so a wrapper div introduced just to hold the role
    // would insert an extra grid item and shift the layout.
    //
    // The two fixture strings differ so a transposed `id={labelledBy}` fails
    // here rather than passing on a pair of identical values.
    const { container } = renderPane({
      tabPanel: { id: "scan-panel-fixture", labelledBy: "scan-tab-fixture" },
    });
    const scan = container.querySelector(".georeference-scan");
    expect(scan).toHaveAttribute("id", "scan-panel-fixture");
    expect(scan).toHaveAttribute("role", "tabpanel");
    expect(scan).toHaveAttribute("aria-labelledby", "scan-tab-fixture");
  });

  it("claims no tab-panel role when no tab reveals it", () => {
    // The prop is optional and the role must not be unconditional: a
    // `role="tabpanel"` with no `role="tab"` anywhere in the document is a
    // claim about a pattern that is not there. Every other test in this file
    // mounts the pane exactly this way, so without this assertion an
    // unconditional role would go unnoticed here too.
    const { container } = renderPane();
    const scan = container.querySelector(".georeference-scan");
    expect(scan).not.toHaveAttribute("role");
    expect(scan).not.toHaveAttribute("id");
    expect(scan).not.toHaveAttribute("aria-labelledby");
  });

  it("configures the Leaflet map on CRS.Simple with the scan's own bounds and zoom limits", () => {
    // A latitude of -800 (scanBounds' north/south extent) is meaningless on
    // the default EPSG3857 CRS — CRS.Simple is what makes raw pixel
    // coordinates work as lat/lng at all.
    renderPane();
    expect(mapContainerCalls).toHaveLength(1);
    const props = mapContainerCalls[0];
    expect(props.crs).toBe(L.CRS.Simple);
    // MapContainer sets its initial view via `center`+`zoom` OR `fitBounds`
    // (react-leaflet's MapContainer.js) — ScanPane passes neither `center`
    // nor `zoom`, so `bounds` isn't just decorative here: drop it and the
    // real component throws "Set map center and zoom first" on mount.
    expect(props.bounds).toEqual([
      [-800, 0],
      [0, 1200],
    ]);
    expect(props.maxBounds).toEqual([
      [-800, 0],
      [0, 1200],
    ]);
    expect(props.minZoom).toBe(-4);
    expect(props.maxZoom).toBe(4);
    expect(props.zoomSnap).toBe(0.25);
    expect(props.className).toBe("georeference-scan-map");
    expect(props.attributionControl).toBe(false);
    // The scan image itself — the entire point of the pane.
    expect(imageOverlayCalls[0].url).toBe("blob:scan");
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

  it("makes every placed point draggable and numbered in list order", () => {
    // A single-GCP fixture can't tell `String(index + 1)` apart from
    // `String(gcps.length - index)` — both give "1" for a one-point list.
    // Three points expose the reversal: the mutant numbers them 3, 2, 1.
    renderPane();
    expect(markerCalls).toHaveLength(3);
    markerCalls.forEach((call, index) => {
      expect(call.draggable).toBe(true);
      expect(call.icon.options.html).toContain(String(index + 1));
      // Exact, not just "not pending": with no `selectedGcpId`, a placed
      // point's icon must be plain "gcp-marker" — adding `pending: true`
      // here (the hollow "still waiting for its other half" style) is
      // exactly the conflation gcpIcon.ts's doc comment says the pending/
      // selected split exists to prevent, and it must not survive a
      // completed, non-selected control point.
      expect(call.icon.options.className).toBe("gcp-marker");
    });
    expect(markerCalls[0].position).toEqual([-415, 637]);
    expect(markerCalls[1].position).toEqual([-100, 200]);
    expect(markerCalls[2].position).toEqual([-700, 900]);
  });

  it("marks the selected GCP's icon by matching its id, not its position label", () => {
    // selectedGcpId is a Gcp id ("b"), never a 1-based label. Comparing the
    // label instead (`String(index + 1) === selectedGcpId`) would silently
    // never match here, since none of the fixture's ids collide with "1",
    // "2", or "3".
    renderPane({ selectedGcpId: "b" });
    expect(markerCalls[0].icon.options.className).not.toContain(
      "gcp-marker--selected",
    );
    expect(markerCalls[1].icon.options.className).toContain(
      "gcp-marker--selected",
    );
    expect(markerCalls[2].icon.options.className).not.toContain(
      "gcp-marker--selected",
    );
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

  it("keeps each marker's icon, handlers, and position — the shared image bounds — and the click handler — stable across re-renders", () => {
    // react-leaflet calls marker.setIcon() when `icon` changes identity,
    // re-runs off()/on() when `eventHandlers` does, and calls
    // marker.setLatLng() when `position` does — its deps are
    // `[element, eventHandlers]` and a `!==` check on position respectively.
    // ImageOverlay compares `bounds` by reference the same way. useMapEvent
    // (hooks.js) keys ITS effect on `[map, type, handler]`, so an unmemoised
    // click handler re-runs map.off()/map.on() on every render exactly like
    // the others. Fresh literals on any of these fire once per pointer move
    // of a drag; worse, an unmemoised `position` means dragging point "c"
    // would call setLatLng() on "a" and "b" too, since moveGcpOnScan returns
    // the SAME object for non-matching ids and only a stable reference lets
    // React (and react-leaflet) tell "unchanged" apart from "recomputed but
    // equal".
    const { rerender, onPickPoint, onDragStartGcp, onMoveGcp } = renderPane();
    expect(markerCalls).toHaveLength(3);
    const before = [...markerCalls];
    const clickHandlerBefore = clickHandlerCalls[0];
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
    expect(markerCalls).toHaveLength(6);
    const after = markerCalls.slice(3);
    before.forEach((call, index) => {
      expect(after[index].icon).toBe(call.icon);
      expect(after[index].eventHandlers).toBe(call.eventHandlers);
      expect(after[index].position).toBe(call.position);
    });
    expect(imageOverlayCalls).toHaveLength(2);
    expect(imageOverlayCalls[1].bounds).toBe(imageOverlayCalls[0].bounds);
    expect(clickHandlerCalls).toHaveLength(2);
    expect(clickHandlerCalls[1]).toBe(clickHandlerBefore);
  });

  it("draws the pending half-point hollow, out of the way, and at the flipped pixel", () => {
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
    // Exact, flipped value — a mutant dropping the y-flip entirely
    // ([pending.pixel.y, pending.pixel.x] = [20, 10]) would pass a looser
    // check.
    expect(markerCalls[0].position).toEqual([-20, 10]);
    // The pending label is ONE PAST the placed points (gcps.length + 1 = 1,
    // since gcps here is []), not gcps.length itself (which would be "0").
    expect(markerCalls[0].icon.options.html).toBe("<span>1</span>");
  });

  it("recentres the scan on a focus request without zooming below the user's current level", () => {
    // getZoom is fixed ABOVE the floor of 1: only then can Math.max(getZoom(),
    // 1) be told apart from a flipped Math.min(getZoom(), 1) or a hardcoded
    // 1 — all three agree whenever getZoom() <= 1.
    stubMap.getZoom.mockReturnValue(3);
    renderPane({ focus: { pixel: { x: 100, y: 50 }, requestId: 1 } });
    expect(stubMap.setView).toHaveBeenCalledWith([-50, 100], 3);
  });

  it("zooms IN to the floor when the user is further out than it", () => {
    // The companion case to the test above: with no floor at all
    // (`map.getZoom()` alone, no `Math.max`), a user parked at minZoom={-4}
    // who clicks a GCP-list row would get recentred at -4 — never zooming in
    // — which defeats the entire documented purpose of ScanFocusController.
    stubMap.getZoom.mockReturnValue(-4);
    renderPane({ focus: { pixel: { x: 100, y: 50 }, requestId: 1 } });
    expect(stubMap.setView).toHaveBeenCalledWith([-50, 100], 1);
  });

  it("re-fires the recentre effect for every distinct focus request, even repeating the same pixel", () => {
    // Real usage never passes a non-null `focus` at mount: it starts null and
    // only becomes non-null once the user clicks a GCP-list row, and Task
    // 10's producer mints a fresh requestId on every click — even clicking
    // the SAME row twice in a row, per ScanFocusRequest's own doc comment
    // ("asking for the SAME point twice still moves the map"). An effect
    // dependency array that drops `focus` entirely stops recentring after
    // the very first click; one that keys on `focus.pixel` instead of the
    // whole `focus` object stops recentring on a repeat click to the same
    // point specifically — both are real regressions this test tells apart.
    const { rerender, onPickPoint, onDragStartGcp, onMoveGcp } = renderPane({
      focus: null,
    });
    expect(stubMap.setView).not.toHaveBeenCalled();

    const rerenderWithFocus = (
      focus: { pixel: { x: number; y: number }; requestId: number } | null,
    ) =>
      rerender(
        <ScanPane
          previewUrl="blob:scan"
          pixelSize={PIXEL_SIZE}
          gcps={GCPS}
          pending={null}
          focus={focus}
          onPickPoint={onPickPoint}
          onDragStartGcp={onDragStartGcp}
          onMoveGcp={onMoveGcp}
          selectedGcpId={null}
        />,
      );

    // The SAME pixel object, reused for both focus requests below — only a
    // dependency on the whole `focus` object (not just `focus.pixel`) can
    // tell these two requests apart.
    const samePixel = { x: 100, y: 50 };

    rerenderWithFocus({ pixel: samePixel, requestId: 1 });
    expect(stubMap.setView).toHaveBeenCalledTimes(1);

    rerenderWithFocus({ pixel: samePixel, requestId: 2 });
    expect(stubMap.setView).toHaveBeenCalledTimes(2);
  });
});
