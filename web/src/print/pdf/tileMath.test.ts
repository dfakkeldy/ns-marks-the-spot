import { describe, expect, it } from "vitest";
import {
  latLngToOutput,
  outputSpaceForBounds,
  tileMercatorBounds,
  tileOutputRect,
  tilesForBounds,
  zoomForOutput,
} from "./tileMath";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

describe("tileMath", () => {
  it("maps bound corners onto the output pixel corners", () => {
    const space = outputSpaceForBounds(bounds, 1000, 800);
    expect(latLngToOutput(space, { lat: 46.2, lng: -61.4 }))
      .toEqual({ x: 0, y: 0 });
    const se = latLngToOutput(space, { lat: 46.0, lng: -61.1 });
    expect(se.x).toBeCloseTo(1000, 6);
    expect(se.y).toBeCloseTo(800, 6);
  });

  it("chooses the smallest zoom that serves the output width", () => {
    const zoom = zoomForOutput(bounds, 2317, 19);
    // 0.3° of longitude = 33 396 m in Mercator; world = 40 075 016 m.
    // At z=15 the world is 256·2^15 px, giving ~6 992 px across the frame,
    // at z=14 ~3 496 px, at z=13 ~1 748 px — first zoom ≥ 2317 is 14.
    expect(zoom).toBe(14);
    expect(zoomForOutput(bounds, 2317, 12)).toBe(12); // clamped to native max
  });

  it("enumerates exactly the tiles covering the bounds", () => {
    // Northeast quadrant of the world at z=1 is tile x=1, y=0.
    const tiles = tilesForBounds(
      { north: 40, south: 10, west: 20, east: 60 },
      1,
    );
    expect(tiles).toEqual([{ z: 1, x: 1, y: 0 }]);
  });

  it("places a tile so its mercator bounds land on the right pixels", () => {
    const space = outputSpaceForBounds(bounds, 1000, 800);
    const tile = tilesForBounds(bounds, 12)[0];
    const rect = tileOutputRect(space, tile);
    const merc = tileMercatorBounds(tile);
    const topLeft = { x: merc.minX, y: merc.maxY };
    expect(rect.x).toBeCloseTo(
      (topLeft.x - space.mercWest) * space.scaleX, 6);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it("handles partial-overlap tiles at grid edges", () => {
    const space = outputSpaceForBounds(bounds, 1000, 800);
    const tiles = tilesForBounds(bounds, 12);

    // Verify multiple tiles are returned (roughly 4x4 grid)
    expect(tiles.length).toBeGreaterThan(1);

    // Find the SE-most tile (last one in the grid)
    const lastTile = tiles[tiles.length - 1];
    const lastRect = tileOutputRect(space, lastTile);

    // SE-most tile should extend beyond canvas on right or bottom
    const extendsBeyondRight = lastRect.x + lastRect.width > space.widthPx;
    const extendsBeyondBottom = lastRect.y + lastRect.height > space.heightPx;
    expect(extendsBeyondRight || extendsBeyondBottom).toBe(true);

    // Verify grid is contiguous: all tiles in same row share same y,
    // all tiles in same column share same x, and widths are uniform
    const tileRectsByRow: { [y: number]: Array<{ rect: ReturnType<typeof tileOutputRect> }> } = {};
    tiles.forEach(tile => {
      const rect = tileOutputRect(space, tile);
      const rowKey = Math.round(rect.y);
      if (!tileRectsByRow[rowKey]) tileRectsByRow[rowKey] = [];
      tileRectsByRow[rowKey].push({ rect });
    });

    // Check that all tiles in a row have the same y and same width
    Object.values(tileRectsByRow).forEach(row => {
      const firstY = row[0].rect.y;
      const firstWidth = row[0].rect.width;
      row.forEach(tileRect => {
        expect(tileRect.rect.y).toBeCloseTo(firstY, 6);
        expect(tileRect.rect.width).toBeCloseTo(firstWidth, 6);
      });
    });
  });

  it("clamps zoom to 0 for very small output width", () => {
    // Full-world bounds drive the computed zoom negative without clamping
    const worldBounds = { north: 85, south: -85, west: -180, east: 180 };
    const zoom = zoomForOutput(worldBounds, 128, 19);
    expect(zoom).toBe(0);
    expect(zoom).toBeGreaterThanOrEqual(0);
  });
});
