import { describe, expect, it } from "vitest";
import { electoralLayerById } from "../layers/electoralLayers";
import { declutterLabels, electoralLabelPoint, electoralLabelsPermanent } from "./electoralLabels";

const square = (x: number, y: number, size: number): number[][] => [
  [x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y],
];

describe("electoralLabelPoint", () => {
  it("labels the largest part of a multi-island district, not its first ring", () => {
    const point = electoralLabelPoint({
      type: "MultiPolygon",
      coordinates: [[square(-60, 45, 0.01)], [square(-62, 45, 1)]],
    });
    expect(point?.position[0]).toBeCloseTo(-61.5, 1);
    expect(point?.position[1]).toBeCloseTo(45.5, 1);
  });

  it("moves inside a crescent whose centroid falls in the bay", () => {
    // A C shape open to the east: its area centroid sits in the open middle.
    const c = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0]];
    const point = electoralLabelPoint({ type: "Polygon", coordinates: [c] })!;
    const [lon, lat] = point.position;
    const inBar = lon >= 0 && lon <= 1 && lat >= 0 && lat <= 3;
    const inArm = lon >= 0 && lon <= 3 && ((lat >= 0 && lat <= 1) || (lat >= 2 && lat <= 3));
    expect(inBar || inArm).toBe(true);
  });

  it("returns nothing for an empty geometry", () => {
    expect(electoralLabelPoint({ type: "MultiPolygon", coordinates: [] })).toBeNull();
  });
});

describe("declutterLabels", () => {
  it("keeps the heaviest of two overlapping labels and every clear one", () => {
    const boxes = [
      { left: 0, top: 0, right: 100, bottom: 20 },
      { left: 50, top: 10, right: 150, bottom: 30 },
      { left: 0, top: 100, right: 100, bottom: 120 },
    ];
    expect([...declutterLabels(boxes, [1, 5, 1])].sort()).toEqual([1, 2]);
  });

  it("drops a label with no box (not laid out)", () => {
    expect(declutterLabels([{ left: 0, top: 0, right: 0, bottom: 0 }], [1]).size).toBe(0);
  });
});

describe("electoralLabelsPermanent", () => {
  const provincial = electoralLayerById["provincial-districts-2026"];
  const federal = electoralLayerById["federal-ridings-2025"];
  const polls = electoralLayerById["provincial-polls-2026"];
  const municipal = electoralLayerById["municipal-polling-districts"];

  it("names districts in boundaries mode, handing federal names to provincial ones at zoom 8", () => {
    expect(electoralLabelsPermanent(provincial, "boundaries", 7, false, true)).toBe(false);
    expect(electoralLabelsPermanent(provincial, "boundaries", 8, false, true)).toBe(true);
    expect(electoralLabelsPermanent(federal, "boundaries", 7, false, true)).toBe(true);
    expect(electoralLabelsPermanent(federal, "boundaries", 8, false, true)).toBe(false);
    expect(electoralLabelsPermanent(federal, "boundaries", 11, false, false)).toBe(true);
  });

  it("never names polling divisions or municipal districts in boundaries mode", () => {
    expect(electoralLabelsPermanent(polls, "boundaries", 14, true, false)).toBe(false);
    expect(electoralLabelsPermanent(municipal, "boundaries", 14, true, false)).toBe(false);
  });

  it("keeps result labels from zoom 9 and in print", () => {
    expect(electoralLabelsPermanent(provincial, "winner", 8, false, true)).toBe(false);
    expect(electoralLabelsPermanent(provincial, "winner", 9, false, true)).toBe(true);
    expect(electoralLabelsPermanent(provincial, "winner", 6, true, true)).toBe(true);
  });
});
