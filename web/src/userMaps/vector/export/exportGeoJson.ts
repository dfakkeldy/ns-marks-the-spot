import type { FeatureCollection } from "geojson";
import { TRACED_PROVENANCE_NOTE, hasTracedFeatures } from "./tracedProvenance";

/**
 * The canonical internal format is already a WGS84 FeatureCollection, so
 * GeoJSON export is a serialization rather than a conversion — what the user
 * gets back is exactly what the map is drawing, including any feature ids
 * and properties their original file carried. A layer holding parcel-traced
 * features additionally carries the provenance note as a foreign member
 * (spec-legal; consumers that strip it still keep per-feature nsmts:traced).
 *
 * Pretty-printed: an exported layer is often read or hand-edited before it
 * goes somewhere else.
 */
export function geojsonExportBlob(collection: FeatureCollection): Blob {
  const output = hasTracedFeatures(collection)
    ? { ...collection, "nsmts:provenance": TRACED_PROVENANCE_NOTE }
    : collection;
  return new Blob([JSON.stringify(output, null, 2)], {
    type: "application/geo+json",
  });
}
