import L from "leaflet";
import { useEffect, useState } from "react";
import {
  CircleMarker,
  Pane,
  Polygon,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  formatArea,
  formatDistance,
  pathDistanceMetres,
  polygonAreaSquareMetres,
  type GeoPoint,
} from "../services/geodesy";
import { MEASURE_PANE, MEASURE_PANE_Z_INDEX } from "./mapPanes";

export type MeasureMode = "off" | "distance" | "area";

type ActiveMeasureMode = Exclude<MeasureMode, "off">;

const MIN_FINISH_POINTS: Record<ActiveMeasureMode, number> = {
  distance: 2,
  area: 3,
};

const SHAPE_STYLE = {
  color: "#d97706",
  weight: 2,
  dashArray: "6 4",
  fillOpacity: 0.12,
};

const VERTEX_STYLE = {
  color: "#d97706",
  weight: 2,
  fillColor: "#ffffff",
  fillOpacity: 1,
};

export function MeasureTool({
  mode,
  onModeChange,
  driveway = false,
}: {
  driveway?: boolean;
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
}) {
  const toggle = (next: ActiveMeasureMode) =>
    onModeChange(mode === next ? "off" : next);

  return (
    <>
      {!driveway && <div
        className="measure-control"
        role="group"
        aria-label="Measure on the map"
        ref={(node) => {
          if (node) {
            // The control renders inside MapContainer, so without this its
            // clicks bubble to Leaflet's own container listener (which runs
            // before React's delegated handler) and fire a map click —
            // tapping "Measure distance" would schedule a parcel identify
            // at the button's position while measuring is still turning on.
            L.DomEvent.disableClickPropagation(node);
            L.DomEvent.disableScrollPropagation(node);
          }
        }}
      >
        <button
          type="button"
          aria-label="Measure distance"
          title="Measure distance"
          aria-pressed={mode === "distance"}
          onClick={() => toggle("distance")}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M3 17 17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Measure area"
          title="Measure area"
          aria-pressed={mode === "area"}
          onClick={() => toggle("area")}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M12 3l8 6-3 10H7L4 9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeDasharray="3 2"
            />
          </svg>
        </button>
      </div>}
      {mode !== "off" ? (
        // key remounts capture state when switching distance ↔ area.
        <MeasureCapture key={mode} mode={mode} onExit={() => onModeChange("off")} />
      ) : null}
    </>
  );
}

interface Measurement {
  points: GeoPoint[];
  finished: boolean;
}

function MeasureCapture({
  mode,
  onExit,
}: {
  mode: ActiveMeasureMode;
  onExit: () => void;
}) {
  const map = useMap();
  const [measurement, setMeasurement] = useState<Measurement>({
    points: [],
    finished: false,
  });
  const [cursor, setCursor] = useState<GeoPoint | null>(null);

  useEffect(() => {
    map.doubleClickZoom.disable();
    return () => {
      map.doubleClickZoom.enable();
    };
  }, [map]);

  const finish = () =>
    setMeasurement((current) =>
      current.points.length >= MIN_FINISH_POINTS[mode]
        ? { ...current, finished: true }
        : current,
    );

  useMapEvents({
    click: ({ latlng }) =>
      setMeasurement((current) => {
        const point = { lat: latlng.lat, lng: latlng.lng };
        return current.finished
          ? { points: [point], finished: false }
          : { points: [...current.points, point], finished: false };
      }),
    dblclick: () =>
      // The double-click's own second click just added a duplicate vertex;
      // drop it before finishing.
      setMeasurement((current) => {
        if (current.finished) {
          return current;
        }
        const points = current.points.slice(0, -1);
        return { points, finished: points.length >= MIN_FINISH_POINTS[mode] };
      }),
    mousemove: ({ latlng }) => setCursor({ lat: latlng.lat, lng: latlng.lng }),
  });

  const isEmpty = measurement.points.length === 0;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape") {
        if (isEmpty) {
          onExit();
        } else {
          setMeasurement({ points: [], finished: false });
        }
      } else if (event.key === "Enter") {
        finish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // finish is recreated per render; subscribing per render is harmless here.
  });

  const { points, finished } = measurement;
  const preview =
    !finished && cursor !== null && points.length > 0
      ? [...points, cursor]
      : points;

  return (
    <>
      <div
        className="measure-control measure-actions"
        ref={(node) => {
          if (node) {
            L.DomEvent.disableClickPropagation(node);
            L.DomEvent.disableScrollPropagation(node);
          }
        }}
      >
        <button type="button" disabled={finished || points.length < MIN_FINISH_POINTS[mode]} onClick={finish}>Finish</button>
        <button type="button" disabled={isEmpty} onClick={() => {
          setCursor(null);
          setMeasurement({ points: [], finished: false });
        }}>Clear</button>
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => {
            setCursor(null);
            setMeasurement((current) => ({
              points: current.points.slice(0, -1),
              finished: false,
            }));
          }}
        >
          Undo point
        </button>
      </div>
      <Pane name={MEASURE_PANE} style={{ zIndex: MEASURE_PANE_Z_INDEX }}>
        {mode === "area" && preview.length >= 3 ? (
          <Polygon positions={preview} pathOptions={SHAPE_STYLE} interactive={false} />
        ) : preview.length >= 2 ? (
          <Polyline positions={preview} pathOptions={SHAPE_STYLE} interactive={false} />
        ) : null}
        {points.map((point, index) => {
          // Stays interactive even once finished: the first vertex must keep
          // absorbing clicks so the second click of a double-click on it
          // doesn't fall through to the map, restart the measurement, and
          // then get wiped by the trailing dblclick.
          const closesRing = mode === "area" && index === 0;
          return (
            <CircleMarker
              key={`${index}-${point.lat}-${point.lng}`}
              center={point}
              radius={5}
              pathOptions={VERTEX_STYLE}
              interactive={closesRing}
              eventHandlers={
                closesRing
                  ? {
                      click: (event) => {
                        // Leaflet's Map dispatch loop checks the Leaflet
                        // event's own `_stopped` flag, which
                        // `DomEvent.stopPropagation` only sets when given the
                        // Leaflet event itself — passing `event.originalEvent`
                        // (the raw DOM event) stops DOM bubbling but leaves
                        // the map's own click handler free to fire, which
                        // would restart the measurement right after finish().
                        L.DomEvent.stopPropagation(event);
                        finish();
                      },
                    }
                  : undefined
              }
            >
              {index === points.length - 1 && points.length >= MIN_FINISH_POINTS[mode] ? (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -12]}
                  opacity={1}
                  className="measure-endpoint-label"
                >
                  <span>{mode === "distance" ? "Total distance" : "Area"}</span>
                  <strong>{readoutText(mode, points)}</strong>
                </Tooltip>
              ) : null}
            </CircleMarker>
          );
        })}
      </Pane>
      <p className="measure-readout" role="status">
        {readoutText(mode, points)}
        {/* The gestures are otherwise undiscoverable; surface them once a
            measurement is underway. */}
        {!finished && points.length > 0
          ? " · double-click or Enter to finish · Esc to clear"
          : null}
      </p>
    </>
  );
}

function readoutText(mode: ActiveMeasureMode, points: readonly GeoPoint[]): string {
  if (mode === "distance") {
    return points.length < 2
      ? "Tap the map to measure distance"
      : formatDistance(pathDistanceMetres(points));
  }
  return points.length < 3
    ? "Tap the map to outline an area"
    : formatArea(polygonAreaSquareMetres(points));
}
