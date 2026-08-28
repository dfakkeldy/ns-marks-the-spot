export const NSPRD_LAYER_URL =
  "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0";

export const NSPRD_PID_BATCH_SIZE = 40;

export type NsprdFeatureProperties = {
  PID: string;
  UPDAT_DATE?: number | null;
  "SHAPE.AREA"?: number | null;
};

export type NsprdFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  NsprdFeatureProperties
>;

export function normalizePid(value: string): string | null {
  if (!/^[\d\s-]+$/.test(value)) {
    return null;
  }

  const digits = value.replace(/[\s-]/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

export function buildPidQueryUrl(pids: string[]): string {
  const normalizedPids = Array.from(
    new Set(pids.map(normalizePid).filter((pid): pid is string => pid !== null)),
  );

  if (normalizedPids.length === 0) {
    throw new Error("NSPRD queries require at least one valid PID.");
  }

  const parameters = new URLSearchParams({
    where: `PID IN (${normalizedPids.map((pid) => `'${pid}'`).join(",")})`,
    outFields: "PID,UPDAT_DATE,SHAPE.AREA",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  return `${NSPRD_LAYER_URL}/query?${parameters.toString()}`;
}

export function buildPointQueryUrl(
  latitude: number,
  longitude: number,
): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("NSPRD point queries require a valid latitude.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("NSPRD point queries require a valid longitude.");
  }

  const parameters = new URLSearchParams({
    where: "1=1",
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "PID,UPDAT_DATE,SHAPE.AREA",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  return `${NSPRD_LAYER_URL}/query?${parameters.toString()}`;
}

export async function fetchParcels(
  pids: string[],
  signal?: AbortSignal,
  onBatch?: (collection: NsprdFeatureCollection) => void,
): Promise<NsprdFeatureCollection> {
  const normalizedPids = Array.from(
    new Set(pids.map(normalizePid).filter((pid): pid is string => pid !== null)),
  );

  if (normalizedPids.length === 0) {
    throw new Error("NSPRD queries require at least one valid PID.");
  }

  const batches: string[][] = [];
  for (let index = 0; index < normalizedPids.length; index += NSPRD_PID_BATCH_SIZE) {
    batches.push(normalizedPids.slice(index, index + NSPRD_PID_BATCH_SIZE));
  }

  const collections = await Promise.all(
    batches.map(async (batch) => {
      const collection = await fetchParcelBatch(batch, signal);
      onBatch?.(collection);
      return collection;
    }),
  );

  return {
    type: "FeatureCollection",
    features: collections.flatMap(({ features }) => features),
  };
}

export async function fetchParcelAtPoint(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  return fetchParcelCollection(buildPointQueryUrl(latitude, longitude), signal);
}

async function fetchParcelBatch(
  pids: string[],
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  return fetchParcelCollection(buildPidQueryUrl(pids), signal);
}

async function fetchParcelCollection(
  url: string,
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`NSPRD request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as NsprdFeatureCollection & {
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "NSPRD returned an unknown error.");
  }

  if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("NSPRD returned an unexpected GeoJSON response.");
  }

  return payload;
}
