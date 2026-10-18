import type { Feature, FeatureCollection, Geometry } from "geojson";
import { UserMapImportError } from "../../errors";

export type ParsedVector = {
  collection: FeatureCollection;
  featureCount: number;
  bbox: [west: number, south: number, east: number, north: number] | null;
};

/**
 * Interactive rendering and hit-testing budget, per layer. Canvas rendering
 * copes with this many features on the phones the map targets; beyond it the
 * import is refused outright rather than degrading into an unusable map.
 */
export const MAX_VECTOR_FEATURES = 10_000;

const GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

const CORRUPT_MESSAGE =
  "Couldn't read this file — it isn't valid GeoJSON.";

function corrupt(): UserMapImportError {
  return new UserMapImportError("corrupt-file", CORRUPT_MESSAGE);
}

/**
 * The 2008-era GeoJSON spec allowed a `crs` member; RFC 7946 removed it and
 * fixed the CRS to WGS84. A file that declares anything else is projected
 * data, and reprojecting without the user's knowledge would silently move
 * their geometry — so it's refused, never guessed at.
 */
function assertUsableCrs(root: Record<string, unknown>): void {
  if (!("crs" in root) || root.crs == null) return;
  const crs = root.crs as { properties?: { name?: unknown } };
  const name = typeof crs.properties?.name === "string" ? crs.properties.name : "";
  const upper = name.toUpperCase();
  if (upper.includes("CRS84") || upper.includes("4326")) return;
  throw new UserMapImportError(
    "unsupported-crs",
    `This file declares the coordinate system "${name}" — only longitude/latitude (WGS84) GeoJSON is supported. Re-export it in WGS84.`,
  );
}

type Bounds = { west: number; south: number; east: number; north: number };

/**
 * Validates every position while accumulating the bounds. Longitude/latitude
 * range violations get their own error: values like [500000, 4980000] mean
 * the file carries projected coordinates with no declared CRS, and guessing
 * the projection is exactly what this app refuses to do.
 */
function visitPositions(coords: unknown, bounds: Bounds): void {
  if (!Array.isArray(coords)) throw corrupt();
  if (coords.length > 0 && typeof coords[0] === "number") {
    if (coords.length < 2) throw corrupt();
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lon !== "number" || typeof lat !== "number") throw corrupt();
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw corrupt();
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      throw new UserMapImportError(
        "invalid-georeferencing",
        "This file's coordinates are outside longitude/latitude range — it looks like projected data. Re-export it in WGS84 (longitude/latitude).",
      );
    }
    bounds.west = Math.min(bounds.west, lon);
    bounds.east = Math.max(bounds.east, lon);
    bounds.south = Math.min(bounds.south, lat);
    bounds.north = Math.max(bounds.north, lat);
    return;
  }
  for (const inner of coords) {
    visitPositions(inner, bounds);
  }
}

function visitGeometry(geometry: unknown, bounds: Bounds): void {
  if (geometry === null) return;
  if (typeof geometry !== "object" || geometry === null) throw corrupt();
  const g = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  if (typeof g.type !== "string" || !GEOMETRY_TYPES.has(g.type)) throw corrupt();
  if (g.type === "GeometryCollection") {
    if (!Array.isArray(g.geometries)) throw corrupt();
    for (const inner of g.geometries) visitGeometry(inner, bounds);
    return;
  }
  visitPositions(g.coordinates, bounds);
}

function hasRenderableGeometry(feature: Feature): boolean {
  if (feature.geometry === null) return false;
  if (feature.geometry.type === "GeometryCollection") {
    return feature.geometry.geometries.length > 0;
  }
  return true;
}

/**
 * Shared tail of every vector import (GeoJSON now; KML/GPX/shapefile convert
 * into this): enforces the feature cap, validates all geometry, assigns
 * stable unique string ids (edits and export round-trips need them), and
 * computes the collection's bounds.
 */
export function normalizeCollection(features: Feature[]): ParsedVector {
  if (features.length > MAX_VECTOR_FEATURES) {
    throw new UserMapImportError(
      "too-many-features",
      `This file has ${features.length.toLocaleString()} features — the map supports up to ${MAX_VECTOR_FEATURES.toLocaleString()} per file.`,
    );
  }
  const bounds: Bounds = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };
  const seenIds = new Set<string>();
  const normalized: Feature[] = features.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || (raw as { type?: unknown }).type !== "Feature") {
      throw corrupt();
    }
    visitGeometry(raw.geometry, bounds);
    const existing = raw.id;
    let id =
      typeof existing === "string" && existing.length > 0
        ? existing
        : typeof existing === "number"
          ? String(existing)
          : `feature-${index + 1}`;
    while (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);
    return {
      type: "Feature",
      id,
      geometry: raw.geometry,
      properties: raw.properties ?? {},
    };
  });
  if (!normalized.some(hasRenderableGeometry)) {
    throw new UserMapImportError(
      "empty-file",
      "This file has no map features in it — nothing to add.",
    );
  }
  return {
    collection: { type: "FeatureCollection", features: normalized },
    featureCount: normalized.length,
    bbox: Number.isFinite(bounds.west)
      ? [bounds.west, bounds.south, bounds.east, bounds.north]
      : null,
  };
}

export function parseGeoJson(text: string): ParsedVector {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw corrupt();
  }
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    throw new UserMapImportError(
      "unsupported-type",
      "This JSON file isn't GeoJSON — no features found in it.",
    );
  }
  const doc = root as Record<string, unknown>;
  assertUsableCrs(doc);
  if (doc.type === "FeatureCollection") {
    if (!Array.isArray(doc.features)) throw corrupt();
    return normalizeCollection(doc.features as Feature[]);
  }
  if (doc.type === "Feature") {
    return normalizeCollection([doc as unknown as Feature]);
  }
  if (typeof doc.type === "string" && GEOMETRY_TYPES.has(doc.type)) {
    return normalizeCollection([
      { type: "Feature", geometry: doc as unknown as Geometry, properties: {} },
    ]);
  }
  throw new UserMapImportError(
    "unsupported-type",
    "This JSON file isn't GeoJSON — no features found in it.",
  );
}
