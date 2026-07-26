import type { EmbeddedGeoref, PixelSize } from "./transform/projection";

export type Gcp = {
  id: string;
  /** Original-image pixel space, so preview resolution never invalidates GCPs. */
  pixel: { x: number; y: number };
  /** WGS84 for portability; solves run in Web Mercator metres (see spec). */
  map: { lat: number; lng: number };
};

/**
 * Which solver turns a record's GCPs into a drape. Named rather than written
 * inline because the choice has to travel to THREE places that each decide
 * something different: the live session's mesh, `meshForRecord` (every saved
 * layer), and `needsGeoreferencing` (whether the record is drawable at all).
 * The stored union is unchanged, so there is no migration.
 */
export type GeoreferenceMethod = "affine" | "tps";

/** Produced by the PR-2 georeferencer; defined now so the store schema is stable. */
export type GcpGeoref = { kind: "gcp"; gcps: Gcp[]; method: GeoreferenceMethod };

export type UserMapGeoref = EmbeddedGeoref | GcpGeoref;

export type UserMapSource = "geotiff" | "geopdf" | "image";

export type UserMapRecord = {
  id: string;
  name: string;
  source: UserMapSource;
  createdAt: string;
  /** Original raster dimensions — GCP space, not preview space. */
  pixelSize: PixelSize;
  georef: UserMapGeoref;
};
