import type { FeatureCollection } from "geojson";
import type { UserVectorLayerRecord } from "../types";
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
  onDrawMode: (mode: EditMode | null) => void;
  onRename: (name: string) => void;
  onUpdateFeature: (featureId: string, details: FeatureDetails) => void;
  onDeleteFeature: (featureId: string) => void;
  onDone: () => void;
};

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
