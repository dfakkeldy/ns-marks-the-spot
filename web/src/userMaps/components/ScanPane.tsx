import { useCallback, useEffect, useMemo } from "react";
import L from "leaflet";
import {
  ImageOverlay,
  MapContainer,
  Marker,
  useMap,
  useMapEvent,
} from "react-leaflet";
import type { PixelSize } from "../transform/projection";
import type { PendingPoint } from "../useGeoreferenceSession";
import type { Gcp } from "../types";
import { numberedIcon } from "./gcpIcon";
import {
  clampToRaster,
  latLngFromPixel,
  pixelFromLatLng,
  scanBounds,
} from "./scanGeometry";

/**
 * A request to recentre the scan on one point. Carries a monotonic
 * `requestId` so asking for the SAME point twice still moves the map — the
 * effect below keys on the object, and a plain pixel would be `===` equal the
 * second time and do nothing.
 */
export type ScanFocusRequest = {
  pixel: { x: number; y: number };
  requestId: number;
};

function ScanClickCatcher({
  pixelSize,
  onPickPoint,
}: {
  pixelSize: PixelSize;
  onPickPoint: (x: number, y: number) => void;
}) {
  const handleClick = useCallback(
    (event: L.LeafletMouseEvent) => {
      // Clamped, not trusted: maxBounds constrains the view, not the click,
      // and minZoom={-4} leaves letterboxed map outside the image.
      const { x, y } = clampToRaster(pixelFromLatLng(event.latlng), pixelSize);
      onPickPoint(x, y);
    },
    [onPickPoint, pixelSize],
  );
  // useMapEvent, NOT useMapEvents: react-leaflet keys useMapEvents' effect on
  // the handlers OBJECT (deps `[map, handlers]`), so an inline literal calls
  // map.off()/map.on() on every render — once per pointer move during a drag.
  // A useCallback'd handler with useMapEvent subscribes once.
  useMapEvent("click", handleClick);
  return null;
}

/** Recentres the scan when the GCP list asks to zoom to a point. */
function ScanFocusController({ focus }: { focus: ScanFocusRequest | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) {
      return;
    }
    // Zoom in only if the user is further out than 1 (roughly "pixels are
    // visible"); never zoom them back OUT of a closer inspection.
    map.setView(latLngFromPixel(focus.pixel), Math.max(map.getZoom(), 1));
  }, [focus, map]);
  return null;
}

/**
 * One draggable control point, as its own component so the icon and the
 * handler object can be memoised PER POINT. Inline `icon={numberedIcon(…)}`
 * mints a fresh `L.DivIcon` every render, and react-leaflet answers that with
 * `marker.setIcon()`; an inline `eventHandlers` object literal re-runs
 * `off()`/`on()` for the same reason (its effect deps are
 * `[element, eventHandlers]`). Both fire once per pointer move of a drag.
 */
function ScanGcpMarker({
  gcp,
  label,
  selected,
  pixelSize,
  onDragStartGcp,
  onMoveGcp,
}: {
  gcp: Gcp;
  label: string;
  selected: boolean;
  pixelSize: PixelSize;
  onDragStartGcp: (id: string) => void;
  onMoveGcp: (id: string, x: number, y: number) => void;
}) {
  const icon = useMemo(
    () => numberedIcon(label, { selected }),
    [label, selected],
  );
  const position = useMemo(() => latLngFromPixel(gcp.pixel), [gcp.pixel]);
  const eventHandlers = useMemo(
    () => ({
      // dragstart is the ONLY scan-side entry into undo history. Without it
      // one Ctrl+Z walks back past the entire drag.
      dragstart: () => onDragStartGcp(gcp.id),
      drag: (event: L.LeafletEvent) => {
        const { x, y } = clampToRaster(
          pixelFromLatLng((event.target as L.Marker).getLatLng()),
          pixelSize,
        );
        onMoveGcp(gcp.id, x, y);
      },
    }),
    [gcp.id, onDragStartGcp, onMoveGcp, pixelSize],
  );
  return (
    <Marker
      position={position}
      draggable
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
}

/**
 * The scan side of the georeferencer. A second Leaflet map rather than a
 * hand-rolled pan/zoom surface: Leaflet is already bundled and already gives
 * pinch-zoom, draggable markers, and hit testing, none of which is worth
 * re-implementing.
 */
export function ScanPane({
  previewUrl,
  pixelSize,
  gcps,
  pending,
  focus,
  onPickPoint,
  onDragStartGcp,
  onMoveGcp,
  selectedGcpId,
}: {
  previewUrl: string;
  pixelSize: PixelSize;
  gcps: Gcp[];
  pending: PendingPoint;
  focus: ScanFocusRequest | null;
  onPickPoint: (x: number, y: number) => void;
  onDragStartGcp: (id: string) => void;
  onMoveGcp: (id: string, x: number, y: number) => void;
  selectedGcpId: string | null;
}) {
  // Memoised because `ImageOverlay` compares `bounds` by REFERENCE: a fresh
  // array every render calls setBounds()/_reset() on every pointer move of a
  // drag. `pixelSize` is a stable reference off the record.
  const bounds = useMemo(() => scanBounds(pixelSize), [pixelSize]);
  // Same reason as the per-marker memo: a fresh DivIcon means setIcon() on
  // every render. Computed unconditionally — hooks cannot be conditional —
  // and only mounted while a scan-side half-point is waiting.
  const pendingIcon = useMemo(
    () => numberedIcon(String(gcps.length + 1), { pending: true }),
    [gcps.length],
  );
  return (
    <div className="georeference-scan" data-testid="georeference-scan">
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        // Whole-image zoom levels only; the scan has no tile pyramid and
        // over-zooming a preview just shows interpolation.
        minZoom={-4}
        maxZoom={4}
        zoomSnap={0.25}
        attributionControl={false}
        className="georeference-scan-map"
      >
        <ImageOverlay url={previewUrl} bounds={bounds} />
        <ScanClickCatcher pixelSize={pixelSize} onPickPoint={onPickPoint} />
        <ScanFocusController focus={focus} />
        {gcps.map((gcp, index) => (
          <ScanGcpMarker
            key={gcp.id}
            gcp={gcp}
            label={String(index + 1)}
            selected={gcp.id === selectedGcpId}
            pixelSize={pixelSize}
            onDragStartGcp={onDragStartGcp}
            onMoveGcp={onMoveGcp}
          />
        ))}
        {pending?.side === "scan" ? (
          <Marker
            position={latLngFromPixel(pending.pixel)}
            icon={pendingIcon}
            interactive={false}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
