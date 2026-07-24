import { useState } from "react";
import type {
  EnvironmentalHealthLayerDescriptor,
  FloodHazardLayerDescriptor,
  HydroPilotLayerDescriptor,
  ProvinceLayerId,
  ResourceControlDescriptor,
  WebLayerDescriptor,
  ZoningLayerDescriptor,
} from "../layers/layerCatalog";
import type { MapLayerStatus } from "./MapCanvas";

function layerRuntimeLabel(
  checked: boolean,
  status: MapLayerStatus,
): string {
  if (!checked) {
    return "Off";
  }
  switch (status.status) {
    case "loading":
      return "Loading visible area…";
    case "ready":
      return status.count === undefined
        ? "Ready"
        : `Ready · ${status.count.toLocaleString("en-CA")} loaded`;
    case "zoom":
      return `Zoom to ${status.minZoom}+ to load`;
    case "error":
      return "Source temporarily unavailable";
    case "idle":
      return "Ready to load";
  }
}

export function LayerMetadata({
  sourceDate,
  scale,
  coverage,
  minZoom,
  maxZoom,
  checked,
  status,
}: {
  sourceDate: string;
  scale: string;
  coverage: string;
  minZoom: number;
  maxZoom: number;
  checked: boolean;
  status: MapLayerStatus;
}) {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  return (
    <span className="layer-metadata">
      <small className={`layer-runtime ${status.status}`}>
        {layerRuntimeLabel(checked, status)}
      </small>
      <details className="layer-provenance" open={provenanceOpen}>
        {/* preventDefault keeps this summary click from also toggling the
            row's wrapping <label> checkbox; state drives the open attribute */}
        <summary
          onClick={(event) => {
            event.preventDefault();
            setProvenanceOpen((open) => !open);
          }}
        >
          Source &amp; scale
        </summary>
        <small>Source date: {sourceDate}</small>
        <small>Scale: {scale}</small>
        <small>Coverage: {coverage}</small>
        <small>Zoom: {minZoom}–{maxZoom}</small>
      </details>
    </span>
  );
}

export function LayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  return (
    <label className="layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={licenceAccepted && checked}
        disabled={!licenceAccepted}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>
          {licenceAccepted ? layer.webCaveat : "Province licence required"}
        </small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={licenceAccepted && checked}
          status={status}
        />
      </span>
      {!licenceAccepted && layer.id === "nsprd" ? (
        <button className="text-button" type="button" onClick={onReviewLicence}>
          Review
        </button>
      ) : null}
    </label>
  );
}

