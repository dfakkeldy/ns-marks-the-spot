import type { ZoningLayerDescriptor } from "../layers/layerCatalog";
import {
  fetchArcGISFeatureOverlay,
  type ArcGISFeatureCollection,
  type MapEnvelope,
} from "./arcGISFeatureOverlay";

export type ZoningGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
export type ZoningFeatureCollection = ArcGISFeatureCollection<ZoningGeometry>;

export type ZoningDescription = {
  code: string | null;
  name: string | null;
  planArea: string | null;
};

export const EMPTY_ZONING_FEATURES: ZoningFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function readText(
  properties: Record<string, unknown>,
  field: string | null,
): string | null {
  if (!field) {
    return null;
  }

  const value = properties[field];
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

/**
 * Municipalities encode the zone name three ways: code-prefixed
 * ("CR Commercial Recreation", Inverness and Victoria), code-suffixed
 * ("Agriculture (AG)", Cumberland), or bare ("Agricultural Potential",
 * Richmond and Halifax). Strip the redundant code so a popup never reads
 * "CR — CR Commercial Recreation".
 */
function stripRedundantCode(name: string, code: string | null): string {
  if (!code) {
    return name;
  }

  if (name.toLocaleUpperCase().startsWith(`${code.toLocaleUpperCase()} `)) {
    return name.slice(code.length).trim();
  }

  const suffix = ` (${code})`;
  if (name.toLocaleUpperCase().endsWith(suffix.toLocaleUpperCase())) {
    return name.slice(0, name.length - suffix.length).trim();
  }

  return name;
}

export function describeZoningFeature(
  properties: Record<string, unknown>,
  descriptor: Pick<
    ZoningLayerDescriptor,
    "zoneCodeField" | "zoneNameField" | "planAreaField"
  >,
): ZoningDescription {
  const code = readText(properties, descriptor.zoneCodeField);
  const rawName = readText(properties, descriptor.zoneNameField);
  const name = rawName ? stripRedundantCode(rawName, code) : null;

  return {
    code,
    name: name && name.length > 0 ? name : null,
    planArea: readText(properties, descriptor.planAreaField),
  };
}

/** Single-line label for the hover tooltip. */
export function zoningFeatureLabel(description: ZoningDescription): string {
  const { code, name } = description;

  if (code && name) {
    return `${code} — ${name}`;
  }

  return code ?? name ?? "Zone not stated";
}

export async function fetchZoningPolygons(
  descriptor: ZoningLayerDescriptor,
  bounds: MapEnvelope,
  signal?: AbortSignal,
): Promise<ZoningFeatureCollection> {
  return fetchArcGISFeatureOverlay<ZoningGeometry>({
    serviceUrl: descriptor.serviceUrl,
    bounds,
    outFields: descriptor.outFields,
    orderByFields: descriptor.orderByFields,
    idField: descriptor.idField,
    signal,
  });
}
