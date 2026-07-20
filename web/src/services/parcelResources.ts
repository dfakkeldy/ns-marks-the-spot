import type { SourceResourceLayerId } from "../layers/layerCatalog";
import type { NsprdFeatureCollection } from "./nsprd";

type ParcelFeature = NsprdFeatureCollection["features"][number];
type ArcGISAttributes = Record<string, string | number | null | undefined>;

type ArcGISQueryResponse = {
  features?: Array<{ attributes: ArcGISAttributes }>;
  error?: { message?: string };
};

export type ResourceIntersection = {
  id: string;
  name: string;
  detail: string;
  relationship?: "on-parcel" | "within-1km";
};

export type ResourceIntersectionResult = {
  status: "ready" | "error";
  intersections: ResourceIntersection[];
};

export type ParcelResourceIntersections = Record<
  SourceResourceLayerId,
  ResourceIntersectionResult
>;

type ResourceQuery = {
  layerId: SourceResourceLayerId;
  url: string;
  outFields: string;
  distanceMetres?: number;
  relationship?: "on-parcel" | "within-1km";
  summarize: (attributes: ArcGISAttributes) => ResourceIntersection;
};

const MINERAL_OCCURRENCE_QUERY_URL =
  "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/mineral_occurrence_database_d002ns_UT83/FeatureServer/0/query";

function summarizeMineralOccurrence(
  attributes: ArcGISAttributes,
): ResourceIntersection {
  const id = String(attributes.Occ_num ?? attributes.geo_id ?? "Unnumbered");
  const name = String(attributes.Name ?? "Mineral occurrence").trim();
  const detail = [attributes.Status, attributes.Comm_list ?? attributes.Comm_prim]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return { id, name, detail };
}

const queries: readonly ResourceQuery[] = [
  {
    layerId: "mineral-occurrences",
    url: MINERAL_OCCURRENCE_QUERY_URL,
    outFields: "geo_id,Occ_num,Name,Status,Comm_prim,Comm_list",
    relationship: "on-parcel",
    summarize: summarizeMineralOccurrence,
  },
  {
    layerId: "mineral-occurrences",
    url: MINERAL_OCCURRENCE_QUERY_URL,
    outFields: "geo_id,Occ_num,Name,Status,Comm_prim,Comm_list",
    distanceMetres: 1_000,
    relationship: "within-1km",
    summarize: summarizeMineralOccurrence,
  },
  {
    layerId: "mineral-tenure",
    url: "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer/1/query",
    outFields: "OBJECTID,TENURE_NUMBER_ID,MTA_TENURE_TYPE_CODE,MINERAL_TENURE_STATUS_CODE",
    summarize: (attributes) => {
      const id = String(attributes.TENURE_NUMBER_ID ?? attributes.OBJECTID ?? "Unnumbered");
      const type = String(attributes.MTA_TENURE_TYPE_CODE ?? "Exploration licence").trim();
      const status = String(attributes.MINERAL_TENURE_STATUS_CODE ?? "").trim();
      return { id, name: `${type} ${id}`, detail: status };
    },
  },
  {
    layerId: "mineral-tenure",
    url: "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer/7/query",
    outFields: "OBJECTID,TENURE_NUMBER_ID,MTA_TENURE_TYPE_CODE,MINERAL_TENURE_STATUS_CODE",
    summarize: (attributes) => {
      const id = String(attributes.TENURE_NUMBER_ID ?? attributes.OBJECTID ?? "Unnumbered");
      const type = String(attributes.MTA_TENURE_TYPE_CODE ?? "Mineral lease").trim();
      const status = String(attributes.MINERAL_TENURE_STATUS_CODE ?? "").trim();
      return { id, name: `${type} ${id}`, detail: status };
    },
  },
  {
    layerId: "abandoned-mines",
    url: "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/0/query",
    outFields: "geo_id,ShaftID,Name,Opening_ty,Degree_Haz,Protection",
    summarize: (attributes) => {
      const id = String(attributes.ShaftID ?? attributes.geo_id ?? "Unnumbered");
      const name = String(attributes.Name ?? `Abandoned mine opening ${id}`).trim();
      const detail = [attributes.Opening_ty, attributes.Degree_Haz && `Hazard: ${attributes.Degree_Haz}`]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      return { id, name, detail };
    },
  },
];

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

async function runQuery(
  query: ResourceQuery,
  rings: number[][][],
  signal?: AbortSignal,
): Promise<ResourceIntersection[]> {
  const body = new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: query.outFields,
    returnGeometry: "false",
  });
  if (query.distanceMetres !== undefined) {
    body.set("distance", String(query.distanceMetres));
    body.set("units", "esriSRUnit_Meter");
  }
  const response = await fetch(query.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Resource intersection query failed (${response.status})`);
  }
  const payload = (await response.json()) as ArcGISQueryResponse;
  if (payload.error) {
    throw new Error(payload.error.message ?? "Resource intersection query failed");
  }
  return (payload.features ?? []).map(({ attributes }) => ({
    ...query.summarize(attributes),
    relationship: query.relationship,
  }));
}

export async function fetchParcelResourceIntersections(
  features: readonly ParcelFeature[],
  signal?: AbortSignal,
): Promise<ParcelResourceIntersections> {
  const rings = ringsForFeatures(features);
  const empty: ParcelResourceIntersections = {
    "mineral-occurrences": { status: "ready", intersections: [] },
    "mineral-tenure": { status: "ready", intersections: [] },
    "abandoned-mines": { status: "ready", intersections: [] },
  };
  if (rings.length === 0) {
    return empty;
  }

  const settled = await Promise.allSettled(
    queries.map((query) => runQuery(query, rings, signal)),
  );
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  return queries.reduce((result, query, index) => {
    const outcome = settled[index];
    if (outcome.status === "rejected") {
      result[query.layerId] = { status: "error", intersections: [] };
      return result;
    }
    if (result[query.layerId].status !== "error") {
      for (const intersection of outcome.value) {
        if (!result[query.layerId].intersections.some(({ id }) => id === intersection.id)) {
          result[query.layerId].intersections.push(intersection);
        }
      }
    }
    return result;
  }, empty);
}
