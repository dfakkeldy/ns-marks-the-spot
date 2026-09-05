import type { BasemapStyle } from "../atlas/basemap";
import { taxSaleEvents } from "../data/taxSaleCatalog";
import { historicalTaxSaleEvents } from "../data/historicalTaxSales";
import {
  allResourceLayerCatalog,
  environmentalHealthLayerCatalog,
  forestryLayerCatalog,
  floodHazardLayerCatalog,
  fletcherLayerCatalog,
  hydroPilotLayerCatalog,
  liveConditionsLayerCatalog,
  provinceLayerCatalog,
  type EnvironmentalHealthLayerId,
  type ForestryLayerId,
  wellLogLayerCatalog,
  type HydroPilotLayerId,
  type FloodHazardLayerId,
  type FletcherLayerId,
  type LiveConditionsLayerId,
  type ProvinceLayerId,
  type ResourceLayerId,
  type ZoningLayerId,
  zoningLayerCatalog,
  type WellLogLayerId,
} from "../layers/layerCatalog";
import { normalizePid } from "./nsprd";

export type MapMode = "current" | "historical";
export type ShareLayerId =
  | "modern"
  | FletcherLayerId
  | ProvinceLayerId
  | ResourceLayerId
  | HydroPilotLayerId
  | FloodHazardLayerId
  | EnvironmentalHealthLayerId
  | ForestryLayerId
  | ZoningLayerId
  | WellLogLayerId
  | LiveConditionsLayerId;

export type MapPosition = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type MapShareState = {
  basemapStyle?: BasemapStyle;
  taxSaleEnabled: boolean;
  mode: MapMode;
  pid: string | null;
  eventIds: string[];
  layerIds: ShareLayerId[];
  position: MapPosition;
};

export const DEFAULT_MAP_POSITION: MapPosition = {
  latitude: 46.08,
  longitude: -60.92,
  zoom: 9,
};

export const NOVA_SCOTIA_BOUNDS = {
  south: 43,
  west: -66.5,
  north: 47.5,
  east: -59,
};

const validEventIds = new Set([
  ...taxSaleEvents.map(({ id }) => id),
  ...historicalTaxSaleEvents.map(({ id }) => id),
]);
const shareLayerIdSet = new Set<ShareLayerId>([
  "modern",
  fletcherLayerCatalog.id,
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog.map(({ id }) => id),
  ...hydroPilotLayerCatalog.map(({ id }) => id),
  ...floodHazardLayerCatalog.map(({ id }) => id),
  ...environmentalHealthLayerCatalog.map(({ id }) => id),
  ...forestryLayerCatalog.map(({ id }) => id),
  ...zoningLayerCatalog.map(({ id }) => id),
  ...wellLogLayerCatalog.map(({ id }) => id),
  ...liveConditionsLayerCatalog.map(({ id }) => id),
]);

export function isShareLayerId(value: unknown): value is ShareLayerId {
  return typeof value === "string" && shareLayerIdSet.has(value as ShareLayerId);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function parsePosition(value: string | null): MapPosition {
  const [rawLatitude, rawLongitude, rawZoom] = (value ?? "").split(",");
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  const zoom = Number(rawZoom);

  if (![latitude, longitude, zoom].every(Number.isFinite)) {
    return DEFAULT_MAP_POSITION;
  }

  return {
    latitude: clamp(latitude, NOVA_SCOTIA_BOUNDS.south, NOVA_SCOTIA_BOUNDS.north),
    longitude: clamp(longitude, NOVA_SCOTIA_BOUNDS.west, NOVA_SCOTIA_BOUNDS.east),
    zoom: clamp(Math.round(zoom), 7, 23),
  };
}

export function parseMapShareState(value: string): MapShareState {
  const url = new URL(value, "https://example.invalid");
  const basemap = url.searchParams.get("basemap");
  const explicitTaxSale = url.searchParams.get("taxSale");
  const taxSaleEnabled = explicitTaxSale === "on"
    ? true
    : explicitTaxSale === "off"
      ? false
      : url.searchParams.has("mode") || url.searchParams.has("event");
  const mode = url.searchParams.get("mode") === "historical"
    ? "historical"
    : "current";
  const eventIds = (url.searchParams.get("event") ?? "")
    .split(",")
    .filter((id) => validEventIds.has(id));
  const layerIds = (url.searchParams.get("layers") ?? "")
    .split(",")
    .filter(isShareLayerId);

  return {
    ...(basemap === "day" || basemap === "night" || basemap === "osm"
      ? { basemapStyle: basemap } : {}),
    taxSaleEnabled,
    mode,
    pid: normalizePid(url.searchParams.get("pid") ?? ""),
    eventIds,
    layerIds,
    position: parsePosition(url.searchParams.get("position")),
  };
}

const recognizedShareKeys = [
  "taxSale",
  "mode",
  "event",
  "pid",
  "layers",
  "position",
] as const;

export function hasRecognizedMapShareState(value: string): boolean {
  const url = new URL(value, "https://example.invalid");
  return recognizedShareKeys.some((key) => url.searchParams.has(key));
}

function compactCoordinate(value: number): string {
  return value.toFixed(5).replace(/\.?0+$/u, "");
}

export function buildMapShareUrl(
  baseUrl: string,
  state: MapShareState,
): string {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  if (state.basemapStyle) url.searchParams.set("basemap", state.basemapStyle);
  url.searchParams.set("taxSale", state.taxSaleEnabled ? "on" : "off");
  url.searchParams.set("mode", state.mode);
  if (state.pid) {
    url.searchParams.set("pid", state.pid);
  }
  if (state.taxSaleEnabled && state.eventIds.length > 0) {
    url.searchParams.set("event", state.eventIds.join(","));
  }
  url.searchParams.set("layers", state.layerIds.join(","));
  url.searchParams.set(
    "position",
    [
      compactCoordinate(state.position.latitude),
      compactCoordinate(state.position.longitude),
      state.position.zoom,
    ].join(","),
  );
  return url.toString();
}
