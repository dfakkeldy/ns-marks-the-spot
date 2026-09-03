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
  | "drawn"
  | "recorded"
  | "photos";

/**
 * Provenance stays attached to the layer for the life of the record: an
 * imported file names its source file, a drawn layer names the device-local
 * act, a recorded layer names the GPS capture. The UI renders this so
 * user-loaded material is never mistaken for an official layer.
 *
 * Reserved feature properties: app-owned metadata on individual features
 * lives under the `nsmts:` prefix (capture time, GPS accuracy — see
 * location/captureSpec.ts for the full pinned list shared with the native
 * app). Imported files' own properties are carried untouched and never
 * collide with the namespace.
 */
export type UserVectorOrigin =
  | { kind: "imported"; filename: string; importedAt: string }
  | { kind: "drawn"; createdAt: string }
  | {
      kind: "recorded";
      startedAt: string;
      endedAt: string;
      /**
       * Only ever set, never false: this walk was saved from the copy the
       * device kept while it ran, so it ends at the last position stored and
       * may be cut short. That is what the flag knows — not that no Stop was
       * ever pressed. A tab discarded with the save dialog open leaves the
       * same draft behind, and a walk saved from that draft is marked too,
       * because the same thing is true of it: what was saved is what the
       * device had, not necessarily what was walked. A walk saved straight
       * from the dialog carries no key.
       */
      interrupted?: true;
    }
  | { kind: "photo-import"; count: number; importedAt: string };

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
