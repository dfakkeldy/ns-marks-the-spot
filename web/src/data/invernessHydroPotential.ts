import type { HydroPotentialClass } from "../services/hydroPotential";

export type InvernessHydroPotentialProperties = {
  watershedCode: string;
  watershedName: string;
  catchmentResolution: "tertiary" | "tertiary/sub-tertiary";
  upstreamAreaKm2: number;
  dropThresholdMetres: number | null;
  downstreamRouteLengthKm: number | null;
  averageMappedFallMetresPerKm: number | null;
  screeningValue: number | null;
  downstreamEndpoint: [number, number] | null;
  sourceSegmentId: string;
  pilotPercentile: number | null;
  potentialClass: HydroPotentialClass;
};

export type InvernessHydroPotentialCollection = GeoJSON.FeatureCollection<
  GeoJSON.MultiLineString,
  InvernessHydroPotentialProperties
> & {
  metadata: {
    title: string;
    retrievedOn: string;
    municipalityDataset: string;
    secondaryWatershedDataset: string;
    catchmentDatasets: {
      tertiary: string;
      subTertiary: string;
    };
    minimumCatchmentCoverage: number;
    nshnService: string;
    nshnLayers: number[];
    watershedCount: number;
    reachCount: number;
    qualifyingReachCount: number;
    dropThresholdsMetres: number[];
    maxDownstreamDistanceKm: number;
    method: string;
    limitations: string;
  };
};

export async function loadInvernessHydroPotential(): Promise<
  InvernessHydroPotentialCollection
> {
  const { default: pilotData } = await import("./invernessHydroPotential.json");
  return pilotData as InvernessHydroPotentialCollection;
}
