import type { LatLngPoint } from "./projection";

export type MercatorPoint = { x: number; y: number };

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

export function fromMercator(point: MercatorPoint): LatLngPoint {
  return {
    lat:
      (2 * Math.atan(Math.exp(point.y / EARTH_RADIUS_METRES)) - Math.PI / 2) *
      RADIANS_TO_DEGREES,
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
