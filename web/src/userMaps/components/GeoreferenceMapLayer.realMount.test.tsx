import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import { GEOREFERENCE_PANE } from "../../components/mapPanes";
import {
  GeoreferenceMapLayer,
  type GeoreferenceBinding,
} from "./GeoreferenceMapLayer";
import type { Gcp } from "../types";

/**
 * Every other test in this directory mocks `react-leaflet` wholesale (see
 * `GeoreferenceMapLayer.test.tsx`), which is why they never caught this: a
 * mocked `Marker`/`useMap` can't reproduce React's real child-effects-before-
 * parent-effects ordering, or Leaflet's real `getPane().appendChild(...)`.
 * This file deliberately does NOT mock `react-leaflet` — it mounts the real
 * `MapContainer`, the real `Marker`, and a real `L.Map` so the ordering bug
 * can actually happen.
 *
 * `react-leaflet`'s `MapContainer` only renders its children once the
 * underlying `L.Map` exists (a `context` state flip after the ref callback
 * runs), so `GeoreferenceMapLayer` and its GCP marker children mount in the
 * SAME commit whenever a session opens on a map that already has points —
 * exactly Task 11's "Adjust points" reachability path (spec: re-georeferencing
 * an existing map reuses the create flow; `useGeoreferenceSession` re-seeds
 * its id counter from the map's existing GCPs for precisely this reason).
 */
function sizedContainer(): HTMLDivElement {
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
  document.body.append(container);
  return container;
}

/**
 * `Map.getSize()` reads `this._container.clientWidth/clientHeight` off the
 * div react-leaflet creates INSIDE the host node, and jsdom reports 0 for
 * every element. Sizing the host above is therefore not enough. `addInitHook`
 * is Leaflet's own public extension point and runs at the end of
 * `Map.initialize` — after `_initContainer` (so `getContainer()` is live) and
 * before react-leaflet's `setView` — which is the only moment a test can
 * reach from outside a component that forwards no ref. Same device as
 * `ScanPane.realMount.test.tsx`; it lasts for this FILE only, because vitest
 * isolates modules per file.
 */
