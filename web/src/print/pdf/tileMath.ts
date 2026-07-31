import type { PrintMapBounds } from "../../services/printSnapshot";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import {
  toMercator,
  type MercatorPoint,
} from "../../userMaps/transform/webMercator";

export const TILE_SIZE = 256;
export const WORLD_EXTENT = 20_037_508.342789244;

export type TileCoords = { z: number; x: number; y: number };

export type OutputSpace = {
  widthPx: number;
  heightPx: number;
  mercWest: number;
  mercEast: number;
  mercNorth: number;
  mercSouth: number;
  /** Output pixels per Mercator metre, horizontal / vertical. */
  scaleX: number;
  scaleY: number;
};

export function outputSpaceForBounds(
  bounds: PrintMapBounds,
  widthPx: number,
  heightPx: number,
): OutputSpace {
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  return {
    widthPx,
    heightPx,
    mercWest: nw.x,
    mercEast: se.x,
    mercNorth: nw.y,
    mercSouth: se.y,
    scaleX: widthPx / (se.x - nw.x),
    scaleY: heightPx / (nw.y - se.y),
  };
}

export function mercatorToOutput(
  space: OutputSpace,
  point: MercatorPoint,
): { x: number; y: number } {
  return {
    x: (point.x - space.mercWest) * space.scaleX,
    y: (space.mercNorth - point.y) * space.scaleY,
  };
}

export function latLngToOutput(
  space: OutputSpace,
  point: LatLngPoint,
): { x: number; y: number } {
  return mercatorToOutput(space, toMercator(point));
}

/**
 * Smallest zoom whose native resolution meets the requested output width,
 * clamped to the layer's maximum native zoom. Matching (not exceeding) the
 * output resolution keeps tile counts bounded at print DPI.
 */
export function zoomForOutput(
  bounds: PrintMapBounds,
  widthPx: number,
  maxNativeZoom: number,
): number {
  const west = toMercator({ lat: 0, lng: bounds.west }).x;
  const east = toMercator({ lat: 0, lng: bounds.east }).x;
  const mercWidth = east - west;
  const zoom = Math.ceil(
    Math.log2((widthPx * 2 * WORLD_EXTENT) / (mercWidth * TILE_SIZE)),
  );
  return Math.max(0, Math.min(maxNativeZoom, zoom));
}

export function tileMercatorBounds(
  tile: TileCoords,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const span = (2 * WORLD_EXTENT) / 2 ** tile.z;
  const minX = -WORLD_EXTENT + tile.x * span;
  const maxY = WORLD_EXTENT - tile.y * span;
  return { minX, minY: maxY - span, maxX: minX + span, maxY };
}

export function tilesForBounds(
  bounds: PrintMapBounds,
  zoom: number,
): TileCoords[] {
  const count = 2 ** zoom;
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  const clamp = (value: number) =>
    Math.max(0, Math.min(count - 1, Math.floor(value)));
  const minTileX = clamp(((nw.x + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * count);
  // Using floor() for both min and max includes one extra column/row when bounds
  // land exactly on tile-grid boundaries. This is intentional: the extra tiles
  // draw off-canvas and ensure complete coverage without gaps.
  const maxTileX = clamp(((se.x + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * count);
  const minTileY = clamp(((WORLD_EXTENT - nw.y) / (2 * WORLD_EXTENT)) * count);
  const maxTileY = clamp(((WORLD_EXTENT - se.y) / (2 * WORLD_EXTENT)) * count);
  const tiles: TileCoords[] = [];
  for (let y = minTileY; y <= maxTileY; y += 1) {
    for (let x = minTileX; x <= maxTileX; x += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

export function tileOutputRect(
  space: OutputSpace,
  tile: TileCoords,
): { x: number; y: number; width: number; height: number } {
  const merc = tileMercatorBounds(tile);
  const topLeft = mercatorToOutput(space, { x: merc.minX, y: merc.maxY });
  const bottomRight = mercatorToOutput(space, { x: merc.maxX, y: merc.minY });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}
