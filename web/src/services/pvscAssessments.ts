import type { NsprdFeatureCollection } from "./nsprd";

export const PVSC_ASSESSMENT_DATASET_URL =
  "https://www.thedatazone.ca/Assessment/Assessed-Value-and-Taxable-Assessed-Value-History/bt58-qu28";
export const PVSC_ASSESSMENT_API_URL =
  "https://www.thedatazone.ca/resource/bt58-qu28.json";
export const PVSC_OPEN_DATA_LICENCE_URL =
  "https://www.pvsc.ca/sites/default/files/shared/Open%20Data%20and%20Information%20Government%20Licence%20-%20PVSC%20and%20Participating%20Municipalities.pdf";
export const PVSC_OPEN_DATA_ATTRIBUTION =
  "Contains information licensed under the Open Data & Information Government Licence – PVSC & Participating Municipalities.";
export const PVSC_ASSESSMENT_SOURCE_DATE = "Dataset updated January 12, 2026";

const PVSC_FIELDS = [
  "aan",
  "tax_year",
  "assessed_value",
  "taxable_assessed_value",
  "x_coord",
  "y_coord",
].join(",");
const PVSC_SPATIAL_PAGE_SIZE = 1_000;

type ParcelFeature = NsprdFeatureCollection["features"][number];
type PolygonPart = GeoJSON.Position[][];
type PointCoordinates = [number, number];

type PvscRawRow = {
  aan?: unknown;
  tax_year?: unknown;
  assessed_value?: unknown;
  taxable_assessed_value?: unknown;
  x_coord?: unknown;
  y_coord?: unknown;
};

export type PvscAssessmentRecord = {
  taxYear: number;
  assessedValue: number;
  taxableAssessedValue: number;
  coordinates: [number, number];
};

export type PvscAssessmentAccount = {
  aan: string;
  records: PvscAssessmentRecord[];
};

export type ParcelAssessmentResult = {
  matchMethod: "notice-aan" | "spatial";
  accounts: PvscAssessmentAccount[];
};

export function normalizeAan(value: string): string | null {
  if (!/^[\d\s-]+$/u.test(value)) {
    return null;
  }
  const digits = value.replace(/[\s-]/gu, "");
  return /^\d{1,8}$/u.test(digits) ? digits.padStart(8, "0") : null;
}

export function buildPvscAanQueryUrl(value: string): string {
  const aan = normalizeAan(value);
  if (!aan) {
    throw new Error("PVSC queries require a valid Assessment Account Number.");
  }
  const url = new URL(PVSC_ASSESSMENT_API_URL);
  url.search = new URLSearchParams({
    "$select": PVSC_FIELDS,
    "$where": `aan='${aan}'`,
    "$order": "tax_year DESC",
    "$limit": "10",
  }).toString();
  return url.toString();
}

export type PvscBounds = {
  north: number;
  west: number;
  south: number;
  east: number;
};

export function buildPvscSpatialQueryUrl(
  bounds: PvscBounds,
  limit: number,
  offset: number,
): string {
  const values = [bounds.north, bounds.west, bounds.south, bounds.east];
  if (!values.every(Number.isFinite)) {
    throw new Error("PVSC spatial queries require finite parcel bounds.");
  }
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(offset) || offset < 0) {
    throw new Error("PVSC spatial queries require valid paging values.");
  }
  const url = new URL(PVSC_ASSESSMENT_API_URL);
  url.search = new URLSearchParams({
    "$select": PVSC_FIELDS,
    "$where": `within_box(location,${bounds.north},${bounds.west},${bounds.south},${bounds.east})`,
    "$order": "aan,tax_year DESC",
    "$limit": String(limit),
    "$offset": String(offset),
  }).toString();
  return url.toString();
}

function polygonPartsForFeatures(features: readonly ParcelFeature[]): PolygonPart[] {
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

function boundsForPolygonPart(part: PolygonPart): PvscBounds | null {
  const positions = part.flat().filter(
    (position) =>
      position.length >= 2 &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1]),
  );
  if (positions.length === 0) {
    return null;
  }
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
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
  const cross = (pointX - startX) * segmentY - (pointY - startY) * segmentX;
  const tolerance = 1e-10 * Math.max(1, Math.abs(segmentX), Math.abs(segmentY));
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
  return ring.some((start, index) =>
    pointOnSegment(point, start, ring[(index + 1) % ring.length]),
  );
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

