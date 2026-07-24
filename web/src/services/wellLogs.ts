import type { PathOptions } from "leaflet";
import type { MapEnvelope } from "./arcGISFeatureOverlay";
import { fetchArcGISFeatureOverlay } from "./arcGISFeatureOverlay";

/**
 * The published table also carries an ADDRESS column that can hold a well
 * owner's civic address. It is deliberately absent from this list so the
 * browser never receives it: the field is excluded at the query, not filtered
 * out afterwards.
 */
export const WELL_LOG_OUT_FIELDS = [
  "OBJECTID",
  "WELLNUM",
  "DATE",
  "DEPTH",
  "CASING",
  "BEDROCK",
  "STATIC",
  "YIELD_LPM",
  "GEOREF_A",
  "GEOREF_S",
] as const;


/**
 * Location-accuracy bands from Appendix A of the NS Well Logs Database Users
 * Manual (2022). `GEOREF_A` is the Province's own estimate, in metres, of how
 * far the plotted point may sit from the real well. Only the surveyed band is
 * tight enough to draw as a confident point.
 */
export type WellLocationAccuracy =
  | "surveyed"
  | "map-referenced"
  | "sheet-referenced"
  | "community"
  | "unknown";

export type WellAccuracyBand = {
  accuracy: WellLocationAccuracy;
  label: string;
  /** Upper bound of the band in metres, or null where the band is open-ended. */
  maxMetres: number | null;
  /** Where the coordinate came from, per Appendix A. */
  provenance: string;
};

/**
 * Ordered coarsest-last. The boundaries are the manual's documented figures:
 * GPS ±50 m, NS Map Book/Atlas ±800 m, NTS sheet ±1,500 m, community centroid
 * ±8,000 m. Property/building centroids are case-by-case and fall into
 * whichever band their own estimate lands in.
 */
export const WELL_ACCURACY_BANDS: readonly WellAccuracyBand[] = [
  {
    accuracy: "surveyed",
    label: "Surveyed · ±50 m",
    maxMetres: 50,
    provenance: "Driller GPS or surveyed coordinate, mostly wells built after 2004",
  },
  {
    accuracy: "map-referenced",
    label: "Map-referenced · ±800 m",
    maxMetres: 800,
    provenance: "NS Map Book or Atlas reference",
  },
  {
    accuracy: "sheet-referenced",
    label: "Sheet-referenced · ±1.5 km",
    maxMetres: 1_500,
    provenance: "NTS map sheet reference",
  },
  {
    accuracy: "community",
    label: "Community centroid · up to ±8 km",
    maxMetres: null,
    provenance: "Community or gazetteer centroid",
  },
  {
    accuracy: "unknown",
    label: "No accuracy estimate",
    maxMetres: null,
    provenance: "The source record carries no usable accuracy estimate",
  },
] as const;

/**
 * A zero or negative estimate means the Province recorded no usable figure. It
 * is treated as unknown rather than as a perfectly located well.
 */
export function classifyWellAccuracy(
  metres: number | null | undefined,
): WellLocationAccuracy {
  if (typeof metres !== "number" || !Number.isFinite(metres) || metres <= 0) {
    return "unknown";
  }
  if (metres <= 50) {
    return "surveyed";
  }
  if (metres <= 800) {
    return "map-referenced";
  }
  if (metres <= 1_500) {
    return "sheet-referenced";
  }
  return "community";
}

const BAND_LABELS = Object.fromEntries(
  WELL_ACCURACY_BANDS.map(({ accuracy, label }) => [accuracy, label]),
) as Record<WellLocationAccuracy, string>;

/** Labels come from the band table so the legend cannot drift from the bands. */
export function wellAccuracyLabel(accuracy: WellLocationAccuracy): string {
  return BAND_LABELS[accuracy];
}

/**
 * The sentence shown in the popup. Coarse records are described as a report
 * near a place, never as a located well.
 */
