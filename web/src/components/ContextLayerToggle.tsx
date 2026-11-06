import { memo, useMemo } from "react";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import type { MapLayerStatus } from "./MapCanvas";
import { LayerMetadata } from "./LayerRows";
import { LayerSwatch } from "./LayerSwatch";
import { contextLayerSwatch } from "./layerSwatchSpec";

export const ContextLayerToggle = memo(function ContextLayerToggle({
  layer, checked, licenceAccepted, status, onChange, onReviewLicence,
}: {
  layer: ContextMapLayer;
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  const licenceEnabled = layer.licence !== "province-restricted" || licenceAccepted;
  const enabled = licenceEnabled && !layer.unavailableReason;
  const swatch = useMemo(() => contextLayerSwatch(layer), [layer]);
  return (
    <div className="context-layer-control">
      <label className="layer-row">
        <input type="checkbox" aria-label={layer.name}
          checked={enabled && checked} disabled={!enabled}
          onChange={(event) => onChange(event.target.checked)} />
        <span className="switch" aria-hidden="true" />
        <span>
          <strong><LayerSwatch spec={swatch} />{layer.name}</strong>
          <small>{layer.webCaveat}</small>
          {!licenceEnabled ? <small>Province licence required</small> : null}
          {layer.unavailableReason ? <small>{layer.unavailableReason}</small> : null}
          <LayerMetadata openData={layer.openData} sourceDate={layer.sourceDate} scale={layer.scale}
            coverage={layer.coverage} minZoom={layer.minZoom} maxZoom={layer.maxZoom}
            checked={enabled && checked} status={status} />
        </span>
        {/* The same in-row Review as the Province rows (LayerToggle), on the
            name's line, rather than a second, larger link under the row. */}
        {!licenceEnabled ? (
          <button className="text-button" type="button" onClick={onReviewLicence}
            aria-label={`Review Province licence for ${layer.name}`}>
            Review
          </button>
        ) : null}
      </label>
      <details className="context-layer-source">
        <summary>{checked && enabled ? "Legend & source" : "Source & legend"}</summary>
        {layer.legend.length > 0 ? (
          <ul className="environmental-health-legend" aria-label={`${layer.name} legend`}>
            {layer.legend.map(({ label, color }, index) => (
              <li key={`${index}:${label}`}>
                {color ? <span className="environmental-health-swatch"
                  style={{ backgroundColor: color }} aria-hidden="true" /> : null}
                {label}
              </li>
            ))}
          </ul>
        ) : null}
        <p><a href={layer.sourceUrl} target="_blank" rel="noreferrer">{layer.provenance === "project-derived" ? "Project source" : layer.licence === "public-facts" ? "Assessment source" : "Official source"}</a>
          {" · "}<a href={layer.licenceUrl} target="_blank" rel="noreferrer">{layer.licence === "public-facts" ? "Original source rights retained" : "Licence"}</a></p>
        <p>Mapped records and coverage may be incomplete. An empty map does not establish absence.</p>
      </details>
    </div>
  );
});
