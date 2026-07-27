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
 * 32, re-affirmed under the warp cache (2026-07-26, Chrome 148 / ANGLE Metal
 * on an Apple M1 Pro — GPU raster confirmed via WEBGL_debug_renderer_info —
 * dpr 2, 1280x800 viewport; the REAL WarpedRasterLayer on a real Leaflet
 * map this time, not a copied function; synthetic 7200x5400 ImageBitmap,
 * raster completion forced via the tiny-canvas readback described below).
 *
 * The cache changed what a bigger grid costs. Pan-end is a containment
 * check (0.0 ms median / 1.4 ms worst over 70 pans, zero mesh walks at 32
 * AND 64) and a zoom step composites the stale cache in 6–9 ms at either
 * grid, so no per-gesture cost distinguishes 32 from 64 any more. What
 * remains is the mesh walk itself — once per zoom settle, padding-
 * exhausting pan, or edit settle — and it is ZOOM-DEPENDENT, because the
 * padded backing canvas changes how many triangles land on it and how many
 * pixels each covers:
 *
 *     mesh walk, ms                       gridSize 32   gridSize 64
 *     backing viewport-capped (deep zoom)     126           466
 *     drape just fills backing (peak)         795          3061
 *     edit settle (unpadded backing)          104           375
 *     5 zoom steps coalesced, at 32:          65.5 total
 *
 * The peak zoom — the sheet just filling the padded viewport — is exactly
 * the zoom a sheet is worked at. The walk no longer blocks the gesture (it
 * lands after the composite paints), but it still freezes the main thread
 * when it lands: 64 would stop the map for ~3 s after every zoom settle
 * there to buy 6.0/1.1/2.0 m of mesh error (max, three real Church control
 * sets) against 32's 17.70–17.78 m — which, per the non-monotonicity note
 * above, is itself not strictly better than 24; 32 is the documented
 * fallback, not a local accuracy optimum. Even 32's 795 ms peak is the
 * current ceiling; a materially finer settled tier still needs a cheaper
 * mesh walk (cull triangles to the backing, chunk the walk across frames,
 * or move it off-thread), not a bigger number here.
 *
 * Pre-cache history (same rig, `drawWarpedImage` copied into a bench page,
 * 2560x1600 viewport-sized destination, paid on EVERY pan and zoom):
 * 8/16/32/64/128 -> 15.7/54/210/829/3423 ms, LINEAR in triangles — the
 * node-canvas "sublinear" claim did not survive a real browser, and
 * `createImageBitmap(canvas)` resolves before raster completes (2.3 ms vs
 * the real 54 ms), which is why completion is forced by drawing an 8x8
 * snapshot onto a second tiny canvas and reading THAT back. Those numbers
 * set the ~100 ms-feels-immediate bar (~25 ms with 4x mid-range headroom)
 * that rejected the provisional 64 and motivated the cache; the
 * zoom-dependent table above supersedes them as the decision table.
 */
export const TPS_GRID_SIZE = 32;

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
