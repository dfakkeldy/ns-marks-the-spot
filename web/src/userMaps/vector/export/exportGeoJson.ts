import type { FeatureCollection } from "geojson";

/**
 * The canonical internal format is already a WGS84 FeatureCollection, so
 * GeoJSON export is a serialization rather than a conversion — what the user
 * gets back is exactly what the map is drawing, including any feature ids
 * and properties their original file carried.
 *
 * Pretty-printed: an exported layer is often read or hand-edited before it
 * goes somewhere else.
 */
export function geojsonExportBlob(collection: FeatureCollection): Blob {
  return new Blob([JSON.stringify(collection, null, 2)], {
    type: "application/geo+json",
  });
}
