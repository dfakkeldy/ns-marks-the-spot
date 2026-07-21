import { describe, expect, it } from "vitest";
import {
  findDownstreamDropCandidates,
  modelRouteReaches,
  selectBestDropCandidate,
} from "./generateInvernessHydroPilot.mjs";

const rectangle = (left, bottom, right, top) => ({
  type: "Polygon",
  coordinates: [[
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
    [left, bottom],
  ]],
});

const route = [
  {
    id: "upper",
    coordinates: [[0, 0, 100], [1, 0, 90]],
    lengthMetres: 1_000,
  },
  {
    id: "middle",
    coordinates: [[1, 0, 90], [2, 0, 60]],
    lengthMetres: 1_000,
  },
  {
    id: "lower",
    coordinates: [[2, 0, 60], [3, 0, 55]],
    lengthMetres: 1_000,
  },
];

describe("point-specific Inverness hydro modelling", () => {
  it("adds an official catchment only after its mapped route outlet", () => {
    const reaches = modelRouteReaches(route, [
      {
        code: "upper-catchment",
        areaKm2: 4,
        geometry: rectangle(-0.1, -0.1, 1.01, 0.1),
      },
      {
        code: "middle-catchment",
        areaKm2: 20,
        geometry: rectangle(0.99, -0.1, 2.01, 0.1),
      },
    ]);

    expect(reaches.map(({ edgeIndex, upstreamAreaKm2 }) => ({
      edgeIndex,
      upstreamAreaKm2,
    }))).toEqual([
      { edgeIndex: 1, upstreamAreaKm2: 4 },
      { edgeIndex: 2, upstreamAreaKm2: 24 },
    ]);
  });

  it("adds a side catchment where its directed tributary joins the main route", () => {
    const reaches = modelRouteReaches(
      route,
      [{
        code: "side-catchment",
        areaKm2: 12,
        geometry: rectangle(0.9, 0.1, 1.1, 1.1),
      }],
      undefined,
      [
        ...route,
        {
          id: "tributary",
          coordinates: [[1, 1, 130], [1, 0, 90]],
          lengthMetres: 1_000,
        },
      ],
    );

    expect(reaches[0]).toMatchObject({
      edgeIndex: 1,
      upstreamAreaKm2: 12,
    });
  });

  it("finds the nearest downstream route distance for each substantial drop", () => {
    const candidates = findDownstreamDropCandidates(route, 1, {
      thresholdsMetres: [10, 25, 50],
      maxDistanceMetres: 2_000,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ dropMetres: 10 });
    expect(candidates[0].routeDistanceMetres).toBeCloseTo(333.33, 1);
    expect(candidates[1]).toMatchObject({ dropMetres: 25 });
    expect(candidates[1].routeDistanceMetres).toBeCloseTo(833.33, 1);
    expect(candidates.some(({ dropMetres }) => dropMetres === 50)).toBe(false);
  });

  it("keeps a wider downstream reach even when no substantial drop qualifies", () => {
    const reaches = modelRouteReaches(route, [
      {
        code: "upper-catchment",
        areaKm2: 4,
        geometry: rectangle(-0.1, -0.1, 1.01, 0.1),
      },
      {
        code: "middle-catchment",
        areaKm2: 20,
        geometry: rectangle(0.99, -0.1, 2.01, 0.1),
      },
    ], {
      thresholdsMetres: [10, 25, 50],
      maxDistanceMetres: 2_000,
    });

    expect(reaches[0].upstreamAreaKm2).toBe(4);
    expect(reaches[0].dropCandidates.length).toBeGreaterThan(0);
    expect(reaches[1]).toMatchObject({
      upstreamAreaKm2: 24,
      dropCandidates: [],
    });
  });

  it("selects potential from area, substantial drop, and required route distance", () => {
    const best = selectBestDropCandidate(24, [
      { dropMetres: 10, routeDistanceMetres: 1_000 },
      { dropMetres: 25, routeDistanceMetres: 1_250 },
      { dropMetres: 50, routeDistanceMetres: 5_000 },
    ]);

    expect(best.dropMetres).toBe(25);
    expect(best.averageFallMetresPerKm).toBe(20);
    expect(best.screeningValue).toBeCloseTo(Math.log1p(24) * 20, 8);
    expect(selectBestDropCandidate(24, [])).toBeNull();
  });
});
