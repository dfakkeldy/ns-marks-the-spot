import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { USER_VECTOR_PANE } from "../../../components/mapPanes";
import type { UserVectorLayerRecord } from "../types";
import {
  EditableVectorLayer,
  type VectorSnapTargets,
} from "./EditableVectorLayer";

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

/**
 * The real app creates its one map at page load, BEFORE the lazy Geoman
 * chunk evaluates — so that map never went through Geoman's init hook and
 * has no `pm`. This harness imports Geoman at module top (it must), which
 * gave every test map a `pm` and let the tests certify a condition the app
 * never runs in; production crashed on "New drawing layer" while this suite
 * was green. Stripping `pm` at init reproduces the app's actual condition.
 */
let stripPmOnInit = false;
L.Map.addInitHook(function stripHook(this: L.Map) {
  if (stripPmOnInit) {
    (this as L.Map & { pm?: unknown }).pm = undefined;
  }
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

const SNAP_ALL: VectorSnapTargets = {
  enabled: true,
  myFeatures: true,
  parcels: true,
};

function mount(
  onGeometryChange = vi.fn(),
  options: { mode?: string | null; snap?: VectorSnapTargets } = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const view = (data: FeatureCollection) => (
    <MapContainer center={[45.8, -61.4]} zoom={12} zoomControl={false}>
      <EditableVectorLayer
        record={RECORD}
        data={data}
        snap={options.snap ?? SNAP_ALL}
        mode={options.mode ?? null}
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

/**
 * The field-capture snapping pins. These certify VENDORED semantics of the
 * pinned @geoman-io/leaflet-geoman-free 2.20.0 — the snapIgnore/optIn
 * interplay the snap design hinges on — so a Geoman upgrade that changes
 * them fails loudly here instead of silently breaking parcel snapping.
 */
describe("EditableVectorLayer field-capture snapping", () => {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
    cleanup();
    createdMaps.length = 0;
    document.body.replaceChildren();
  });

  function parcelTarget(): L.Polygon {
    return L.polygon(
      [
        [45.79, -61.42],
        [45.79, -61.38],
        [45.82, -61.38],
        [45.82, -61.42],
      ],
      {
        snapIgnore: false,
        interactive: false,
        nsmtsSnapSource: "nsprd-parcel",
      } as L.PolylineOptions,
    );
  }

  it("keeps snapIgnore:false targets in the snap list but out of findLayers", async () => {
    const { map } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    const parcel = parcelTarget().addTo(map);

    // Global edit/drag/delete must never reach the parcel target…
    const editable = L.PM.Utils.findLayers(map);
    expect(editable).not.toContain(parcel);

    // …while the draw tool's snap list must include it, even under the
    // session's L.PM.setOptIn(true) with pmIgnore left undefined.
    const draw = (map.pm as unknown as {
      Draw: Record<string, { _createSnapList: () => void; _snapList?: L.Layer[] }>;
    }).Draw.Line;
    draw._createSnapList();
    expect(draw._snapList).toContain(parcel);
  });

  it("passes the contract snap options to the armed draw tool", async () => {
    const { map } = mount(vi.fn(), { mode: "Line" });
    await waitFor(() => expect(map.pm).toBeTruthy());

    const draw = (map.pm as unknown as {
      Draw: Record<string, { options: Record<string, unknown> }>;
    }).Draw.Line;
    await waitFor(() => expect(draw.options.snappable).toBe(true));
    expect(draw.options.snapDistance).toBe(15);
    expect(draw.options.snapSegment).toBe(true);
    expect(draw.options.snapVertex).toBe(true);
    expect(draw.options.snapMiddle).toBe(false);
  });

  it("disarms snapping through the master toggle", async () => {
    const { map } = mount(vi.fn(), {
      mode: "Line",
      snap: { enabled: false, myFeatures: true, parcels: true },
    });
    await waitFor(() => expect(map.pm).toBeTruthy());
    const draw = (map.pm as unknown as {
      Draw: Record<string, { options: Record<string, unknown> }>;
    }).Draw.Line;
    await waitFor(() => expect(draw.options.snappable).toBe(false));
  });

  it("stamps nsmts:createdAt on created shapes and never on seeded ones", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    map.fire("pm:create", { layer: L.marker([45.8, -61.4]), shape: "Marker" });
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());

    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    const created = collection.features.find((f) => f.id !== "poly");
    const seeded = collection.features.find((f) => f.id === "poly");
    expect(typeof created?.properties?.["nsmts:createdAt"]).toBe("string");
    expect(seeded?.properties?.["nsmts:createdAt"]).toBeUndefined();
  });

  it("stamps nsmts:traced when the drawn shape snapped to a parcel source", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());
    const parcel = parcelTarget().addTo(map);

    const workingLayer = L.polyline([]).addTo(map);
    map.fire("pm:drawstart", { workingLayer, shape: "Line" });
    workingLayer.fire("pm:snap", {
      layerInteractedWith: parcel,
      snapLatLng: { lat: 45.79, lng: -61.42 },
      segment: [
        { lat: 45.79, lng: -61.42 },
        { lat: 45.79, lng: -61.38 },
      ],
    });

    map.fire("pm:create", {
      layer: L.polyline([
        [45.79, -61.42],
        [45.8, -61.4],
      ]),
      shape: "Line",
    });
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    let collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    let traced = collection.features.find((f) => f.id !== "poly");
    expect(traced?.properties?.["nsmts:traced"]).toBe("nsprd-parcel");

    // The flag is one-shot: the next shape, drawn without a parcel snap,
    // must not inherit the stamp.
    map.fire("pm:create", { layer: L.marker([45.81, -61.41]), shape: "Marker" });
    await waitFor(() =>
      expect(
        (onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection).features,
      ).toHaveLength(3),
    );
    collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    traced = collection.features.find(
      (f) => f.geometry.type === "Point" && f.id !== "poly",
    );
    expect(traced?.properties?.["nsmts:traced"]).toBeUndefined();
  });

  it("stamps nsmts:traced on an edited feature that snapped to a parcel", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());
    const parcel = parcelTarget().addTo(map);

    const target = findLayerByFeatureId(map, "poly");
    expect(target).toBeTruthy();
    target!.fire("pm:snap", {
      layerInteractedWith: parcel,
      snapLatLng: { lat: 45.79, lng: -61.4 },
      segment: [
        { lat: 45.79, lng: -61.42 },
        { lat: 45.79, lng: -61.38 },
      ],
    });
    target!.fire("pm:edit", { layer: target! }, true);

    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(
      collection.features.find((f) => f.id === "poly")?.properties?.[
        "nsmts:traced"
      ],
    ).toBe("nsprd-parcel");
  });

  it("does not stamp nsmts:traced for a snap to a non-parcel source", async () => {
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    const ownFeature = L.polyline([
      [45.78, -61.44],
      [45.78, -61.4],
    ]).addTo(map);
    const target = findLayerByFeatureId(map, "poly");
    target!.fire("pm:snap", {
      layerInteractedWith: ownFeature,
      snapLatLng: { lat: 45.78, lng: -61.44 },
      segment: [
        { lat: 45.78, lng: -61.44 },
        { lat: 45.78, lng: -61.4 },
      ],
    });
    target!.fire("pm:edit", { layer: target! }, true);

    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(
      collection.features.find((f) => f.id === "poly")?.properties?.[
        "nsmts:traced"
      ],
    ).toBeUndefined();
  });

  it("shows a square indicator for a vertex hit and clears it on unsnap", async () => {
    const { map } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());
    const parcel = parcelTarget().addTo(map);
    const target = findLayerByFeatureId(map, "poly");

    const segment = [
      { lat: 45.79, lng: -61.42 },
      { lat: 45.79, lng: -61.38 },
    ];
    target!.fire("pm:snap", {
      layerInteractedWith: parcel,
      snapLatLng: { lat: 45.79, lng: -61.42 },
      segment,
    });
    expect(document.querySelector(".snap-indicator-vertex")).toBeTruthy();

    target!.fire("pm:snap", {
      layerInteractedWith: parcel,
      snapLatLng: { lat: 45.79, lng: -61.4 },
      segment,
    });
    expect(document.querySelector(".snap-indicator")).toBeTruthy();
    expect(document.querySelector(".snap-indicator-vertex")).toBeNull();

    target!.fire("pm:unsnap", {});
    expect(document.querySelector(".snap-indicator")).toBeNull();
  });
});

describe("EditableVectorLayer on a map created before Geoman loaded", () => {
  afterEach(async () => {
    stripPmOnInit = false;
    await new Promise((resolve) => setTimeout(resolve, 32));
    cleanup();
    createdMaps.length = 0;
    document.body.replaceChildren();
  });

  it("initializes map.pm itself and runs a full session (production crash regression)", async () => {
    stripPmOnInit = true;
    const { map, onGeometryChange } = mount();
    await waitFor(() => expect(map.pm).toBeTruthy());

    // The session must be fully functional, not merely alive: a drawn shape
    // still reaches the callback with id and creation stamp.
    map.fire("pm:create", { layer: L.marker([45.8, -61.4]), shape: "Marker" });
    await waitFor(() => expect(onGeometryChange).toHaveBeenCalled());
    const collection = onGeometryChange.mock.calls.at(-1)![0] as FeatureCollection;
    expect(collection.features).toHaveLength(2);
  });
});
