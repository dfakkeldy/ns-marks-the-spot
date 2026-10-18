import { useState } from "react";
import type { FeatureCollection, Position } from "geojson";
import { FIELD_CAPTURE_SPEC } from "../../../location/captureSpec";
import {
  formatArea,
  formatDistance,
  pathDistanceMetres,
} from "../../../services/geodesy";
import type {
  ConversionPlan,
  ConvertShape,
} from "../convert/pointsToPath";
import type { UserVectorLayerRecord } from "../types";
import { AttributeEditor, type AttributePatch } from "./AttributeEditor";
import { PhotoStrip } from "../photos/PhotoStrip";
import {
  readPhotoDescriptors,
  type FeaturePhotoDescriptor,
} from "../photos/types";
import type { PhotoManagerApi } from "../photos/usePhotoManager";
import type { VectorSnapTargets } from "./EditableVectorLayer";
import type { ParcelSnapStatus } from "./ParcelSnapTargetsLayer";
import type { FeatureCorner, VertexEditOutcome } from "./featureCorners";
import type { FeatureDetails } from "./useVectorEditSession";

/**
 * Above this many corners the picker is a number field rather than a list: a
 * 2,000-fix imported track would otherwise build a two-thousand-option select
 * on every render of the panel.
 */
const CORNER_LIST_LIMIT = 200;

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
  onPatchAttributes: (featureId: string, patch: AttributePatch) => void;
  photoManager: PhotoManagerApi;
  onSetFeaturePhotos: (
    featureId: string,
    descriptors: FeaturePhotoDescriptor[],
  ) => void;
  onAttachFeaturePhotos: (
    layerId: string,
    featureId: string,
    descriptors: FeaturePhotoDescriptor[],
  ) => FeaturePhotoDescriptor[];
  onPhotoCleanupFailed: (photoId: string) => void;
  onMoveFeaturePoint: (featureId: string, position: [number, number]) => void;
  /** The selected feature's corners, numbered; see `featureCorners`. */
  onFeatureCorners: (featureId: string) => FeatureCorner[];
  onMoveVertex: (
    featureId: string,
    cornerNumber: number,
    position: Position,
  ) => VertexEditOutcome;
  onInsertVertex: (
    featureId: string,
    cornerNumber: number,
    position: Position,
  ) => VertexEditOutcome;
  /**
   * Where the map is aimed, [lon, lat], or null before it has settled. The
   * corner mover puts a corner here: panning the whole map is a gesture a
   * keyboard has and a thumb can make, which a 10px vertex handle is not.
   */
  mapCentre: [number, number] | null;
  onOpenPhoto: (descriptor: FeaturePhotoDescriptor) => void;
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

function cornerLabel(corner: FeatureCorner): string {
  return corner.partCount > 1
    ? `Corner ${corner.number} (part ${corner.part})`
    : `Corner ${corner.number}`;
}

const COMPASS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

/**
 * Which way the corner lies from the map centre. Distance alone does not
 * identify a corner — every corner of a square centred on the map is the same
 * distance away — and the handles on screen carry no numbers, so without this
 * neither a sighted reader nor a screen-reader user can tell which "Corner 2"
 * means before moving it.
 *
 * A local flat-earth bearing: over the tens of metres this control works at,
 * the difference from a great-circle bearing is far smaller than the eight
 * names it is being rounded into.
 */
function bearingFrom(
  centre: [number, number],
  position: Position,
): (typeof COMPASS)[number] {
  const east =
    (position[0] - centre[0]) * Math.cos((centre[1] * Math.PI) / 180);
  const north = position[1] - centre[1];
  const degrees = (Math.atan2(east, north) * 180) / Math.PI;
  return COMPASS[Math.round(((degrees + 360) % 360) / 45) % 8];
}

/**
 * Reshaping without a drag: pick a corner by number, aim the map, press.
 *
 * The map's centre is the pointing device. A vertex handle is 10px, which is
 * under the target size on a phone and unreachable by keyboard; the map
 * itself pans with arrow keys and with a thumb anywhere on the screen, so
 * "where the map is aimed" is a position anyone can set precisely. Mounted
 * with the feature id as its key, so switching features resets the choice
 * rather than carrying corner 7 onto a triangle.
 */
