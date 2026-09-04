import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import type { Feature, FeatureCollection } from "geojson";
import {
  USER_VECTOR_PANE,
  USER_VECTOR_PANE_Z_INDEX,
} from "../../../components/mapPanes";
import {
  FIELD_CAPTURE_SPEC,
  NSMTS_TRACED,
  NSMTS_TRACED_PARCEL,
} from "../../../location/captureSpec";
import { generateId } from "../../importUtils";
import { styleForFeature } from "../render/style";
import { attachSnapTracker } from "./snapTracker";
import type { ConversionPreview } from "./ConversionPreviewLayer";
import type { ParcelSnapStatus } from "./ParcelSnapTargetsLayer";
import type { UserVectorLayerRecord } from "../types";

/** Which geometry a drawn or dragged vertex may pull to. */
export type VectorSnapTargets = {
  enabled: boolean;
  myFeatures: boolean;
  parcels: boolean;
};

type EditableVectorLayerProps = {
  record: UserVectorLayerRecord;
  data: FeatureCollection;
  snap: VectorSnapTargets;
  onGeometryChange: (collection: FeatureCollection) => void;
  onSelectFeature: (featureId: string | null) => void;
};

/** What App hands MapCanvas to put one layer into edit mode. */
export type VectorEditBinding = EditableVectorLayerProps & {
  /** Geoman mode the toolbar has selected, or null for plain selection. */
  mode: string | null;
  /** Where the parcel snap-target layer reports its distinct states. */
  onParcelSnapStatus: (status: ParcelSnapStatus) => void;
  /** Connect-the-dots preview while the convert dialog is open. */
  conversionPreview: ConversionPreview | null;
};

/**
 * The contract's snap options, passed wherever Geoman takes them. snapMiddle
 * stays off: segment midpoints would compete with parcel corners during
 * tracing. Vertex-over-edge priority is Geoman's own snapVertex rule — the
 * behavior the parity fixture pins as "vertex-first".
 */
function snapOptions(snappable: boolean): {
  snappable: boolean;
  snapDistance: number;
  snapSegment: boolean;
  snapVertex: boolean;
  snapMiddle: boolean;
} {
  return {
    snappable,
    snapDistance: FIELD_CAPTURE_SPEC.snap.toleranceScreenUnits,
    snapSegment: true,
    snapVertex: true,
    snapMiddle: false,
  };
}

const POINT_RADIUS = 6;

/**
 * Leaflet rounds every coordinate to six decimals on its way out of
 * `toGeoJSON`, so a draft that has never been through a publish — an imported
 * layer, at session start — differs from its own live layer in the seventh
 * decimal and nowhere else. Rounding both sides is what stops that difference
 * reading as an edit somebody made.
 */
function roundedCoordinates(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(roundedCoordinates);
  }
  return typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value;
}

/**
 * Rings as Leaflet will hand them back. A Polygon's `toGeoJSON` always closes
 * its rings, and an imported ring is not required to arrive closed — comparing
 * an unclosed draft ring against a closed live one would report a difference
 * on every commit and rebuild the handles each time for nothing.
 */
function closedRings(value: unknown, depth: number): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  if (depth > 0) {
    return value.map((child) => closedRings(child, depth - 1));
  }
  const ring = value as number[][];
  const last = ring[ring.length - 1];
  if (
    ring.length >= 2 &&
    Array.isArray(ring[0]) &&
    Array.isArray(last) &&
    (ring[0][0] !== last[0] || ring[0][1] !== last[1])
  ) {
    return [...ring, ring[0]];
  }
  return ring;
}

/**
 * The app's one map is created at page load, long before this lazy chunk
 * evaluates — and Geoman attaches `pm` only through a Map init hook, which
 * touches maps created AFTER its module runs. Without this, every `map.pm`
 * call in the session reads undefined and crashes the map (it did, on
 * production, until this function). `new L.PM.Map(map)` is exactly what
 * Geoman's own init hook runs for a non-opted-out map.
 */
