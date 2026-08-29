import { memo } from "react";
import { useState } from "react";
import type {
  EnvironmentalHealthLayerDescriptor,
  FloodHazardLayerDescriptor,
  ForestryLayerDescriptor,
  HydroPilotLayerDescriptor,
  ProvinceLayerId,
  ResourceControlDescriptor,
  WebLayerDescriptor,
  ZoningLayerDescriptor,
  WellLogLayerDescriptor,
  FletcherLayerId,
} from "../layers/layerCatalog";
import type { MapLayerStatus } from "./MapCanvas";
import {
  WELL_ACCURACY_BANDS,
  type WellLogAccuracyFilter,
} from "../services/wellLogs";

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

export const LayerMetadata = memo(function LayerMetadata({
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
});

export const LayerToggle = memo(function LayerToggle({
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
      {/* Every province-restricted row used to disable the switch with no
          in-row accept path except NSPRD. Aerial (and the rest) left phone
          users hunting a footer control the open layer sheet can cover. */}
      {!licenceAccepted ? (
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
});

export const FletcherLayerControl = memo(function FletcherLayerControl({
  layer,
  checked,
  enabled,
  opacity,
  status,
  onChange,
  onOpacityChange,
  onRetry,
}: {
  layer: WebLayerDescriptor & { id: FletcherLayerId };
  checked: boolean;
  enabled: boolean;
  opacity: number;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  onRetry: () => void;
}) {
  const controlLabel = "Fletcher historical map";
  return (
    <div className="fletcher-layer-control">
      <label className="layer-row">
        <input
          type="checkbox"
          aria-label={controlLabel}
          checked={enabled && checked}
          disabled={!enabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch" aria-hidden="true" />
        <span>
          <strong>{controlLabel}</strong>
          <small>
            {enabled ? layer.webCaveat : "Tile hosting not configured"}
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
      </label>
      {enabled && checked ? (
        <label className="fletcher-opacity" htmlFor="fletcher-opacity">
          <small>Opacity {Math.round(opacity * 100)}%</small>
          <input
            id="fletcher-opacity"
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
          />
        </label>
      ) : null}
      {enabled && checked && status.status === "error" ? (
        <button className="text-button fletcher-retry" type="button" onClick={onRetry}>
          Retry tiles
        </button>
      ) : null}
    </div>
  );
});

export const ResourceLayerToggle = memo(function ResourceLayerToggle({
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
});

export const HydroPilotLayerToggle = memo(function HydroPilotLayerToggle({
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
});

/**
 * Zoning comes from municipal servers, so it sits outside the Province licence
 * gate entirely and takes no licenceAccepted prop.
 */
export const ZoningLayerToggle = memo(function ZoningLayerToggle({
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
});

export const FloodHazardLayerToggle = memo(function FloodHazardLayerToggle({
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
});

export const EnvironmentalHealthLayerToggle = memo(function EnvironmentalHealthLayerToggle({
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
});

export const ForestryLayerToggle = memo(function ForestryLayerToggle({
  layer,
  checked,
  status,
  onChange,
}: {
  layer: ForestryLayerDescriptor;
  checked: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
}) {
  const statusBands = [
    {
      label: "Confirmed old growth",
      color: layer.statusColors.confirmedOldGrowth,
    },
    {
      label: "Restoration opportunity",
      color: layer.statusColors.restorationOpportunity,
    },
    { label: "Status unknown", color: layer.statusColors.unknown },
  ];

  return (
    <label className="layer-row forestry-layer-row">
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
        {checked ? (
          <ul
            className="forestry-policy-legend"
            aria-label="Old-growth policy status legend"
          >
            {statusBands.map((band) => (
              <li key={band.label}>
                <span
                  className="forestry-policy-swatch"
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
          checked={checked}
          status={status}
        />
      </span>
    </label>
  );
});

export const WellLogLayerToggle = memo(function WellLogLayerToggle({
  layer,
  checked,
  status,
  onChange,
}: {
  layer: WellLogLayerDescriptor;
  checked: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="layer-row well-log-layer-row">
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
});

/**
 * The filter is the honest default made explicit: surveyed wells are the only
 * band tight enough to read as a point, so showing the rest is opt-in.
 */
export const WellLogAccuracyFilterControl = memo(function WellLogAccuracyFilterControl({
  value,
  onChange,
}: {
  value: WellLogAccuracyFilter;
  onChange: (value: WellLogAccuracyFilter) => void;
}) {
  return (
    <div
      className="well-log-accuracy-filter segmented-control"
      role="group"
      aria-label="Well location accuracy"
    >
      <button
        type="button"
        className={value === "surveyed" ? "selected" : ""}
        aria-pressed={value === "surveyed"}
        onClick={() => onChange("surveyed")}
      >
        Surveyed only
      </button>
      <button
        type="button"
        className={value === "all" ? "selected" : ""}
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        Include approximate
      </button>
    </div>
  );
});

export function WellLogAccuracyLegend() {
  return (
    <div className="well-log-legend" aria-label="Well location accuracy legend">
      <p><strong>Marker = how well the location is known</strong></p>
      <ul>
        {WELL_ACCURACY_BANDS.map(({ accuracy, label }) => (
          <li key={accuracy}>
            <span className={`well-swatch ${accuracy}`} />
            {label}
          </li>
        ))}
      </ul>
      <p className="well-log-legend-note">
        Only surveyed wells are drawn as solid points. Hollow markers report that
        a well exists somewhere nearby, not where it is.
      </p>
    </div>
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
