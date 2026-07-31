/**
 * shpjs 6.2.0 ships no type declarations and has no @types package. Only the
 * default export is used here: it takes zip bytes and returns one
 * FeatureCollection, or several when the archive holds multiple shapefiles.
 * Each carries a `fileName` shpjs derives from the entry name.
 */
declare module "shpjs" {
  import type { FeatureCollection } from "geojson";

  type ShpFeatureCollection = FeatureCollection & { fileName?: string };

  export default function shp(
    source: ArrayBuffer | Uint8Array | string,
  ): Promise<ShpFeatureCollection | ShpFeatureCollection[]>;
}
