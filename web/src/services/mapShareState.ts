import { initialElectoralModes, isElectoralLayerId, type ElectoralLayerId, type ElectoralMode } from "../layers/electoralLayers";
import { contextLayerCatalog, type ContextLayerId } from "../layers/contextLayerCatalog";
import { forestryExclusionReason } from "../layers/forestryExclusions";
import { isBasemapStyle, type BasemapStyle } from "../atlas/basemap";
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
  | LiveConditionsLayerId
  | ContextLayerId;

export type MapPosition = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type MapShareState = {
  electoralModes?: Partial<Record<ElectoralLayerId, ElectoralMode>>;
  basemapStyle?: BasemapStyle;
  taxSaleEnabled: boolean;
  mode: MapMode;
  pid: string | null;
  eventIds: string[];
  layerIds: ShareLayerId[];
  position: MapPosition;
  /**
   * The built-in setup a link names outright, unvalidated here: this module
   * owns layer, tax-sale, and position parameters, and `mapThemes` owns which
   * setup IDs exist. `App` decides whether the name is real and whether the
   * rest of the link agrees with it. Absent when no setup is named, the same
   * way `basemapStyle` is: a link that stands for exactly the layers it lists
   * — a printed map's, say — names none.
   */
  themeId?: string;
  /**
   * A focus page's month filter (1-12) and selected spot (`S01`). Like
   * `electoral`, they ride along with the map state without counting as
   * shared map state: a month-only link is still a first visit.
   */
  month?: number;
  spot?: string;
  /**
   * Fletcher's fade, 0.15-1 in 0.05 steps. Like `electoral`, it is how the
   * map is being looked at, not which setup it is: written only when the
   * sheets are on and the fade differs from the catalogue's, and never
   * counted as shared map state on its own.
   */
  fletcherOpacity?: number;
};

export const FLETCHER_OPACITY_MIN = 0.15;
export const FLETCHER_OPACITY_STEP = 0.05;

/** A Fletcher fade snapped to the slider's steps and range, or undefined. */
export function normalizeFletcherOpacity(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const clamped = Math.min(1, Math.max(FLETCHER_OPACITY_MIN, value));
  return Number((Math.round(clamped / FLETCHER_OPACITY_STEP) * FLETCHER_OPACITY_STEP).toFixed(2));
}

/** `opacity=fletcher:40` → 0.4; anything else → undefined. */
function parseShareOpacity(value: string | null): number | undefined {
  for (const entry of (value ?? "").split(",")) {
    const [id, percent] = entry.split(":");
    if (id !== "fletcher" || !/^\d{1,3}$/u.test(percent ?? "")) continue;
    return normalizeFletcherOpacity(Number(percent) / 100);
  }
  return undefined;
}

/** A spot id's shape; whether the spot exists is the page's call. */
const SPOT_ID_PATTERN = /^S\d{2}$/u;

export function parseShareMonth(value: string | null): number | undefined {
  return value !== null && /^(?:[1-9]|1[0-2])$/u.test(value) ? Number(value) : undefined;
}

export function parseShareSpot(value: string | null): string | undefined {
  return value !== null && SPOT_ID_PATTERN.test(value) ? value : undefined;
}

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
  ...contextLayerCatalog.map(({ id }) => id),
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
  const parts = (value ?? "").split(",");
  // Number("") is zero: a missing coordinate must not turn into a real
  // position at the edge of the province after clamping.
  if (parts.length !== 3 || parts.some((part) => part.trim() === "")) {
    return DEFAULT_MAP_POSITION;
  }
  const [rawLatitude, rawLongitude, rawZoom] = parts;
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
  // The interface writes "Hand-drawn", so the hyphenated spelling is the one a
  // person types; the id itself has no hyphen.
  const basemapParam = url.searchParams.get("basemap");
  const basemap = basemapParam === "hand-drawn" ? "handdrawn" : basemapParam;
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
  const themeId = url.searchParams.get("theme")?.trim();
  const electoralModes: Partial<Record<ElectoralLayerId, ElectoralMode>> = {};
  for (const entry of (url.searchParams.get("electoral") ?? "").split(",")) {
    const [id, value] = entry.split(":");
    if (isElectoralLayerId(id) && ["boundaries", "winner", "margin", "turnout"].includes(value)
        && (id === "provincial-results-2024" || id === "provincial-seats-2026" && ["boundaries", "winner"].includes(value))) electoralModes[id] = value as ElectoralMode;
  }
  const month = parseShareMonth(url.searchParams.get("month"));
  const spot = parseShareSpot(url.searchParams.get("spot"));
  const fletcherOpacity = layerIds.includes("fletcher")
    ? parseShareOpacity(url.searchParams.get("opacity"))
    : undefined;

  return {
    ...(isBasemapStyle(basemap) ? { basemapStyle: basemap } : {}),
    taxSaleEnabled,
    mode,
    ...(Object.keys(electoralModes).length ? { electoralModes } : {}),
    pid: normalizePid(url.searchParams.get("pid") ?? ""),
    eventIds,
    layerIds,
    position: parsePosition(url.searchParams.get("position")),
    ...(themeId ? { themeId } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(spot !== undefined ? { spot } : {}),
    ...(fletcherOpacity !== undefined ? { fletcherOpacity } : {}),
  };
}

/**
 * `theme` is deliberately absent. These keys mean "this link carries map state
 * to restore instead of a first-visit default", and a link that names a setup
 * without any of them carries no layer list to restore — the named setup
 * supplies one. Listing `theme` here would restore an empty layer set and open
 * the map with nothing drawn. `month` and `spot` are absent for a similar
 * reason: they filter and select a focus page's own list, so a link carrying
 * only them still opens a phone on the page's summary.
 */
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
  if (state.themeId) url.searchParams.set("theme", state.themeId);
  url.searchParams.set("taxSale", state.taxSaleEnabled ? "on" : "off");
  url.searchParams.set("mode", state.mode);
  if (state.pid) {
    url.searchParams.set("pid", state.pid);
  }
  if (state.taxSaleEnabled && state.eventIds.length > 0) {
    url.searchParams.set("event", state.eventIds.join(","));
  }
  url.searchParams.set("layers", state.layerIds.filter(id => forestryExclusionReason(id) === null).join(","));
  const modes = Object.entries(state.electoralModes ?? {}).filter(([id,mode]) => isElectoralLayerId(id) && state.layerIds.includes(id) && mode !== initialElectoralModes[id]);
  if (modes.length) url.searchParams.set("electoral", modes.map(([id,mode]) => `${id}:${mode}`).join(","));
  const month = parseShareMonth(state.month === undefined ? null : String(state.month));
  if (month !== undefined) url.searchParams.set("month", String(month));
  const spot = parseShareSpot(state.spot ?? null);
  if (spot !== undefined) url.searchParams.set("spot", spot);
  const fletcherOpacity = state.fletcherOpacity === undefined
    ? undefined
    : normalizeFletcherOpacity(state.fletcherOpacity);
  if (fletcherOpacity !== undefined && state.layerIds.includes("fletcher")) {
    url.searchParams.set("opacity", `fletcher:${Math.round(fletcherOpacity * 100)}`);
  }
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
