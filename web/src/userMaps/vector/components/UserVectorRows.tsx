import type { UserVectorLayerRecord } from "../types";
import type { UserVectorLayersApi } from "../useUserVectorLayers";

function provenance(record: UserVectorLayerRecord): string {
  const count = `${record.featureCount.toLocaleString("en-CA")} feature${
    record.featureCount === 1 ? "" : "s"
  }`;
  return record.origin.kind === "imported"
    ? `Your file · ${record.origin.filename} · ${count}`
    : `Drawn on this device · ${count}`;
}

/**
 * The "Your data" section beside "Your maps": user vector layers, always
 * labeled as user-loaded material so they read as annotations, never as
 * official records. Import happens through the shared drop zone in "Your
 * maps" — this group only lists, toggles, and removes. No opacity slider on
 * purpose: vector styles carry their own stroke/fill opacity, unlike the
 * raster rows' whole-image slider.
 */
export function UserVectorRows({ api }: { api: UserVectorLayersApi }) {
  return (
    <details className="resource-layer-group user-vector-group" open>
      <summary>
        <span>Your data</span>
        <small>
          {api.records.length === 0
            ? "GeoJSON, KML, KMZ, GPX"
            : `${api.records.length} loaded`}
        </small>
      </summary>
      <div className="resource-layer-controls">
        {api.storageError ? (
          <small role="alert" className="user-map-error">
            {api.storageError}
          </small>
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
      </div>
    </details>
  );
}