function ensureGeomanMap(map: L.Map): void {
  if (!map.pm) {
    // The constructor is real but undeclared: Geoman's d.ts types `map.pm`
    // as always-present PMMap (true only for post-load maps) and does not
    // type `L.PM.Map` as constructable.
    map.pm = new (L.PM as unknown as {
      Map: new (mapInstance: L.Map) => L.PM.PMMap;
    }).Map(map);
  }
}

/**
 * The layer under edit, drawn imperatively rather than through react-leaflet's
 * `<GeoJSON>`.
 *
 * react-leaflet's GeoJSON never re-reads `data`, so the read-only list
 * remounts it on every revision — which is exactly wrong while editing:
 * remounting mid-drag would destroy the very layer Geoman has vertex handles
 * attached to. This component therefore owns one `L.geoJSON` for the whole
 * session, lets Geoman mutate it in place, and reports the result outward.
 *
 * The renderer is SVG here, unlike every read-only layer, and that is
 * deliberate. A browser spike showed Geoman attaching, enabling and dragging
 * vertices on a canvas-rendered layer perfectly well — its handles are DOM
 * markers in `markerPane`, independent of whatever draws the shape — but
 * teardown is a different story: `Edit.Line.disable()` reads
 * `layer._path ? layer._path : layer._renderer._container`, and when the map
 * is being destroyed the renderer is already gone, so the canvas branch
 * throws on a layer that is still in edit mode. Under SVG `_path` stays
 * truthy and that branch is never reached. Only one layer is ever in edit
 * mode, so the SVG node count this trades for is bounded; the unbounded case
 * — every imported layer at once — stays on canvas in `UserVectorLayers`.
 */
