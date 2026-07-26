import type { UserMapsApi } from "../useUserMaps";
import { DEFAULT_OPACITY } from "../useUserMaps";
import { ImportDialog } from "./ImportDialog";

/**
 * The one element App.tsx mounts in the layer list. Structured to match the
 * other `resource-layer-group` sections (Church maps, well logs, Geology &
 * Resources): a collapsible group with a summary line, then one
 * `layer-control` row per item. Each row keeps the checkbox inside its own
 * `<label>` (toggling the map) and puts the opacity slider and Remove button
 * as siblings outside that label — nesting them inside it would make
 * clicking Remove also toggle the checkbox, the way ZoningLayerToggle's
 * bylaw link has to stopPropagation to avoid the same trap.
 */
export function UserMapRows({ api }: { api: UserMapsApi }) {
  return (
    <details className="resource-layer-group user-map-group" open>
      <summary>
        <span>Your maps</span>
        <small>
          {api.records.length === 0
            ? "Load your own GeoTIFF"
            : `${api.records.length} loaded`}
        </small>
      </summary>
      <div className="resource-layer-controls">
        <ImportDialog
          importing={api.importing}
          importingLabel={api.importingLabel}
          storageError={api.storageError}
          outcomes={api.outcomes}
          onImportFiles={(files) => void api.importFiles(files)}
        />
        {api.records.map((record) => {
          const ui = api.uiState[record.id] ?? {
            enabled: false,
            opacity: DEFAULT_OPACITY,
          };
          const isGcp = record.georef.kind === "gcp";
          const needsWork = isGcp && api.needsGeoreferencing(record);
          return (
            <div className="layer-control user-map-row" key={record.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  aria-label={record.name}
                  checked={ui.enabled && !needsWork}
                  disabled={needsWork}
                  onChange={(event) =>
                    api.setEnabled(record.id, event.target.checked)
                  }
                />
                <span className="switch" aria-hidden="true" />
                <span>
                  <strong>{record.name}</strong>
                  <small>
                    Your file · {record.pixelSize.width.toLocaleString("en-CA")}×
                    {record.pixelSize.height.toLocaleString("en-CA")} px
                    {needsWork ? (
                      <>
                        {" · "}
                        <span className="user-map-needs-georeference">
                          Needs georeferencing
                        </span>
                      </>
                    ) : null}
                  </small>
                </span>
              </label>
              {needsWork ? null : (
                <label className="user-map-opacity">
                  <small>Opacity</small>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    aria-label={`${record.name} opacity`}
                    value={Math.round(ui.opacity * 100)}
                    onChange={(event) =>
                      api.setOpacity(record.id, Number(event.target.value) / 100)
                    }
                  />
                </label>
              )}
              {isGcp ? (
                <button
                  type="button"
                  className="user-map-georeference"
                  aria-label={
                    needsWork
                      ? `Georeference ${record.name}`
                      : `Adjust points for ${record.name}`
                  }
                  onClick={() => api.beginGeoreference(record.id)}
                >
                  {needsWork ? "Georeference" : "Adjust points"}
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
                    void api.removeMap(record.id);
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
