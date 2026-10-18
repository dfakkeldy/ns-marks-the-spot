import { gpx } from "@tmcw/togeojson";
import type { Feature } from "geojson";
import { normalizeCollection, type ParsedVector } from "./geojsonSource";

/**
 * GPX → GeoJSON via togeojson: waypoints become Points and tracks/routes
 * become LineStrings, which is exactly the shape a site-visit recording
 * needs — no extra modelling for waypoints vs tracks.
 */
export function parseGpx(document: Document): ParsedVector {
  const collection = gpx(document);
  return normalizeCollection((collection.features ?? []) as Feature[]);
}
