import { applyAffine, type AffineParams } from "./affine";
import type { LatLngPoint, PixelSize } from "./projection";
import { applyTps, type TpsParams } from "./tps";
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

/**
 * Coarse tier for a TPS mesh while a control point is actively being dragged.
 *
 * At gridSize 16 the mesh error is 44.3/10.9/15.9 ground m (max, three real
 * Church control sets) and re-solving stays inside a 16 ms frame up to
 * n = 300 control points (measured: solve + evaluate at gridSize 12/16 is
 * the n = 300 ceiling; at gridSize 64 it drops to n = 200). That is what
 * makes 16 the drag-time choice — it is cheap enough to redraw on every
 * pointer move, not because it is the most accurate small size available.
 *
 * ERROR IS NOT MONOTONE IN gridSize: measured, 12 beats 16 (43.87 m vs
 * 44.28 m) and 24 beats 32 (17.70 m vs 17.78 m) on these same control sets,
 * because lattice vertices landing near control points locally cancel
 * error. Nothing here may be read as "denser is always better" — 16 is
 * chosen for its solve/evaluate budget during a drag, not because it beats
 * every smaller size on accuracy.
 */
export const TPS_DRAG_GRID_SIZE = 16;

/**
 * Settled-state tier for a TPS mesh once the pointer stops moving.
 *
 * Measured mesh error at gridSize 64 is 6.0/1.1/2.0 ground m (max, three
 * real Church control sets) — a large accuracy jump over the drag tier's
 * 44.3/10.9/15.9 m, worth paying for once a redraw is no longer happening on
 * every pointer move. Render cost is sublinear in triangle count
 * (`T ∝ triangles^0.29–0.40` on node-canvas), so the jump from 16 to 64 costs
 * much less than the 16x increase in cell count suggests. gridSize 256 is
 * ruled out regardless of rasterizer: 19.65 ms of pure JavaScript per redraw
 * before a pixel is touched, measured independently of any canvas backend.
 *
 * **PROVISIONAL.** Browser rasterization cost is UNMEASURED — two
 * measurement methodologies failed for identified reasons (a hidden tab
 * reports 0 rAF callbacks; `getImageData` sync demotes an accelerated canvas
 * to software), and node-canvas's own number for the already-shipping
 * gridSize 8 (90 ms/redraw, 11 fps) would mean the existing feature is
 * visibly broken if taken at face value, so it overstates by an uncalibrated
 * factor. Once a real browser profile exists, 64 should be revisited; if it
 * proves too slow, **the documented fallback is 32** (17.70–17.78 m — still
 * NOT strictly better than 24, per the note above, but the next tier down
 * from 64 that materially costs less to rasterize). The 12–16 drag tier is
 * safe either way and does not depend on this profiling.
 */
export const TPS_GRID_SIZE = 64;

/**
 * Lattice of geographic positions over the raster for a TPS warp, in the
 * same row/col order as `buildGcpLatLngMesh` (row = pixel Y, col = pixel X)
 * so `WarpedRasterLayer` can consume either mesh without caring which
 * solver produced it.
 *
 * Unlike the affine mesh, a TPS surface is not affine anywhere — the
 * bending term means straight lines in pixel space do not stay straight
 * after warping — so a single cell cannot represent it exactly and a real
 * lattice (`TPS_DRAG_GRID_SIZE` while dragging, `TPS_GRID_SIZE` once
 * settled) is required rather than merely offered as an option.
 */
export function buildTpsLatLngMesh(
  params: TpsParams,
  pixelSize: PixelSize,
  gridSize: number = TPS_GRID_SIZE,
): LatLngPoint[][] {
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = (pixelSize.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = (pixelSize.width * col) / gridSize;
      line.push(fromMercator(applyTps(params, x, y)));
    }
    mesh.push(line);
  }
  return mesh;
}
