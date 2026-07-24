/**
 * Geodesic measurement on the sphere Leaflet uses (CRS.Earth, R = 6 371 000 m),
 * so measured values agree with the on-screen scale bar. A planar shoelace on
 * raw lat/lng would overstate areas by ~40 % at Nova Scotia's latitude; the
 * spherical-excess form below is the standard geodesic approximation.
 */

const EARTH_RADIUS_METRES = 6_371_000;
const DEGREES_TO_RADIANS = Math.PI / 180;
const SQUARE_METRES_PER_HECTARE = 10_000;

export const SQUARE_METRES_PER_ACRE = 4_046.856_422_4;

export interface GeoPoint {
  lat: number;
  lng: number;
}

function distanceMetres(from: GeoPoint, to: GeoPoint): number {
  const fromLat = from.lat * DEGREES_TO_RADIANS;
  const toLat = to.lat * DEGREES_TO_RADIANS;
  const deltaLat = (to.lat - from.lat) * DEGREES_TO_RADIANS;
  const deltaLng = (to.lng - from.lng) * DEGREES_TO_RADIANS;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_METRES *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function pathDistanceMetres(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMetres(points[index - 1], points[index]);
  }
  return total;
}

export function polygonAreaSquareMetres(ring: readonly GeoPoint[]): number {
  if (ring.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    sum +=
      (next.lng - current.lng) *
      DEGREES_TO_RADIANS *
      (2 +
        Math.sin(current.lat * DEGREES_TO_RADIANS) +
        Math.sin(next.lat * DEGREES_TO_RADIANS));
  }
  return Math.abs((sum * EARTH_RADIUS_METRES * EARTH_RADIUS_METRES) / 2);
}

const metreFormatter = new Intl.NumberFormat("en-CA", {
  maximumFractionDigits: 0,
});
const twoDecimalFormatter = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDistance(metres: number): string {
  if (metres < 1_000) {
    return `${metreFormatter.format(metres)} m`;
  }
  return `${twoDecimalFormatter.format(metres / 1_000)} km`;
}

export function formatArea(squareMetres: number): string {
  const hectares = squareMetres / SQUARE_METRES_PER_HECTARE;
  const acres = squareMetres / SQUARE_METRES_PER_ACRE;
  return `${twoDecimalFormatter.format(hectares)} ha · ${twoDecimalFormatter.format(acres)} ac`;
}
