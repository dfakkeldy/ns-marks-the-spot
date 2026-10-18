import type { NsprdFeatureCollection } from "./nsprd";

/**
 * Listed parcels are sub-pixel polygons at overview zooms, so the map shows
 * circle markers instead while zoom <= this threshold. Polygon fills take
 * over from zoom 12, where parcel shapes become legible.
 */
export const OVERVIEW_MARKER_MAX_ZOOM = 11;

export type RepresentativePoint = {
  pid: string;
  latitude: number;
  longitude: number;
};

type Ring = readonly (readonly number[])[];

function ringAreaAndCentroid(ring: Ring): {
  area: number;
  latitude: number;
  longitude: number;
} {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (twiceArea === 0) {
    const [x, y] = ring[0];
    return { area: 0, longitude: x, latitude: y };
  }
  return {
    area: Math.abs(twiceArea / 2),
    longitude: cx / (3 * twiceArea),
    latitude: cy / (3 * twiceArea),
  };
}

/**
 * One marker point per listed PID: the centroid of the largest outer ring
 * among that PID's returned NSPRD features. Planar math on lat/lon is fine
 * here — parcels are far too small for projection error to move a marker
 * visibly at the zooms where markers show.
 */
export function representativeParcelPoints(
  parcels: NsprdFeatureCollection,
  pids: Set<string>,
): RepresentativePoint[] {
  const best = new Map<
    string,
    { area: number; latitude: number; longitude: number }
  >();
  for (const feature of parcels.features) {
    const pid = feature.properties?.PID;
    if (!pid || !pids.has(pid)) {
      continue;
    }
    const { geometry } = feature;
    const outerRings: Ring[] =
      geometry.type === "Polygon"
        ? [geometry.coordinates[0]]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates.map((polygon) => polygon[0])
          : [];
    for (const ring of outerRings) {
      if (!ring || ring.length < 4) {
        continue;
      }
      const candidate = ringAreaAndCentroid(ring);
      const current = best.get(pid);
      if (!current || candidate.area > current.area) {
        best.set(pid, candidate);
      }
    }
  }
  return [...best.entries()].map(([pid, point]) => ({
    pid,
    latitude: point.latitude,
    longitude: point.longitude,
  }));
}
