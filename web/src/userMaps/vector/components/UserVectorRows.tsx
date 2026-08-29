import type { UserVectorLayerRecord } from "../types";
import type { UserVectorLayersApi } from "../useUserVectorLayers";

function provenance(record: UserVectorLayerRecord): string {
  const count = `${record.featureCount.toLocaleString("en-CA")} feature${
    record.featureCount === 1 ? "" : "s"
  }`;
  const source =
    record.origin.kind === "imported"
      ? `Your file · ${record.origin.filename}`
      : record.origin.kind === "recorded"
        ? "Recorded on this device"
        : "Drawn on this device";
  // An edited layer no longer matches the file it came from, so the row says
  // so rather than letting the filename imply the data is still as imported.
  const edited = record.modifiedAt
    ? ` · edited ${new Date(record.modifiedAt).toLocaleDateString("en-CA")}`
    : "";
  return `${source}${edited} · ${count}`;
}

/**
 * The vector controls App mounts directly inside My Maps. The transitional
 * UserVectorRows wrapper below retains the old standalone disclosure. Vector
 * layers stay labeled as user-loaded material, never official records. Import
 * happens through the shared drop zone; these controls list, toggle, and
 * remove. No opacity slider on
 * purpose: vector styles carry their own stroke/fill opacity, unlike the
 * raster rows' whole-image slider.
 */
export interface UserVectorRowsProps {
  api: UserVectorLayersApi;
  onEdit?: (id: string) => void;
  onNewLayer?: () => void;
  editingId?: string | null;
}

function renderUserVectorControls({
  api,
  onEdit,
  onNewLayer,
  editingId = null,
}: UserVectorRowsProps) {
  return (
    <>
      {api.storageError ? (
          <small role="alert" className="user-map-error">
            {api.storageError}
          </small>
        ) : null}
      {onNewLayer ? (
          <button
            type="button"
            className="user-vector-new"
            onClick={() => onNewLayer()}
          >
            New drawing layer
          </button>
        ) : null}
      {api.records.map((record) => {
          const enabled = api.uiState[record.id]?.enabled ?? false;
          return (
            <div className="layer-control user-vector-row" key={record.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  aria-label={record.name}
                  checked={enabled}
                  onChange={(event) =>
                    api.setEnabled(record.id, event.target.checked)
                  }
                />
                <span className="switch" aria-hidden="true" />
                <span>
                  <strong>{record.name}</strong>
                  <small>{provenance(record)}</small>
                </span>
              </label>
              {/* Export exists on user layers only — never on official
                  sources, whose redistribution terms are their publisher's
                  to set, not this app's. */}
              <div className="user-vector-export">
                <small>Export</small>
                <button
                  type="button"
                  aria-label={`Export ${record.name} as GeoJSON`}
                  onClick={() => void api.exportLayer(record.id, "geojson")}
                >
                  GeoJSON
                </button>
                <button
                  type="button"
                  aria-label={`Export ${record.name} as KML`}
                  onClick={() => void api.exportLayer(record.id, "kml")}
                >
                  KML
                </button>
              </div>
              {onEdit ? (
                <button
                  type="button"
                  className="user-vector-edit"
                  aria-label={`Edit ${record.name}`}
                  aria-pressed={editingId === record.id}
                  onClick={() => onEdit(record.id)}
                >
                  {editingId === record.id ? "Editing" : "Edit"}
                </button>
              ) : null}
              <button
                type="button"
                className="user-map-remove"
                aria-label={`Remove ${record.name}`}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove "${record.name}" from this device? The original ` +
                        "file on your computer is not affected.",
                    )
                  ) {
                    void api.removeLayer(record.id);
                  }
                }}
              >
                Remove
              </button>
            </div>
          );
      })}
    </>
  );
}

export function UserVectorControls(props: UserVectorRowsProps) {
  return (
    <div className="resource-layer-controls">
      {renderUserVectorControls(props)}
    </div>
  );
}

export function UserVectorRows(props: UserVectorRowsProps) {
  const { api } = props;
  return (
    <details className="resource-layer-group user-vector-group" open>
      <summary>
        <span>Your data</span>
        <small>
          {api.records.length === 0
            ? "GeoJSON, KML, KMZ, GPX, SHP"
            : `${api.records.length} loaded`}
        </small>
      </summary>
      <UserVectorControls {...props} />
    </details>
  );
}
