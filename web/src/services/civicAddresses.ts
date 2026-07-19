import type { NsprdFeatureCollection } from "./nsprd";

export const CIVIC_ADDRESS_DATASET_URL =
  "https://data.novascotia.ca/Municipalities/Nova-Scotia-Civic-Address-File-Civic-Points/tntn-er5g";
export const CIVIC_ADDRESS_GEOJSON_URL =
  "https://data.novascotia.ca/resource/tntn-er5g.geojson";
export const OPEN_GOVERNMENT_LICENCE_URL =
  "https://support.novascotia.ca/services/open-data-portal-licence";
export const OPEN_GOVERNMENT_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Nova Scotia.";

export const CIVIC_ADDRESS_FIELDS = [
  "the_geom",
  "pntid",
  "civicnum",
  "civsuffix",
  "unit_num",
  "add_loc",
  "strprefix",
  "strname",
  "strsuffix",
  "strdir",
  "comm",
  "mun",
  "county",
] as const;

export const CIVIC_ADDRESS_PAGE_SIZE = 1_000;
export const CIVIC_ADDRESS_SEARCH_LIMIT = 12;

type AddressComponent = string | number | null | undefined;
type ParcelFeature = NsprdFeatureCollection["features"][number];
type PolygonPart = GeoJSON.Polygon["coordinates"];
type PointCoordinates = [number, number];

export type CivicAddressProperties = {
  pntid: AddressComponent;
  civicnum: AddressComponent;
  civsuffix: AddressComponent;
  unit_num: AddressComponent;
  add_loc: AddressComponent;
  strprefix: AddressComponent;
  strname: AddressComponent;
  strsuffix: AddressComponent;
  strdir: AddressComponent;
  comm: AddressComponent;
  mun: AddressComponent;
  county: AddressComponent;
};

type CivicPointFeature = GeoJSON.Feature<
  GeoJSON.Point,
  CivicAddressProperties
>;

type CivicPointCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  CivicAddressProperties
>;

export type CivicAddress = {
  pntid: string;
  coordinates: PointCoordinates;
  label: string;
  properties: CivicAddressProperties;
};

export type CivicAddressBounds = {
  north: number;
  west: number;
  south: number;
  east: number;
};

export function buildCivicAddressQueryUrl(
  bounds: CivicAddressBounds,
  limit = CIVIC_ADDRESS_PAGE_SIZE,
  offset = 0,
): string {
  const parameters = new URLSearchParams({
    $select: CIVIC_ADDRESS_FIELDS.join(","),
    $where: `within_box(the_geom,${bounds.north},${bounds.west},${bounds.south},${bounds.east})`,
    $order: "pntid",
    $limit: String(limit),
    $offset: String(offset),
  });

  return `${CIVIC_ADDRESS_GEOJSON_URL}?${parameters.toString()}`;
}

export function buildCivicAddressSearchUrl(
  query: string,
  limit = CIVIC_ADDRESS_SEARCH_LIMIT,
): string {
  const normalizedQuery = query.trim().replace(/\s+/gu, " ");
  if (normalizedQuery.length < 3) {
    throw new Error("Civic address searches require at least three characters.");
  }

  const leadingCivicNumber = normalizedQuery.match(
    /^(\d+)([a-z]?)\s+(.{2,})$/iu,
  );
  const fullTextQuery = leadingCivicNumber?.[3] ?? normalizedQuery;
  const parameters = new URLSearchParams({
    $select: CIVIC_ADDRESS_FIELDS.join(","),
    $q: fullTextQuery,
    $order: "pntid",
    $limit: String(limit),
  });
  if (leadingCivicNumber) {
    const civicNumber = Number(leadingCivicNumber[1]);
    const civicSuffix = leadingCivicNumber[2]?.toUpperCase();
    parameters.set(
      "$where",
      civicSuffix
        ? `civicnum=${civicNumber} AND upper(civsuffix)='${civicSuffix}'`
        : `civicnum=${civicNumber}`,
    );
  }

  return `${CIVIC_ADDRESS_GEOJSON_URL}?${parameters.toString()}`;
}

function cleanComponent(value: AddressComponent): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value)
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/^,+|,+$/gu, "")
    .trim();
  return cleaned && cleaned !== "-" ? cleaned : null;
}

function uniqueSegments(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value) {
      return false;
    }

    const key = value.toLocaleLowerCase("en-CA");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function formatCivicAddress(
  properties: CivicAddressProperties,
): string {
  const civicNumber = cleanComponent(properties.civicnum);
  const civicSuffix = cleanComponent(properties.civsuffix);
  const numberedAddress = civicNumber
    ? `${civicNumber}${civicSuffix ?? ""}`
    : null;
  const street = uniqueSegments([
    numberedAddress,
    cleanComponent(properties.strprefix),
    cleanComponent(properties.strname),
    cleanComponent(properties.strsuffix),
    cleanComponent(properties.strdir),
  ]).join(" ");
  const unit = cleanComponent(properties.unit_num);
  const unitLabel = unit
    ? /^unit\b/iu.test(unit)
      ? unit
      : `Unit ${unit}`
    : null;

  return uniqueSegments([
    unitLabel,
    street || null,
    cleanComponent(properties.comm),
    cleanComponent(properties.mun),
    cleanComponent(properties.county),
  ]).join(", ");
}

