import { useState } from "react";
import type { FeatureCollection } from "geojson";
import { FIELD_CAPTURE_SPEC } from "../../../location/captureSpec";
import { formatArea, formatDistance } from "../../../services/geodesy";
import type {
  ConversionPlan,
  ConvertShape,
} from "../convert/pointsToPath";
import type { UserVectorLayerRecord } from "../types";
import type { VectorSnapTargets } from "./EditableVectorLayer";
import type { ParcelSnapStatus } from "./ParcelSnapTargetsLayer";
import type { FeatureDetails } from "./useVectorEditSession";

/** Geoman shape names, kept out of the rest of the app's vocabulary. */
export type DrawMode = "Marker" | "Line" | "Polygon";
export type EditMode = DrawMode | "edit" | "drag" | "remove";

type VectorEditPanelProps = {
  record: UserVectorLayerRecord;
  data: FeatureCollection;
  selectedFeatureId: string | null;
  drawMode: EditMode | null;
  storageError: string | null;
  snap: VectorSnapTargets;
  parcelSnapStatus: ParcelSnapStatus;
  licenceAccepted: boolean;
  onSnapChange: (snap: VectorSnapTargets) => void;
  /** Parcels toggled before the province licence: open the licence dialog. */
  onRequestParcelSnapLicence: () => void;
  convertShape: ConvertShape | null;
  conversionPlan: ConversionPlan | null;
  onConvertShape: (shape: ConvertShape | null) => void;
  onConvertCreate: (keepSourcePoints: boolean) => void;
  lastConversion: { label: string } | null;
  onUndoConversion: () => void;
  onDrawMode: (mode: EditMode | null) => void;
  onRename: (name: string) => void;
  onUpdateFeature: (featureId: string, details: FeatureDetails) => void;
  onDeleteFeature: (featureId: string) => void;
  onDone: () => void;
};

function parcelStatusText(status: ParcelSnapStatus): string | null {
  switch (status.status) {
    case "idle":
      return null;
    case "loading":
      return "Loading parcels…";
    case "zoom":
      return `Parcels load at zoom ${status.minZoom}+`;
    case "dense":
      return `Too many parcels here (${status.count.toLocaleString("en-CA")}) — zoom in to snap`;
    case "error":
      return "Parcels didn't load";
    case "ready":
      // "0 parcels snappable" is an honest empty, not absence evidence.
      return `${status.count.toLocaleString("en-CA")} parcels snappable`;
  }
}

const TOOLS: Array<{ mode: EditMode; label: string; text: string }> = [
  { mode: "Marker", label: "Draw point", text: "Point" },
  { mode: "Line", label: "Draw line", text: "Line" },
  { mode: "Polygon", label: "Draw area", text: "Area" },
  { mode: "edit", label: "Reshape", text: "Reshape" },
  { mode: "drag", label: "Move", text: "Move" },
  { mode: "remove", label: "Delete features", text: "Delete" },
];

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The editing surface: draw tools, the layer's name, and the selected
 * feature's details. Geoman's own toolbar is never shown — these buttons
 * drive the same modes while matching the app's controls and keeping the
 * 44px touch targets `styles.test.ts` asserts.
 *
 * Feature text is rendered into form fields, whose `value` is text by
 * definition, so an imported description carrying HTML stays inert here for
 * the same reason it does in the popup.
 */