export function ResourceLayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: ResourceControlDescriptor;
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  const requiresProvinceLicence =
    "requiresProvinceLicence" in layer && layer.requiresProvinceLicence;
  const enabled = !requiresProvinceLicence || licenceAccepted;

  return (
    <>
      <label className="layer-row resource-layer-row">
        <input
          type="checkbox"
          aria-label={layer.name}
          checked={enabled && checked}
          disabled={!enabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch" aria-hidden="true" />
        <span>
          <strong>{layer.name}</strong>
          <small>
            {enabled
              ? layer.webCaveat
              : "Province licence required for derived parcel geometry"}
          </small>
          <LayerMetadata
            sourceDate={layer.sourceDate}
            scale={layer.scale}
            coverage={layer.coverage}
            minZoom={layer.minZoom}
            maxZoom={layer.maxZoom}
            checked={enabled && checked}
            status={status}
          />
        </span>
        {!enabled ? (
          <button
            aria-label={`Review Province licence for ${layer.name}`}
            className="text-button"
            type="button"
            onClick={onReviewLicence}
          >
            Review
          </button>
        ) : null}
      </label>
      {layer.id === "mineral-proximity-parcels" ? (
        <a
          className="derived-resource-source"
          href={layer.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Mineral Occurrences source
        </a>
      ) : null}
    </>
  );
}

export function HydroPilotLayerToggle({
  layer,
  checked,
  status,
  onChange,
}: {
  layer: HydroPilotLayerDescriptor;
  checked: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="layer-row hydro-pilot-layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>{layer.webCaveat}</small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={checked}
          status={status}
        />
      </span>
    </label>
  );
}

/**
 * Zoning comes from municipal servers, so it sits outside the Province licence
 * gate entirely and takes no licenceAccepted prop.
 */
export function ZoningLayerToggle({
  layer,
  checked,
  status,
  onChange,
}: {
  layer: ZoningLayerDescriptor;
  checked: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="layer-row zoning-layer-row">
      <input
        type="checkbox"
        aria-label={`${layer.name} zoning`}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>{layer.webCaveat}</small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={checked}
          status={status}
        />
        <a
          className="layer-bylaw-link"
          href={layer.bylawUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {layer.bylawLabel}
        </a>
      </span>
    </label>
  );
}

export function FloodHazardLayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: FloodHazardLayerDescriptor;
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  const enabled = layer.licence === "province-open" || licenceAccepted;
  return (
    <label className="layer-row flood-hazard-layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={enabled && checked}
        disabled={!enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>{enabled ? layer.webCaveat : "Province licence required"}</small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={enabled && checked}
          status={status}
        />
      </span>
      {!enabled ? (
        <button className="text-button" type="button" onClick={onReviewLicence}>Review</button>
      ) : null}
    </label>
  );
}

export function EnvironmentalHealthLayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: EnvironmentalHealthLayerDescriptor;
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  const enabled = layer.licence === "province-open" || licenceAccepted;
  return (
    <label className="layer-row environmental-health-layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={enabled && checked}
        disabled={!enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>{enabled ? layer.webCaveat : "Province licence required"}</small>
        {/* The province's own guidance rides with the layer: these rasters are
            tile overlays with no popup, so this row is the only place a reader
            can meet the caveat before acting on a risk band. */}
        <small className="environmental-health-guidance">{layer.guidance}</small>
        {enabled && layer.riskBands.length > 0 ? (
          <ul
            className="environmental-health-legend"
            aria-label={`${layer.name} risk bands`}
          >
            {layer.riskBands.map((band) => (
              <li key={band.label}>
                <span
                  className="environmental-health-swatch"
                  style={{ backgroundColor: band.color }}
                  aria-hidden="true"
                />
                {band.label}
              </li>
            ))}
          </ul>
        ) : null}
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={enabled && checked}
          status={status}
        />
      </span>
      {!enabled ? (
        <button
          aria-label={`Review Province licence for ${layer.name}`}
          className="text-button"
          type="button"
          onClick={onReviewLicence}
        >
          Review
        </button>
      ) : null}
    </label>
  );
}

export function RoadLegend() {
  return (
    <ul className="road-legend" aria-label="Road type legend">
      <li>
        <span className="road-swatch highway" />Highway
      </li>
      <li>
        <span className="road-swatch local" />Local road
      </li>
      <li>
        <span className="road-swatch resource" />Resource road
      </li>
      <li>
        <span className="road-swatch trail" />Trail / track
      </li>
      <li>
        <span className="road-swatch culvert" />Culvert
      </li>
    </ul>
  );
}

export function HydroPotentialLegend() {
  return (
    <div className="hydro-potential-legend" aria-label="Micro-hydro symbology">
      <p><strong>Line width = modeled upstream area</strong></p>
      <div className="hydro-width-key" aria-hidden="true">
        <span className="hydro-line narrow" />
        <span>smaller</span>
        <span className="hydro-line wide" />
        <span>larger</span>
      </div>
      <p><strong>Colour = nominal micro-hydro scale</strong></p>
      <ul>
        <li><span className="hydro-swatch not-qualified" />No 5 m drop within 3 km</li>
        <li><span className="hydro-swatch below-1kw" />Below 1 kW scale</li>
        <li><span className="hydro-swatch kw-1-5" />1–5 kW scale</li>
        <li><span className="hydro-swatch kw-5-15" />5–15 kW scale</li>
        <li><span className="hydro-swatch kw-15-30" />15–30 kW scale</li>
        <li><span className="hydro-swatch kw-30-50" />30–50 kW scale</li>
        <li><span className="hydro-swatch over-50kw" />Above 50 kW scale</li>
      </ul>
    </div>
  );
}
