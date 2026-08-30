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
  afterEach(async () => {
    // Leaflet's canvas renderer redraws on an animation frame. Unmounting
    // with one still queued lets it fire against a torn-down renderer
    // (`ctx` undefined), which surfaces as an unhandled error and can taint
    // later tests. Letting the frame run while its map is still alive costs
    // one jsdom tick and keeps the run's output clean.
    await new Promise((resolve) => setTimeout(resolve, 32));
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

  it("fits an area layer to its whole extent, not to the maximum zoom", async () => {
    // Browser check found the map sitting at maxZoom (16) after importing a
    // layer whose extent needs about zoom 14 — i.e. the layer filled the
    // screen instead of fitting inside it. The fit must land on the zoom the
    // extent actually calls for.
    const host = document.createElement("div");
    document.body.append(host);
    render(
      <MapContainer center={[46.5, -60.5]} zoom={10} zoomControl={false}>
        <UserVectorLayers layers={[LAYER]} fitRequest={{ layerId: LAYER.record.id, revision: 1 }} />
      </MapContainer>,
      { container: host },
    );

    const map = createdMaps[0];
    await waitFor(() => expect(map.getPane(USER_VECTOR_PANE)).toBeTruthy());

    const [west, south, east, north] = LAYER.record.bbox!;
    await waitFor(() => {
      expect(map.getBounds().contains([[south, west], [north, east]])).toBe(true);
    });
    expect(map.getZoom()).toBeLessThan(16);
  });

  it("still fits when the request arrives before the layer is in the list", async () => {
    // The real import order: the hook publishes the fit request and the new
    // layer from the same batch, and React can commit a render where the
    // request is present but the layer list has not caught up. Giving up
    // there — and never retrying — left the map wherever it already was,
    // which is what the browser showed for every area layer imported.
    const host = document.createElement("div");
    document.body.append(host);
    const request = { layerId: LAYER.record.id, revision: 1 };
    const { rerender } = render(
      <MapContainer center={[46.5, -60.5]} zoom={10} zoomControl={false}>
        <UserVectorLayers layers={[]} fitRequest={request} />
      </MapContainer>,
      { container: host },
    );

    const map = createdMaps[0];
    await waitFor(() => expect(map.getPane(USER_VECTOR_PANE)).toBeTruthy());
    expect(map.getCenter().lat).toBeCloseTo(46.5, 1);

    rerender(
      <MapContainer center={[46.5, -60.5]} zoom={10} zoomControl={false}>
        <UserVectorLayers layers={[LAYER]} fitRequest={request} />
      </MapContainer>,
    );

    const [west, south, east, north] = LAYER.record.bbox!;
    await waitFor(() => {
      expect(map.getBounds().contains([[south, west], [north, east]])).toBe(true);
    });
  });

  it("does not re-fit when an unrelated layer is toggled", async () => {
    // The fit is a one-shot per request: re-running it whenever the layer
    // list changes would yank the map back every time the user turns another
    // layer on or off.
    const host = document.createElement("div");
    document.body.append(host);
    const request = { layerId: LAYER.record.id, revision: 1 };
    const { rerender } = render(
      <MapContainer center={[46.5, -60.5]} zoom={10} zoomControl={false}>
        <UserVectorLayers layers={[LAYER]} fitRequest={request} />
      </MapContainer>,
      { container: host },
    );

    const map = createdMaps[0];
    await waitFor(() => expect(map.getZoom()).toBeLessThan(16));
    map.setView([44.0, -64.0], 9);

    const other: VisibleUserVectorLayer = {
      ...LAYER,
      record: { ...LAYER.record, id: "another-layer" },
    };
    rerender(
      <MapContainer center={[46.5, -60.5]} zoom={10} zoomControl={false}>
        <UserVectorLayers layers={[LAYER, other]} fitRequest={request} />
      </MapContainer>,
    );

    await waitFor(() => expect(map.getPane(USER_VECTOR_PANE)).toBeTruthy());
    expect(map.getCenter().lat).toBeCloseTo(44.0, 1);
    expect(map.getZoom()).toBe(9);
  });
});

describe("UserVectorLayers snap targets", () => {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
    cleanup();
    createdMaps.length = 0;
    document.body.replaceChildren();
  });

  function childOptions(map: L.Map): Array<{ snapIgnore?: boolean }> {
    const options: Array<{ snapIgnore?: boolean }> = [];
    map.eachLayer((layer) => {
      if (
        (layer as L.Layer & { feature?: unknown }).feature &&
        (layer instanceof L.Path || layer instanceof L.CircleMarker)
      ) {
        options.push(layer.options as { snapIgnore?: boolean });
      }
    });
    return options;
  }

  it("stamps snapIgnore false on every child while armed as snap targets", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    render(
      <MapContainer center={[45.8, -61.4]} zoom={12} zoomControl={false}>
        <UserVectorLayers layers={[LAYER]} snapAsTargets />
      </MapContainer>,
      { container: host },
    );
    const map = createdMaps[0];
    await waitFor(() => expect(childOptions(map).length).toBeGreaterThan(1));
    for (const options of childOptions(map)) {
      expect(options.snapIgnore).toBe(false);
    }
  });

  it("stamps snapIgnore true when not armed", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    render(
      <MapContainer center={[45.8, -61.4]} zoom={12} zoomControl={false}>
        <UserVectorLayers layers={[LAYER]} />
      </MapContainer>,
      { container: host },
    );
    const map = createdMaps[0];
    await waitFor(() => expect(childOptions(map).length).toBeGreaterThan(1));
    for (const options of childOptions(map)) {
      expect(options.snapIgnore).toBe(true);
    }
  });
});
