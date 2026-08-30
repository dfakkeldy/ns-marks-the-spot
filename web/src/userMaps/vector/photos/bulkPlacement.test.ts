import { describe, expect, it } from "vitest";
import { classifyBulkPhotos } from "./bulkPlacement";

const BOUNDS = { west: -64, south: 44, east: -63, north: 45 };

function candidate(name: string, gps: { lon: number; lat: number } | null) {
  return { file: new File([], name), gps, capturedAt: null };
}

describe("classifyBulkPhotos", () => {
  it("checks in-view photos, unchecks out-of-view, disables no-location", () => {
    const rows = classifyBulkPhotos(
      [
        candidate("inside.jpg", { lon: -63.5, lat: 44.5 }),
        candidate("outside.jpg", { lon: -60, lat: 46 }),
        candidate("untagged.jpg", null),
      ],
      BOUNDS,
    );
    expect(rows.map(({ inViewport, checkedByDefault }) => ({ inViewport, checkedByDefault }))).toEqual([
      { inViewport: true, checkedByDefault: true },
      { inViewport: false, checkedByDefault: false },
      { inViewport: null, checkedByDefault: false },
    ]);
  });

  it("treats the bounds edge as inside", () => {
    const [row] = classifyBulkPhotos(
      [candidate("edge.jpg", { lon: -64, lat: 45 })],
      BOUNDS,
    );
    expect(row.inViewport).toBe(true);
    expect(row.checkedByDefault).toBe(true);
  });

  it("leaves geotagged photos placeable but unchecked when no bounds are known", () => {
    const [row] = classifyBulkPhotos(
      [candidate("somewhere.jpg", { lon: -63.5, lat: 44.5 })],
      null,
    );
    expect(row.inViewport).toBe(false);
    expect(row.checkedByDefault).toBe(false);
  });
});
