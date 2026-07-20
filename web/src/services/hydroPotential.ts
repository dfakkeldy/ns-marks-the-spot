import type { PathOptions } from "leaflet";

export type HydroPotentialClass =
  | "low"
  | "moderate"
  | "high"
  | "very-high";

export type HydroTerrainInputs = {
  drainageAreaKm2: number;
  elevationDropMetres: number;
  mainFlowLengthKm: number;
};

export type HydroTerrainMetrics = {
  averageFallMetresPerKm: number;
  screeningValue: number;
};

const POTENTIAL_COLOURS: Record<HydroPotentialClass, string> = {
  low: "#72b7d2",
  moderate: "#3397b7",
  high: "#08769b",
  "very-high": "#07516f",
};

export function calculateHydroTerrainMetrics({
  drainageAreaKm2,
  elevationDropMetres,
  mainFlowLengthKm,
}: HydroTerrainInputs): HydroTerrainMetrics {
  if (
    drainageAreaKm2 <= 0 ||
    elevationDropMetres <= 0 ||
    mainFlowLengthKm <= 0
  ) {
    throw new Error("Hydro terrain measurements must be positive.");
  }

  const averageFallMetresPerKm = elevationDropMetres / mainFlowLengthKm;

  return {
    averageFallMetresPerKm,
    screeningValue: Math.log1p(drainageAreaKm2) * averageFallMetresPerKm,
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
  drainageAreaKm2,
  potentialClass,
}: {
  drainageAreaKm2: number;
  potentialClass: HydroPotentialClass;
}): PathOptions {
  const weight = Math.min(
    8,
    Math.max(2, 1.25 + Math.log2(Math.max(0, drainageAreaKm2) + 1) * 0.7),
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
  return value === "very-high"
    ? "Very high"
    : `${value[0].toLocaleUpperCase()}${value.slice(1)}`;
}
