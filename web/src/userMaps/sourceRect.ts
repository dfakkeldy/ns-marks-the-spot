import type { PixelRect } from "./types";
import type { PixelSize } from "./transform/projection";

const EDGE_TOLERANCE_PX = 1e-7;

export function resolveSourceRect(
  pixelSize: PixelSize,
  sourceRect?: PixelRect,
): PixelRect {
  const rect = sourceRect ?? {
    x: 0,
    y: 0,
    width: pixelSize.width,
    height: pixelSize.height,
  };
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (
    !values.every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x < -EDGE_TOLERANCE_PX ||
    rect.y < -EDGE_TOLERANCE_PX ||
    rect.x + rect.width > pixelSize.width + EDGE_TOLERANCE_PX ||
    rect.y + rect.height > pixelSize.height + EDGE_TOLERANCE_PX
  ) {
    throw new Error("Invalid source rectangle for canonical raster");
  }
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return {
    x,
    y,
    width: Math.min(rect.width, pixelSize.width - x),
    height: Math.min(rect.height, pixelSize.height - y),
  };
}
