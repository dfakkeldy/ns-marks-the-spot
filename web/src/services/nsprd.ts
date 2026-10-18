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
 * Whether a returned parcel carries a polygon the evidence queries can use.
 *
 * NSPRD can answer for a PID with a geometry nothing here can ask against — a
 * LineString, a collection, a ring with too few positions. Every spatial
 * lookup then returns a clean empty answer, and a panel of them reads as a
 * parcel with no buildings, no roads, no accounts and no resources, none of
 * which was ever asked.
 */
/**
 * Twice the ring's area, in degrees squared.
 *
 * Taken about the ring's own first vertex rather than the origin: at Nova
 * Scotia's coordinates the raw products are around 2,800, and a collinear
 * ring's terms then cancel to floating-point noise rather than to zero —
 * noise larger than the true area of a small parcel.
 */
function ringArea(ring: readonly (readonly number[])[]): number {
  const [originX, originY] = ring[0];
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const x1 = ring[index][0] - originX;
    const y1 = ring[index][1] - originY;
    const x2 = ring[index + 1][0] - originX;
    const y2 = ring[index + 1][1] - originY;
    total += x1 * y2 - x2 * y1;
  }
  return Math.abs(total);
}

/** About 0.06 m² at this latitude: below any parcel, above the noise. */
const MINIMUM_RING_AREA_DEGREES_SQUARED = 1e-14;

function isUsableRing(ring: unknown): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const positions = ring as readonly (readonly number[])[];
  const usable = positions.every(
    (position) =>
      Array.isArray(position) &&
      position.length >= 2 &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1]) &&
      Math.abs(position[0]) <= 180 &&
      Math.abs(position[1]) <= 90,
  );
  if (!usable) return false;
  const [first] = positions;
  const last = positions[positions.length - 1];
  // A ring that does not close, or closes on itself with no area, encloses
  // nothing: a point-in-polygon test against it answers "outside" for the
  // whole province, which is a negative about the ground rather than about
  // the shape.
  return (
    first[0] === last[0] &&
    first[1] === last[1] &&
    ringArea(positions) > MINIMUM_RING_AREA_DEGREES_SQUARED
  );
}

export function hasQueryablePolygon(
  feature: NsprdFeatureCollection["features"][number],
): boolean {
  // Read through `unknown`: the declared type says what a stored parcel may
  // be assumed to carry, and the wire is not validated against it — a null
  // geometry would throw here rather than answer.
  const geometry = feature.geometry as
    | { type?: unknown; coordinates?: unknown }
    | null
    | undefined;
  const rings =
    geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)
        ? (geometry.coordinates as unknown[])
        : [];
  return rings.some(
    (polygon) => Array.isArray(polygon) && isUsableRing(polygon[0]),
  );
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
    // has stored, not what ArcGIS is allowed to send. A null, a blank, a
    // padded, or a numeric PID is counted rather than dropped in silence, and
    // never repaired — the selection, the share URL and the evidence requests
    // all key on the eight-digit form, so a value that is not already that
    // form is a gap in the reply rather than a parcel this app can name.
    const pid = (feature as { properties?: { PID?: unknown } | null } | null)
      ?.properties?.PID;
    if (typeof pid !== "string" || normalizePid(pid) !== pid) {
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
