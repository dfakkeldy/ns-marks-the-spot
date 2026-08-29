import type { TrackPoint } from "./trackFilter";

/**
 * Douglas-Peucker in local planar metres, hand-rolled per the geodesy.ts
 * no-turf precedent (Leaflet's LineUtil works in pixels and would drag a map
 * dependency into a pure module). Vertices project to a plane about the
 * segment's mean latitude — the equirectangular error over track extents is
 * micrometres against metre tolerances. Stack-based on purpose: a long
 * recording must not recurse thousands of frames deep. Endpoints are always
 * kept, and the same kept indices apply to the parallel times array, which
 * is why this returns indices rather than points.
 */

const EARTH_RADIUS_METRES = 6_371_000;
const DEGREES_TO_RADIANS = Math.PI / 180;

type Planar = { x: number; y: number };

function project(points: readonly { lat: number; lng: number }[]): Planar[] {
  const meanLat =
    points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const metresPerLngDegree =
    EARTH_RADIUS_METRES * DEGREES_TO_RADIANS * Math.cos(meanLat * DEGREES_TO_RADIANS);
  const metresPerLatDegree = EARTH_RADIUS_METRES * DEGREES_TO_RADIANS;
  return points.map(({ lat, lng }) => ({
    x: lng * metresPerLngDegree,
    y: lat * metresPerLatDegree,
  }));
}

function perpendicularDistance(point: Planar, a: Planar, b: Planar): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Kept indices, ascending; tolerance 0 (or fewer than 3 points) keeps all. */
export function simplifyIndices(
  points: readonly { lat: number; lng: number }[],
  toleranceM: number,
): number[] {
  if (toleranceM <= 0 || points.length <= 2) {
    return points.map((_, index) => index);
  }
  const planar = project(points);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = first + 1; index < last; index += 1) {
      const distance = perpendicularDistance(planar[index], planar[first], planar[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxIndex !== -1 && maxDistance > toleranceM) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  const kept: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (keep[index]) {
      kept.push(index);
    }
  }
  return kept;
}

/** Runs per segment, so a pause boundary is never simplified across. */
export function simplifyTrackSegments(
  segments: readonly TrackPoint[][],
  toleranceM: number,
): TrackPoint[][] {
  return segments.map((segment) =>
    simplifyIndices(segment, toleranceM).map((index) => segment[index]),
  );
}