export function wellAccuracyStatement(
  accuracy: WellLocationAccuracy,
  metres: number | null | undefined,
): string {
  if (accuracy === "unknown") {
    return "This record carries no location-accuracy estimate. Treat the marker as a rough indication only.";
  }

  const rounded =
    typeof metres === "number" && Number.isFinite(metres) && metres > 0
      ? Math.round(metres)
      : null;
  const distance = rounded === null ? null : formatAccuracyDistance(rounded);

  if (accuracy === "surveyed") {
    return distance === null
      ? "Surveyed coordinate."
      : `Surveyed coordinate, reported accurate to about ±${distance}.`;
  }

  return distance === null
    ? "A well was reported near here. The marker is not the well location."
    : `A well was reported within about ${distance} of here. The marker is not the well location.`;
}

function formatAccuracyDistance(metres: number): string {
  return metres >= 1_000
    ? `${(metres / 1_000).toFixed(metres % 1_000 === 0 ? 0 : 1)} km`
    : `${metres} m`;
}

const ACCURACY_COLOURS: Record<WellLocationAccuracy, string> = {
  surveyed: "#0ea5e9",
  "map-referenced": "#7dd3fc",
  "sheet-referenced": "#bae6fd",
  community: "#cbd5e1",
  unknown: "#e2e8f0",
};

/**
 * Only surveyed wells get a filled dot. Every coarser band is drawn hollow and
 * dashed so it reads as an area report rather than a plotted point.
 */
export function wellLogMarkerStyle(
  accuracy: WellLocationAccuracy,
): PathOptions {
  if (accuracy === "surveyed") {
    return {
      color: "#ffffff",
      fillColor: ACCURACY_COLOURS.surveyed,
      fillOpacity: 0.95,
      weight: 1.5,
      opacity: 1,
    };
  }

  return {
    color: ACCURACY_COLOURS[accuracy],
    fillColor: ACCURACY_COLOURS[accuracy],
    fillOpacity: 0.12,
    weight: 1.25,
    opacity: 0.75,
    dashArray: "2 2",
  };
}

export function wellLogMarkerRadius(accuracy: WellLocationAccuracy): number {
  return accuracy === "surveyed" ? 5 : 4;
}

/** Monochrome equivalent for the print sheet. */
export function printWellLogMarkerStyle(
  accuracy: WellLocationAccuracy,
): PathOptions {
  if (accuracy === "surveyed") {
    return {
      color: "#111111",
      fillColor: "#4b4b4b",
      fillOpacity: 0.85,
      weight: 1.25,
      opacity: 1,
    };
  }

  return {
    color: "#111111",
    fillColor: "#ffffff",
    fillOpacity: 0,
    weight: 1,
    opacity: 0.7,
    dashArray: "2 2",
  };
}

export type WellLogAccuracyFilter = "surveyed" | "all";

/**
 * Pushes the accuracy filter into the service query so hidden coarse records
 * are never transferred. `GEOREF_A` is populated for every published record,
 * so the surveyed clause needs no null branch.
 */
export function wellAccuracyWhereClause(
  filter: WellLogAccuracyFilter,
): string {
  return filter === "surveyed" ? "GEOREF_A > 0 AND GEOREF_A <= 50" : "1=1";
}

export type WellLogProperties = {
  wellNumber: string | null;
  completedOn: string | null;
  depthMetres: number | null;
  casingMetres: number | null;
  bedrockDepthMetres: number | null;
  staticLevelMetres: number | null;
  yieldLitresPerMinute: number | null;
  accuracyMetres: number | null;
  accuracy: WellLocationAccuracy;
  coordinateSource: string | null;
};

export type WellLogFeature = GeoJSON.Feature<GeoJSON.Point, WellLogProperties>;
export type WellLogCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  WellLogProperties
>;

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The published table uses -9999 as its no-data marker across every
 * measurement column, so it has to be dropped rather than rendered as a depth.
 * Small negative static levels are left alone: they are real readings for
 * flowing wells where water stands above ground.
 */
const NO_DATA_SENTINEL = -9_999;

