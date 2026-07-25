import type { EmbeddedGeoref, PixelSize } from "./transform/projection";

export type Gcp = {
  id: string;
  /** Original-image pixel space, so preview resolution never invalidates GCPs. */
  pixel: { x: number; y: number };
  /** WGS84 for portability; solves run in Web Mercator metres (see spec). */
  map: { lat: number; lng: number };
};

/** Produced by the PR-2 georeferencer; defined now so the store schema is stable. */
export type GcpGeoref = { kind: "gcp"; gcps: Gcp[]; method: "affine" | "tps" };

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
