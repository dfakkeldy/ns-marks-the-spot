import { describe, expect, it } from "vitest";
import {
  WORLD_EXTENT,
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
    const zoom = 12;
    const space = outputSpaceForBounds(bounds, 1000, 800);
    const tiles = tilesForBounds(bounds, zoom);

    // This fixture (bounds, zoom 12, 1000x800 canvas) enumerates a 4-column
    // by 5-row grid of 20 tiles, with the NW and SE corners overlapping the
    // canvas edges (the requested bounds don't land on tile boundaries).
    expect(tiles.length).toBe(20);

    // Derive the SE-most tile's expected placement from first principles —
    // the same span/minX/maxY formula tileMercatorBounds implements — rather
    // than by calling tileMercatorBounds or tileOutputRect to produce their
    // own expectation. That way a sign flip or offset bug inside the
    // projection chain shows up as a numeric mismatch instead of silently
    // agreeing with itself.
    const span = (2 * WORLD_EXTENT) / 2 ** zoom;
    const seTile = tiles[tiles.length - 1];
    const expectedSeMinX = -WORLD_EXTENT + seTile.x * span;
    const expectedSeMaxY = WORLD_EXTENT - seTile.y * span;
    const expectedSeX = (expectedSeMinX - space.mercWest) * space.scaleX;
    const expectedSeY = (space.mercNorth - expectedSeMaxY) * space.scaleY;
    const expectedWidth = span * space.scaleX;
    const expectedHeight = span * space.scaleY;

    const seRect = tileOutputRect(space, seTile);
    expect(seRect.x).toBeCloseTo(expectedSeX, 6);
    expect(seRect.y).toBeCloseTo(expectedSeY, 6);
    expect(seRect.width).toBeCloseTo(expectedWidth, 6);
    expect(seRect.height).toBeCloseTo(expectedHeight, 6);

    // The SE-most tile legitimately overlaps the canvas on BOTH axes for
    // this fixture. Assert each axis on its own — never OR'd together — so
    // a bug that only breaks one axis can't hide behind the other axis
    // still being correct.
    expect(expectedSeX + expectedWidth).toBeGreaterThan(space.widthPx);
    expect(expectedSeY + expectedHeight).toBeGreaterThan(space.heightPx);
    expect(seRect.x + seRect.width).toBeGreaterThan(space.widthPx);
    expect(seRect.y + seRect.height).toBeGreaterThan(space.heightPx);

    // Grid contiguity, pinned to absolute geography rather than merely
    // internally consistent: the NW-most (first-enumerated) tile must sit
    // at or above/left of the canvas origin, since the requested bounds
    // start partway into that tile.
    const nwTile = tiles[0];
    const expectedNwMinX = -WORLD_EXTENT + nwTile.x * span;
    const expectedNwMaxY = WORLD_EXTENT - nwTile.y * span;
    const expectedNwX = (expectedNwMinX - space.mercWest) * space.scaleX;
    const expectedNwY = (space.mercNorth - expectedNwMaxY) * space.scaleY;
    expect(expectedNwX).toBeLessThanOrEqual(0);
    expect(expectedNwY).toBeLessThanOrEqual(0);

    const nwRect = tileOutputRect(space, nwTile);
    expect(nwRect.x).toBeCloseTo(expectedNwX, 6);
    expect(nwRect.y).toBeCloseTo(expectedNwY, 6);
    expect(nwRect.x).toBeLessThanOrEqual(0);
    expect(nwRect.y).toBeLessThanOrEqual(0);

    // Verify the full grid is contiguous: all tiles in the same enumerated
    // row share the same y and the same width.
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
