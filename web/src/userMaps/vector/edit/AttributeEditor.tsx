import { useState } from "react";
import type { Feature } from "geojson";
import { FIELD_CAPTURE_SPEC } from "../../../location/captureSpec";

/**
 * Freeform key-value attributes on the selected feature, per the
 * field-capture contract: values entered here are stored as STRINGS — no
 * numeric or boolean coercion ("42" the text must be storable; typed fields
 * arrive later with templates, without migrating anything, because values
 * already live flat in properties. Imported non-string values round-trip
 * untouched: scalars stay their type until the user edits them, and
 * objects/arrays render read-only rather than being flattened.
 *
 * Hidden rather than editable: `name` and `description` (they have their
 * own fields above), `coordinateProperties` (togeojson's per-vertex times,
 * not an attribute), and the app-owned `nsmts:` namespace — which the add
 * flow also refuses, so imported files' own attribute tables can never
 * collide with app semantics. Everything renders through input values and
 * textContent; imported markup stays inert here for the same reason it
 * does in the popup.
 */

export type AttributePatch = Record<string, string | undefined>;

type AttributeEditorProps = {
  feature: Feature;
  onPatch: (patch: AttributePatch) => void;
};

const HIDDEN_KEYS = new Set(["name", "description", "coordinateProperties"]);

function isReservedKey(key: string): boolean {
  return (
    HIDDEN_KEYS.has(key) || key.startsWith(FIELD_CAPTURE_SPEC.reservedPrefix)
  );
}

function editableEntries(feature: Feature): Array<[string, unknown]> {
  const properties =
    feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>)
      : {};
  return Object.entries(properties).filter(([key]) => !isReservedKey(key));
}

export function AttributeEditor({ feature, onPatch }: AttributeEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const entries = editableEntries(feature);

  const addAttribute = () => {
    const key = newKey.trim();
    if (!key) {
      setAddError("Give the attribute a name.");
      return;
    }
    if (isReservedKey(key)) {
      setAddError("This name is reserved — pick another.");
      return;
    }
    if (entries.some(([existing]) => existing === key)) {
      setAddError("This attribute already exists — edit it above.");
      return;
    }
    onPatch({ [key]: newValue });
    setNewKey("");
    setNewValue("");
    setAddError(null);
  };

  return (
    <div className="vector-edit-attributes">
      <h3>Attributes</h3>
      {entries.length === 0 ? (
        <small className="vector-edit-attributes-empty">
          No attributes yet.
        </small>
      ) : (
        entries.map(([key, value]) => (
          <div className="vector-edit-attribute-row" key={key}>
            <label>
              <span>{key}</span>
              {value !== null && typeof value === "object" ? (
                <small className="vector-edit-attribute-complex">
                  Complex value — kept as imported.
                </small>
              ) : (
                <input
                  type="text"
                  value={value === null || value === undefined ? "" : String(value)}
                  onChange={(event) => onPatch({ [key]: event.target.value })}
                />
              )}
            </label>
            <button
              type="button"
              aria-label={`Remove attribute ${key}`}
              onClick={() => onPatch({ [key]: undefined })}
            >
              ✕
            </button>
          </div>
        ))
      )}
      <div className="vector-edit-attribute-add">
        <input
          type="text"
          placeholder="Attribute name"
          aria-label="New attribute name"
          value={newKey}
          onChange={(event) => {
            setNewKey(event.target.value);
            setAddError(null);
          }}
        />
        <input
          type="text"
          placeholder="Value"
          aria-label="New attribute value"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
        />
        <button type="button" onClick={addAttribute}>
          Add
        </button>
      </div>
      {addError ? (
        <small role="alert" className="vector-edit-attribute-error">
          {addError}
        </small>
      ) : null}
    </div>
  );
}
