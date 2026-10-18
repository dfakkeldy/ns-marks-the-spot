import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { GeoJSON, useMap } from "react-leaflet";
import {
  USER_VECTOR_PANE,
  USER_VECTOR_PANE_Z_INDEX,
} from "../../../components/mapPanes";
import { prefersReducedMotion } from "../../../components/mapMotion";
import { textTooltip } from "../../../components/mapTooltip";
import { buildFeaturePopup, type PopupPhotoUi } from "../render/popup";
import { readPhotoDescriptors } from "../photos/types";
import { styleForFeature } from "../render/style";
import type { UserVectorLayerRecord } from "../types";
import type {
  UserVectorFitRequest,
  VisibleUserVectorLayer,
} from "../useUserVectorLayers";

type UserVectorLayersProps = {
  layers: VisibleUserVectorLayer[];
  fitRequest?: UserVectorFitRequest | null;
  /** Photo thumbnails in popups and the lightbox opener; optional. */
  photoUi?: PopupPhotoUi | null;
  /**
   * True while an edit session's "My features" snap target is armed: the
   * read-only layers then carry snapIgnore false so Geoman's snap list
   * includes them even under the session's L.PM.setOptIn(true). They never
   * get pmIgnore false, so global edit/drag/delete still cannot touch them.
   */
  snapAsTargets?: boolean;
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
  photoUi = null,
  snapAsTargets = false,
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

  /**
   * A fit must happen exactly once per request, but the request and the layer
   * it names do not necessarily arrive in the same commit — the import hook
   * publishes both from one batch, and React can render the request first.
   * Keying the effect on the request alone therefore missed the layer and
   * gave up permanently (every imported area layer left the map where it
   * was); keying it on `layers` alone would yank the map back every time an
   * unrelated layer toggled. So it watches both and remembers which revision
   * it has already honoured.
   */
  const handledFitRevisionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!fitRequest || handledFitRevisionRef.current === fitRequest.revision) {
      return;
    }
    const target = layers.find((layer) => layer.record.id === fitRequest.layerId);
    const bbox = target?.record.bbox;
    if (!bbox) {
      // The layer has not landed yet; stay armed for the next render.
      return;
    }
    handledFitRevisionRef.current = fitRequest.revision;
    const [west, south, east, north] = bbox;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      {
        padding: [48, 48],
        maxZoom: FIT_MAX_ZOOM,
        animate: !prefersReducedMotion(),
      },
    );
  }, [fitRequest, layers, map]);

  return (
    <>
      {layers.map(({ record, data }) => (
        <GeoJSON
          // react-leaflet's GeoJSON never re-reads `data`; the revision in
          // the key remounts the layer when edits (phase 4) bump it, and the
          // snap flag remounts it so children re-read their snapIgnore.
          key={`${record.id}:${record.revision}:${snapAsTargets ? "snap" : "nosnap"}`}
          data={data}
          pane={USER_VECTOR_PANE}
          // The canvas renderer rides in PathOptions (react-leaflet's GeoJSON
          // props don't declare a renderer prop): L.GeoJSON.addData applies
          // the style before the child layer is added, so beforeAdd sees it.
          // snapIgnore rides the same way, into each child's options.
          style={(feature) => ({
            ...styleForFeature(feature!, record.style),
            renderer,
            snapIgnore: !snapAsTargets,
          })}
          pointToLayer={(feature, latlng) =>
            L.circleMarker(
              latlng,
              readPhotoDescriptors(feature.properties).length > 0
                ? // Hollow ring: a point that carries photos reads
                  // differently at a glance, without a DOM icon that would
                  // escape this pane's z-contract.
                  ({
                    radius: POINT_RADIUS + 2,
                    weight: 3,
                    color: styleForFeature(feature, record.style).color,
                    fillColor: "#ffffff",
                    fillOpacity: 1,
                    pane: USER_VECTOR_PANE,
                    renderer,
                    snapIgnore: !snapAsTargets,
                  } as L.CircleMarkerOptions)
                : ({
                    radius: POINT_RADIUS,
                    pane: USER_VECTOR_PANE,
                    renderer,
                    snapIgnore: !snapAsTargets,
                  } as L.CircleMarkerOptions),
            )
          }
          onEachFeature={(feature, featureLayer) =>
            bindFeatureUi(feature, featureLayer, record, photoUi)
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
  photoUi: PopupPhotoUi | null,
): void {
  // Built lazily so a 10k-feature import doesn't create 10k popup DOM trees
  // up front; textContent-only construction lives in buildFeaturePopup.
  featureLayer.bindPopup(() =>
    buildFeaturePopup(feature, record, photoUi ?? undefined),
  );
  const name = asText(
    feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>).name
      : null,
  );
  const hasPhotos = readPhotoDescriptors(feature.properties).length > 0;
  if (name || hasPhotos) {
    // A DOM node, not the raw string: Leaflet assigns string tooltip content
    // with innerHTML, so a feature name from an imported file was live markup
    // — the one property-to-DOM path buildFeaturePopup's textContent-only
    // construction did not cover.
    featureLayer.bindTooltip(
      textTooltip(
        name ? (hasPhotos ? `${name} · photo` : name) : "photo",
      ),
      { sticky: true },
    );
  }
}
