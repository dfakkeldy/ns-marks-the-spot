import type { LatLngPoint } from "./projection";

export type MercatorPoint = { x: number; y: number };

/**
 * The Web Mercator sphere's radius, used for BOTH the projection and the
 * ground-distance haversine below. The great-circle convention would be the
 * mean radius 6371008.8, which would make every reported residual 0.112%
 * smaller — 4.5 cm on a 40 m figure. Using one radius throughout keeps
 * projected metres and ground metres on the same sphere, which is worth more
 * than that difference.
 */
export const EARTH_RADIUS_METRES = 6378137;

/**
 * Mercator's y term diverges at the poles, so every implementation clamps.
 * This is the same limit Leaflet uses, which keeps our metres identical to
 * the map's own projected space.
 */
export const MAX_MERCATOR_LATITUDE = 85.0511287798;

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * Spherical Web Mercator, hand-rolled so `transform/` imports no Leaflet and
 * stays testable headlessly. Verified to agree with
 * `L.Projection.SphericalMercator` to ~3e-9 m, which matters because the
 * renderer hands these coordinates straight back to Leaflet.
 */
export function toMercator(point: LatLngPoint): MercatorPoint {
  const lat = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, point.lat),
  );
  return {
    x: EARTH_RADIUS_METRES * point.lng * DEGREES_TO_RADIANS,
    y:
      EARTH_RADIUS_METRES *
      Math.log(Math.tan(Math.PI / 4 + (lat * DEGREES_TO_RADIANS) / 2)),
  };
}

/**
 * Clamped symmetrically to `toMercator`. A large-scale affine can project a
 * mesh corner past the Mercator domain; unclamped, Leaflet silently clamps it
 * for us at draw time, which breaks the mesh's affinity in a way no test
 * catches. Better to be the one who clamps.
 */
export function fromMercator(point: MercatorPoint): LatLngPoint {
  const lat =
    (2 * Math.atan(Math.exp(point.y / EARTH_RADIUS_METRES)) - Math.PI / 2) *
    RADIANS_TO_DEGREES;
  return {
    lat: Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat)),
    lng: (point.x / EARTH_RADIUS_METRES) * RADIANS_TO_DEGREES,
  };
}

/**
 * Great-circle distance. Residuals are reported through this rather than as
 * Mercator magnitudes: Mercator inflates distance by 1/cos(latitude), which
 * is 1.44x at Nova Scotia latitudes, so a "40 m" accuracy claim measured in
 * Mercator metres would really be 28 m of ground error.
 */
export function groundMetresBetween(a: LatLngPoint, b: LatLngPoint): number {
  const lat1 = a.lat * DEGREES_TO_RADIANS;
  const lat2 = b.lat * DEGREES_TO_RADIANS;
  const deltaLat = lat2 - lat1;
  const deltaLng = (b.lng - a.lng) * DEGREES_TO_RADIANS;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}
