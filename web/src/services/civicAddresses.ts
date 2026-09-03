import type { NsprdFeatureCollection } from "./nsprd";

export const CIVIC_ADDRESS_DATASET_URL =
  "https://data.novascotia.ca/Municipalities/Nova-Scotia-Civic-Address-File-Civic-Points/tntn-er5g";
export const CIVIC_ADDRESS_GEOJSON_URL =
  "https://data.novascotia.ca/resource/tntn-er5g.geojson";
// Canonical definitions live in the licensing module; re-exported here so the
// established `services/civicAddresses` import path keeps working.
export {
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
} from "../licensing/provinceLicense";

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

// The geometry is nullable because a row whose `the_geom` column is empty
// comes back as `"geometry": null`. Typing that away made reading its
// coordinate throw, so one unplaceable row failed the whole request instead of
// being reported as the one row it is.
type CivicPointFeature = GeoJSON.Feature<
  GeoJSON.Point | null,
  CivicAddressProperties
>;

type CivicPointCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point | null,
  CivicAddressProperties
>;

export type CivicAddress = {
  pntid: string;
  coordinates: PointCoordinates;
  label: string;
  properties: CivicAddressProperties;
};

/**
 * What a parcel's civic lookup read, and what it could not.
 *
 * The count is not decoration. The panel is allowed to say a parcel has no
 * mapped civic address, and that sentence is only true when every row the file
 * sent was read: a row with no `pntid`, or no usable coordinate, is one this
 * build cannot place and cannot describe. Carrying the number is what lets the
 * panel say "none I could read" instead of "none".
 */
export type CivicAddressReading = {
  addresses: CivicAddress[];
  unreadableRows: number;
};

/**
 * Said under a list that does have addresses in it: the list is real, it is
 * just not the whole of what the file holds here, and a reader counting
 * addresses off it should be told the count is a floor.
 *
 * The native app's sentence, so the two surfaces say the same thing about the
 * same rows (`ParcelLookupMessage.addressShortfall`).
 */
export function civicAddressShortfall(rows: number): string {
  return rows === 1
    ? "One more mapped point here could not be read, so it is not listed."
    : `${rows} more mapped points here could not be read, so they are not listed.`;
}

/**
 * Every row the file sent for this parcel was unreadable.
 *
 * Deliberately not "no civic address point is mapped inside this parcel": the
 * file had rows for it. What this build has is nothing it could place
 * (`ParcelLookupMessage.noReadableAddresses`).
 */
export function noReadableCivicAddresses(rows: number): string {
  return rows === 1
    ? "One mapped point here could not be read. Whether an address is mapped inside this parcel is unknown."
    : `${rows} mapped points here could not be read. Whether an address is mapped inside this parcel is unknown.`;
}

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
  const normalizedQuery = normalizeSearchQuery(query);
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

function normalizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/\s+/gu, " ");
}

function expandRoadAliases(value: string): string {
  return value
    .replace(/\bhwy\b/giu, "Highway")
    .replace(/\broute(?=\s+\d+[a-z]?\b)/giu, "Highway");
}

