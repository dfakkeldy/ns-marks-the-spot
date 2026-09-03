import type { CivicAddressReading } from "./civicAddresses";
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
import type { PvscDwellingAccount } from "./pvscDwellings";
import type { WellLogAccuracyFilter } from "./wellLogs";

export type PrintTemplate = "research" | "field";

/**
 * What a printed source that never answered says for itself.
 *
 * Kept apart from "unavailable at export time" on purpose. A source that
 * failed has answered, and a reader can weigh a failure; a source that went
 * silent has given nothing at all, and the difference decides whether asking
 * again is worth anything.
 */
export const PRINT_SOURCE_UNANSWERED =
  "This source had not answered when this page was made. Nothing is concluded from its silence.";

/** An evidence slot carrying no value, and why it carries none. */
export type UnsettledPrintLoad =
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "unanswered"; message: string };

export type PrintLoadState<T> =
  | { status: "ready"; value: T }
  | UnsettledPrintLoad;

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
  /** Null when the publisher states no licence terms for the source. */
  licenceUrl: string | null;
};

export type PrintEvent = {
  id: string;
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
  dwellings: PrintLoadState<PvscDwellingAccount[]>;
  civicAddresses: PrintLoadState<CivicAddressReading>;
  mappedContext: PrintLoadState<ParcelContext>;
  floodHazard: PrintLoadState<ParcelFloodHazardEvidence>;
  resources: PrintLoadState<ParcelResourceIntersections>;
};

export type PrintCaptureBase = {
  token: string;
  capturedAt: string;
  pid: string;
  evidenceRequest: { pid: string; generation: number };
  taxSaleEnabled: boolean;
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
  /**
   * Carried so the printed sheet renders the same accuracy bands the user was
   * looking at; without it the print map would silently fall back to surveyed
   * wells while the legend still advertised the approximate ones.
   */
  wellLogAccuracyFilter: WellLogAccuracyFilter;
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
  "dwellings",
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
  collection: DeepReadonly<NsprdFeatureCollection>,
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
  const visitGeometry = (geometry: DeepReadonly<GeoJSON.Geometry>): void => {
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
  capture: Pick<
    DeepReadonly<PrintCapture>,
    "selectedParcelGeometry" | "viewport"
  >,
  template: PrintTemplate,
): PrintMapBounds {
  return template === "research"
    ? boundsForParcelGeometry(capture.selectedParcelGeometry)
    : { ...capture.viewport.bounds };
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
  renderedLayerIds: readonly ShareLayerId[],
): string {
  return buildMapShareUrl(baseUrl, {
    taxSaleEnabled: snapshot.taxSaleEnabled,
    mode: snapshot.mode,
    pid: snapshot.pid,
    eventIds: [...snapshot.eventIds],
    layerIds: [...renderedLayerIds],
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
  update: {
    token: string;
    pid: string;
    evidenceRequest: { pid: string; generation: number };
    evidence: PrintEvidence;
  },
): PrintCapture {
  if (
    update.token !== capture.token ||
    update.pid !== capture.pid ||
    update.evidenceRequest.pid !== capture.evidenceRequest.pid ||
    update.evidenceRequest.generation !== capture.evidenceRequest.generation
  ) {
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
  // A source that ran out of time never answered. Sealing it as an error puts
  // it under the same sentence as a service that failed, and the reader
  // holding the page has no way to tell the two apart.
  const unansweredIfPending = <T,>(
    state: PrintLoadState<T>,
  ): PrintLoadState<T> =>
    state.status === "pending"
      ? { status: "unanswered", message: PRINT_SOURCE_UNANSWERED }
      : state;
  const clonedEvidence = clone(capture.evidence);
  const evidence = template === "research" && options.timedOut
    ? {
        ...clonedEvidence,
        buildings: unansweredIfPending(clonedEvidence.buildings),
        assessments: unansweredIfPending(clonedEvidence.assessments),
        dwellings: unansweredIfPending(clonedEvidence.dwellings),
        civicAddresses: unansweredIfPending(clonedEvidence.civicAddresses),
        mappedContext: unansweredIfPending(clonedEvidence.mappedContext),
        floodHazard: unansweredIfPending(clonedEvidence.floodHazard),
        resources: unansweredIfPending(clonedEvidence.resources),
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

/**
 * What an unsettled slot prints.
 *
 * Every state carries its own sentence, because why a section is blank is what
 * decides whether a reader may conclude anything from it. A slot still pending
 * on a printed page never answered either, so it gets the unanswered sentence
 * rather than being reported as an outage.
 */
export function printEvidenceMessage(state: UnsettledPrintLoad): string {
  return state.status === "pending" ? PRINT_SOURCE_UNANSWERED : state.message;
}

/**
 * What the front-page receipt calls a slot.
 *
 * "Unavailable" and "did not answer" are different receipts. One source gave
 * an answer the page could not use; the other gave nothing, and a receipt that
 * calls both unavailable tells the reader the page was refused when in fact it
 * never heard back.
 */
export function printEvidenceReceiptStatus(state: {
  readonly status: PrintLoadState<unknown>["status"];
}): "captured" | "unavailable" | "did not answer" {
  if (state.status === "ready") return "captured";
  return state.status === "error" ? "unavailable" : "did not answer";
}

/** The appendix headings, so the front page and the appendix agree. */
const RESEARCH_EVIDENCE_NAMES: Record<EvidenceKey, string> = {
  buildings: "Mapped buildings",
  assessments: "Assessment accounts",
  dwellings: "PVSC dwelling characteristics",
  civicAddresses: "Civic addresses",
  mappedContext: "Mapped roads and water",
  floodHazard: "Flood evidence",
  resources: "Resources",
};

/**
 * The sources that never answered, in the order the appendix prints them.
 *
 * Named rather than counted: how long a reader should wait, and whether asking
 * again is worth anything, depends entirely on which source went silent.
 */
export function unansweredEvidenceNames(
  snapshot: Pick<PrintSnapshot, "evidence">,
): string[] {
  return RESEARCH_KEYS.filter(
    (key) => snapshot.evidence[key].status === "unanswered",
  ).map((key) => RESEARCH_EVIDENCE_NAMES[key]);
}
