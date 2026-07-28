import type { UserMapsApi } from "../useUserMaps";
import { DEFAULT_OPACITY } from "../useUserMaps";
import type { UserMapRecord } from "../types";
import { ImportDialog } from "./ImportDialog";

function pdfProvenance(record: UserMapRecord): string | null {
  const pdf = record.pdf;
  if (!pdf) {
    return null;
  }
  const page =
    pdf.pageCount > 1
      ? `GeoPDF page 1 of ${pdf.pageCount}`
      : "GeoPDF page 1";
  const registration = pdf.registration;
  if (registration.status === "selection-required") {
    return `${page} · Choose frame`;
  }
  if (registration.status === "manual") {
    return `${page} · ${registration.reason} registration · manual points`;
  }
  const candidateIndex = registration.candidates.findIndex(
    ({ id }) => id === registration.selectedFrameId,
  );
  const unnamedOrdinal = registration.candidates
    .slice(0, candidateIndex + 1)
    .filter(({ embeddedLabel }) => embeddedLabel === null).length;
  const label =
    registration.selectedLabel ??
    `Unnamed frame ${Math.max(1, unnamedOrdinal)}`;
  const selection =
    registration.selection.kind === "sole"
      ? "sole registration"
      : registration.selection.kind === "producer-rule"
        ? "USGS rule"
        : "chosen by you";
  const flavor =
    registration.flavor === "measure" ? "Measure" : "LGIDict";
  return (
    `${page} · ${label} · ${flavor} · ${selection}` +
    (registration.adjusted ? " · adjusted" : "")
  );
}

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
            ? "Load GeoTIFF, PDF, or image"
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
          const chooseFrame = api.needsFrameSelection(record);
          const needsWork =
            !chooseFrame && isGcp && api.needsGeoreferencing(record);
          const provenance = pdfProvenance(record);
          const canChangeFrame =
            record.pdf?.registration.status === "embedded" &&
            record.pdf.registration.candidates.length > 1;
          return (
            <div className="layer-control user-map-row" key={record.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  aria-label={record.name}
                  checked={ui.enabled && !needsWork && !chooseFrame}
                  disabled={needsWork || chooseFrame}
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
                    {chooseFrame ? (
                      <>
                        {" · "}
                        <span className="user-map-needs-georeference">
                          Choose frame
                        </span>
                      </>
                    ) : null}
                    {provenance ? (
                      <>
                        <br />
                        {provenance}
                      </>
                    ) : null}
                  </small>
                </span>
              </label>
              {needsWork || chooseFrame ? null : (
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
              {chooseFrame ? (
                <button
                  type="button"
                  className="user-map-georeference"
                  onClick={() => api.beginFrameSelection(record.id)}
                >
                  Choose frame
                </button>
              ) : null}
              {canChangeFrame ? (
                <button
                  type="button"
                  className="user-map-georeference"
                  onClick={() => api.beginFrameSelection(record.id)}
                >
                  Change frame
                </button>
              ) : null}
              {isGcp && !chooseFrame ? (
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
