import type { NsprdFeatureCollection } from "./nsprd";

export const BUILDINGS_DATASET_URL =
  "https://data.novascotia.ca/d/tz45-5mz7";
export const BUILDINGS_MAP_SERVICE_URL =
  "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Buildings_UT83/MapServer";

const BUILDING_POINT_LAYER_IDS = [2, 3] as const;
const BUILDING_POLYGON_LAYER_ID = 4;

type ParcelFeature = NsprdFeatureCollection["features"][number];

type ArcGISCountResponse = {
  count?: number;
  error?: { message?: string };
};

export type ParcelBuildingCount = {
  count: number;
  pointCount: number;
  polygonCount: number;
};

function ringsForFeatures(features: readonly ParcelFeature[]): number[][][] {
  return features.flatMap(({ geometry }) => {
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map((ring) => [...ring].reverse());
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) => [...ring].reverse()),
      );
    }
    return [];
  });
}

async function queryBuildingLayerCount(
  layerId: number,
  rings: number[][][],
  signal?: AbortSignal,
): Promise<number> {
  const body = new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: JSON.stringify({
      rings,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnCountOnly: "true",
  });
  const response = await fetch(
    `${BUILDINGS_MAP_SERVICE_URL}/${layerId}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Province building request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as ArcGISCountResponse;
  if (payload.error || typeof payload.count !== "number") {
    throw new Error(
      payload.error?.message ?? "Province building request returned no count.",
    );
  }
  return payload.count;
}

export async function fetchParcelBuildingCount(
  features: readonly ParcelFeature[],
  signal?: AbortSignal,
): Promise<ParcelBuildingCount> {
  const rings = ringsForFeatures(features);
  if (rings.length === 0) {
    return { count: 0, pointCount: 0, polygonCount: 0 };
  }

  const [classifiedPoints, unclassifiedPoints, polygonCount] = await Promise.all([
    ...BUILDING_POINT_LAYER_IDS.map((layerId) =>
      queryBuildingLayerCount(layerId, rings, signal),
    ),
    queryBuildingLayerCount(BUILDING_POLYGON_LAYER_ID, rings, signal),
  ]);
  const pointCount = classifiedPoints + unclassifiedPoints;

  return {
    count: pointCount + polygonCount,
    pointCount,
    polygonCount,
  };
}
