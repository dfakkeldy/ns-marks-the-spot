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
  const view = (data: FeatureCollection) => (
    <MapContainer center={[45.8, -61.4]} zoom={12} zoomControl={false}>
      <EditableVectorLayer
        record={RECORD}
        data={data}
        onGeometryChange={onGeometryChange}
        onSelectFeature={vi.fn()}
      />
    </MapContainer>
  );
  const { rerender } = render(view(DATA), { container: host });
  return {
    map: createdMaps[0],
    onGeometryChange,
    rerenderWith: (data: FeatureCollection) => rerender(view(data)),
  };
}

function findLayerByFeatureId(map: L.Map, id: string): L.Layer | null {
  let found: L.Layer | null = null;
  map.eachLayer((layer) => {
    if ((layer as L.Layer & { feature?: { id?: unknown } }).feature?.id === id) {
      found = layer;
    }
  });
  return found;
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

  it("reports geometry after a vertex edit fired the way Geoman fires it", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    const target = findLayerByFeatureId(map, "poly");
    expect(target).toBeTruthy();
    // Geoman fires pm:edit on the LAYER and propagates it to parent groups
    // only — never to the map. Firing on the layer with propagation is the
    // real path; the previous version of this test fired on the map, which
    // Geoman never does, and so certified wiring that lost every reshape.
    target!.fire("pm:edit", { layer: target! }, true);

    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
  });

  it("publishes drags and marker drags from the layer, and ignores the map-level path Geoman never uses", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());
    const target = findLayerByFeatureId(map, "poly");

    map.fire("pm:edit", { layer: target! });
    map.fire("pm:dragend", { layer: target! });
    map.fire("pm:markerdragend", { layer: target! });
    await new Promise((resolve) => setTimeout(resolve, 16));
    expect(onGeometryChange).not.toHaveBeenCalled();

    target!.fire("pm:dragend", { layer: target! }, true);
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalledTimes(1));
    target!.fire("pm:markerdragend", { layer: target! }, true);
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalledTimes(2));
  });

  it("drops a panel-deleted feature from the live group instead of resurrecting it", async () => {
    const { map, onGeometryChange, rerenderWith } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());
    expect(findLayerByFeatureId(map, "poly")).toBeTruthy();

    // The details panel deletes by advancing the draft; the group must follow,
    // because the next publish rebuilds the collection from the group.
    rerenderWith({ type: "FeatureCollection", features: [] });
    await waitFor(() => expect(findLayerByFeatureId(map, "poly")).toBeNull());

    const drawn = L.polygon([
      [45.75, -61.45],
      [45.75, -61.35],
      [45.85, -61.35],
    ]);
    map.fire("pm:create", { layer: drawn, shape: "Polygon" });
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(collection.features.map(({ id }) => id)).not.toContain("poly");
  });

  it("publishes panel-edited details on the next gesture instead of reverting them", async () => {
    const { map, onGeometryChange, rerenderWith } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    rerenderWith({
      type: "FeatureCollection",
      features: [
        {
          ...DATA.features[0],
          properties: { name: "Front lot", description: "renamed in panel" },
        },
      ],
    });

    const target = findLayerByFeatureId(map, "poly");
    target!.fire("pm:edit", { layer: target! }, true);
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(collection.features[0]?.properties).toMatchObject({
      name: "Front lot",
      description: "renamed in panel",
    });
  });

  it("scopes Geoman to the session: layers that never opted in stay outside global modes", async () => {
    const { map } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    // An official evidence marker: present on the map, never opted in.
    const official = L.circleMarker([45.82, -61.42], { radius: 5 }).addTo(map);
    // Geoman's typings expose setOptIn but not the flag it sets.
    const pmGlobals = L.PM as typeof L.PM & { optIn?: boolean };
    expect(pmGlobals.optIn).toBe(true);
    // findLayers re-reads L.PM.optIn, so global edit must enumerate only the
    // session's layers (pmIgnore: false) — official geometry stays untouched.
    map.pm.enableGlobalEditMode?.();
    const sessionLayer = findLayerByFeatureId(map, "poly") as L.Layer & {
      pm?: { enabled?: () => boolean };
    };
    const bystander = official as L.Layer & {
      pm?: { enabled?: () => boolean };
    };
    expect(sessionLayer.pm?.enabled?.()).toBe(true);
    expect(bystander.pm?.enabled?.() ?? false).toBe(false);
    map.pm.disableGlobalEditMode?.();

    cleanup();
    // The flag is session-scoped: leaving it set would strip Geoman from every
    // future layer on the map.
    expect(pmGlobals.optIn).toBe(false);
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
