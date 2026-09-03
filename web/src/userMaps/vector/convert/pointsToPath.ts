import type { Feature, FeatureCollection, Position } from "geojson";
import {
  NSMTS_TRACED,
  NSMTS_TRACED_PARCEL,
} from "../../../location/captureSpec";
import {
  pathDistanceMetres,
  polygonAreaSquareMetres,
} from "../../../services/geodesy";
import { generateId } from "../../importUtils";

/**
 * Points-to-path conversion per the field-capture contract: the layer's
 * Point features in STORED ARRAY ORDER (creation order for drawn layers —
 * the owner ruled to ship the simple ordering first and revisit reordering
 * after real use), consecutive exact-duplicate coordinates dropped, a
 * polygon ring closed by repeating the first position, self-intersection
 * warned but never blocked. The numbered on-map preview is the safeguard
 * against a surprising order. The output feature carries nsmts:createdAt,
 * nsmts:convertedFromPoints, and inherits nsmts:traced when any source
 * point was parcel-snapped — the caveat travels with derived geometry.
 */

export type ConvertShape = "line" | "area";

export type ConversionPlan = {
  /** Deduped source positions in stored order, unclosed. */
  positions: Position[];
  sourcePointCount: number;
  viable: boolean;
  lengthM: number;
  areaM2: number | null;
  selfIntersects: boolean;
  traced: boolean;
};

function pointFeatures(collection: FeatureCollection): Feature[] {
  return collection.features.filter(
    (feature) => feature.geometry?.type === "Point",
  );
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Proper segment-intersection test in lon/lat; adequate at parcel scales. */
function segmentsCross(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): boolean {
  const orient = (p: Position, q: Position, r: Position): number => {
    const value = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return value > 0 ? 1 : value < 0 ? -1 : 0;
  };
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function pathSelfIntersects(path: Position[], closed: boolean): boolean {
  const segments: Array<[Position, Position]> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    segments.push([path[index], path[index + 1]]);
  }
  if (closed && path.length >= 3) {
    segments.push([path[path.length - 1], path[0]]);
  }
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 2; j < segments.length; j += 1) {
      // Adjacent segments share a vertex; in a ring the last and first are
      // adjacent too.
      if (closed && i === 0 && j === segments.length - 1) {
        continue;
      }
      if (segmentsCross(segments[i][0], segments[i][1], segments[j][0], segments[j][1])) {
        return true;
      }
    }
  }
  return false;
}

export function planPointsToPath(
  collection: FeatureCollection,
  shape: ConvertShape,
): ConversionPlan {
  const points = pointFeatures(collection);
  const positions: Position[] = [];
  let traced = false;
  for (const feature of points) {
    if (feature.geometry?.type !== "Point") {
      continue;
    }
    // 2D on purpose: a converted outline is planimetric, and mixed
    // altitudes from marked points would fabricate a 3D shape.
    const position: Position = [
      feature.geometry.coordinates[0],
      feature.geometry.coordinates[1],
    ];
    const previous = positions[positions.length - 1];
    if (!previous || !samePosition(previous, position)) {
      positions.push(position);
    }
    // The spec declares one value this key may take. Any other value is a
    // property an imported file happened to carry, and promoting it would
    // stamp NSPRD provenance — and the Province's attribution — on a path
    // nothing traced.
    if (
      feature.properties &&
      (feature.properties as Record<string, unknown>)[NSMTS_TRACED] ===
        NSMTS_TRACED_PARCEL
    ) {
      traced = true;
    }
  }
  // A hand-closed ring (last point back on the first) would double the
  // closure the builder appends.
  if (
    shape === "area" &&
    positions.length >= 2 &&
    samePosition(positions[0], positions[positions.length - 1])
  ) {
    positions.pop();
  }

  const viable = shape === "line" ? positions.length >= 2 : positions.length >= 3;
  const geoPoints = positions.map(([lng, lat]) => ({ lat, lng }));
  const closedGeoPoints = viable && shape === "area" ? [...geoPoints, geoPoints[0]] : geoPoints;
  return {
    positions,
    sourcePointCount: points.length,
    viable,
    lengthM: viable ? pathDistanceMetres(closedGeoPoints) : 0,
    areaM2: viable && shape === "area" ? polygonAreaSquareMetres(geoPoints) : null,
    selfIntersects: viable ? pathSelfIntersects(positions, shape === "area") : false,
    traced,
  };
}

export type ConversionResult = {
  collection: FeatureCollection;
  feature: Feature;
};

export function buildPathFromPoints(
  collection: FeatureCollection,
  input: { shape: ConvertShape; keepSourcePoints: boolean },
): ConversionResult | null {
  const plan = planPointsToPath(collection, input.shape);
  if (!plan.viable) {
    return null;
  }
  const properties: Record<string, unknown> = {
    "nsmts:createdAt": new Date().toISOString(),
    "nsmts:convertedFromPoints": plan.sourcePointCount,
  };
  if (plan.traced) {
    properties[NSMTS_TRACED] = NSMTS_TRACED_PARCEL;
  }
  const feature: Feature = {
    type: "Feature",
    id: generateId(),
    geometry:
      input.shape === "line"
        ? { type: "LineString", coordinates: plan.positions }
        : {
            type: "Polygon",
            coordinates: [[...plan.positions, plan.positions[0]]],
          },
    properties,
  };
  const remaining = input.keepSourcePoints
    ? collection.features
    : collection.features.filter(
        (candidate) => candidate.geometry?.type !== "Point",
      );
  return {
    collection: { type: "FeatureCollection", features: [...remaining, feature] },
    feature,
  };
}
