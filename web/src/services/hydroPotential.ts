import type { PathOptions } from "leaflet";

export type HydroPotentialClass =
  | "not-qualified"
  | "low"
  | "moderate"
  | "high"
  | "very-high";

export type HydroTerrainInputs = {
  upstreamAreaKm2: number;
  dropThresholdMetres: number;
  downstreamRouteLengthKm: number;
};

export type HydroTerrainMetrics = {
  averageFallMetresPerKm: number;
  screeningValue: number;
};

const POTENTIAL_COLOURS: Record<HydroPotentialClass, string> = {
  "not-qualified": "#9aaeb4",
  low: "#72b7d2",
  moderate: "#3397b7",
  high: "#08769b",
  "very-high": "#07516f",
};

export function calculateHydroTerrainMetrics({
  upstreamAreaKm2,
  dropThresholdMetres,
  downstreamRouteLengthKm,
}: HydroTerrainInputs): HydroTerrainMetrics {
  if (
    upstreamAreaKm2 <= 0 ||
    dropThresholdMetres <= 0 ||
    downstreamRouteLengthKm <= 0
  ) {
    throw new Error("Hydro terrain measurements must be positive.");
  }

  const averageFallMetresPerKm =
    dropThresholdMetres / downstreamRouteLengthKm;

  return {
    averageFallMetresPerKm,
    screeningValue: Math.log1p(upstreamAreaKm2) * averageFallMetresPerKm,
  };
}

export function potentialClassForPercentile(
  percentile: number,
): HydroPotentialClass {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new Error("Pilot percentile must be between 0 and 1.");
  }
  if (percentile < 0.25) {
    return "low";
  }
  if (percentile < 0.5) {
    return "moderate";
  }
  if (percentile < 0.75) {
    return "high";
  }
  return "very-high";
}

export function hydroLineStyle({
  upstreamAreaKm2,
  potentialClass,
}: {
  upstreamAreaKm2: number;
  potentialClass: HydroPotentialClass;
}): PathOptions {
  const weight = Math.min(
    8,
    Math.max(2, 1.25 + Math.log2(Math.max(0, upstreamAreaKm2) + 1) * 0.7),
  );

  return {
    color: POTENTIAL_COLOURS[potentialClass],
    opacity: 0.92,
    weight,
    lineCap: "round",
    lineJoin: "round",
  };
}

export function hydroPotentialLabel(value: HydroPotentialClass): string {
  if (value === "not-qualified") {
    return "No qualifying drop";
  }
  return value === "very-high"
    ? "Very high"
    : `${value[0].toLocaleUpperCase()}${value.slice(1)}`;
}
