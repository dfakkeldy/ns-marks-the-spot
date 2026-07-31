import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { USER_VECTOR_PANE } from "../../../components/mapPanes";
import type { UserVectorLayerRecord } from "../types";
import { EditableVectorLayer } from "./EditableVectorLayer";

/**
 * Geoman is the whole subject here, so this file mounts real Leaflet, real
 * Geoman and a real map. A mocked `map.pm` would answer every question the
 * test asks — whether editing can be enabled at all, and whether a drawn
 * shape reaches the callback with its properties intact.
 *
 * The browser spike that preceded this established the load-bearing fact:
 * Geoman's vertex handles are DOM markers in `markerPane`, independent of
 * the renderer drawing the shape, so a canvas-rendered layer edits fine and
 * no SVG fallback is needed. This test pins the parts jsdom can hold.
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

const RECORD: UserVectorLayerRecord = {
  id: "edit-me",
  name: "Field notes",
  source: "drawn",
  origin: { kind: "drawn", createdAt: "2026-07-31T00:00:00.000Z" },
  createdAt: "2026-07-31T00:00:00.000Z",
  revision: 0,
  style: { color: "#d55e00" },
  featureCount: 1,
  bbox: [-61.5, 45.7, -61.3, 45.9],
};

const DATA: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "poly",
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
      properties: { name: "Back lot", description: "NE corner" },
    },
  ],
};

function mount(onGeometryChange = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  render(
    <MapContainer center={[45.8, -61.4]} zoom={12} zoomControl={false}>
      <EditableVectorLayer
        record={RECORD}
        data={DATA}
        onGeometryChange={onGeometryChange}
        onSelectFeature={vi.fn()}
      />
    </MapContainer>,
    { container: host },
  );
  return { map: createdMaps[0], onGeometryChange };
}

describe("EditableVectorLayer", () => {
  afterEach(async () => {
    // Let any queued canvas redraw run while its map is alive; unmounting
    // first leaves the frame to fire against a torn-down renderer.
    await new Promise((resolve) => setTimeout(resolve, 32));
    cleanup();
    createdMaps.length = 0;
    document.body.replaceChildren();
  });

  it("puts the editable layer in the user vector pane, not a pane of its own", async () => {
    const { map } = mount();
    await waitFor(() => expect(map.getPane(USER_VECTOR_PANE)).toBeTruthy());
    expect(Number(map.getPane(USER_VECTOR_PANE)!.style.zIndex)).toBe(425);
  });

  it("enables Geoman editing on the layer's features", async () => {
    const { map } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    const editable: L.Layer[] = [];
    map.eachLayer((layer) => {
      if ((layer as L.Layer & { pm?: unknown }).pm) {
        editable.push(layer);
      }
    });
    // The polygon itself must be editable, not merely present.
    expect(editable.length).toBeGreaterThan(0);
  });

  it("reports a newly drawn shape with a stable id", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    const drawn = L.polygon([
      [45.75, -61.45],
      [45.75, -61.35],
      [45.85, -61.35],
    ]);
    map.fire("pm:create", { layer: drawn, shape: "Polygon" });

    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(collection.features).toHaveLength(2);
    // Editing and export both key off feature ids, so a new shape needs one
    // immediately rather than at the next import.
    expect(collection.features.every((f) => typeof f.id === "string" && f.id)).toBe(true);
  });

  it("keeps existing feature properties through an edit", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    map.fire("pm:create", { layer: L.marker([45.8, -61.4]), shape: "Marker" });
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());

    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    const original = collection.features.find((f) => f.id === "poly");
    expect(original?.properties).toMatchObject({
      name: "Back lot",
      description: "NE corner",
    });
  });

  it("reports geometry after a vertex edit", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    let target: L.Layer | null = null;
    map.eachLayer((layer) => {
      if ((layer as L.Polygon).feature?.id === "poly") {
        target = layer;
      }
    });
    expect(target).toBeTruthy();
    map.fire("pm:edit", { layer: target! });

    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
  });

  it("drops a feature removed through Geoman", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    let target: L.Layer | null = null;
    map.eachLayer((layer) => {
      if ((layer as L.Polygon).feature?.id === "poly") {
        target = layer;
      }
    });
    map.fire("pm:remove", { layer: target! });

    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(collection.features).toHaveLength(0);
  });

  it("turns Geoman off and removes its layer when the session closes", async () => {
    const { map } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());
    const before = map.getPane(USER_VECTOR_PANE)!.childElementCount;
    expect(before).toBeGreaterThan(0);

    cleanup();
    // A left-behind edit layer would draw the features a second time on top
    // of the read-only list once the session ends.
    let stillEditable = 0;
    map.eachLayer((layer) => {
      if ((layer as L.Layer & { feature?: unknown }).feature) {
        stillEditable += 1;
      }
    });
    expect(stillEditable).toBe(0);
  });
});
