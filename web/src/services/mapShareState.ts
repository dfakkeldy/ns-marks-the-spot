import { taxSaleEvents } from "../data/taxSaleCatalog";
import { historicalTaxSaleEvents } from "../data/historicalTaxSales";
import {
  allResourceLayerCatalog,
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  hydroPilotLayerCatalog,
  provinceLayerCatalog,
  type EnvironmentalHealthLayerId,
  wellLogLayerCatalog,
  type HydroPilotLayerId,
  type FloodHazardLayerId,
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
  | ProvinceLayerId
  | ResourceLayerId
  | HydroPilotLayerId
  | FloodHazardLayerId
  | EnvironmentalHealthLayerId
  | ZoningLayerId
  | WellLogLayerId;

export type MapPosition = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type MapShareState = {
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

const NOVA_SCOTIA_BOUNDS = {
  south: 43,
  west: -66.5,
  north: 47.5,
  east: -59,
};

const validEventIds = new Set([
  ...taxSaleEvents.map(({ id }) => id),
  ...historicalTaxSaleEvents.map(({ id }) => id),
]);
const validLayerIds = new Set<ShareLayerId>([
  "modern",
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog.map(({ id }) => id),
  ...hydroPilotLayerCatalog.map(({ id }) => id),
  ...floodHazardLayerCatalog.map(({ id }) => id),
  ...environmentalHealthLayerCatalog.map(({ id }) => id),
  ...zoningLayerCatalog.map(({ id }) => id),
  ...wellLogLayerCatalog.map(({ id }) => id),
]);

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
  const mode = url.searchParams.get("mode") === "historical"
    ? "historical"
    : "current";
  const eventIds = (url.searchParams.get("event") ?? "")
    .split(",")
    .filter((id) => validEventIds.has(id));
  const layerIds = (url.searchParams.get("layers") ?? "")
    .split(",")
    .filter((id): id is ShareLayerId => validLayerIds.has(id as ShareLayerId));

  return {
    mode,
    pid: normalizePid(url.searchParams.get("pid") ?? ""),
    eventIds,
    layerIds,
    position: parsePosition(url.searchParams.get("position")),
  };
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
  url.searchParams.set("mode", state.mode);
  if (state.pid) {
    url.searchParams.set("pid", state.pid);
  }
  if (state.eventIds.length > 0) {
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
