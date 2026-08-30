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

export function distanceMetres(from: GeoPoint, to: GeoPoint): number {
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

/**
 * Valid only for rings that do not cross the antimeridian (fine for Nova
 * Scotia): the Δλ term (`next.lng - current.lng`) is a plain linear
 * difference, not wrapped to [-180, 180], so a ring spanning ±180° longitude
 * would compute a wildly wrong area.
 */
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

/**
 * A local planar frame in metres about a reference point: x east, y north,
 * equirectangular (x = R·Δλ·cosφ₀, y = R·Δφ). The chord error against the
 * geodesic is O((L/R)²) relative — at parcel-edge lengths it is micrometres,
 * six-plus orders below any snap radius — so snap geometry can use ordinary
 * planar math and still agree with the haversine functions above.
 */
export function localMetricProjection(reference: GeoPoint): {
  toXY: (point: GeoPoint) => { x: number; y: number };
  toGeo: (xy: { x: number; y: number }) => GeoPoint;
} {
  const metresPerLatDegree = EARTH_RADIUS_METRES * DEGREES_TO_RADIANS;
  const metresPerLngDegree =
    metresPerLatDegree * Math.cos(reference.lat * DEGREES_TO_RADIANS);
  return {
    toXY: (point) => ({
      x: (point.lng - reference.lng) * metresPerLngDegree,
      y: (point.lat - reference.lat) * metresPerLatDegree,
    }),
    toGeo: (xy) => ({
      lat: reference.lat + xy.y / metresPerLatDegree,
      lng: reference.lng + xy.x / metresPerLngDegree,
    }),
  };
}

/**
 * Nearest point on the segment a→b to `point`, in the local planar frame
 * about `point`. `t` is the clamped parameter along the segment (0 at a,
 * 1 at b); a degenerate a≈b segment returns a itself with t = 0. Haversine
 * has no closed point-to-segment form, and at snap scales the planar answer
 * is exact for every practical purpose (see localMetricProjection).
 */
export function nearestPointOnSegment(
  point: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
): { point: GeoPoint; distanceMetres: number; t: number } {
  const frame = localMetricProjection(point);
  const target = frame.toXY(point);
  const from = frame.toXY(a);
  const to = frame.toXY(b);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((target.x - from.x) * dx + (target.y - from.y) * dy) / lengthSquared,
          ),
        );
  const nearest = { x: from.x + t * dx, y: from.y + t * dy };
  return {
    point: frame.toGeo(nearest),
    distanceMetres: Math.hypot(target.x - nearest.x, target.y - nearest.y),
    t,
  };
}
