import { kml } from "@tmcw/togeojson";
import type { Feature } from "geojson";
import { normalizeCollection, type ParsedVector } from "./geojsonSource";

/**
 * KML → GeoJSON via togeojson, which emits the simplestyle vocabulary
 * (`stroke`, `stroke-width`, `fill`, …) that `render/style.ts` already reads,
 * so authored KML colours survive import with no extra plumbing.
 *
 * Descriptions are kept exactly as authored — KML routinely carries HTML in
 * them. Storing it verbatim is safe because the ONLY path from a feature
 * property to the DOM is `render/popup.ts`, which assigns via `textContent`.
 */
export function parseKml(document: Document): ParsedVector {
  const collection = kml(document);
  const features = ((collection.features ?? []) as Feature[]).map((feature) => ({
    ...feature,
    properties: flattenHtmlValues(feature.properties),
  }));
  return normalizeCollection(features);
}

/**
 * togeojson wraps a CDATA/HTML-bearing property as
 * `{ "@type": "html", value: "…" }` while leaving a plain-text one a bare
 * string. Google Earth writes HTML descriptions as a matter of course, so
 * without this the common case arrives as an object — and every consumer
 * downstream (popup, export) reads string properties, meaning the
 * description would silently vanish rather than fail loudly.
 *
 * Flattening to the raw string keeps ONE property shape across every import
 * format. The markup stays markup-as-text: `render/popup.ts` assigns it with
 * `textContent`, and the KML writer escapes it structurally.
 */
function flattenHtmlValues(
  properties: Feature["properties"],
): Feature["properties"] {
  if (!properties || typeof properties !== "object") {
    return properties;
  }
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const wrapped =
      value !== null &&
      typeof value === "object" &&
      (value as Record<string, unknown>)["@type"] === "html" &&
      typeof (value as Record<string, unknown>).value === "string";
    flattened[key] = wrapped
      ? ((value as Record<string, unknown>).value as string)
      : value;
  }
  return flattened;
}