function pointInPolygonPart(point: PointCoordinates, part: PolygonPart): boolean {
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

function numberValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRow(row: PvscRawRow): { aan: string; record: PvscAssessmentRecord } | null {
  const aan = typeof row.aan === "string" ? normalizeAan(row.aan) : null;
  const taxYear = numberValue(row.tax_year);
  const assessedValue = numberValue(row.assessed_value);
  const taxableAssessedValue = numberValue(row.taxable_assessed_value);
  const longitude = numberValue(row.x_coord);
  const latitude = numberValue(row.y_coord);
  if (
    !aan ||
    taxYear === null ||
    !Number.isInteger(taxYear) ||
    assessedValue === null ||
    taxableAssessedValue === null ||
    longitude === null ||
    latitude === null ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return {
    aan,
    record: {
      taxYear,
      assessedValue,
      taxableAssessedValue,
      coordinates: [longitude, latitude],
    },
  };
}

async function fetchRows(url: string, signal?: AbortSignal): Promise<PvscRawRow[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`PVSC assessment request failed with status ${response.status}.`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("PVSC assessment data returned an unexpected response.");
  }
  return payload as PvscRawRow[];
}

function groupAccounts(
  parsedRows: Array<{ aan: string; record: PvscAssessmentRecord }>,
): PvscAssessmentAccount[] {
  const accounts = new Map<string, Map<number, PvscAssessmentRecord>>();
  for (const { aan, record } of parsedRows) {
    const records = accounts.get(aan) ?? new Map<number, PvscAssessmentRecord>();
    if (!records.has(record.taxYear)) {
      records.set(record.taxYear, record);
    }
    accounts.set(aan, records);
  }
  return [...accounts]
    .sort(([left], [right]) => left.localeCompare(right, "en-CA"))
    .map(([aan, records]) => ({
      aan,
      records: [...records.values()].sort((left, right) => right.taxYear - left.taxYear),
    }));
}

async function fetchSpatialRows(
  bounds: PvscBounds,
  signal?: AbortSignal,
): Promise<PvscRawRow[]> {
  const rows: PvscRawRow[] = [];
  for (let offset = 0; ; offset += PVSC_SPATIAL_PAGE_SIZE) {
    const page = await fetchRows(
      buildPvscSpatialQueryUrl(bounds, PVSC_SPATIAL_PAGE_SIZE, offset),
      signal,
    );
    rows.push(...page);
    if (page.length < PVSC_SPATIAL_PAGE_SIZE) {
      return rows;
    }
  }
}

export async function fetchParcelAssessments(
  features: readonly ParcelFeature[],
  noticeAan?: string,
  signal?: AbortSignal,
): Promise<ParcelAssessmentResult> {
  const normalizedNoticeAan = noticeAan ? normalizeAan(noticeAan) : null;
  if (normalizedNoticeAan) {
    const rows = await fetchRows(buildPvscAanQueryUrl(normalizedNoticeAan), signal);
    return {
      matchMethod: "notice-aan",
      accounts: groupAccounts(rows.map(parseRow).filter((row) => row !== null)),
    };
  }

  const polygonParts = polygonPartsForFeatures(features);
  const bounds = polygonParts
    .map(boundsForPolygonPart)
    .filter((value): value is PvscBounds => value !== null);
  if (bounds.length === 0) {
    return { matchMethod: "spatial", accounts: [] };
  }
  const rows = (await Promise.all(bounds.map((item) => fetchSpatialRows(item, signal)))).flat();
  const matches = rows
    .map(parseRow)
    .filter(
      (row): row is NonNullable<ReturnType<typeof parseRow>> =>
        row !== null &&
        polygonParts.some((part) => pointInPolygonPart(row.record.coordinates, part)),
    );
  return { matchMethod: "spatial", accounts: groupAccounts(matches) };
}
