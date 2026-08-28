import type { HydroPotentialClass } from "../services/hydroPotential";

export type InvernessHydroPotentialProperties = {
  watershedCode: string;
  watershedName: string;
  catchmentResolution: "tertiary" | "tertiary/sub-tertiary";
  networkRole: "trunk" | "tributary";
  upstreamAreaKm2: number;
  dropThresholdMetres: number | null;
  downstreamRouteLengthKm: number | null;
  averageMappedFallMetresPerKm: number | null;
  nominalFlowLitresPerSecond: number | null;
  indicativePowerKw: number | null;
  screeningValue: number | null;
  downstreamEndpoint: [number, number] | null;
  sourceSegmentId: string;
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
    tributaryReachCount: number;
    qualifyingReachCount: number;
    targetBandReachCount: number;
    dropThresholdsMetres: number[];
    maxDownstreamDistanceKm: number;
    nominalSpecificDischargeLitresPerSecondPerKm2: number;
    nominalSystemEfficiency: number;
    nominalPowerBandKw: [number, number];
    hydrometricCalibration: {
      source: string;
      period: string;
      stations: Array<{
        id: string;
        name: string;
        drainageAreaKm2: number;
        tenthPercentileSpecificDischargeLitresPerSecondPerKm2: number;
      }>;
    };
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
