import { useCallback, useEffect, useMemo } from "react";
import L from "leaflet";
import { Marker, useMap, useMapEvent } from "react-leaflet";
import {
  GEOREFERENCE_PANE,
  GEOREFERENCE_PANE_Z_INDEX,
} from "../../components/mapPanes";
import type { PendingPoint } from "../useGeoreferenceSession";
import type { Gcp } from "../types";
import { numberedIcon } from "./gcpIcon";
import type { DraftUserMap } from "./UserMapLayers";

/**
 * A request to recentre the live map on one GCP. Carries a monotonic
 * `requestId` so asking for the SAME point twice still moves the map — the
 * focus controller's effect keys on this object, and a plain lat/lng would be
 * `===`-equal the second time and do nothing.
 */
export type MapFocusRequest = { lat: number; lng: number; requestId: number };

/**
 * Everything the map side of the georeferencer needs from the session. No
 * selected-GCP id crosses here on purpose — see this file's header comment in
 * the task brief: the map markers already carry their number, which is how a
 * user matches a list row to a point, so threading selection through App
 * would buy a highlight nobody asked for at the cost of a third state owner.
 */
export type GeoreferenceBinding = {
  gcps: Gcp[];
  pending: PendingPoint;
  draft: DraftUserMap | null;
  focus: MapFocusRequest | null;
  onPickMapPoint: (lat: number, lng: number) => void;
  onDragStartGcp: (id: string) => void;
  onMoveGcpOnMap: (id: string, lat: number, lng: number) => void;
};

/** Idempotent: Leaflet keeps panes for the map's lifetime. */
function ensurePane(map: ReturnType<typeof useMap>): void {
  if (!map.getPane(GEOREFERENCE_PANE)) {
    const pane = map.createPane(GEOREFERENCE_PANE);
    pane.style.zIndex = String(GEOREFERENCE_PANE_Z_INDEX);
  }
}

/**
 * One draggable control point, as its own component so the icon and the
 * handler object can be memoised PER POINT. Inline `icon={numberedIcon(…)}`
 * mints a fresh `L.DivIcon` every render, and react-leaflet answers that with
 * `marker.setIcon()`; an inline `eventHandlers` object literal re-runs
 * `off()`/`on()` for the same reason (its effect deps are
 * `[element, eventHandlers]`). Both fire once per pointer move of a drag —
 * the hottest path in this feature.
 */
function GeoreferenceGcpMarker({
  gcp,
  label,
  onDragStartGcp,
  onMoveGcpOnMap,
}: {
  gcp: Gcp;
  label: string;
  onDragStartGcp: (id: string) => void;
  onMoveGcpOnMap: (id: string, lat: number, lng: number) => void;
}) {
  const icon = useMemo(() => numberedIcon(label), [label]);
  const position = useMemo<[number, number]>(
    () => [gcp.map.lat, gcp.map.lng],
    [gcp.map.lat, gcp.map.lng],
  );
  const eventHandlers = useMemo(
    () => ({
      // The ONLY map-side entry into undo history.
      dragstart: () => onDragStartGcp(gcp.id),
      drag: (event: L.LeafletEvent) => {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        onMoveGcpOnMap(gcp.id, lat, lng);
      },
    }),
    [gcp.id, onDragStartGcp, onMoveGcpOnMap],
  );
  return (
    <Marker
      position={position}
      draggable
      pane={GEOREFERENCE_PANE}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
}

function MapClickCatcher({
  onPickMapPoint,
}: {
  onPickMapPoint: (lat: number, lng: number) => void;
}) {
  const handleClick = useCallback(
    (event: L.LeafletMouseEvent) => {
      onPickMapPoint(event.latlng.lat, event.latlng.lng);
    },
    [onPickMapPoint],
  );
  // useMapEvent, NOT useMapEvents: useMapEvents' effect deps are
  // `[map, handlers]`, so an inline handlers object re-runs map.off()/on()
  // on every render — once per pointer move during a GCP drag.
  useMapEvent("click", handleClick);
  return null;
}

/** Recentres the live map when the GCP list asks to zoom to a point. */
function MapFocusController({ focus }: { focus: MapFocusRequest | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) {
      return;
    }
    // requestId makes a repeat request a new object, so asking twice for the
    // same point still moves the map. Zoom in only; never pull the user back
    // out of a closer look.
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 15));
  }, [focus, map]);
  return null;
}

/**
 * The map side of the georeferencer: numbered draggable GCP markers on the
 * app's own live map, a click catcher that turns a tap into a picked point,
 * and a focus controller the panel's zoom-to control can reach. The live
 * warped draft itself is rendered by `UserMapLayers` (via `MapCanvas`'s
 * `draft` prop) — this component owns only the markers and the interaction,
 * not the raster.
 */
export function GeoreferenceMapLayer({
  binding,
}: {
  binding: GeoreferenceBinding;
}) {
  const map = useMap();
  useEffect(() => {
    ensurePane(map);
  }, [map]);

  const pendingIcon = useMemo(
    () => numberedIcon(String(binding.gcps.length + 1), { pending: true }),
    [binding.gcps.length],
  );

  return (
    <>
      <MapClickCatcher onPickMapPoint={binding.onPickMapPoint} />
      <MapFocusController focus={binding.focus} />
      {binding.gcps.map((gcp, index) => (
        <GeoreferenceGcpMarker
          key={gcp.id}
          gcp={gcp}
          label={String(index + 1)}
          onDragStartGcp={binding.onDragStartGcp}
          onMoveGcpOnMap={binding.onMoveGcpOnMap}
        />
      ))}
      {binding.pending?.side === "map" ? (
        <Marker
          position={[binding.pending.map.lat, binding.pending.map.lng]}
          pane={GEOREFERENCE_PANE}
          icon={pendingIcon}
          interactive={false}
        />
      ) : null}
    </>
  );
}
