import { gpx } from "@tmcw/togeojson";
import type { Feature } from "geojson";
import { normalizeCollection, type ParsedVector } from "./geojsonSource";
import { parseXmlDocument } from "./xmlDocument";

/**
 * GPX → GeoJSON via togeojson: waypoints become Points and tracks/routes
 * become LineStrings, which is exactly the shape a site-visit recording
 * needs — no extra modelling for waypoints vs tracks.
 */
export function parseGpx(text: string): ParsedVector {
  const document = parseXmlDocument(text);
  const collection = gpx(document);
  return normalizeCollection((collection.features ?? []) as Feature[]);
}
