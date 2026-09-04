import { describe, expect, it } from "vitest";
import type { Geometry, Position } from "geojson";
import {
  CROSSING_CHECK_MAX_POSITIONS,
  featureCorners,
  insertAfterCorner,
  moveCorner,
} from "./featureCorners";

const closedSquare: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ],
};

/** What `geojsonSource` will hand over: nothing there closes a ring. */
const unclosedSquare: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
  ],
};

const openC: Geometry = {
  type: "LineString",
  coordinates: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
};

function numbered(geometry: Geometry, cornerNumber: number) {
  const corner = featureCorners(geometry).find(
    (candidate) => candidate.number === cornerNumber,
  );
  if (!corner) {
    throw new Error(`no corner ${cornerNumber}`);
  }
  return corner;
}

describe("featureCorners", () => {
  it("lists a closed ring's corners once each, without the position that closes it", () => {
    const corners = featureCorners(closedSquare);
    expect(corners).toHaveLength(4);
    expect(corners.map((corner) => corner.position)).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
    expect(corners[0].mirrors).toEqual([4]);
    expect(corners[1].mirrors).toEqual([]);
  });

  // A ring that arrives unclosed has four real vertices, not three plus a
  // repeat. Assuming closure would hide the fourth from the list and then
  // teleport it whenever corner 1 moved.
  it("mirrors a ring's first corner only when the ring actually repeats it", () => {
    const corners = featureCorners(unclosedSquare);
    expect(corners).toHaveLength(4);
    expect(corners[3].position).toEqual([1, 0]);
    expect(corners.every((corner) => corner.mirrors.length === 0)).toBe(true);

    const moved = moveCorner(unclosedSquare, numbered(unclosedSquare, 1), [
      5, 5,
    ]);
    expect(moved.outcome).toEqual({ status: "done", crossingChecked: true });
    expect((moved.geometry as { coordinates: Position[][] }).coordinates[0]).toEqual([
      [5, 5],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
  });

  // Leaflet renders a MultiPoint as a FeatureGroup of circle markers, which
  // neither the layer's reconciliation nor its collect() can see inside — a
  // move would be reported as done and then published away.
  it("offers no corners for geometry the live layer could not follow", () => {
    expect(
      featureCorners({
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toEqual([]);
    expect(
      featureCorners({ type: "GeometryCollection", geometries: [] }),
    ).toEqual([]);
    expect(featureCorners(null)).toEqual([]);
  });

  it("numbers the corners of every ring of an area in one sequence", () => {
    const donut: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 4],
          [4, 4],
          [4, 0],
          [0, 0],
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1],
          [1, 1],
        ],
      ],
    };
    const corners = featureCorners(donut);
    expect(corners).toHaveLength(8);
    expect(corners[5].number).toBe(6);
    expect(corners[5].part).toBe(2);
    expect(corners[5].partCount).toBe(2);
    expect(corners[5].owner?.prefix).toEqual([1]);
  });
});