export function VectorEditPanel({
  record,
  data,
  selectedFeatureId,
  drawMode,
  storageError,
  snap,
  parcelSnapStatus,
  licenceAccepted,
  onSnapChange,
  onRequestParcelSnapLicence,
  convertShape,
  conversionPlan,
  onConvertShape,
  onConvertCreate,
  lastConversion,
  onUndoConversion,
  onDrawMode,
  onRename,
  onUpdateFeature,
  onDeleteFeature,
  onDone,
}: VectorEditPanelProps) {
  const selected = data.features.find(
    (feature) => String(feature.id) === selectedFeatureId,
  );
  const properties = (selected?.properties ?? {}) as Record<string, unknown>;
  const pointCount = data.features.filter(
    (feature) => feature.geometry?.type === "Point",
  ).length;
  // Non-destructive by default: with no undo system beyond the one-shot
  // conversion revert, keeping the source points is the safer failure mode.
  const [keepSourcePoints, setKeepSourcePoints] = useState(true);

  return (
    <section className="vector-edit-panel" aria-label={`Editing ${record.name}`}>
      <header className="vector-edit-header">
        <h2>Editing</h2>
        <button type="button" className="vector-edit-done" onClick={onDone}>
          Done editing
        </button>
      </header>

      {storageError ? (
        <small role="alert" className="user-map-error">
          {storageError}
        </small>
      ) : null}

      <div className="vector-edit-tools" role="group" aria-label="Drawing tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.mode}
            type="button"
            aria-label={tool.label}
            aria-pressed={drawMode === tool.mode}
            className={drawMode === tool.mode ? "is-active" : undefined}
            onClick={() => onDrawMode(drawMode === tool.mode ? null : tool.mode)}
          >
            {tool.text}
          </button>
        ))}
      </div>

      <fieldset className="vector-edit-snap">
        <legend>Snapping</legend>
        <label className="vector-edit-snap-row">
          <input
            type="checkbox"
            checked={snap.enabled}
            onChange={(event) =>
              onSnapChange({ ...snap, enabled: event.target.checked })
            }
          />
          <span>Snap while drawing</span>
        </label>
        {snap.enabled ? (
          <>
            <label className="vector-edit-snap-row">
              <input
                type="checkbox"
                checked={snap.myFeatures}
                onChange={(event) =>
                  onSnapChange({ ...snap, myFeatures: event.target.checked })
                }
              />
              <span>My features</span>
            </label>
            <label className="vector-edit-snap-row">
              <input
                type="checkbox"
                checked={snap.parcels}
                onChange={(event) => {
                  if (event.target.checked && !licenceAccepted) {
                    // The gate, not a toggle: acceptance completes the
                    // intent and arms parcels; declining leaves it off.
                    onRequestParcelSnapLicence();
                    return;
                  }
                  onSnapChange({ ...snap, parcels: event.target.checked });
                }}
              />
              <span>Parcel boundaries (NSPRD)</span>
            </label>
            {/* The pinned caveat stands whenever the parcels control is
                visible — a traced line inherits NSPRD's own accuracy, and
                NSPRD says it is not a survey. */}
            <small className="vector-edit-snap-caveat">
              {FIELD_CAPTURE_SPEC.snap.parcelCaveat}
            </small>
            {snap.parcels ? (
              <small className="vector-edit-snap-status" aria-live="polite">
                {parcelStatusText(parcelSnapStatus)}
              </small>
            ) : null}
            <small className="vector-edit-snap-hint">
              Hold Alt to place a vertex without snapping.
            </small>
          </>
        ) : null}
      </fieldset>

      {pointCount >= 2 ? (
        <fieldset className="vector-edit-convert">
          <legend>Make line or area from points</legend>
          {convertShape === null ? (
            <div className="vector-edit-convert-pick" role="group">
              <button type="button" onClick={() => onConvertShape("line")}>
                Line from points
              </button>
              <button type="button" onClick={() => onConvertShape("area")}>
                Area from points
              </button>
            </div>
          ) : (
            <>
              <small className="vector-edit-convert-stats">
                {conversionPlan?.viable
                  ? `${conversionPlan.sourcePointCount} points → ${formatDistance(
                      conversionPlan.lengthM,
                    )}${
                      conversionPlan.areaM2 !== null
                        ? ` · ${formatArea(conversionPlan.areaM2)}`
                        : ""
                    }`
                  : convertShape === "area"
                    ? "An area needs at least 3 distinct points."
                    : "A line needs at least 2 distinct points."}
              </small>
              {conversionPlan?.selfIntersects ? (
                <small className="vector-edit-convert-warning">
                  The path crosses itself — check the numbered order on the
                  map.
                </small>
              ) : null}
              <label className="vector-edit-snap-row">
                <input
                  type="checkbox"
                  checked={keepSourcePoints}
                  onChange={(event) => setKeepSourcePoints(event.target.checked)}
                />
                <span>Keep the source points</span>
              </label>
              <div className="vector-edit-convert-actions">
                <button type="button" onClick={() => onConvertShape(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="vector-edit-convert-create"
                  disabled={!conversionPlan?.viable}
                  onClick={() => onConvertCreate(keepSourcePoints)}
                >
                  {convertShape === "area" ? "Create area" : "Create line"}
                </button>
              </div>
            </>
          )}
        </fieldset>
      ) : null}
      {lastConversion ? (
        <div className="vector-edit-convert-undo">
          <small>{lastConversion.label}</small>
          <button type="button" onClick={onUndoConversion}>
            Undo
          </button>
        </div>
      ) : null}

      <label className="vector-edit-field">
        <span>Layer name</span>
        <input
          type="text"
          value={record.name}
          onChange={(event) => onRename(event.target.value)}
        />
      </label>

      {selected ? (
        <div className="vector-edit-feature">
          <label className="vector-edit-field">
            <span>Feature name</span>
            <input
              type="text"
              value={asText(properties.name)}
              onChange={(event) =>
                onUpdateFeature(String(selected.id), { name: event.target.value })
              }
            />
          </label>
          <label className="vector-edit-field">
            <span>Feature description</span>
            <textarea
              rows={3}
              value={asText(properties.description)}
              onChange={(event) =>
                onUpdateFeature(String(selected.id), {
                  description: event.target.value,
                })
              }
            />
          </label>
          <button
            type="button"
            className="user-map-remove"
            onClick={() => {
              if (
                window.confirm(
                  "Delete this feature? This cannot be undone.",
                )
              ) {
                onDeleteFeature(String(selected.id));
              }
            }}
          >
            Delete this feature
          </button>
        </div>
      ) : (
        <p className="vector-edit-hint">
          Select a feature on the map to name it, or pick a drawing tool to add
          one.
        </p>
      )}
    </section>
  );
}
