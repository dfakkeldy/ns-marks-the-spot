import { describe, expect, it } from "vitest";
import {
  findDownstreamDropCandidates,
  microHydroClassForKw,
  modelNetworkReaches,
  modelRouteReaches,
  selectBestDropCandidate,
  selectMicroHydroCandidate,
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
  it("retains tributary reaches and unions their catchment areas downstream", () => {
    const network = [
      {
        id: "north-tributary",
        coordinates: [[0, 1, 120], [1, 0, 100]],
        lengthMetres: 1_000,
      },
      {
        id: "south-tributary",
        coordinates: [[0, -1, 115], [1, 0, 100]],
        lengthMetres: 1_000,
      },
      {
        id: "trunk",
        coordinates: [[1, 0, 100], [2, 0, 80]],
        lengthMetres: 1_000,
      },
      {
        id: "lower",
        coordinates: [[2, 0, 80], [3, 0, 70]],
        lengthMetres: 1_000,
      },
    ];

    const reaches = modelNetworkReaches(network, [
      {
        code: "north",
        areaKm2: 4,
        geometry: rectangle(-0.1, 0.4, 1.01, 1.1),
      },
      {
        code: "south",
        areaKm2: 6,
        geometry: rectangle(-0.1, -1.1, 1.01, -0.4),
      },
    ], {
      thresholdsMetres: [5, 10, 20, 30],
      maxDistanceMetres: 3_000,
    });

    expect(reaches.map(({ edge, upstreamAreaKm2 }) => ({
      id: edge.id,
      upstreamAreaKm2,
    }))).toEqual([
      { id: "north-tributary", upstreamAreaKm2: 4 },
      { id: "south-tributary", upstreamAreaKm2: 6 },
      { id: "trunk", upstreamAreaKm2: 10 },
      { id: "lower", upstreamAreaKm2: 10 },
    ]);
  });

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

  it("selects a short-run micro-hydro scenario and reports its nominal power", () => {
    const best = selectMicroHydroCandidate(5, [
      { dropMetres: 5, routeDistanceMetres: 1_000 },
      { dropMetres: 10, routeDistanceMetres: 1_500 },
      { dropMetres: 20, routeDistanceMetres: 2_500 },
    ], {
      specificDischargeLitresPerSecondPerKm2: 8,
      efficiency: 0.6,
    });

    expect(best.dropMetres).toBe(20);
    expect(best.nominalFlowLitresPerSecond).toBeCloseTo(40, 8);
    expect(best.indicativePowerKw).toBeCloseTo(4.7088, 8);
    expect(best.opportunityClass).toBe("kw-1-5");
    expect(best.screeningValue).toBeCloseTo(4.7088 / 2.5, 8);
  });

  it("uses explicit 1 to 50 kW-scale opportunity bands", () => {
    expect(microHydroClassForKw(0.99)).toBe("below-1kw");
    expect(microHydroClassForKw(1)).toBe("kw-1-5");
    expect(microHydroClassForKw(5)).toBe("kw-5-15");
    expect(microHydroClassForKw(15)).toBe("kw-15-30");
    expect(microHydroClassForKw(30)).toBe("kw-30-50");
    expect(microHydroClassForKw(50.01)).toBe("over-50kw");
  });
});
