/**
 * User vector data ("Your data") — the parallel subsystem to the raster
 * user-map records in ../types.ts. The canonical geometry format everywhere
 * is a GeoJSON FeatureCollection in WGS84; other formats (KML, GPX,
 * shapefile) convert at import and never leak past the parsers.
 */

export type UserVectorSource =
  | "geojson"
  | "kml"
  | "kmz"
  | "gpx"
  | "shapefile-zip"
  | "drawn";

/**
 * Provenance stays attached to the layer for the life of the record: an
 * imported file names its source file, a drawn layer names the device-local
 * act. The UI renders this so user-loaded material is never mistaken for an
 * official layer.
 */
export type UserVectorOrigin =
  | { kind: "imported"; filename: string; importedAt: string }
  | { kind: "drawn"; createdAt: string };

export type UserVectorLayerRecord = {
  id: string;
  name: string;
  source: UserVectorSource;
  origin: UserVectorOrigin;
  createdAt: string;
  modifiedAt?: string;
  /** Remount key for the rendered layer; edits (phase 4) bump it. */
  revision: number;
  /** Layer default; per-feature simplestyle properties win over it. */
  style: { color: string };
  featureCount: number;
  bbox: [west: number, south: number, east: number, north: number] | null;
};
