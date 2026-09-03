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
import { prefersReducedMotion } from "../../components/mapMotion";
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
    map.setView(latLngFromPixel(focus.pixel), Math.max(map.getZoom(), 1), {
      animate: !prefersReducedMotion(),
    });
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
  onDragEndGcp,
  onMoveGcp,
}: {
  gcp: Gcp;
  label: string;
  selected: boolean;
  pixelSize: PixelSize;
  onDragStartGcp: (id: string) => void;
  onDragEndGcp: (id: string) => void;
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
      // Leaflet's REAL dragend, not a debounce: a drag released without a
      // final pointer move would otherwise never restore the fine mesh.
      // Note the two handlers share a signature, so swapping them here
      // typechecks and lints clean — `ScanPane.realMount.test.tsx` drives a
      // genuine Draggable to a real mouseup to pin which is which.
      dragend: () => onDragEndGcp(gcp.id),
      drag: (event: L.LeafletEvent) => {
        const { x, y } = clampToRaster(
          pixelFromLatLng((event.target as L.Marker).getLatLng()),
          pixelSize,
        );
        onMoveGcp(gcp.id, x, y);
      },
    }),
    [gcp.id, onDragEndGcp, onDragStartGcp, onMoveGcp, pixelSize],
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
  onDragEndGcp,
  onMoveGcp,
  selectedGcpId,
  tabPanel,
}: {
  previewUrl: string;
  pixelSize: PixelSize;
  gcps: Gcp[];
  pending: PendingPoint;
  focus: ScanFocusRequest | null;
  onPickPoint: (x: number, y: number) => void;
  onDragStartGcp: (id: string) => void;
  /** Required, not optional: a pane that silently forgot to end a drag would
   * leave the TPS drape coarse forever, and `tsc -b` is the only thing that
   * can make every call site say which handler it means. */
  onDragEndGcp: (id: string) => void;
  onMoveGcp: (id: string, x: number, y: number) => void;
  selectedGcpId: string | null;
  /**
   * Identity for the `role="tab"` button that reveals this pane, when a
   * caller renders one. Handed DOWN rather than applied by that caller,
   * because `.georeference-scan` is a direct grid child of
   * `.georeference-panel` (styles.css sets explicit
   * `grid-template-columns`/`rows`) and a wrapper div to hold the role would
   * insert an extra grid item.
   *
   * One optional OBJECT, not two optional strings, so `tsc` enforces that the
   * id and its label arrive together. Optional because the pane is not
   * inherently a tab panel: the tabs exist only below the two-pane
   * breakpoint, and the pane's own tests mount it with no tablist at all.
   */
  tabPanel?: { id: string; labelledBy: string };
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
    <div
      className="georeference-scan"
      data-testid="georeference-scan"
      id={tabPanel?.id}
      role={tabPanel ? "tabpanel" : undefined}
      aria-labelledby={tabPanel?.labelledBy}
    >
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
            onDragEndGcp={onDragEndGcp}
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