function officialSearchFallback(query: string): string | null {
  const normalizedQuery = normalizeSearchQuery(query);
  const fallbackQuery = expandRoadAliases(normalizedQuery).replace(
    /\b([a-z]{2,4})'s\b/giu,
    (_, initials: string) =>
      `${initials.toUpperCase().split("").join(".")}.'s`,
  );

  return fallbackQuery === normalizedQuery ? null : fallbackQuery;
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

export function formatCivicRoadName(
  properties: CivicAddressProperties,
): string | null {
  const roadName = [
    cleanComponent(properties.strprefix),
    cleanComponent(properties.strname),
    cleanComponent(properties.strsuffix),
    cleanComponent(properties.strdir),
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  return roadName || null;
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
  // Read through `unknown`: the declared type says what a placed point may be
  // assumed to carry, and nothing validates the wire against it. A row whose
  // "coordinates" is a number destructured to a TypeError, which rejected the
  // whole request — one unreadable row reported as a source outage, taking
  // every readable address in the same reply with it.
  const coordinates = (feature.geometry as { coordinates?: unknown } | null)
    ?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [longitude, latitude] = coordinates as unknown[];
  return typeof longitude === "number" &&
    typeof latitude === "number" &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function civicAddressForFeature(
  feature: CivicPointFeature,
): CivicAddress | null {
  if (typeof feature.properties !== "object" || feature.properties === null) {
    return null;
  }
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

function addressMatchKey(value: string): string {
  return expandRoadAliases(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-CA")
    .replace(/[.\u2018\u2019']/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function addressMatchScore(address: CivicAddress, query: string): number {
  const queryKey = addressMatchKey(query);
  const queryTerms = queryKey.split(" ").filter(Boolean);
  const labelTerms = new Set(addressMatchKey(address.label).split(" "));
  if (
    queryTerms.length === 0 ||
    !queryTerms.every((term) => labelTerms.has(term))
  ) {
    return 0;
  }

  const roadKey = addressMatchKey(
    formatCivicRoadName(address.properties) ?? "",
  );
  if (roadKey === queryKey) {
    return 3;
  }
  if (roadKey.startsWith(`${queryKey} `)) {
    return 2;
  }
  return 1;
}

function rankedCivicAddresses(
  features: readonly CivicPointFeature[],
  query: string,
): CivicAddress[] {
  const addresses = new Map<string, CivicAddress>();

  for (const feature of features) {
    const address = civicAddressForFeature(feature);
    if (address && !addresses.has(address.pntid)) {
      addresses.set(address.pntid, address);
    }
  }

  const ranked = [...addresses.values()]
    .map((address) => ({ address, score: addressMatchScore(address, query) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.address.label.localeCompare(right.address.label, "en-CA"),
    );
  const bestScore = ranked[0]?.score ?? 0;

  return ranked
    .filter(({ score }) => bestScore <= 1 || score === bestScore)
    .slice(0, CIVIC_ADDRESS_SEARCH_LIMIT)
    .map(({ address }) => address);
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
  const initialFeatures = await fetchCivicPointCollection(
    buildCivicAddressSearchUrl(query),
    signal,
  );
  const initialResults = rankedCivicAddresses(initialFeatures, query);
  if (initialResults.length > 0) {
    return initialResults;
  }

  const fallbackQuery = officialSearchFallback(query);
  if (!fallbackQuery) {
    return [];
  }

  const fallbackFeatures = await fetchCivicPointCollection(
    buildCivicAddressSearchUrl(fallbackQuery),
    signal,
  );
  return rankedCivicAddresses(fallbackFeatures, query);
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

/**
 * Raised when the parcel has no polygon to ask inside.
 *
 * NSPRD can answer for a PID with a geometry this build cannot query against —
 * a LineString, a collection, a ring with no usable positions. Returning an
 * empty reading for that made a lookup that was never made read as a file that
 * answered and named nothing.
 */
export class CivicAddressGeometryError extends Error {
  constructor() {
    super("This parcel has no polygon to look for civic addresses inside.");
    this.name = "CivicAddressGeometryError";
  }
}

export async function fetchCivicAddresses(
  features: readonly ParcelFeature[],
  signal?: AbortSignal,
): Promise<CivicAddressReading> {
  const polygonParts = polygonPartsForFeatures(features);
  const bounds = polygonParts
    .map(boundsForPolygonPart)
    .filter((value): value is CivicAddressBounds => value !== null);
  if (bounds.length === 0) {
    throw new CivicAddressGeometryError();
  }

  const perPart = await Promise.all(
    bounds.map((partBounds) => fetchCandidates(partBounds, signal)),
  );
  const addresses = new Map<string, CivicAddress>();
  // Counted apart from the rows dropped for falling outside the boundary or
  // for repeating a pntid. Those two are answers about this parcel; this is a
  // row the file sent that the browser could not read, and it has no pntid to
  // deduplicate on — nor, in the worst case, a coordinate to place it by.
  //
  // A parcel of several parts is asked once per part, and their boxes can
  // overlap, so the same source row can come back in more than one reply. The
  // count is the largest number of times a row appeared in ANY ONE reply:
  // two identical rows the file really sent count twice, while one row echoed
  // by two overlapping queries counts once. Summing would inflate the
  // shortfall; a flat set across replies would swallow a genuine duplicate.
  const unreadableByRow = new Map<string, number>();

  for (const candidates of perPart) {
    const inThisPart = new Map<string, number>();
    for (const feature of candidates) {
      // Containment is tested before readability, on the coordinate alone. A
      // row the browser can place outside the parcel is an answer about
      // somewhere else in the bounding box, and counting it would report a
      // shortfall here that the file never had. A row whose coordinate cannot
      // be read is still counted: it came back for this parcel's box and
      // there is no way to say it is not inside.
      const coordinates = pointCoordinates(feature);
      if (
        coordinates &&
        !polygonParts.some((part) => pointInPolygonPart(coordinates, part))
      ) {
        continue;
      }
      const address = civicAddressForFeature(feature);
      if (!address) {
        const key = JSON.stringify(feature);
        inThisPart.set(key, (inThisPart.get(key) ?? 0) + 1);
        continue;
      }
      if (addresses.has(address.pntid)) {
        continue;
      }

      addresses.set(address.pntid, address);
    }
    for (const [key, count] of inThisPart) {
      unreadableByRow.set(key, Math.max(unreadableByRow.get(key) ?? 0, count));
    }
  }

  return {
    addresses: [...addresses.values()],
    unreadableRows: [...unreadableByRow.values()].reduce(
      (total, count) => total + count,
      0,
    ),
  };
}
