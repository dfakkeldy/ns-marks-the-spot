import type { Geometry, Position } from "geojson";
import { pathSelfIntersects } from "../convert/pointsToPath";

/**
 * The non-drag route to a shape's corners.
 *
 * Reshaping a line or an area on the map means dragging a vertex handle, and
 * a vertex handle is 10px across. That is under the target size on a phone,
 * it cannot be reached by keyboard at all, and enlarging it is not open to
 * us: the session enables Geoman on every feature of the layer being edited,
 * so a 44px middle marker would put a 44px "insert a corner" target on every
 * segment midpoint of that layer, and a tap meant to select a shape the
 * reader had not selected would add a corner to it instead.
 *
 * So the corners are addressed by number instead of by pixel: the panel lists
 * them, the reader picks one, and the map centre — which a keyboard can pan
 * and a phone can drag with the whole screen — says where it goes. Everything
 * in this module is pure geometry so it can be tested without a map.
 */

/**
 * Above this many positions in one ring or line, the self-crossing test is
 * not run. It compares every segment against every other, so a 2,000-fix
 * imported track would cost about two million orientation computations per
 * press, twice — once for the shape as it stands and once for the shape the
 * move would make. The cap is not silent: the outcome says the shape was not
 * checked, and the panel repeats that to the reader.
 */
export const CROSSING_CHECK_MAX_POSITIONS = 400;

/** The array a corner lives in: a line, or one ring of an area. */
type CornerOwner = {
  /** Index path from `geometry.coordinates` down to the position array. */
  prefix: number[];
  /** Whether the last position of that array repeats its first. */
  closed: boolean;
};

export type FeatureCorner = {
  /** 1-based across the whole geometry; what the panel says out loud. */
  number: number;
  position: Position;
  /** Index within the owner array. */
  index: number;
  /** Null for a Point, whose single position is the whole geometry. */
  owner: CornerOwner | null;
  /**
   * Other indices in the owner array that hold the same corner and have to
   * move with it — a closed ring's repeated first position, and nothing else.
   */
  mirrors: number[];
  /** 1-based part number, and how many parts the geometry has in total. */
  part: number;
  partCount: number;
};

export type VertexEditOutcome =
  | {
      status: "done";
      /**
       * False when the shape was too long for the self-crossing test. The
       * corner moved either way; what is unknown is whether the shape now
       * crosses itself, and the reader is told that rather than left to
       * assume it was checked.
       */
      crossingChecked: boolean;
    }
  /** The shape does not cross itself now and would after. Nothing was written. */
  | { status: "would-cross" }
  /** No such corner, or geometry this control cannot address. */
  | { status: "unavailable" };

export type VertexEditResult = {
  outcome: VertexEditOutcome;
  /** The rewritten geometry, or null whenever the outcome is not "done". */
  geometry: Geometry | null;
};

const UNAVAILABLE: VertexEditResult = {
  outcome: { status: "unavailable" },
  geometry: null,
};

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * A ring counts as closed only when its last position actually repeats its
 * first. Nothing on the import path enforces that — `geojsonSource.ts`
 * validates the CRS, the position ranges and the geometry type, and never
 * closes or checks a ring — so assuming closure would drop an imported ring's
 * last real vertex from the list and then teleport it whenever corner 1 moved.
 */
function ringIsClosed(positions: Position[]): boolean {
  return (
    positions.length >= 2 &&
    samePosition(positions[0], positions[positions.length - 1])
  );
}

function cornersIn(
  positions: Position[],
  prefix: number[],
  part: number,
): Omit<FeatureCorner, "number" | "partCount">[] {
  const closed = ringIsClosed(positions);
  const last = positions.length - 1;
  const listed = closed ? positions.slice(0, last) : positions;
  return listed.map((position, index) => ({
    position,
    index,
    owner: { prefix, closed },
    mirrors: closed && index === 0 ? [last] : [],
    part,
  }));
}

/**
 * Every corner of a geometry, in the order the panel lists them.
 *
 * MultiPoint is deliberately absent. Leaflet renders one as a FeatureGroup of
 * circle markers, and neither the reconciliation in `EditableVectorLayer` nor
 * its `collect()` can see inside a FeatureGroup — so a move would be written
 * to the draft, reported as done, and then published away by the next Geoman
 * gesture. Offering nothing is honest; offering a control that reports a
 * success the map reverts is not. GeometryCollection is absent for the same
 * reason: nothing renders its members as editable layers.
 */