describe("moveCorner", () => {
  it("moves a ring's first corner and keeps the ring closed on it", () => {
    const result = moveCorner(closedSquare, numbered(closedSquare, 1), [5, 5]);
    expect(result.outcome).toEqual({ status: "done", crossingChecked: true });
    expect(
      (result.geometry as { coordinates: Position[][] }).coordinates[0],
    ).toEqual([
      [5, 5],
      [0, 1],
      [1, 1],
      [1, 0],
      [5, 5],
    ]);
    // The source is untouched: the session publishes new collections and a
    // mutated one would edit geometry it had already handed out.
    expect(
      (closedSquare as { coordinates: Position[][] }).coordinates[0][0],
    ).toEqual([0, 0]);
  });

  it("refuses a corner move that would make the shape cross itself", () => {
    const result = moveCorner(openC, numbered(openC, 4), [0.5, -1]);
    expect(result.outcome).toEqual({ status: "would-cross" });
    expect(result.geometry).toBeNull();
  });

  // `pathSelfIntersects` reports whether a path crosses, full stop. A track
  // that already doubles back returns true for every corner and every target,
  // so refusing on the answer alone would freeze the one geometry hardest to
  // drag.
  it("allows a move on a shape that was already crossing itself", () => {
    const bowtie: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [2, 2],
        [2, 0],
        [0, 2],
      ],
    };
    const result = moveCorner(bowtie, numbered(bowtie, 4), [0, 3]);
    expect(result.outcome).toEqual({ status: "done", crossingChecked: true });
  });

  // The stored repeat decides the mirror and nothing else. Leaflet draws the
  // closing edge of an unclosed imported ring just the same, so a move that
  // puts a crossing there is one the reader sees — and reporting it as
  // checked-and-clear would be the control certifying what it never tested.
  it("tests an unclosed ring's closing edge, which the map draws either way", () => {
    const unclosedTriangle: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [0, 2],
          [0, 3],
        ],
      ],
    };
    const result = moveCorner(
      unclosedTriangle,
      numbered(unclosedTriangle, 4),
      [2, 2],
    );
    expect(result.outcome).toEqual({ status: "would-cross" });
  });

  // A polyline that ends where it started is two coincident vertices, not a
  // ring: Leaflet draws it exactly as stored, and moving one end must leave
  // the other where the reader put it.
  it("does not mirror a line whose last position happens to equal its first", () => {
    const loop: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    };
    const corners = featureCorners(loop);
    expect(corners).toHaveLength(4);
    expect(corners.every((corner) => corner.mirrors.length === 0)).toBe(true);
    const result = moveCorner(loop, numbered(loop, 1), [-1, -1]);
    expect(
      (result.geometry as { coordinates: Position[] }).coordinates,
    ).toEqual([
      [-1, -1],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it("says so when the shape has too many corners to check for crossings", () => {
    const long: Geometry = {
      type: "LineString",
      coordinates: Array.from(
        { length: CROSSING_CHECK_MAX_POSITIONS + 1 },
        (_unused, index): Position => [index / 1000, 0],
      ),
    };
    const result = moveCorner(long, numbered(long, 2), [0, 5]);
    expect(result.outcome).toEqual({ status: "done", crossingChecked: false });
    expect(result.geometry).not.toBeNull();
  });

  // A corner dropped on top of the one beside it draws a segment with no
  // length: invisible on the map, and read back as a shape with a vertex
  // nobody can see. Refused, and said, rather than reported as a move.
  it("refuses a corner moved on top of the one beside it", () => {
    const result = moveCorner(closedSquare, numbered(closedSquare, 2), [0, 0]);
    expect(result.outcome).toEqual({ status: "already-there" });
    expect(result.geometry).toBeNull();
  });

  it("still moves a corner on a shape that already had a doubled position", () => {
    const doubled: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [0, 0],
        [1, 1],
      ],
    };
    // Repairing that shape is exactly what this control is for, so an existing
    // zero-length edge must not freeze every corner on it.
    const result = moveCorner(doubled, numbered(doubled, 3), [2, 2]);
    expect(result.outcome).toEqual({ status: "done", crossingChecked: true });
  });

  it("moves a Point, which has no path to cross", () => {
    const point: Geometry = { type: "Point", coordinates: [-63.5, 44.5] };
    const corners = featureCorners(point);
    expect(corners).toHaveLength(1);
    expect(corners[0].owner).toBeNull();
    const result = moveCorner(point, corners[0], [-63.4, 44.6]);
    expect(result.outcome).toEqual({ status: "done", crossingChecked: true });
    expect(result.geometry).toEqual({
      type: "Point",
      coordinates: [-63.4, 44.6],
    });
  });
});

describe("insertAfterCorner", () => {
  it("adds a corner inside a ring, before the position that closes it", () => {
    const result = insertAfterCorner(
      closedSquare,
      numbered(closedSquare, 4),
      [0.5, -1],
    );
    expect(result.outcome).toEqual({ status: "done", crossingChecked: true });
    expect(
      (result.geometry as { coordinates: Position[][] }).coordinates[0],
    ).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0.5, -1],
      [0, 0],
    ]);
  });

  it("refuses a corner that would make the ring cross itself", () => {
    const result = insertAfterCorner(
      closedSquare,
      numbered(closedSquare, 4),
      [2, 0.5],
    );
    expect(result.outcome).toEqual({ status: "would-cross" });
    expect(result.geometry).toBeNull();
  });

  it("refuses a corner added on top of the one it follows", () => {
    const result = insertAfterCorner(
      closedSquare,
      numbered(closedSquare, 1),
      [0, 0],
    );
    expect(result.outcome).toEqual({ status: "already-there" });
    expect(result.geometry).toBeNull();
  });

  it("refuses a Point rather than promoting it to a line", () => {
    const point: Geometry = { type: "Point", coordinates: [-63.5, 44.5] };
    const result = insertAfterCorner(point, featureCorners(point)[0], [0, 0]);
    expect(result.outcome).toEqual({ status: "unavailable" });
    expect(result.geometry).toBeNull();
  });
});
