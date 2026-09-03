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

/**
 * What one point query answered with, split by what could be read from it.
 *
 * A reply holding nothing and a reply holding shapes with no usable PID are
 * different evidence and owe the reader different sentences: the first is the
 * service looking and finding no parcel, the second is something being there
 * that this build cannot name. `pids` is separate from `identified` because a
 * point on a shared boundary comes back as several parcels, and which one
 * NSPRD listed first is not evidence of which one the point belongs to.
 */
export type ParcelPointIdentification = {
  identified: NsprdFeatureCollection;
  pids: string[];
  unidentifiedCount: number;
};

export function identifyParcelsAtPoint(
  collection: NsprdFeatureCollection,
): ParcelPointIdentification {
  const features: NsprdFeatureCollection["features"] = [];
  const pids: string[] = [];
  let unidentifiedCount = 0;

  for (const feature of collection.features) {
    // Read through `unknown` rather than the declared `PID: string`: that
    // declaration says what the rest of the app may assume about a parcel it
    // has stored, not what ArcGIS is allowed to send. A null, a blank, or a
    // numeric PID is counted rather than dropped in silence, and never
    // repaired into a string — a PID the selection cannot match is a gap in
    // the reply, not a parcel.
    const pid = (feature.properties as { PID?: unknown }).PID;
    if (typeof pid !== "string" || pid === "") {
      unidentifiedCount += 1;
      continue;
    }
    features.push(feature);
    if (!pids.includes(pid)) {
      pids.push(pid);
    }
  }

  return {
    identified: { type: "FeatureCollection", features },
    pids,
    unidentifiedCount,
  };
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
