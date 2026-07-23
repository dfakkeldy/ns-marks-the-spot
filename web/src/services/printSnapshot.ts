import type { CivicAddress } from "./civicAddresses";
import type { ParcelBuildingCount } from "./buildings";
import type { ParcelFloodHazardEvidence } from "./floodHazard";
import {
  buildMapShareUrl,
  type MapMode,
  type MapPosition,
  type ShareLayerId,
} from "./mapShareState";
import type { NsprdFeatureCollection } from "./nsprd";
import type { ParcelContext, MappedArea } from "./parcelContext";
import type { ParcelResourceIntersections } from "./parcelResources";
import type { ParcelAssessmentResult } from "./pvscAssessments";

export type PrintTemplate = "research" | "field";

export type PrintLoadState<T> =
  | { status: "pending" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export type PrintMapBounds = {
  north: number;
  east: number;
  south: number;
  west: number;
};

export type PrintMapViewport = {
  position: MapPosition;
  bounds: PrintMapBounds;
};

export type PrintLayerSource = {
  id: ShareLayerId;
  name: string;
  sourceUrl: string;
  sourceDate: string;
  attribution: string;
  licenceUrl: string;
};

export type PrintEvent = {
  name: string;
  status: string;
  facts: Array<{ label: string; value: string }>;
  sources: Array<{ label: string; sourceUrl: string }>;
  limitation: string;
};

export type PrintEvidence = {
  mappedArea: MappedArea | null;
  buildings: PrintLoadState<ParcelBuildingCount>;
  assessments: PrintLoadState<ParcelAssessmentResult>;
  civicAddresses: PrintLoadState<CivicAddress[]>;
  mappedContext: PrintLoadState<ParcelContext>;
  floodHazard: PrintLoadState<ParcelFloodHazardEvidence>;
  resources: PrintLoadState<ParcelResourceIntersections>;
};

export type PrintCaptureBase = {
  token: string;
  capturedAt: string;
  pid: string;
  mode: MapMode;
  eventIds: string[];
  events: PrintEvent[];
  selectedParcelGeometry: NsprdFeatureCollection;
  mapParcels: NsprdFeatureCollection;
  taxSalePids: string[];
  historicalTaxSalePids: string[];
  viewport: PrintMapViewport;
  layerIds: ShareLayerId[];
  layerSources: PrintLayerSource[];
  licenceAccepted: boolean;
};

export type PrintCapture = PrintCaptureBase & {
  evidence: PrintEvidence;
};

export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export type PrintSnapshot = DeepReadonly<PrintCapture & {
  template: PrintTemplate;
  generatedAt: string;
}>;

export type PrintScale = {
  label: string;
  metres: number;
  pixels: number;
};

const RESEARCH_KEYS = [
  "buildings",
  "assessments",
  "civicAddresses",
  "mappedContext",
  "floodHazard",
  "resources",
] as const;

type EvidenceKey = (typeof RESEARCH_KEYS)[number];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(
  value: T,
  frozen = new WeakSet<object>(),
): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !frozen.has(value)) {
    frozen.add(value);
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue, frozen);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export function boundsForParcelGeometry(
  collection: NsprdFeatureCollection,
): PrintMapBounds {
  const coordinates: Array<[number, number]> = [];
  const visit = (value: unknown): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinates.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
    }
  };
  const visitGeometry = (geometry: GeoJSON.Geometry): void => {
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visitGeometry);
      return;
    }
    visit(geometry.coordinates);
  };

  collection.features.forEach(({ geometry }) => visitGeometry(geometry));
  if (coordinates.length === 0) {
    throw new Error("Print bounds require selected parcel geometry.");
  }
  return {
    north: Math.max(...coordinates.map(([, latitude]) => latitude)),
    east: Math.max(...coordinates.map(([longitude]) => longitude)),
    south: Math.min(...coordinates.map(([, latitude]) => latitude)),
    west: Math.min(...coordinates.map(([longitude]) => longitude)),
  };
}

export function printBoundsForTemplate(
  capture: PrintCapture,
  template: PrintTemplate,
): PrintMapBounds {
  return template === "research"
    ? boundsForParcelGeometry(capture.selectedParcelGeometry)
    : capture.viewport.bounds;
}

export function printedLayerIds(
  layerIds: ShareLayerId[],
  includeAerial: boolean,
): ShareLayerId[] {
  return layerIds.filter((id) => id !== "ns-aerial" || includeAerial);
}

export function printScaleForPosition(
  position: MapPosition,
  maximumPixels = 90,
): PrintScale {
  const metresPerPixel =
    156_543.033_92 *
    Math.cos((position.latitude * Math.PI) / 180) /
    2 ** position.zoom;
  const targetMetres = metresPerPixel * maximumPixels;
  const magnitude = 10 ** Math.floor(Math.log10(targetMetres));
  const normalized = targetMetres / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  const metres = multiplier * magnitude;
  return {
    label: metres >= 1_000 ? `${metres / 1_000} km` : `${metres} m`,
    metres,
    pixels: metres / metresPerPixel,
  };
}

export function buildPrintMapShareUrl(
  baseUrl: string,
  snapshot: PrintSnapshot,
  position: MapPosition,
  includeAerial: boolean,
): string {
  return buildMapShareUrl(baseUrl, {
    mode: snapshot.mode,
    pid: snapshot.pid,
    eventIds: [...snapshot.eventIds],
    layerIds: printedLayerIds([...snapshot.layerIds], includeAerial),
    position,
  });
}

export function startPrintCapture(
  base: PrintCaptureBase,
  evidence: PrintEvidence,
): PrintCapture {
  return clone({ ...base, evidence });
}

export function updatePrintCaptureEvidence(
  capture: PrintCapture,
  update: { token: string; pid: string; evidence: PrintEvidence },
): PrintCapture {
  if (update.token !== capture.token || update.pid !== capture.pid) {
    return capture;
  }
  return clone({ ...capture, evidence: update.evidence });
}

export function printCaptureReadiness(
  capture: PrintCapture,
  template: PrintTemplate,
): { ready: boolean; pending: EvidenceKey[] } {
  if (template === "field") {
    return { ready: true, pending: [] };
  }
  const pending = RESEARCH_KEYS.filter(
    (key) => capture.evidence[key].status === "pending",
  );
  return { ready: pending.length === 0, pending };
}

export function sealPrintSnapshot(
  capture: PrintCapture,
  template: PrintTemplate,
  options: { timedOut: boolean; generatedAt: string },
): PrintSnapshot {
  const unavailableIfPending = <T,>(
    state: PrintLoadState<T>,
  ): PrintLoadState<T> =>
    state.status === "pending"
      ? { status: "error", message: "Source unavailable at export time." }
      : state;
  const clonedEvidence = clone(capture.evidence);
  const evidence = template === "research" && options.timedOut
    ? {
        ...clonedEvidence,
        buildings: unavailableIfPending(clonedEvidence.buildings),
        assessments: unavailableIfPending(clonedEvidence.assessments),
        civicAddresses: unavailableIfPending(clonedEvidence.civicAddresses),
        mappedContext: unavailableIfPending(clonedEvidence.mappedContext),
        floodHazard: unavailableIfPending(clonedEvidence.floodHazard),
        resources: unavailableIfPending(clonedEvidence.resources),
      }
    : clonedEvidence;
  if (!options.timedOut && !printCaptureReadiness(capture, template).ready) {
    throw new Error("Print snapshot cannot seal while evidence is pending.");
  }
  return deepFreeze(clone({
    ...capture,
    evidence,
    template,
    generatedAt: options.generatedAt,
  }));
}