function CornerMover({
  corners,
  centre,
  onMove,
  onInsert,
}: {
  corners: FeatureCorner[];
  centre: [number, number] | null;
  onMove: (cornerNumber: number, position: Position) => VertexEditOutcome;
  onInsert: (cornerNumber: number, position: Position) => VertexEditOutcome;
}) {
  const [chosen, setChosen] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const corner =
    corners.find((candidate) => candidate.number === chosen) ?? corners[0];
  if (!corner) {
    return null;
  }
  const away = centre
    ? pathDistanceMetres([
        { lat: centre[1], lng: centre[0] },
        { lat: corner.position[1], lng: corner.position[0] },
      ])
    : null;
  // A Point is one position with nothing to insert into; the mover still
  // moves it, which is the only non-drag way to reposition a mark that has
  // no geotagged photo to offer one.
  const insertable = corner.owner !== null;

  const said = (
    outcome: VertexEditOutcome,
    what: string,
    refused: string,
    alreadyThere: string,
  ) => {
    switch (outcome.status) {
      case "done":
        setNote(
          outcome.crossingChecked
            ? what
            : `${what} This shape has too many corners to check whether it now crosses itself.`,
        );
        return;
      case "would-cross":
        setNote(refused);
        return;
      case "already-there":
        setNote(alreadyThere);
        return;
      case "unavailable":
        setNote(
          "The map could not change that corner. Nothing has moved.",
        );
    }
  };

  return (
    <fieldset className="vector-edit-corners">
      <legend>Corners</legend>
      <label className="vector-edit-field">
        <span>Corner</span>
        {corners.length <= CORNER_LIST_LIMIT ? (
          <select
            value={corner.number}
            onChange={(event) => {
              setChosen(Number(event.target.value));
              setNote(null);
            }}
          >
            {corners.map((candidate) => (
              <option key={candidate.number} value={candidate.number}>
                {cornerLabel(candidate)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            min={1}
            max={corners.length}
            step={1}
            value={corner.number}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                setChosen(Math.min(Math.max(Math.round(next), 1), corners.length));
                setNote(null);
              }
            }}
          />
        )}
      </label>
      <small className="vector-edit-corner-where">
        {corners.length === 1
          ? "1 corner."
          : `${corners.length.toLocaleString("en-CA")} corners.`}{" "}
        {away === null || !centre
          ? "The map has not settled yet."
          : away < 1
            ? `${cornerLabel(corner)} is at the centre of the map.`
            : `${cornerLabel(corner)} is ${formatDistance(away)} ${bearingFrom(
                centre,
                corner.position,
              )} of the centre of the map.`}
      </small>
      <div className="vector-edit-corner-actions">
        <button
          type="button"
          disabled={centre === null}
          onClick={() => {
            if (!centre) {
              return;
            }
            said(
              onMove(corner.number, [centre[0], centre[1]]),
              `${cornerLabel(corner)} moved to the centre of the map.`,
              `${cornerLabel(corner)} has not moved: putting it there would make this shape cross itself.`,
              `${cornerLabel(corner)} has not moved: the corner beside it is already there, and the two together would draw nothing.`,
            );
          }}
        >
          Move corner here
        </button>
        <button
          type="button"
          disabled={centre === null || !insertable}
          onClick={() => {
            if (!centre) {
              return;
            }
            said(
              onInsert(corner.number, [centre[0], centre[1]]),
              `A corner was added here, after ${cornerLabel(corner).toLowerCase()}.`,
              `No corner was added: one here would make this shape cross itself.`,
              `No corner was added: there is already one at this spot.`,
            );
          }}
        >
          Add a corner here
        </button>
      </div>
      {note ? (
        <small role="status" className="vector-edit-corner-note">
          {note}
        </small>
      ) : null}
    </fieldset>
  );
}

/**
 * The editing surface: draw tools, the layer's name, and the selected
 * feature's details. Geoman's own toolbar is never shown — these buttons
 * drive the same modes while matching the app's controls and keeping the
 * 44px touch targets.
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
  onPatchAttributes,
  photoManager,
  onSetFeaturePhotos,
  onAttachFeaturePhotos,
  onPhotoCleanupFailed,
  onMoveFeaturePoint,
  onFeatureCorners,
  onMoveVertex,
  onInsertVertex,
  mapCentre,
  onOpenPhoto,
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
  const [attachingPhotos, setAttachingPhotos] = useState(false);

  return (
    <section className="vector-edit-panel" aria-label={`Editing ${record.name}`}>
      <header className="vector-edit-header">
        <h2>Editing</h2>
        {/* Held while a photo is being processed. Done closes the session,
            and an attach that finishes afterwards has no feature left to
            land on: its bytes are deleted and the reader loses a photo they
            watched being added. */}
        <button
          type="button"
          className="vector-edit-done"
          disabled={attachingPhotos}
          onClick={onDone}
        >
          {attachingPhotos ? "Finishing a photo…" : "Done editing"}
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
            {/* Two sentences ship and CSS shows one, chosen by pointer type
                — the same arrangement the georeference tabs use, so nothing
                here has to re-derive what kind of pointer is in front of it.
                Alt is a keyboard modifier a phone has no way to press; the
                only unsnapped route a touch user has is the master toggle
                above, which the second sentence names by its exact label. */}
            <small className="vector-edit-snap-hint vector-edit-snap-hint-fine">
              Hold Alt to place a vertex without snapping.
            </small>
            <small className="vector-edit-snap-hint vector-edit-snap-hint-coarse">
              Turn off Snap while drawing to place a vertex freely.
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
          <CornerMover
            key={String(selected.id)}
            corners={onFeatureCorners(String(selected.id))}
            centre={mapCentre}
            onMove={(cornerNumber, position) =>
              onMoveVertex(String(selected.id), cornerNumber, position)
            }
            onInsert={(cornerNumber, position) =>
              onInsertVertex(String(selected.id), cornerNumber, position)
            }
          />
          <AttributeEditor
            feature={selected}
            onPatch={(patch) => onPatchAttributes(String(selected.id), patch)}
          />
          <PhotoStrip
            descriptors={readPhotoDescriptors(selected.properties)}
            pointPosition={
              selected.geometry?.type === "Point"
                ? [
                    selected.geometry.coordinates[0],
                    selected.geometry.coordinates[1],
                  ]
                : null
            }
            layerId={record.id}
            manager={photoManager}
            onDescriptors={(descriptors) =>
              onSetFeaturePhotos(String(selected.id), descriptors)
            }
            onAttachDescriptors={(descriptors) =>
              onAttachFeaturePhotos(record.id, String(selected.id), descriptors)
            }
            onPhotoCleanupFailed={onPhotoCleanupFailed}
            onBusyChange={setAttachingPhotos}
            onMovePoint={(position) =>
              onMoveFeaturePoint(String(selected.id), position)
            }
            onOpenPhoto={onOpenPhoto}
          />
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
