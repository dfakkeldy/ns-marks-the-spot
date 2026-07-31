import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import {
  ESTABLISHED_PARCEL_PANE_Z_INDEX,
  MEASURE_PANE_Z_INDEX,
  USER_VECTOR_PANE,
  USER_VECTOR_PANE_Z_INDEX,
} from "../../../components/mapPanes";
import type { UserVectorLayerRecord } from "../types";
import type { VisibleUserVectorLayer } from "../useUserVectorLayers";
import { UserVectorLayers } from "./UserVectorLayers";

/**
 * Mocked tests answer for the pane, so this file mounts the real
 * `MapContainer` (the component is a child of a map the test supplies, same
 * structure as GeoreferenceMapLayer.realMount.test.tsx). `Map.getSize()`
 * reads the container react-leaflet creates internally, and jsdom reports 0
 * for every element; `addInitHook` is Leaflet's public extension point that
 * runs after `_initContainer` and before react-leaflet's `setView`. Lasts
 * for this FILE only (vitest isolates modules per file).
 */
L.Map.addInitHook(function initHook(this: L.Map) {
  Object.defineProperties(this.getContainer(), {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
});

const createdMaps: L.Map[] = [];
L.Map.addInitHook(function trackHook(this: L.Map) {
  createdMaps.push(this);
});

function record(): UserVectorLayerRecord {
  return {
    id: "pane-fixture",
    name: "Pane fixture",
    source: "geojson",
    origin: {
      kind: "imported",
      filename: "pane.geojson",
      importedAt: "2026-07-30T00:00:00.000Z",
    },
    createdAt: "2026-07-30T00:00:00.000Z",
    revision: 0,
    style: { color: "#d55e00" },
    featureCount: 2,
    bbox: [-61.5, 45.7, -61.3, 45.9],
  };
}

const LAYER: VisibleUserVectorLayer = {
  record: record(),
  data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "point",
        geometry: { type: "Point", coordinates: [-61.4, 45.8] },
        properties: { name: "A point" },
      },
      {
        type: "Feature",
        id: "polygon",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-61.5, 45.7],
              [-61.3, 45.7],
              [-61.3, 45.9],
              [-61.5, 45.9],
              [-61.5, 45.7],
            ],
          ],
        },
        properties: { name: "A polygon" },
      },
    ],
  },
};

describe("UserVectorLayers pane mount", () => {
  afterEach(() => {
    // cleanup() unmounts MapContainer, which removes the map itself — no
    // manual map.remove() here, that would double-remove and throw.
    cleanup();
    createdMaps.length = 0;
    document.body.replaceChildren();
  });

  it("creates the user vector pane at its z-index with a canvas renderer inside", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    render(
      <MapContainer center={[45.8, -61.4]} zoom={13} zoomControl={false}>
        <UserVectorLayers layers={[LAYER]} />
      </MapContainer>,
      { container: host },
    );

    const map = createdMaps[0];
    await waitFor(() => expect(map.getPane(USER_VECTOR_PANE)).toBeTruthy());
    const pane = map.getPane(USER_VECTOR_PANE)!;

    expect(pane.style.zIndex).toBe(String(USER_VECTOR_PANE_Z_INDEX));
    expect(Number(pane.style.zIndex)).toBeGreaterThan(ESTABLISHED_PARCEL_PANE_Z_INDEX);
    expect(Number(pane.style.zIndex)).toBeLessThan(MEASURE_PANE_Z_INDEX);

    // Canvas renderer: geometry rasterizes into ONE <canvas> inside the pane…
    await waitFor(() => expect(pane.querySelector("canvas")).toBeTruthy());
    // …and the point renders as a circle marker on that canvas, not as a
    // default icon marker escaping to Leaflet's markerPane (z 600).
    expect(map.getPane("markerPane")?.childElementCount ?? 0).toBe(0);
  });
});
