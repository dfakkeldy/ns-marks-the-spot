import type { PathOptions } from "leaflet";

export type HydroPotentialClass =
  | "not-qualified"
  | "below-1kw"
  | "kw-1-5"
  | "kw-5-15"
  | "kw-15-30"
  | "kw-30-50"
  | "over-50kw";

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
  "not-qualified": "#94a3b8",
  "below-1kw": "#cbd5e1",
  "kw-1-5": "#0d9488",
  "kw-5-15": "#16a34a",
  "kw-15-30": "#d97706",
  "kw-30-50": "#dc2626",
  "over-50kw": "#64748b",
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

export function hydroLineStyle({
  upstreamAreaKm2,
  potentialClass,
}: {
  upstreamAreaKm2: number;
  potentialClass: HydroPotentialClass;
}): PathOptions {
  const weight = Math.min(
    6.5,
    Math.max(1.75, 1.1 + Math.log2(Math.max(0, upstreamAreaKm2) + 1) * 0.55),
  );

  return {
    color: POTENTIAL_COLOURS[potentialClass],
    opacity: potentialClass === "over-50kw" ? 0.72 : 0.92,
    weight,
    lineCap: "round",
    lineJoin: "round",
  };
}

export function hydroPotentialLabel(value: HydroPotentialClass): string {
  const labels: Record<HydroPotentialClass, string> = {
    "not-qualified": "No qualifying drop",
    "below-1kw": "Below 1 kW scale",
    "kw-1-5": "1–5 kW scale",
    "kw-5-15": "5–15 kW scale",
    "kw-15-30": "15–30 kW scale",
    "kw-30-50": "30–50 kW scale",
    "over-50kw": "Above 50 kW scale",
  };
  return labels[value];
}