function measurementValue(value: unknown): number | null {
  const numeric = numberValue(value);
  return numeric === null || numeric <= NO_DATA_SENTINEL ? null : numeric;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** The service returns completion dates as epoch milliseconds. */
export function formatWellCompletionDate(value: unknown): string | null {
  const epochMilliseconds = numberValue(value);
  if (epochMilliseconds === null) {
    return null;
  }
  const completed = new Date(epochMilliseconds);
  if (Number.isNaN(completed.getTime())) {
    return null;
  }
  return completed.toISOString().slice(0, 10);
}

export function toWellLogProperties(
  properties: Record<string, unknown>,
): WellLogProperties {
  const accuracyMetres = numberValue(properties.GEOREF_A);

  return {
    wellNumber: textValue(properties.WELLNUM),
    completedOn: formatWellCompletionDate(properties.DATE),
    depthMetres: measurementValue(properties.DEPTH),
    casingMetres: measurementValue(properties.CASING),
    bedrockDepthMetres: measurementValue(properties.BEDROCK),
    staticLevelMetres: measurementValue(properties.STATIC),
    yieldLitresPerMinute: measurementValue(properties.YIELD_LPM),
    accuracyMetres,
    accuracy: classifyWellAccuracy(accuracyMetres),
    coordinateSource: textValue(properties.GEOREF_S),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function measurementText(value: number | null, unit: string): string {
  return value === null ? "Not recorded" : `${value.toFixed(1)} ${unit}`;
}

/**
 * Leaflet assigns string tooltip and popup content with `innerHTML`, so text
 * taken from the live service has to be escaped here rather than interpolated
 * raw.
 */
export function wellLogTooltipHtml(properties: WellLogProperties): string {
  return escapeHtml(
    `Well ${properties.wellNumber ?? "record"} · ${wellAccuracyLabel(
      properties.accuracy,
    )}`,
  );
}

export function wellLogPopupHtml(properties: WellLogProperties): string {
  const rows: [string, string][] = [
    ["Completed", properties.completedOn ?? "Not recorded"],
    ["Depth", measurementText(properties.depthMetres, "m")],
    ["Casing", measurementText(properties.casingMetres, "m")],
    ["Depth to bedrock", measurementText(properties.bedrockDepthMetres, "m")],
    ["Static level", measurementText(properties.staticLevelMetres, "m")],
    ["Yield", measurementText(properties.yieldLitresPerMinute, "L/min")],
    ["Coordinate source", properties.coordinateSource ?? "Not recorded"],
  ];

  return `
    <article class="well-log-popup well-log-popup--${properties.accuracy}">
      <p class="well-log-popup-eyebrow">NS well logs · DP ME 430</p>
      <h3>Well ${escapeHtml(properties.wellNumber ?? "record")}</h3>
      <p class="well-log-popup-accuracy">${escapeHtml(
        wellAccuracyStatement(properties.accuracy, properties.accuracyMetres),
      )}</p>
      <dl>
        ${rows
          .map(
            ([term, detail]) =>
              `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(
                detail,
              )}</dd></div>`,
          )
          .join("")}
      </dl>
      <p class="well-log-popup-note">Reported by the well driller. Not a survey, and not proof of a usable water supply.</p>
    </article>
  `;
}

export async function fetchWellLogs({
  serviceUrl,
  bounds,
  filter,
  signal,
}: {
  serviceUrl: string;
  bounds: MapEnvelope;
  filter: WellLogAccuracyFilter;
  signal?: AbortSignal;
}): Promise<WellLogCollection> {
  const collection = await fetchArcGISFeatureOverlay({
    serviceUrl,
    bounds,
    outFields: WELL_LOG_OUT_FIELDS,
    where: wellAccuracyWhereClause(filter),
    orderByFields: "OBJECTID",
    idField: "OBJECTID",
    signal,
  });

  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      ...feature,
      properties: toWellLogProperties(feature.properties ?? {}),
    })),
  };
}