L.Map.addInitHook(function initHook(this: L.Map) {
  Object.defineProperties(this.getContainer(), {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
});

const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 10, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
];

const BINDING: GeoreferenceBinding = {
  gcps: GCPS,
  pending: null,
  draft: null,
  focus: null,
  onPickMapPoint: () => {},
  onDragStartGcp: () => {},
  onDragEndGcp: () => {},
  onMoveGcpOnMap: () => {},
};

/**
 * jsdom's `MouseEvent` does not implement the legacy `which` alias and leaves
 * it 0; a real browser reports `which === 1` for the primary button, and
 * Leaflet's `Draggable._onDown` gates on exactly that
 * (`(e.which !== 1) && (e.button !== 1) && !e.touches` → bail). Setting it
 * makes the synthetic event MATCH a real browser's rather than substituting
 * for Leaflet's own logic, which still runs unmodified. Identical to the
 * helper in `ScanPane.realMount.test.tsx`, and deliberately duplicated: a
 * shared helper would have to live in a non-test module that ships.
 */
function mouse(type: string, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, {
    button: 0,
    buttons: 1,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "which", { value: 1 });
  return event;
}

/**
 * Leaflet's `Draggable` commits a move inside a `requestAnimationFrame`
 * callback, so `drag` is delivered a frame after the pointer moves. jsdom
 * provides a real rAF queue and runs callbacks in FIFO order, so awaiting a
 * frame we queue ourselves guarantees Leaflet's earlier one already ran.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function mountLayer(binding: GeoreferenceBinding = BINDING) {
  const container = sizedContainer();
  const utils = render(
    <MapContainer center={[46.05, -61.1]} zoom={10}>
      <GeoreferenceMapLayer binding={binding} />
    </MapContainer>,
    { container },
  );
  return { ...utils, container };
}

describe("GeoreferenceMapLayer mounted against a real Leaflet map", () => {
  it("does not throw when GCPs are already present on the very first render", () => {
    const container = sizedContainer();
    // The crash this guards against is a TypeError thrown from inside a
    // React passive-effect commit (Marker's onAdd -> _initIcon ->
    // getPane().appendChild), which render() propagates synchronously.
    // "Adjust points" on an already-georeferenced map is exactly this: N
    // markers exist from the very first commit, not added one at a time.
    expect(() => {
      render(
        <MapContainer center={[46.05, -61.1]} zoom={10}>
          <GeoreferenceMapLayer binding={BINDING} />
        </MapContainer>,
        { container },
      );
    }).not.toThrow();
  });

  it("routes markers present at first mount into the georeference pane", () => {
    const { container } = mountLayer();
    // Leaflet's own `createPane` names the element `leaflet-<name>-pane`
    // (with any literal "Pane" substring stripped first, which our
    // lowercase "georeference-pane" doesn't have).
    const pane = container.querySelector(`.leaflet-${GEOREFERENCE_PANE}-pane`);
    expect(pane).not.toBeNull();
    // Both GCP markers' icons must be children of THAT pane, not of
    // Leaflet's default marker pane — the whole reason this task created a
    // dedicated pane in the first place.
    expect(pane?.querySelectorAll(".gcp-marker")).toHaveLength(2);
  });

  it("delivers a REAL Leaflet dragend to onDragEndGcp, and never to onDragStartGcp", async () => {
    // The map half of the two-tier mesh wiring, and the reason it cannot be
    // inferred from the scan half: the two panes have SEPARATE marker
    // components with separate `eventHandlers` memos and separate bindings
    // (`GeoreferencePanel` wires ScanPane, `App` wires this one). Wiring one
    // and not the other leaves releasing a marker on the unwired pane stuck
    // on the coarse drape while every test on the other pane passes.
    //
    // Both handlers are `(id: string) => void`, so
    // `dragend: () => onDragStartGcp(gcp.id)` typechecks and lints clean.
    const onDragStartGcp = vi.fn<(id: string) => void>();
    const onDragEndGcp = vi.fn<(id: string) => void>();
    const onMoveGcpOnMap = vi.fn<(id: string, lat: number, lng: number) => void>();
    const { container } = mountLayer({
      ...BINDING,
      onDragStartGcp,
      onDragEndGcp,
      onMoveGcpOnMap,
    });

    // Matched by its LABEL, so the assertions below tie a Leaflet event to a
    // specific control point rather than to a DOM ordinal: "b" is index 1,
    // so its marker reads "2".
    const icons = [...container.querySelectorAll<HTMLElement>(".gcp-marker")];
    expect(icons).toHaveLength(2);
    const icon = icons.find((node) => node.textContent === "2");
    expect(icon).toBeDefined();
    const target = icon as HTMLElement;

    // Leaflet's `Draggable` anchors to `clientX/clientY` deltas from the
    // press, so the absolute coordinates are arbitrary; what matters is that
    // the move clears the click tolerance.
    target.dispatchEvent(mouse("mousedown", 100, 100));
    target.dispatchEvent(mouse("mousemove", 140, 180));
    await nextFrame();
    expect(onDragStartGcp.mock.calls).toEqual([["b"]]);
    expect(onMoveGcpOnMap).toHaveBeenCalledTimes(1);
    expect(onMoveGcpOnMap.mock.calls[0][0]).toBe("b");
    // `dragend` comes only from `Draggable.finishDrag`, on release.
    expect(onDragEndGcp).not.toHaveBeenCalled();

    target.dispatchEvent(mouse("mouseup", 140, 180));
    expect(onDragEndGcp.mock.calls).toEqual([["b"]]);
    // The count that fails under the transposition: wiring `dragend` to
    // `onDragStartGcp` would leave the `.toEqual` above red only because the
    // end spy stayed empty — but wiring BOTH to `onDragEndGcp` would pass it,
    // and this catches that too.
    expect(onDragStartGcp).toHaveBeenCalledTimes(1);
  });
});
