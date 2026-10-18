import type { PixelSize } from "../transform/projection";

/**
 * L.CRS.Simple applies Transformation(1, 0, -1, 0), so image pixel (x, y) is
 * latLng(-y, x). Doing the flip here, once, keeps it out of every component —
 * and keeps anyone from reaching for L.CRS.Simple.project(), which returns
 * raw LonLat and ignores its zoom argument.
 *
 * The `|| 0` guards normalise -0 to 0: Object.is(-0, 0) is false, so a -0
 * latitude silently breaks equality checks downstream.
 */
export function latLngFromPixel(pixel: { x: number; y: number }): [number, number] {
  return [-pixel.y || 0, pixel.x || 0];
}

/**
 * Both components are guarded, not just `y`: `-latLng.lat` reintroduces -0
 * exactly the same way `-pixel.y` does above (a stray -0 lng is one degree
 * less likely in practice, since it round-trips from `pixel.x`, but nothing
 * about the arithmetic rules it out — e.g. pixelFromLatLng({lat: 0, lng: -0})).
 */
export function pixelFromLatLng(latLng: { lat: number; lng: number }): {
  x: number;
  y: number;
} {
  return { x: latLng.lng || 0, y: -latLng.lat || 0 };
}

/** Bounds in ORIGINAL pixel space: GCPs live there, so the map does too. */
export function scanBounds(
  pixelSize: PixelSize,
): [[number, number], [number, number]] {
  return [
    [-pixelSize.height, 0],
    [0, pixelSize.width],
  ];
}

/**
 * Keeps a picked or dragged point on the raster. `maxBounds` cannot do this:
 * it constrains the VIEW, its viscosity defaults to 0, and minZoom={-4}
 * leaves letterboxed map outside the image in almost any viewport. An
 * off-image pixel is not rejected anywhere downstream — the affine solver
 * consumes a negative x as ordinary input and it persists.
 *
 * Math.max(-0, 0) is +0 by spec, so this also cannot reintroduce the -0 that
 * latLngFromPixel goes out of its way to avoid.
 */
export function clampToRaster(
  pixel: { x: number; y: number },
  pixelSize: PixelSize,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(pixel.x, 0), pixelSize.width),
    y: Math.min(Math.max(pixel.y, 0), pixelSize.height),
  };
}
