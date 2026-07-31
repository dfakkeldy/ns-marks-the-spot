import { useEffect, useMemo } from "react";
import L from "leaflet";
import { GeoJSON, useMap } from "react-leaflet";
import {
  USER_VECTOR_PANE,
  USER_VECTOR_PANE_Z_INDEX,
} from "../../../components/mapPanes";
import { buildFeaturePopup } from "../render/popup";
import { styleForFeature } from "../render/style";
import type { UserVectorLayerRecord } from "../types";
import type {
  UserVectorFitRequest,
  VisibleUserVectorLayer,
} from "../useUserVectorLayers";

type UserVectorLayersProps = {
  layers: VisibleUserVectorLayer[];
  fitRequest?: UserVectorFitRequest | null;
};

const POINT_RADIUS = 6;
const FIT_MAX_ZOOM = 16;

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Renders every enabled "Your data" layer as one react-leaflet <GeoJSON> in
 * the user-vector pane. All geometry shares ONE canvas renderer: user files
 * are unbounded, and thousands of SVG paths are thousands of DOM nodes —
 * jank on the phones this map targets — while a canvas stays a single
 * element. Points go through pointToLayer as circle markers for the same
 * reason: default icon markers would land in Leaflet's markerPane (z 600),
 * escaping this pane's z-contract entirely.
 */
export function UserVectorLayers({
  layers,
  fitRequest = null,
}: UserVectorLayersProps) {
  const map = useMap();

  // Pane before renderer: L.canvas({ pane }) looks the pane up when Leaflet
  // first adds it to the map, so it must exist before the first <GeoJSON>
  // mounts — which is why this component creates it itself instead of
  // relying on a <Pane> wrapper at the call site.
  const renderer = useMemo(() => {
    if (!map.getPane(USER_VECTOR_PANE)) {
      const pane = map.createPane(USER_VECTOR_PANE);
      pane.style.zIndex = String(USER_VECTOR_PANE_Z_INDEX);
    }
    return L.canvas({ pane: USER_VECTOR_PANE });
  }, [map]);

  useEffect(() => {
    if (!fitRequest) {
      return;
    }
    const target = layers.find((layer) => layer.record.id === fitRequest.layerId);
    const bbox = target?.record.bbox;
    if (!bbox) {
      return;
    }
    const [west, south, east, north] = bbox;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [48, 48], maxZoom: FIT_MAX_ZOOM },
    );
    // `layers` is deliberately absent from the deps: a fit fires once per
    // request revision, not again when an unrelated layer toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest, map]);

  return (
    <>
      {layers.map(({ record, data }) => (
        <GeoJSON
          // react-leaflet's GeoJSON never re-reads `data`; the revision in
          // the key remounts the layer when edits (phase 4) bump it.
          key={`${record.id}:${record.revision}`}
          data={data}
          pane={USER_VECTOR_PANE}
          // The canvas renderer rides in PathOptions (react-leaflet's GeoJSON
          // props don't declare a renderer prop): L.GeoJSON.addData applies
          // the style before the child layer is added, so beforeAdd sees it.
          style={(feature) => ({
            ...styleForFeature(feature!, record.style),
            renderer,
          })}
          pointToLayer={(_feature, latlng) =>
            L.circleMarker(latlng, {
              radius: POINT_RADIUS,
              pane: USER_VECTOR_PANE,
              renderer,
            })
          }
          onEachFeature={(feature, featureLayer) =>
            bindFeatureUi(feature, featureLayer, record)
          }
        />
      ))}
    </>
  );
}

function bindFeatureUi(
  feature: GeoJSON.Feature,
  featureLayer: L.Layer,
  record: UserVectorLayerRecord,
): void {
  // Built lazily so a 10k-feature import doesn't create 10k popup DOM trees
  // up front; textContent-only construction lives in buildFeaturePopup.
  featureLayer.bindPopup(() => buildFeaturePopup(feature, record));
  const name = asText(
    feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>).name
      : null,
  );
  if (name) {
    featureLayer.bindTooltip(name, { sticky: true });
  }
}
