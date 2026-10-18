import { describe, expect, it } from "vitest";
import { representativeParcelPoints } from "./parcelMarkers";
import type { NsprdFeatureCollection } from "./nsprd";

const square = (
  pid: string,
  originLng: number,
  originLat: number,
  size: number,
) => ({
  type: "Feature",
  properties: { PID: pid },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [originLng, originLat],
        [originLng + size, originLat],
        [originLng + size, originLat + size],
        [originLng, originLat + size],
        [originLng, originLat],
      ],
    ],
  },
});

describe("representativeParcelPoints", () => {
  it("returns one centroid per listed PID, ignoring unlisted parcels", () => {
    const parcels = {
      type: "FeatureCollection",
      features: [
        square("11111111", -61, 46, 0.01),
        square("22222222", -60, 45, 0.01),
      ],
    } as unknown as NsprdFeatureCollection;

    const points = representativeParcelPoints(parcels, new Set(["11111111"]));

    expect(points).toHaveLength(1);
    expect(points[0].pid).toBe("11111111");
    expect(points[0].longitude).toBeCloseTo(-60.995, 3);
    expect(points[0].latitude).toBeCloseTo(46.005, 3);
  });

  it("uses the largest polygon when a PID has several features", () => {
    const parcels = {
      type: "FeatureCollection",
      features: [
        square("11111111", -61, 46, 0.001),
        square("11111111", -60.5, 45.5, 0.05),
      ],
    } as unknown as NsprdFeatureCollection;

    const [point] = representativeParcelPoints(
      parcels,
      new Set(["11111111"]),
    );

    expect(point.longitude).toBeCloseTo(-60.475, 3);
    expect(point.latitude).toBeCloseTo(45.525, 3);
  });

  it("handles MultiPolygon geometry by picking its largest part", () => {
    const parcels = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "33333333" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [-61, 46],
                  [-60.99, 46],
                  [-60.99, 46.01],
                  [-61, 46.01],
                  [-61, 46],
                ],
              ],
              [
                [
                  [-59, 44],
                  [-58.9, 44],
                  [-58.9, 44.1],
                  [-59, 44.1],
                  [-59, 44],
                ],
              ],
            ],
          },
        },
      ],
    } as unknown as NsprdFeatureCollection;

    const [point] = representativeParcelPoints(
      parcels,
      new Set(["33333333"]),
    );

    expect(point.longitude).toBeCloseTo(-58.95, 2);
    expect(point.latitude).toBeCloseTo(44.05, 2);
  });

  it("returns no point for degenerate geometry", () => {
    const parcels = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "44444444" },
          geometry: { type: "Point", coordinates: [-61, 46] },
        },
      ],
    } as unknown as NsprdFeatureCollection;

    expect(
      representativeParcelPoints(parcels, new Set(["44444444"])),
    ).toHaveLength(0);
  });
});
