import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection, Position } from "geojson";
import { buildPathFromPoints, planPointsToPath } from "./pointsToPath";

function point(
  position: Position,
  properties: Record<string, unknown> = {},
  id = `p${position.join(",")}`,
): Feature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: position },
    properties,
  };
}

function collection(...features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

// A ~100 m square at 46° N (0.0009° of latitude ≈ 100 m).
const A: Position = [-61.0, 46.0];
const B: Position = [-61.0, 46.0009];
const C: Position = [-60.9987, 46.0009];
const D: Position = [-60.9987, 46.0];

describe("planPointsToPath", () => {
  it("uses stored array order and measures the path", () => {
    const plan = planPointsToPath(collection(point(A), point(B), point(C)), "line");
    expect(plan.positions).toEqual([A, B, C]);
    expect(plan.viable).toBe(true);
    expect(plan.lengthM).toBeGreaterThan(190);
    expect(plan.lengthM).toBeLessThan(210);
    expect(plan.areaM2).toBeNull();
  });

  it("closes an area for measurement and reports its size", () => {
    const plan = planPointsToPath(
      collection(point(A), point(B), point(C), point(D)),
      "area",
    );
    expect(plan.viable).toBe(true);
    // ~100 m × ~100 m square.
    expect(plan.areaM2).toBeGreaterThan(9_000);
    expect(plan.areaM2).toBeLessThan(11_000);
  });

  it("drops consecutive duplicates and a hand-closed ring's final point", () => {
    const plan = planPointsToPath(
      collection(point(A), point(A, {}, "dup"), point(B), point(C), point(A, {}, "close")),
      "area",
    );
    expect(plan.positions).toEqual([A, B, C]);
    expect(plan.sourcePointCount).toBe(5);
    expect(plan.viable).toBe(true);
  });

  it("refuses too little: 1 point for a line, collapsed duplicates for an area", () => {
    expect(planPointsToPath(collection(point(A)), "line").viable).toBe(false);
    expect(
      planPointsToPath(
        collection(point(A), point(A, {}, "x"), point(B)),
        "area",
      ).viable,
    ).toBe(false);
  });

  it("warns on a self-crossing path without blocking it", () => {
    // A-C-B-D draws a bowtie.
    const plan = planPointsToPath(
      collection(point(A), point(C), point(B), point(D)),
      "area",
    );
    expect(plan.viable).toBe(true);
    expect(plan.selfIntersects).toBe(true);

    const clean = planPointsToPath(
      collection(point(A), point(B), point(C), point(D)),
      "area",
    );
    expect(clean.selfIntersects).toBe(false);
  });

  it("notices a traced source point", () => {
    expect(
      planPointsToPath(
        collection(point(A, { "nsmts:traced": "nsprd-parcel" }), point(B)),
        "line",
      ).traced,
    ).toBe(true);
    expect(planPointsToPath(collection(point(A), point(B)), "line").traced).toBe(
      false,
    );
  });

  it("ignores non-point features entirely", () => {
    const line: Feature = {
      type: "Feature",
      id: "existing-line",
      geometry: { type: "LineString", coordinates: [A, B] },
      properties: {},
    };
    const plan = planPointsToPath(collection(line, point(A), point(B)), "line");
    expect(plan.sourcePointCount).toBe(2);
    expect(plan.positions).toEqual([A, B]);
  });
});

describe("buildPathFromPoints", () => {
  it("builds a stamped LineString and keeps the source points by default", () => {
    const result = buildPathFromPoints(collection(point(A), point(B), point(C)), {
      shape: "line",
      keepSourcePoints: true,
    });
    expect(result).not.toBeNull();
    expect(result!.feature.geometry).toEqual({
      type: "LineString",
      coordinates: [A, B, C],
    });
    expect(result!.feature.properties).toMatchObject({
      "nsmts:convertedFromPoints": 3,
    });
    expect(typeof result!.feature.properties?.["nsmts:createdAt"]).toBe("string");
    expect(typeof result!.feature.id).toBe("string");
    // 3 points + the new line.
    expect(result!.collection.features).toHaveLength(4);
  });

  it("builds a closed Polygon ring and can consume the points", () => {
    const result = buildPathFromPoints(
      collection(point(A), point(B), point(C)),
      { shape: "area", keepSourcePoints: false },
    );
    expect(result!.feature.geometry).toEqual({
      type: "Polygon",
      coordinates: [[A, B, C, A]],
    });
    expect(result!.collection.features).toHaveLength(1);
  });

  it("carries nsmts:traced from any source point", () => {
    const result = buildPathFromPoints(
      collection(point(A, { "nsmts:traced": "nsprd-parcel" }), point(B)),
      { shape: "line", keepSourcePoints: true },
    );
    expect(result!.feature.properties?.["nsmts:traced"]).toBe("nsprd-parcel");
  });

  it("returns null when the plan is not viable", () => {
    expect(
      buildPathFromPoints(collection(point(A), point(B)), {
        shape: "area",
        keepSourcePoints: true,
      }),
    ).toBeNull();
  });
});
