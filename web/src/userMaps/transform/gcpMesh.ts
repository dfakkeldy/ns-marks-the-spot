import { applyAffine, type AffineParams } from "./affine";
import type { LatLngPoint, PixelSize } from "./projection";
import { fromMercator } from "./webMercator";

/**
 * One cell, two triangles — and that is exact, not an approximation.
 *
 * Leaflet's screen space is Web Mercator scaled and translated, so a
 * pixel->Mercator affine composes with it into a map that is still affine all
 * the way to the canvas. There is no curvature for a denser lattice to
 * absorb. (The embedded-GeoTIFF path uses 8x8 because it goes
 * pixel->UTM->WGS84->Mercator, and UTM->Mercator genuinely curves.)
 *
 * It is also the performance answer: the georeferencer re-solves on every
 * pointer move during a GCP drag, and each mesh cell costs two clipped
 * drawImage calls over the full preview. Two triangles per frame instead of
 * 128 is the difference between a live warp and a slideshow.
 */
export const AFFINE_GRID_SIZE = 1;

/**
 * Lattice of geographic positions over the raster, in the same row/col order
 * as `buildLatLngMesh` in `projection.ts` (row = pixel Y, col = pixel X) so
 * `WarpedRasterLayer` can consume either without caring which produced it.
 */
export function buildGcpLatLngMesh(
  params: AffineParams,
  pixelSize: PixelSize,
  gridSize: number = AFFINE_GRID_SIZE,
): LatLngPoint[][] {
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = (pixelSize.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = (pixelSize.width * col) / gridSize;
      line.push(fromMercator(applyAffine(params, x, y)));
    }
    mesh.push(line);
  }
  return mesh;
}
