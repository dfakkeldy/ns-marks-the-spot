import type { HydroPotentialClass } from "../services/hydroPotential";

export type InvernessHydroPotentialProperties = {
  watershedCode: string;
  watershedName: string;
  drainageAreaKm2: number;
  elevationDropMetres: number;
  mainFlowLengthKm: number;
  averageFallMetresPerKm: number;
  screeningValue: number;
  sourceSegmentCount: number;
  pilotPercentile: number;
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
    watershedDataset: string;
    nshnService: string;
    nshnLayers: number[];
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
