import type { MapEnvelope } from "./arcGISFeatureOverlay";
import { fetchArcGISFeatureOverlay } from "./arcGISFeatureOverlay";
import {
  NSPRD_LAYER_URL,
  type NsprdFeatureCollection,
} from "./nsprd";

export const MINERAL_PROXIMITY_DISTANCE_METRES = 1_000;
export const MINERAL_PROXIMITY_MIN_ZOOM = 12;

export const MINERAL_OCCURRENCE_SERVICE_URL =
  "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/mineral_occurrence_database_d002ns_UT83/FeatureServer/0";

const OCCURRENCE_FIELDS = [
  "geo_id",
  "Occ_num",
  "Name",
  "Status",
  "Comm_prim",
  "Comm_list",
] as const;
const POINTS_PER_BATCH = 500;
const PAGE_SIZE = 2_000;
const MAX_PAGES_PER_BATCH = 10;

type NsprdQueryPayload = NsprdFeatureCollection & {
  error?: { message?: string };
};

function pointBatches(points: number[][]): number[][][] {
  const batches: number[][][] = [];
  for (let index = 0; index < points.length; index += POINTS_PER_BATCH) {
    batches.push(points.slice(index, index + POINTS_PER_BATCH));
  }
  return batches;
}

async function fetchParcelBatch(
  points: number[][],
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  const features: NsprdFeatureCollection["features"] = [];

  for (let page = 0; page < MAX_PAGES_PER_BATCH; page += 1) {
    const body = new URLSearchParams({
      f: "geojson",
      where: "1=1",
      geometry: JSON.stringify({
        points,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryMultipoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(MINERAL_PROXIMITY_DISTANCE_METRES),
      units: "esriSRUnit_Meter",
      outFields: "PID",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(page * PAGE_SIZE),
      orderByFields: "PID",
    });
    const response = await fetch(`${NSPRD_LAYER_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal,
    });
    if (!response.ok) {
      throw new Error(`NSPRD proximity query failed (${response.status})`);
    }
    const payload = (await response.json()) as NsprdQueryPayload;
    if (payload.error) {
      throw new Error(payload.error.message ?? "NSPRD proximity query failed");
    }
    if (!Array.isArray(payload.features)) {
      throw new Error("NSPRD proximity query returned an invalid collection");
    }
    features.push(...payload.features);
    if (payload.features.length < PAGE_SIZE) {
      return { type: "FeatureCollection", features };
    }
  }

  throw new Error("NSPRD proximity query exceeded the safety limit");
}

export async function fetchMineralProximityParcels(
  bounds: MapEnvelope,
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  const occurrences = await fetchArcGISFeatureOverlay({
    serviceUrl: MINERAL_OCCURRENCE_SERVICE_URL,
    bounds,
    outFields: OCCURRENCE_FIELDS,
    orderByFields: "geo_id",
    idField: "geo_id",
    distanceMetres: MINERAL_PROXIMITY_DISTANCE_METRES,
    signal,
  });
  const points = occurrences.features.map(({ geometry }) => geometry.coordinates);

  if (points.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const collections = await Promise.all(
    pointBatches(points).map((batch) => fetchParcelBatch(batch, signal)),
  );
  const seen = new Set<string>();
  return {
    type: "FeatureCollection",
    features: collections.flatMap(({ features }) =>
      features.filter(({ properties }) => {
        if (seen.has(properties.PID)) {
          return false;
        }
        seen.add(properties.PID);
        return true;
      }),
    ),
  };
}
