import { describe, expect, it } from "vitest";
import { simplifyIndices, simplifyTrackSegments } from "./simplifyTrack";
import type { TrackPoint } from "./trackFilter";

const LAT_METRE = 1 / 111_320;

function point(latMetres: number, lngMetres: number, index = 0): TrackPoint {
  // At 45°N a degree of longitude is ~cos(45°) of a latitude degree.
  const lngDegree = (lngMetres / 111_320) / Math.cos((45 * Math.PI) / 180);
  return {
    lat: 45 + latMetres * LAT_METRE,
    lng: -61 + lngDegree,
    altitudeM: null,
    accuracyM: 5,
    timestampMs: index * 1_000,
  };
}

describe("simplifyIndices", () => {
  it("collapses collinear vertices within tolerance and keeps endpoints", () => {
    // A straight 40 m east-west line sampled every 10 m, with one vertex
    // nudged 0.5 m off-axis: everything inside a 1 m tolerance collapses.
    const points = [
      point(0, 0),
      point(0.5, 10),
      point(0, 20),
      point(0.4, 30),
      point(0, 40),
    ];
    expect(simplifyIndices(points, 1)).toEqual([0, 4]);
  });

  it("keeps a vertex that sticks out past the tolerance (metric at 45°N)", () => {
    const points = [point(0, 0), point(3, 20), point(0, 40)];
    expect(simplifyIndices(points, 1)).toEqual([0, 1, 2]);
    expect(simplifyIndices(points, 5)).toEqual([0, 2]);
  });

  it("keeps everything at tolerance 0 and for two-point segments", () => {
    const points = [point(0, 0), point(0, 10), point(0, 20)];
    expect(simplifyIndices(points, 0)).toEqual([0, 1, 2]);
    expect(simplifyIndices(points.slice(0, 2), 5)).toEqual([0, 1]);
  });

  it("survives a long collinear track without recursing", () => {
    const points = Array.from({ length: 10_000 }, (_, index) =>
      point(0, index),
    );
    expect(simplifyIndices(points, 1)).toEqual([0, 9_999]);
  });
});

describe("simplifyTrackSegments", () => {
  it("simplifies per segment so a pause boundary is never crossed", () => {
    const a = [point(0, 0, 0), point(0.5, 10, 1), point(0, 20, 2)];
    const b = [point(100, 0, 3), point(100, 20, 4)];
    const simplified = simplifyTrackSegments([a, b], 1);
    expect(simplified[0].map(({ timestampMs }) => timestampMs)).toEqual([0, 2_000]);
    expect(simplified[1]).toHaveLength(2);
  });
});
