import type { PrintMapBounds } from "../../services/printSnapshot";
import {
  fromMercator,
  toMercator,
} from "../../userMaps/transform/webMercator";
import { TILE_SIZE, WORLD_EXTENT } from "./tileMath";
import type { PdfTemplateId } from "./templates/types";

export type FrameState = {
  orientation: PdfTemplateId;
  /** Frame height as a fraction of the container's limiting dimension. */
  scale: number;
  /** Drag offsets in CSS px from the container centre. */
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_FRAME_STATE: FrameState = {
  orientation: "landscape",
  scale: 0.7,
  offsetX: 0,
  offsetY: 0,
};

export const MIN_FRAME_SCALE = 0.25;
export const MAX_FRAME_SCALE = 0.95;

export type ScreenRect = { x: number; y: number; width: number; height: number };

export function frameScreenRect(
  container: { width: number; height: number },
  aspect: number,
  state: FrameState,
): ScreenRect {
  const scale = Math.min(MAX_FRAME_SCALE, Math.max(MIN_FRAME_SCALE, state.scale));
  let height = container.height * scale;
  let width = height * aspect;
  if (width > container.width * MAX_FRAME_SCALE) {
    width = container.width * MAX_FRAME_SCALE;
    height = width / aspect;
  }
  const x = container.width / 2 - width / 2 + state.offsetX;
  const y = container.height / 2 - height / 2 + state.offsetY;
  return {
    x: Math.max(0, Math.min(container.width - width, x)),
    y: Math.max(0, Math.min(container.height - height, y)),
    width,
    height,
  };
}

/**
 * Screen rect → geographic bounds using the same spherical-Mercator scale
 * Leaflet uses (256 px world at z0), so the export shows exactly what the
 * frame framed.
 */
export function boundsForFrameRect(
  rect: ScreenRect,
  container: { width: number; height: number },
  center: { lat: number; lng: number },
  zoom: number,
): PrintMapBounds {
  const metresPerPx = (2 * WORLD_EXTENT) / (TILE_SIZE * 2 ** zoom);
  const centreMerc = toMercator(center);
  const west = centreMerc.x + (rect.x - container.width / 2) * metresPerPx;
  const east = west + rect.width * metresPerPx;
  const north = centreMerc.y + (container.height / 2 - rect.y) * metresPerPx;
  const south = north - rect.height * metresPerPx;
  const nw = fromMercator({ x: west, y: north });
  const se = fromMercator({ x: east, y: south });
  return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
}