export function featureCorners(geometry: Geometry | null): FeatureCorner[] {
  if (!geometry) {
    return [];
  }
  let flat: Omit<FeatureCorner, "number" | "partCount">[] = [];
  switch (geometry.type) {
    case "Point":
      flat = [
        {
          position: geometry.coordinates,
          index: 0,
          owner: null,
          mirrors: [],
          part: 1,
        },
      ];
      break;
    case "LineString":
      flat = cornersIn(geometry.coordinates, [], 1);
      break;
    case "MultiLineString":
      flat = geometry.coordinates.flatMap((line, index) =>
        cornersIn(line, [index], index + 1),
      );
      break;
    case "Polygon":
      flat = geometry.coordinates.flatMap((ring, index) =>
        cornersIn(ring, [index], index + 1),
      );
      break;
    case "MultiPolygon":
      flat = geometry.coordinates.flatMap((polygon, outer) =>
        polygon.flatMap((ring, inner) =>
          cornersIn(ring, [outer, inner], outer + 1),
        ),
      );
      break;
    default:
      return [];
  }
  const partCount = flat.reduce((count, corner) => Math.max(count, corner.part), 0);
  return flat.map((corner, index) => ({
    ...corner,
    number: index + 1,
    partCount,
  }));
}

function positionsAt(geometry: Geometry, prefix: number[]): Position[] | null {
  let node: unknown = (geometry as { coordinates?: unknown }).coordinates;
  for (const step of prefix) {
    if (!Array.isArray(node)) {
      return null;
    }
    node = node[step];
  }
  return Array.isArray(node) ? (node as Position[]) : null;
}

/** A geometry with one position array replaced; nothing else is aliased. */
function withPositions(
  geometry: Geometry,
  prefix: number[],
  positions: Position[],
): Geometry {
  const replace = (node: unknown, depth: number): unknown => {
    if (depth === prefix.length) {
      return positions;
    }
    if (!Array.isArray(node)) {
      return node;
    }
    return node.map((child, index) =>
      index === prefix[depth] ? replace(child, depth + 1) : child,
    );
  };
  return {
    ...geometry,
    coordinates: replace(
      (geometry as { coordinates?: unknown }).coordinates,
      0,
    ),
  } as Geometry;
}

/**
 * Whether the move may proceed, and whether the question was asked at all.
 *
 * The refusal compares the shape before with the shape after, and refuses
 * only when the move is what introduces the crossing. `pathSelfIntersects`
 * reports whether a path crosses, full stop — a GPS track that doubles back
 * crosses itself already, and a shape that returns true whatever the reader
 * does would make the mover useless on exactly the geometry hardest to drag.
 */
function crossingVerdict(
  before: Position[],
  after: Position[],
  closed: boolean,
): { refuse: boolean; checked: boolean } {
  if (Math.max(before.length, after.length) > CROSSING_CHECK_MAX_POSITIONS) {
    return { refuse: false, checked: false };
  }
  const open = (positions: Position[]) =>
    closed && ringIsClosed(positions) ? positions.slice(0, -1) : positions;
  if (!pathSelfIntersects(open(after), closed)) {
    return { refuse: false, checked: true };
  }
  return { refuse: !pathSelfIntersects(open(before), closed), checked: true };
}

function rewrite(
  geometry: Geometry,
  corner: FeatureCorner,
  next: (positions: Position[]) => Position[],
): VertexEditResult {
  if (!corner.owner) {
    // A Point: one position, no path to cross.
    return {
      outcome: { status: "done", crossingChecked: true },
      geometry: {
        ...geometry,
        coordinates: next([corner.position])[0],
      } as Geometry,
    };
  }
  const before = positionsAt(geometry, corner.owner.prefix);
  if (!before || before[corner.index] === undefined) {
    return UNAVAILABLE;
  }
  const after = next(before);
  const verdict = crossingVerdict(before, after, corner.owner.closed);
  if (verdict.refuse) {
    return { outcome: { status: "would-cross" }, geometry: null };
  }
  return {
    outcome: { status: "done", crossingChecked: verdict.checked },
    geometry: withPositions(geometry, corner.owner.prefix, after),
  };
}

/** Puts the named corner at `position`, carrying a ring's closing repeat. */
export function moveCorner(
  geometry: Geometry | null,
  corner: FeatureCorner,
  position: Position,
): VertexEditResult {
  if (!geometry) {
    return UNAVAILABLE;
  }
  return rewrite(geometry, corner, (positions) => {
    const next = positions.slice();
    next[corner.index] = position;
    for (const mirror of corner.mirrors) {
      next[mirror] = position;
    }
    return next;
  });
}

/**
 * Adds a corner immediately after the named one — the non-drag half of
 * inserting a vertex, which on the map is a 10px middle marker.
 *
 * In a closed ring the new position lands before the closing repeat, so the
 * ring stays closed on the same corner it was closed on. A Point has nothing
 * to insert into and is refused rather than silently promoted to a line.
 */
export function insertAfterCorner(
  geometry: Geometry | null,
  corner: FeatureCorner,
  position: Position,
): VertexEditResult {
  if (!geometry || !corner.owner) {
    return UNAVAILABLE;
  }
  return rewrite(geometry, corner, (positions) => {
    const next = positions.slice();
    next.splice(corner.index + 1, 0, position);
    return next;
  });
}