export function EditableVectorLayer({
  record,
  data,
  snap,
  mode = null,
  onGeometryChange,
  onSelectFeature,
}: EditableVectorLayerProps & { mode?: string | null }) {
  const map = useMap();
  // Callbacks change identity every render; the effect below must not tear
  // the Geoman session down when they do.
  const changeRef = useRef(onGeometryChange);
  const selectRef = useRef(onSelectFeature);
  const styleRef = useRef(record.style);
  useEffect(() => {
    changeRef.current = onGeometryChange;
    selectRef.current = onSelectFeature;
    styleRef.current = record.style;
  }, [onGeometryChange, onSelectFeature, record.style]);

  // Seeded once per session on purpose: `data` changes on every edit (the
  // session hook advances its draft), and re-seeding from it would fight
  // Geoman for ownership of the geometry mid-gesture.
  const seedRef = useRef(data);
  const groupRef = useRef<L.GeoJSON | null>(null);
  // Set by the session effect: turns a draft feature with no live layer into
  // an adopted group child, with the session's pane/renderer/style.
  const materializeRef = useRef<((feature: Feature) => void) | null>(null);

  useEffect(() => {
    ensureGeomanMap(map);

    if (!map.getPane(USER_VECTOR_PANE)) {
      const pane = map.createPane(USER_VECTOR_PANE);
      pane.style.zIndex = String(USER_VECTOR_PANE_Z_INDEX);
    }
    const renderer = L.svg({ pane: USER_VECTOR_PANE });

    const group = L.geoJSON(seedRef.current, {
      pane: USER_VECTOR_PANE,
      style: (feature) => ({
        ...styleForFeature(feature!, styleRef.current),
        renderer,
      }),
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: POINT_RADIUS,
          pane: USER_VECTOR_PANE,
          renderer,
        }),
    }).addTo(map);

    /**
     * Ids survive the round trip because editing, export, and the details
     * form all key off them. Leaflet's `toGeoJSON` copies `layer.feature`,
     * so an id assigned here rides along; a shape Geoman just drew has no
     * feature at all until one is attached.
     */
    const collect = (): FeatureCollection => {
      const features: Feature[] = [];
      group.eachLayer((layer) => {
        const asGeo = layer as L.Layer & { toGeoJSON?: () => Feature };
        if (typeof asGeo.toGeoJSON !== "function") {
          return;
        }
        const feature = asGeo.toGeoJSON();
        if (feature?.type === "Feature") {
          features.push(feature);
        }
      });
      return { type: "FeatureCollection", features };
    };

    const publish = () => changeRef.current(collect());

    const tracker = attachSnapTracker(map);

    const adopt = (layer: L.Layer) => {
      const target = layer as L.Layer & { feature?: Feature };
      target.feature ??= {
        type: "Feature",
        geometry: null as unknown as Feature["geometry"],
        properties: {},
      };
      target.feature.id ??= generateId();
      target.feature.properties ??= {};
      // The session's opt-in marker; see setOptIn below. Geoman stamps its
      // own drawn shapes with pmIgnore: false, this covers the seeded ones.
      (layer.options as { pmIgnore?: boolean }).pmIgnore = false;
      tracker.watch(layer);
      layer.on("click", () => {
        selectRef.current(String((layer as { feature?: Feature }).feature?.id ?? ""));
      });
    };

    group.eachLayer(adopt);
    groupRef.current = group;
    materializeRef.current = (feature) => {
      // Same construction path as the seed, so an added feature is
      // indistinguishable from one that was there at session start.
      const addition = L.geoJSON(feature, {
        pane: USER_VECTOR_PANE,
        style: (added) => ({
          ...styleForFeature(added!, styleRef.current),
          renderer,
        }),
        pointToLayer: (_added, latlng) =>
          L.circleMarker(latlng, {
            radius: POINT_RADIUS,
            pane: USER_VECTOR_PANE,
            renderer,
          }),
      });
      addition.eachLayer((child) => {
        adopt(child);
        group.addLayer(child);
      });
    };

    // Geoman's global edit/drag/removal modes enumerate EVERY qualifying
    // layer on the map — official evidence markers (well logs, abandoned
    // mines, tax-sale points) included, so "Delete" could remove a well-log
    // marker and drag could move official geometry. findLayers re-reads
    // L.PM.optIn on every call, so flipping it for the session's lifetime
    // scopes all three modes to layers that opted in (pmIgnore: false): this
    // group's, plus anything Geoman itself draws.
    L.PM.setOptIn(true);

    const handleCreate = (event: { layer: L.Layer }) => {
      // Geoman adds the drawn shape to the map, not to our group; moving it
      // over is what puts it under the same style, pane, and serializer as
      // everything else in the layer.
      map.removeLayer(event.layer);
      adopt(event.layer);
      const feature = (event.layer as L.Layer & { feature?: Feature }).feature;
      if (feature?.properties) {
        // Stamped HERE and only here, per the field-capture contract: adopt()
        // also runs for every seeded child at session mount, and stamping
        // there would fabricate identical timestamps onto imported features.
        feature.properties["nsmts:createdAt"] ??= new Date().toISOString();
        // The working layer Geoman drew with is not this created layer, so a
        // parcel snap during drawing arrives as the tracker's one-shot flag.
        if (tracker.consumeDrawSnap()) {
          feature.properties[NSMTS_TRACED] = NSMTS_TRACED_PARCEL;
        }
      }
      group.addLayer(event.layer);
      publish();
    };
    const handleRemove = (event: { layer: L.Layer }) => {
      group.removeLayer(event.layer);
      publish();
    };

    map.on("pm:create", handleCreate);
    map.on("pm:remove", handleRemove);
    // On the GROUP, not the map: Geoman fires pm:edit, pm:dragend, and
    // pm:markerdragend on the edited layer and propagates them only to its
    // parent LayerGroups (getAllParentGroups) — the map never hears them.
    // Listened on the map, reshape and move worked on screen but were never
    // published, so closing the session silently reverted them. pm:create
    // (fired with the map) and pm:remove (fired on both) stay on the map.
    group.on("pm:edit", publish);
    group.on("pm:dragend", publish);
    group.on("pm:markerdragend", publish);

    // Geoman's own toolbar stays off: the app supplies its own controls so
    // they match the rest of the UI and keep 44px touch targets.
    map.pm.addControls?.({ position: "topleft", drawMarker: false });
    map.pm.removeControls?.();
    group.eachLayer((layer) => {
      (layer as L.Layer & { pm?: { enable?: (opts?: unknown) => void } }).pm?.enable?.({
        allowSelfIntersection: false,
      });
    });

    return () => {
      map.off("pm:create", handleCreate);
      map.off("pm:remove", handleRemove);
      group.off("pm:edit", publish);
      group.off("pm:dragend", publish);
      group.off("pm:markerdragend", publish);
      tracker.detach();
      materializeRef.current = null;
      groupRef.current = null;
      L.PM.setOptIn(false);
      map.pm.disableDraw?.();
      map.pm.disableGlobalEditMode?.();
      map.pm.disableGlobalRemovalMode?.();
      map.pm.disableGlobalDragMode?.();
      group.eachLayer((layer) => {
        (layer as L.Layer & { pm?: { disable?: () => void } }).pm?.disable?.();
      });
      // Removing the group is what stops the features being drawn twice once
      // the read-only list takes the layer back.
      map.removeLayer(group);
    };
  }, [map]);

  /**
   * Reconcile the live group with the session's draft — membership and
   * properties ONLY, never geometry, which stays Geoman-owned (re-seeding
   * shapes from `data` would fight Geoman mid-gesture; see seedRef above).
   *
   * This closes the second writer's path: the details panel deletes features
   * and edits name/description on `draftData`, but `collect()` rebuilds the
   * published collection from the group's layers and each layer's own
   * `feature`. Unreconciled, the next Geoman gesture resurrected every
   * panel-deleted feature and reverted every panel-edited property.
   */
  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const draftById = new Map(
      data.features
        .filter((feature) => feature.id !== undefined)
        .map((feature) => [String(feature.id), feature]),
    );
    const removed: L.Layer[] = [];
    const liveIds = new Set<string>();
    group.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: Feature }).feature;
      if (!feature || feature.id === undefined) {
        return;
      }
      liveIds.add(String(feature.id));
      const draft = draftById.get(String(feature.id));
      if (!draft) {
        removed.push(layer);
        return;
      }
      // Copied, not aliased: collect() re-publishes `feature.properties`, and
      // sharing the draft's object would let a later panel edit mutate a
      // collection the session already published.
      if (draft.properties !== feature.properties) {
        feature.properties = { ...(draft.properties ?? {}) };
      }
      // The first deliberate geometry exception: moveFeaturePoint ("use
      // photo's location", and the panel's corner mover on a Point)
      // repositions a Point in the draft, and the live circle marker must
      // follow. Safe outside an active gesture — a point has no vertex
      // handles mid-drag to fight with.
      if (
        draft.geometry?.type === "Point" &&
        layer instanceof L.CircleMarker
      ) {
        const [lng, lat] = draft.geometry.coordinates;
        const current = layer.getLatLng();
        if (current.lat !== lat || current.lng !== lng) {
          layer.setLatLng([lat, lng]);
          if (feature.geometry?.type === "Point") {
            feature.geometry = { type: "Point", coordinates: [lng, lat] };
          }
        }
      }
      // The second: the corner mover writes a line or area vertex into the
      // draft, and collect() rebuilds the published collection from the live
      // layers — so a corner the live layer never heard about would be
      // published back out of existence by the next Geoman gesture, the same
      // way panel-edited names were before this reconciliation existed. A
      // press in the panel cannot arrive mid-drag, so there is no gesture to
      // fight; the handles are then rebuilt the way Geoman rebuilds them for
      // itself when a layer's geometry changes underneath it, with the
      // layer's own current options handed back so whatever mode is armed
      // survives the rebuild.
      const draftGeometry = draft.geometry;
      if (
        layer instanceof L.Polyline &&
        (draftGeometry?.type === "LineString" ||
          draftGeometry?.type === "MultiLineString" ||
          draftGeometry?.type === "Polygon" ||
          draftGeometry?.type === "MultiPolygon")
      ) {
        const areal =
          draftGeometry.type === "Polygon" ||
          draftGeometry.type === "MultiPolygon";
        const depth =
          draftGeometry.type === "LineString"
            ? 0
            : draftGeometry.type === "MultiPolygon"
              ? 2
              : 1;
        const live = (layer.toGeoJSON() as Feature).geometry;
        const settled =
          live.type === draftGeometry.type &&
          JSON.stringify((live as { coordinates?: unknown }).coordinates) ===
            JSON.stringify(
              roundedCoordinates(
                areal
                  ? closedRings(draftGeometry.coordinates, depth)
                  : draftGeometry.coordinates,
              ),
            );
        if (!settled) {
          const pm = (
            layer as L.Layer & {
              pm?: {
                enable?: (options?: unknown) => void;
                enabled?: () => boolean;
                getOptions?: () => unknown;
              };
            }
          ).pm;
          // Read before the write: `enable()` is what builds the vertex and
          // middle markers, so calling it on a layer that was not already
          // editing would put handles on a shape whose only reason to have
          // them is that the panel touched it. The session enables every
          // seeded feature, so in practice this is true — but a layer
          // materialized later is not, and re-enabling is for rebuilding
          // handles that exist, not for granting them.
          const wasEditing = pm?.enabled?.() ?? false;
          layer.setLatLngs(
            L.GeoJSON.coordsToLatLngs(
              draftGeometry.coordinates as never,
              depth,
            ),
          );
          if (wasEditing) {
            pm?.enable?.(pm.getOptions?.());
          }
        }
      }
    });
    for (const layer of removed) {
      (layer as L.Layer & { pm?: { disable?: () => void } }).pm?.disable?.();
      group.removeLayer(layer);
    }
    // The third writer's path: features the SESSION added to the draft —
    // points-to-path output, an undone conversion's restored points, a GPS
    // mark placed mid-session — have no live layer yet, and collect()
    // rebuilds from the group, so without materializing them here the next
    // Geoman gesture would silently publish them out of existence.
    for (const [id, draft] of draftById) {
      if (!liveIds.has(id) && draft.geometry) {
        materializeRef.current?.(draft);
      }
    }
  }, [data]);

  /**
   * The toolbar's selection drives Geoman's global modes. Separate from the
   * session effect above so switching tools never tears down the layer the
   * user is drawing into.
   */
  useEffect(() => {
    const pm = map.pm;
    if (!pm) {
      return;
    }
    pm.disableDraw?.();
    pm.disableGlobalEditMode?.();
    pm.disableGlobalRemovalMode?.();
    pm.disableGlobalDragMode?.();
    // Only the master toggle re-arms the tool. Target changes (my features,
    // parcels) mount/unmount their layers, and Geoman rebuilds its snap list
    // from the map's layeradd/layerremove events on its own.
    const snapping = snapOptions(snap.enabled);
    if (mode === "edit") {
      pm.enableGlobalEditMode?.({ allowSelfIntersection: false, ...snapping });
    } else if (mode === "drag") {
      pm.enableGlobalDragMode?.();
    } else if (mode === "remove") {
      pm.enableGlobalRemovalMode?.();
    } else if (mode) {
      pm.enableDraw?.(mode, { ...snapping, continueDrawing: true });
    }
    // A primitive dep on purpose: App builds the snap object per render, and
    // an object dep would disable/re-enable the active tool on every render.
  }, [map, mode, snap.enabled]);

  return null;
}
