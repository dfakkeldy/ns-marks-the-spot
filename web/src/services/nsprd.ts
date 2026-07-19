export const NSPRD_LAYER_URL =
  "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0";

const NSPRD_PID_BATCH_SIZE = 40;

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

export async function fetchParcels(
  pids: string[],
  signal?: AbortSignal,
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
    batches.map((batch) => fetchParcelBatch(batch, signal)),
  );

  return {
    type: "FeatureCollection",
    features: collections.flatMap(({ features }) => features),
  };
}

async function fetchParcelBatch(
  pids: string[],
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  const response = await fetch(buildPidQueryUrl(pids), { signal });

  if (!response.ok) {
    throw new Error(`NSPRD request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as NsprdFeatureCollection & {
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "NSPRD returned an unknown error.");
  }

  return payload;
}
