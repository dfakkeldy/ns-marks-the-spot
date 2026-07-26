import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GEOREFERENCE_PANE, GEOREFERENCE_PANE_Z_INDEX } from "../../components/mapPanes";

type MarkerCall = {
  position: [number, number];
  draggable?: boolean;
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
const handlers = vi.hoisted(() => ({ click: null as ((e: unknown) => void) | null }));
const stubMap = vi.hoisted(() => ({
  getPane: vi.fn(() => undefined as HTMLElement | undefined),
  createPane: vi.fn(() => document.createElement("div")),
  setView: vi.fn(),
  // ABOVE the 15 floor on purpose. At 12 — below it — `Math.max(getZoom(), 15)`
  // and a hardcoded `15` are indistinguishable, so the "only zooms in" test
  // would pass against an implementation that always yanks the user to 15.
  getZoom: vi.fn(() => 17),
}));

vi.mock("react-leaflet", () => ({
  useMap: () => stubMap,
  useMapEvent: (type: string, handler: (e: unknown) => void) => {
    if (type === "click") {
      handlers.click = handler;
    }
    return stubMap;
  },
  Marker: (props: MarkerCall) => {
    markerCalls.push(props);
    // Records the icon's className AND the number embedded in its html —
    // deleting `icon={icon}` at the call site, or numbering from 0, or
    // rendering a completed point in the pending style all pass every OTHER
    // assertion in this file. The number is the ONLY correspondence between
    // this map's markers and the scan pane's own (see gcpIcon.ts), so it
    // needs its own check, not just position/pane/handlers.
    const label = /<span>(.*)<\/span>/.exec(props.icon.options.html ?? "")?.[1] ?? "";
    return (
      <div
        data-testid="gcp-marker"
        data-position={props.position.join(",")}
        data-draggable={String(props.draggable ?? false)}
        data-pane={props.pane ?? ""}
        data-handlers={Object.keys(props.eventHandlers ?? {}).sort().join(",")}
        data-icon-class={props.icon.options.className ?? ""}
        data-label={label}
      />
    );
  },
}));

import { GeoreferenceMapLayer } from "./GeoreferenceMapLayer";

const BINDING = {
  gcps: [
    { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
    { id: "b", pixel: { x: 10, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
  ],
  pending: null,
  draft: null,
  focus: null,
  onPickMapPoint: vi.fn(),
  onDragStartGcp: vi.fn(),
  onMoveGcpOnMap: vi.fn(),
};

describe("GeoreferenceMapLayer", () => {
  beforeEach(() => {
    markerCalls.length = 0;
    stubMap.createPane.mockClear();
    stubMap.setView.mockClear();
  });

  it("renders one marker per GCP at its stored WGS84 position", () => {
    render(<GeoreferenceMapLayer binding={BINDING} />);
    const markers = screen.getAllByTestId("gcp-marker");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute("data-position", "46.1,-61.2");
  });

  it("puts the control points in their own pane, above every overlay", () => {
    // `mapPanes.test.ts` asserts the constants relate correctly; only this
    // proves the layer USES them. Without both, markers land in Leaflet's
    // default marker pane at 600 — under the tooltip pane — and the pane
    // rationale Task 13 documents is fiction.
    render(<GeoreferenceMapLayer binding={BINDING} />);
    expect(stubMap.createPane).toHaveBeenCalledWith(GEOREFERENCE_PANE);
    for (const marker of screen.getAllByTestId("gcp-marker")) {
      expect(marker).toHaveAttribute("data-pane", GEOREFERENCE_PANE);
    }
    // The pane element's z-index is set from the constant, not a literal.
    const pane = stubMap.createPane.mock.results[0]?.value as HTMLElement;
    expect(pane.style.zIndex).toBe(String(GEOREFERENCE_PANE_Z_INDEX));
  });

  it("snapshots undo on dragstart, then follows the drag", () => {
    // dragstart is the only map-side entry into undo history. Wire `drag`
    // alone and every assertion except this one still passes.
    const onDragStartGcp = vi.fn();
    const onMoveGcpOnMap = vi.fn();
    render(
      <GeoreferenceMapLayer
        binding={{ ...BINDING, onDragStartGcp, onMoveGcpOnMap }}
      />,
    );
    expect(markerCalls[0].draggable).toBe(true);
    expect(Object.keys(markerCalls[0].eventHandlers ?? {}).sort()).toEqual([
      "drag",
      "dragstart",
    ]);
    markerCalls[0].eventHandlers?.dragstart?.();
    expect(onDragStartGcp).toHaveBeenCalledWith("a");
    markerCalls[0].eventHandlers?.drag?.({
      target: { getLatLng: () => ({ lat: 45.9, lng: -61.4 }) },
    });
    expect(onMoveGcpOnMap).toHaveBeenCalledWith("a", 45.9, -61.4);
  });

  it("turns a map click into a picked point", () => {
    const onPickMapPoint = vi.fn();
    render(
      <GeoreferenceMapLayer binding={{ ...BINDING, onPickMapPoint }} />,
    );
    handlers.click?.({ latlng: { lat: 45.9, lng: -61.5 } });
    expect(onPickMapPoint).toHaveBeenCalledWith(45.9, -61.5);
  });

  it("shows the pending half-point waiting for its scan match", () => {
    render(
      <GeoreferenceMapLayer
        binding={{
          ...BINDING,
          gcps: [],
          pending: { side: "map", map: { lat: 45.9, lng: -61.5 } },
        }}
      />,
    );
    expect(screen.getAllByTestId("gcp-marker")).toHaveLength(1);
  });

  it("numbers real GCPs from 1 in the shared icon style, and gives the pending half-point its own style, number, and pane", () => {
    // Both GCPs present AND a pending point in the same render: the pending
    // point's label must continue the sequence (3), not restart at 1, and
    // must NOT get the same style as a completed point — a swapped
    // `numberedIcon(label, { pending: true })` call at either site is
    // `tsc -b`-clean and passes every other test in this file.
    render(
      <GeoreferenceMapLayer
        binding={{
          ...BINDING,
          pending: { side: "map", map: { lat: 45.9, lng: -61.5 } },
        }}
      />,
    );
    const markers = screen.getAllByTestId("gcp-marker");
    expect(markers).toHaveLength(3);

    expect(markers[0]).toHaveAttribute("data-icon-class", "gcp-marker");
    expect(markers[0]).toHaveAttribute("data-label", "1");
    expect(markers[1]).toHaveAttribute("data-icon-class", "gcp-marker");
    expect(markers[1]).toHaveAttribute("data-label", "2");
    // Draggable, with the undo-history entry point wired — a completed GCP,
    // not a decoration.
    expect(markers[0]).toHaveAttribute("data-handlers", "drag,dragstart");
    expect(markers[1]).toHaveAttribute("data-handlers", "drag,dragstart");

    const pending = markers[2];
    expect(pending).toHaveAttribute("data-icon-class", "gcp-marker gcp-marker--pending");
    expect(pending).toHaveAttribute("data-label", "3");
    // The pane assertion above only ever renders with `pending: null` — this
    // is the only place the pending marker's OWN pane is checked. Deleting
    // `pane={GEOREFERENCE_PANE}` from the pending marker alone still passes
    // every other test, and drops the half-point to Leaflet's default marker
    // pane (600), under the tooltip pane (650).
    expect(pending).toHaveAttribute("data-pane", GEOREFERENCE_PANE);
    // Non-interactive: no drag affordance for a point that isn't a GCP yet.
    expect(pending).toHaveAttribute("data-handlers", "");
  });

  it("recentres on a focus request, and only zooms in", () => {
    const { rerender } = render(<GeoreferenceMapLayer binding={BINDING} />);
    expect(stubMap.setView).not.toHaveBeenCalled();
    // Deliberately NOT gcps[0].map (46.1, -61.2): an earlier version of this
    // fixture coincided with it, so wiring `MapFocusController`'s `focus` to
    // `binding.gcps[0].map` instead of `binding.focus` (keeping only
    // `requestId` distinct) still passed this test — the coordinate alone
    // couldn't tell "focus" from "first GCP" apart.
    rerender(
      <GeoreferenceMapLayer
        binding={{
          ...BINDING,
          focus: { lat: 45.5, lng: -60.8, requestId: 1 },
        }}
      />,
    );
    // The fixture sits at zoom 17, ABOVE the 15 floor, so this distinguishes
    // `Math.max(getZoom(), 15)` from a hardcoded 15 — at a fixture zoom of 12
    // the two are identical and the test's own name is unearned. Never zoom
    // the user back OUT of a closer inspection.
    expect(stubMap.setView).toHaveBeenCalledWith([45.5, -60.8], 17);
  });
});