function polygonPartsForFeatures(
  features: readonly ParcelFeature[],
): PolygonPart[] {
  return features.flatMap(({ geometry }) => {
    if (geometry.type === "Polygon") {
      return [geometry.coordinates];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates;
    }
    return [];
  });
}

function boundsForPolygonPart(part: PolygonPart): CivicAddressBounds | null {
  const positions = part
    .flat()
    .filter(
      (position) =>
        position.length >= 2 &&
        Number.isFinite(position[0]) &&
        Number.isFinite(position[1]),
    );
  if (positions.length === 0) {
    return null;
  }

  const longitudes = positions.map((position) => position[0]);
  const latitudes = positions.map((position) => position[1]);
  return {
    north: Math.max(...latitudes),
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
  };
}

function pointOnSegment(
  point: PointCoordinates,
  start: GeoJSON.Position,
  end: GeoJSON.Position,
): boolean {
  const [pointX, pointY] = point;
  const [startX, startY] = start;
  const [endX, endY] = end;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const cross =
    (pointX - startX) * segmentY - (pointY - startY) * segmentX;
  const tolerance =
    1e-10 * Math.max(1, Math.abs(segmentX), Math.abs(segmentY));

  if (Math.abs(cross) > tolerance) {
    return false;
  }

  const dot =
    (pointX - startX) * (pointX - endX) +
    (pointY - startY) * (pointY - endY);
  return dot <= tolerance;
}

function pointOnRingBoundary(
  point: PointCoordinates,
  ring: GeoJSON.Position[],
): boolean {
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if (pointOnSegment(point, start, end)) {
      return true;
    }
  }
  return false;
}

function pointInRingInterior(
  point: PointCoordinates,
  ring: GeoJSON.Position[],
): boolean {
  const [pointX, pointY] = point;
  let inside = false;

  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crossesRay =
      currentY > pointY !== previousY > pointY &&
      pointX <
        ((previousX - currentX) * (pointY - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygonPart(
  point: PointCoordinates,
  part: PolygonPart,
): boolean {
  if (part.some((ring) => pointOnRingBoundary(point, ring))) {
    return true;
  }

  const [outerRing, ...holes] = part;
  return (
    Boolean(outerRing) &&
    pointInRingInterior(point, outerRing) &&
    !holes.some((hole) => pointInRingInterior(point, hole))
  );
}

function pointCoordinates(feature: CivicPointFeature): PointCoordinates | null {
  const [longitude, latitude] = feature.geometry.coordinates;
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function civicAddressForFeature(
  feature: CivicPointFeature,
): CivicAddress | null {
  const pntid = cleanComponent(feature.properties.pntid);
  const coordinates = pointCoordinates(feature);
  if (!pntid || !coordinates) {
    return null;
  }

  return {
    pntid,
    coordinates,
    label: formatCivicAddress(feature.properties) || "Mapped civic point",
    properties: feature.properties,
  };
}

async function fetchCivicPointCollection(
  url: string,
  signal?: AbortSignal,
): Promise<CivicPointFeature[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Civic Points request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as CivicPointCollection;
  if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("Civic Points returned an unexpected GeoJSON response.");
  }

  return payload.features;
}

export async function searchCivicAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<CivicAddress[]> {
  const features = await fetchCivicPointCollection(
    buildCivicAddressSearchUrl(query),
    signal,
  );
  const addresses = new Map<string, CivicAddress>();

  for (const feature of features) {
    const address = civicAddressForFeature(feature);
    if (address && !addresses.has(address.pntid)) {
      addresses.set(address.pntid, address);
    }
  }

  return [...addresses.values()];
}

async function fetchCandidates(
  bounds: CivicAddressBounds,
  signal?: AbortSignal,
): Promise<CivicPointFeature[]> {
  const candidates: CivicPointFeature[] = [];

  for (let offset = 0; ; offset += CIVIC_ADDRESS_PAGE_SIZE) {
    const page = await fetchCivicPointCollection(
      buildCivicAddressQueryUrl(bounds, CIVIC_ADDRESS_PAGE_SIZE, offset),
      signal,
    );

    candidates.push(...page);
    if (page.length < CIVIC_ADDRESS_PAGE_SIZE) {
      break;
    }
  }

  return candidates;
}

export async function fetchCivicAddresses(
  features: readonly ParcelFeature[],
  signal?: AbortSignal,
): Promise<CivicAddress[]> {
  const polygonParts = polygonPartsForFeatures(features);
  const bounds = polygonParts
    .map(boundsForPolygonPart)
    .filter((value): value is CivicAddressBounds => value !== null);
  if (bounds.length === 0) {
    return [];
  }

  const candidates = (
    await Promise.all(bounds.map((partBounds) => fetchCandidates(partBounds, signal)))
  ).flat();
  const addresses = new Map<string, CivicAddress>();

  for (const feature of candidates) {
    const address = civicAddressForFeature(feature);
    if (
      !address ||
      !polygonParts.some((part) =>
        pointInPolygonPart(address.coordinates, part),
      ) ||
      addresses.has(address.pntid)
    ) {
      continue;
    }

    addresses.set(address.pntid, address);
  }

  return [...addresses.values()];
}
