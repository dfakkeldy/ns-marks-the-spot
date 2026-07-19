import type { NsprdFeatureCollection } from "./nsprd";

const SQUARE_METRES_PER_ACRE = 4_046.856_422_4;
const ROAD_SERVICE_URL =
  "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer";
const WATER_SERVICE_URL =
  "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer";
export const ADJACENT_ROAD_DISTANCE_METRES = 20;

type ParcelFeature = NsprdFeatureCollection["features"][number];

type FeatureLayer = {
  serviceUrl: string;
  id: number;
  fallbackKind: string;
  fields: string;
};

type ArcGISAttributes = Record<string, string | number | null | undefined>;

type ArcGISQueryResponse = {
  features?: Array<{ attributes: ArcGISAttributes }>;
  error?: { message?: string };
};

export type MappedFeature = {
  name: string;
  kind: string;
  relationship: "intersects" | "adjacent" | "civic-address";
};

export type ParcelContext = {
  roads: MappedFeature[];
  water: MappedFeature[];
};

export type MappedArea = {
  squareMetres: number;
  acres: number;
  label: string;
};

const roadLayers: readonly FeatureLayer[] = [
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 3,
    fallbackKind: "Road point",
    fields: "FEAT_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 5,
    fallbackKind: "Bridge",
    fields: "FEAT_DESC,STREET,RTE_NO,ROADC_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 6,
    fallbackKind: "Railway",
    fields: "FEAT_DESC,STREET,RTE_NO,ROADC_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 7,
    fallbackKind: "Highway",
    fields: "FEAT_DESC,STREET,RTE_NO,ROADC_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 8,
    fallbackKind: "Road or trail",
    fields: "FEAT_DESC,STREET,RTE_NO,ROADC_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 9,
    fallbackKind: "Ferry crossing",
    fields: "FEAT_DESC,STREET,RTE_NO,ROADC_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 10,
    fallbackKind: "Non-vehicle feature",
    fields: "FEAT_DESC",
  },
  {
    serviceUrl: ROAD_SERVICE_URL,
    id: 11,
    fallbackKind: "Road polygon",
    fields: "FEAT_DESC",
  },
];

const waterLayers: readonly FeatureLayer[] = [
  {
    serviceUrl: WATER_SERVICE_URL,
    id: 1,
    fallbackKind: "Water point",
    fields: "FEAT_DESC",
  },
  {
    serviceUrl: WATER_SERVICE_URL,
    id: 3,
    fallbackKind: "Dry water feature",
    fields: "FEAT_DESC,RIVNAME_1,RIVNAME_2",
  },
  {
    serviceUrl: WATER_SERVICE_URL,
    id: 4,
    fallbackKind: "Water line",
    fields: "FEAT_DESC,RIVNAME_1,RIVNAME_2",
  },
  {
    serviceUrl: WATER_SERVICE_URL,
    id: 6,
    fallbackKind: "Dry water area",
    fields: "FEAT_DESC",
  },
  {
    serviceUrl: WATER_SERVICE_URL,
    id: 7,
    fallbackKind: "Rapids",
    fields: "FEAT_DESC",
  },
  {
    serviceUrl: WATER_SERVICE_URL,
    id: 8,
    fallbackKind: "Water area",
    fields: "FEAT_DESC",
  },
];

const acreFormatter = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function mappedAreaForPid(
  parcels: NsprdFeatureCollection,
  pid: string,
): MappedArea | null {
  const squareMetres = parcels.features
    .filter(({ properties }) => properties.PID === pid)
    .reduce((total, { properties }) => {
      const area = properties["SHAPE.AREA"];
      return total + (typeof area === "number" && area > 0 ? area : 0);
    }, 0);

  if (squareMetres === 0) {
    return null;
  }

  const acres = Math.round((squareMetres / SQUARE_METRES_PER_ACRE) * 100) / 100;
  return {
    squareMetres,
    acres,
    label: `${acreFormatter.format(acres)} acres`,
  };
}

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

function cleanValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned && cleaned !== "-" ? cleaned : null;
}

function cleanFeatureDescription(value: unknown): string | null {
  const description = cleanValue(value);
  if (!description) {
    return null;
  }

  const cleaned = description
    .replace(/\s+-\s+.*$/u, "")
    .replace(/\s+(?:line|point|polygon)$/iu, "")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function summarizeFeature(
  attributes: ArcGISAttributes,
  fallbackKind: string,
  relationship: MappedFeature["relationship"],
): MappedFeature {
  const namedFeature =
    cleanValue(attributes.STREET) ??
    cleanValue(attributes.RTE_NO) ??
    cleanValue(attributes.RIVNAME_1) ??
    cleanValue(attributes.RIVNAME_2);
  const description = cleanFeatureDescription(attributes.FEAT_DESC);
  const roadClass = cleanValue(attributes.ROADC_DESC);

  return {
    name: namedFeature ?? description ?? fallbackKind,
    kind:
      roadClass ?? (namedFeature && description ? description : fallbackKind),
    relationship,
  };
}

function uniqueFeatures(features: MappedFeature[]): MappedFeature[] {
  const seen = new Set<string>();
  return features.filter(({ name, kind }) => {
    const key = `${name.toLocaleLowerCase()}|${kind.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function queryLayer(
  layer: FeatureLayer,
  rings: number[][][],
  relationship: Extract<MappedFeature["relationship"], "intersects" | "adjacent">,
  signal?: AbortSignal,
): Promise<MappedFeature[]> {
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
    outFields: layer.fields,
    returnGeometry: "false",
  });
  if (relationship === "adjacent") {
    body.set("distance", String(ADJACENT_ROAD_DISTANCE_METRES));
    body.set("units", "esriSRUnit_Meter");
  }
  const response = await fetch(`${layer.serviceUrl}/${layer.id}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Province mapped feature request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as ArcGISQueryResponse;
  if (payload.error) {
    throw new Error(
      payload.error.message ?? "Province mapped feature request failed.",
    );
  }

  return (payload.features ?? []).map(({ attributes }) =>
    summarizeFeature(attributes, layer.fallbackKind, relationship),
  );
}

export async function fetchParcelContext(
  features: readonly ParcelFeature[],
  signal?: AbortSignal,
): Promise<ParcelContext> {
  const rings = ringsForFeatures(features);
  if (rings.length === 0) {
    return { roads: [], water: [] };
  }

  const [intersectingRoadResults, adjacentRoadResults, waterResults] = await Promise.all([
    Promise.all(
      roadLayers.map((layer) => queryLayer(layer, rings, "intersects", signal)),
    ),
    Promise.all(
      roadLayers.map((layer) => queryLayer(layer, rings, "adjacent", signal)),
    ),
    Promise.all(
      waterLayers.map((layer) => queryLayer(layer, rings, "intersects", signal)),
    ),
  ]);

  return {
    roads: uniqueFeatures([
      ...intersectingRoadResults.flat(),
      ...adjacentRoadResults.flat(),
    ]),
    water: uniqueFeatures(waterResults.flat()),
  };
}
