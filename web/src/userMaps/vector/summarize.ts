import type { FeatureCollection } from "geojson";

export type VectorBounds =
  | [west: number, south: number, east: number, north: number]
  | null;

/**
 * Recomputes a record's summary from the geometry it now holds. Feature
 * count and bbox drive the row's subtitle and the fit, so leaving them at
 * their import-time values would make both lie after the first change.
 * Shared by the edit session and appendFeatures — one implementation, or
 * the two paths drift.
 */
export function summarize(collection: FeatureCollection): {
  featureCount: number;
  bbox: VectorBounds;
} {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      return;
    }
    for (const inner of coords) visit(inner);
  };
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "GeometryCollection") {
      for (const part of geometry.geometries) visit((part as { coordinates?: unknown }).coordinates);
    } else {
      visit(geometry.coordinates);
    }
  }
  return {
    featureCount: collection.features.length,
    bbox: Number.isFinite(west) ? [west, south, east, north] : null,
  };
}
