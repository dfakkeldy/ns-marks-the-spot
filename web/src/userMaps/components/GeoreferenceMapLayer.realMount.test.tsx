import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapContainer } from "react-leaflet";
import { GEOREFERENCE_PANE } from "../../components/mapPanes";
import { GeoreferenceMapLayer } from "./GeoreferenceMapLayer";
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

const GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 10, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
];

const BINDING = {
  gcps: GCPS,
  pending: null,
  draft: null,
  focus: null,
  onPickMapPoint: () => {},
  onDragStartGcp: () => {},
  onMoveGcpOnMap: () => {},
};

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
    const container = sizedContainer();
    render(
      <MapContainer center={[46.05, -61.1]} zoom={10}>
        <GeoreferenceMapLayer binding={BINDING} />
      </MapContainer>,
      { container },
    );
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
});
