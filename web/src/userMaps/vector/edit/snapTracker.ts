import L from "leaflet";
import {
  NSMTS_TRACED,
  NSMTS_TRACED_PARCEL,
} from "../../../location/captureSpec";

/**
 * Watches Geoman's snap events for two jobs the contract pins:
 *
 * 1. The indicator — one non-interactive marker at the candidate point,
 *    square for a vertex hit, round for an edge hit, cleared on unsnap and
 *    at gesture end.
 * 2. nsmts:traced stamping, at snap-EVENT time. Coordinate-equality
 *    reconciliation is forbidden here: Leaflet's toGeoJSON rounds to six
 *    decimals, so full-precision comparisons never match. A layer that ever
 *    snapped to a parcel source keeps the stamp even if the vertex is later
 *    dragged away — conservative over-labeling is acceptable, silent
 *    under-labeling is not.
 *
 * Edit-mode children carry their `feature` already, so the stamp is written
 * straight into feature.properties when the snap fires. A draw-mode working
 * layer is NOT the layer pm:create later hands over, so draw snaps set a
 * flag the pm:create handler consumes for the created feature.
 */

type SnapEvent = {
  snapLatLng?: L.LatLngLiteral;
  segment?: [L.LatLngLiteral, L.LatLngLiteral];
  layerInteractedWith?: L.Layer & {
    options?: { nsmtsSnapSource?: string };
  };
};

export type SnapTracker = {
  /** Attach snap listeners to an edit-mode child (called from adopt()). */
  watch: (layer: L.Layer) => void;
  /** True once, when the shape being drawn snapped to a parcel source. */
  consumeDrawSnap: () => boolean;
  detach: () => void;
};

function isParcelSource(event: SnapEvent): boolean {
  return event.layerInteractedWith?.options?.nsmtsSnapSource === NSMTS_TRACED_PARCEL;
}

function sameLatLng(a: L.LatLngLiteral, b: L.LatLngLiteral): boolean {
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
}

function indicatorIcon(vertexHit: boolean): L.DivIcon {
  return L.divIcon({
    className: "snap-indicator-anchor",
    html: `<div class="snap-indicator${vertexHit ? " snap-indicator-vertex" : ""}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function attachSnapTracker(map: L.Map): SnapTracker {
  let indicator: L.Marker | null = null;
  let drawSnapped = false;
  const watched = new Set<L.Layer>();

  const hideIndicator = () => {
    if (indicator) {
      map.removeLayer(indicator);
      indicator = null;
    }
  };

  const showIndicator = (event: SnapEvent) => {
    if (!event.snapLatLng) {
      return;
    }
    // A snap that landed on a segment endpoint is a vertex hit — Geoman's
    // vertex-priority rule chose a corner over the edge projection.
    const vertexHit =
      !!event.segment &&
      (sameLatLng(event.snapLatLng, event.segment[0]) ||
        sameLatLng(event.snapLatLng, event.segment[1]));
    hideIndicator();
    indicator = L.marker(event.snapLatLng, {
      icon: indicatorIcon(vertexHit),
      interactive: false,
      keyboard: false,
      pane: "markerPane",
    }).addTo(map);
  };

  const stamp = (layer: L.Layer) => {
    const target = layer as L.Layer & {
      feature?: { properties?: Record<string, unknown> | null };
    };
    if (target.feature) {
      // Copy-on-write of the WHOLE feature: Leaflet aliases layer.feature to
      // the seed collection's feature object, so writing into it (or even
      // reassigning its .properties field) would silently edit the session
      // draft and the store-loaded geometry behind React's back. A fresh
      // feature on the layer leaves every published collection untouched
      // until the next publish picks this one up.
      target.feature = {
        ...target.feature,
        properties: {
          ...(target.feature.properties ?? {}),
          [NSMTS_TRACED]: NSMTS_TRACED_PARCEL,
        },
      };
    }
  };

  const makeSnapHandler = (layer: L.Layer | null) => (raw: unknown) => {
    const event = raw as SnapEvent;
    showIndicator(event);
    if (!isParcelSource(event)) {
      return;
    }
    if (layer) {
      stamp(layer);
    } else {
      drawSnapped = true;
    }
  };

  const handleUnsnap = () => hideIndicator();

  const handleDrawStart = (raw: unknown) => {
    const { workingLayer } = raw as { workingLayer?: L.Layer };
    if (!workingLayer) {
      return;
    }
    workingLayer.on("pm:snap", makeSnapHandler(null));
    workingLayer.on("pm:unsnap", handleUnsnap);
  };
  const handleDrawEnd = () => hideIndicator();

  map.on("pm:drawstart", handleDrawStart);
  map.on("pm:drawend", handleDrawEnd);

  return {
    watch: (layer) => {
      if (watched.has(layer)) {
        return;
      }
      watched.add(layer);
      layer.on("pm:snap", makeSnapHandler(layer));
      layer.on("pm:unsnap", handleUnsnap);
      layer.on("pm:markerdragend", handleUnsnap);
      layer.on("pm:dragend", handleUnsnap);
    },
    consumeDrawSnap: () => {
      const wasSnapped = drawSnapped;
      drawSnapped = false;
      return wasSnapped;
    },
    detach: () => {
      hideIndicator();
      map.off("pm:drawstart", handleDrawStart);
      map.off("pm:drawend", handleDrawEnd);
      // Watched layers belong to the edit group, which the session removes
      // wholesale; clearing listeners layer-by-layer would outlive no one.
      watched.clear();
    },
  };
}
