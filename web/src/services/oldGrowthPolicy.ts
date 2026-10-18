import { OLD_GROWTH_POLICY_SERVICE_URL } from "../layers/layerCatalog";
import type { MapEnvelope } from "./arcGISFeatureOverlay";

export const OLD_GROWTH_POLICY_PAGE_SIZE = 1_000;

const OLD_GROWTH_POLICY_SELECT_FIELDS = [
  ":id",
  "the_geom",
  "selmethod",
  "old_growth",
  "selmethtxt",
  "oldgrowtxt",
  "hectares",
].join(",");
const MAX_POLICY_PAGES = 10;

export type OldGrowthPolicyGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon;

export type OldGrowthPolicyFeature = GeoJSON.Feature<
  OldGrowthPolicyGeometry,
  Record<string, unknown>
>;

export type OldGrowthPolicyFeatureCollection = GeoJSON.FeatureCollection<
  OldGrowthPolicyGeometry,
  Record<string, unknown>
>;

export type OldGrowthPolicyStatus =
  | "confirmed-old-growth"
  | "restoration-opportunity"
  | "unknown";

export type OldGrowthPolicyDescription = {
  status: OldGrowthPolicyStatus;
  statusLabel: string;
  hectares: number | null;
  selectionMethod: string | null;
};

export const EMPTY_OLD_GROWTH_POLICY_FEATURES: OldGrowthPolicyFeatureCollection =
  {
    type: "FeatureCollection",
    features: [],
  };

function readText(
  properties: Record<string, unknown>,
  field: string,
): string | null {
  const value = properties[field];
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readHectares(properties: Record<string, unknown>): number | null {
  const rawValue = readText(properties, "hectares");
  if (!rawValue) {
    return null;
  }

  const hectares = Number(rawValue);
  return Number.isFinite(hectares) && hectares >= 0 ? hectares : null;
}

export function describeOldGrowthPolicyFeature(
  properties: Record<string, unknown>,
): OldGrowthPolicyDescription {
  const sourceStatus = readText(properties, "old_growth");
  const status: OldGrowthPolicyStatus =
    sourceStatus === "1"
      ? "confirmed-old-growth"
      : sourceStatus === "2"
        ? "restoration-opportunity"
        : "unknown";

  return {
    status,
    statusLabel:
      status === "confirmed-old-growth"
        ? "Confirmed old growth"
        : status === "restoration-opportunity"
          ? "Restoration opportunity"
          : "Status unknown",
    hectares: readHectares(properties),
    selectionMethod: readText(properties, "selmethtxt"),
  };
}

export function buildOldGrowthPolicyQueryUrl(
  bounds: MapEnvelope,
  offset = 0,
): string {
  const url = new URL(OLD_GROWTH_POLICY_SERVICE_URL);
  url.searchParams.set("$select", OLD_GROWTH_POLICY_SELECT_FIELDS);
  url.searchParams.set(
    "$where",
    `within_box(the_geom,${bounds.north},${bounds.west},${bounds.south},${bounds.east})`,
  );
  url.searchParams.set("$order", ":id");
  url.searchParams.set("$limit", String(OLD_GROWTH_POLICY_PAGE_SIZE));
  url.searchParams.set("$offset", String(offset));
  return url.toString();
}

function isPolicyGeometry(
  value: unknown,
): value is OldGrowthPolicyGeometry {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  return value.type === "Polygon" || value.type === "MultiPolygon";
}

function isPolicyFeature(value: unknown): value is OldGrowthPolicyFeature {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "Feature" &&
      "geometry" in value &&
      isPolicyGeometry(value.geometry) &&
      "properties" in value &&
      value.properties &&
      typeof value.properties === "object" &&
      !Array.isArray(value.properties),
  );
}

function readPolicyFeatures(value: unknown): OldGrowthPolicyFeature[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("features" in value) ||
    !Array.isArray(value.features)
  ) {
    throw new Error("Old-growth policy source returned an invalid response");
  }

  if (!value.features.every(isPolicyFeature)) {
    throw new Error("Old-growth policy source returned an invalid feature");
  }

  return value.features;
}

export async function fetchOldGrowthPolicyPolygons(
  bounds: MapEnvelope,
  signal?: AbortSignal,
): Promise<OldGrowthPolicyFeatureCollection> {
  const features: OldGrowthPolicyFeature[] = [];

  for (let page = 0; page < MAX_POLICY_PAGES; page += 1) {
    const offset = page * OLD_GROWTH_POLICY_PAGE_SIZE;
    const response = await fetch(buildOldGrowthPolicyQueryUrl(bounds, offset), {
      signal,
      headers: { Accept: "application/geo+json, application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Old-growth policy source returned HTTP ${response.status}`,
      );
    }

    const pageFeatures = readPolicyFeatures(await response.json());
    features.push(...pageFeatures);

    if (pageFeatures.length < OLD_GROWTH_POLICY_PAGE_SIZE) {
      return { type: "FeatureCollection", features };
    }
  }

  throw new Error(
    "Old-growth policy source exceeded the safe pagination limit",
  );
}
