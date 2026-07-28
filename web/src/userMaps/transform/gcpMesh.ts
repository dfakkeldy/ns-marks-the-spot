import { resolveSourceRect } from "../sourceRect";
import type { PixelRect } from "../types";
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
  sourceRect?: PixelRect,
): LatLngPoint[][] {
  const rect = resolveSourceRect(pixelSize, sourceRect);
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = rect.y + (rect.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = rect.x + (rect.width * col) / gridSize;
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
 * 32, kept for a third time — now under off-canvas triangle culling and the
 * chunked deferred walk (2026-07-26, Chrome 148 / ANGLE Metal on an Apple
 * M1 Pro — GPU raster confirmed via WEBGL_debug_renderer_info — dpr 2,
 * 1280x800 viewport, the real WarpedRasterLayer on a real Leaflet map,
 * synthetic 7200x5400 ImageBitmap, raster completion forced per frame via
 * the tiny-canvas readback described below; two repeats, spread under 3%).
 *
 * Culling collapsed the walks the drape overhangs: the deep-zoom
 * viewport-capped walk went from 126 to 13–54 ms at 32 and from 466 to
 * 27–36 ms at 64, and a padding-exhausting pan now blits its still-valid
 * backing and blocks for 0–3 ms. Neither path distinguishes the two grids
 * any more. What is left is the peak zoom — the sheet just filling the
 * padded viewport, which is the zoom a sheet is worked at — where nothing
 * culls:
 *
 *     at the peak zoom                    gridSize 32   gridSize 64
 *     deferred refinement, frames              87           327
 *     ...as wall clock at 60 Hz              ~1.5 s        ~5.4 s
 *     worst single refinement frame, ms        33            94
 *     median refinement frame, ms              13            12
 *     edit settle (synchronous), ms            57           208
 *     first display of the sheet, ms          925          3606
 *
 * Chunking removed the freeze but not the work: the walk is now background
 * refinement over a geometrically correct (merely resampled) composite, so
 * the cost reads as TIME-TO-SHARP, not as a stall. At 64 that is ~5.4 s
 * after every zoom settle at the working zoom, against ~1.5 s at 32 — and
 * the edit settle stays synchronous by design (it is the drag tier's
 * uncached hot path), so 64 also blocks ~208 ms on every control-point
 * release against 32's 57 ms. That buys 6.0/1.1/2.0 m of mesh error (max,
 * three real Church control sets) against 32's 17.70–17.78 m, which per the
 * non-monotonicity note above is not even a local optimum — 24 measured
 * slightly better. Not worth a 3.5x longer sharpen and a 3.6x longer edit
 * stall.
 *
 * What would actually change this answer is not a bigger number here: the
 * per-triangle cost is dominated by SOURCE SIZE, not triangle count. Same
 * 2560x2560 destination, same 2048 triangles, varying only the source:
 * 3072x2304 (7.1 Mpx) costs 13 ms, 3600x2700 (9.7 Mpx) costs 587 ms, and
 * 7200x5400 costs 611 ms — a ~45x cliff between roughly 7 and 10 Mpx,
 * where the source stops fitting the GPU image cache and every clipped
 * drawImage re-uploads it. Real scanned sheets are always past that cliff.
 * Drawing the mesh from a resolution-appropriate downscale of the source
 * (an LOD pyramid) would cut every number in the table by more than an
 * order of magnitude and make 64 affordable; that is the next lever, and
 * it is a separate piece of work.
 *
 * Pre-cache history (same rig, `drawWarpedImage` copied into a bench page,
 * 2560x1600 viewport-sized destination, paid on EVERY pan and zoom):
 * 8/16/32/64/128 -> 15.7/54/210/829/3423 ms, LINEAR in triangles — the
 * node-canvas "sublinear" claim did not survive a real browser, and
 * `createImageBitmap(canvas)` resolves before raster completes (2.3 ms vs
 * the real 54 ms), which is why completion is forced by drawing an 8x8
 * snapshot onto a second tiny canvas and reading THAT back. A JS clock
 * inside the walk is blind for the same reason — a chunk reporting 8 ms of
 * elapsed time was measured costing 750 ms of completed GPU work — which
 * is why chunk size is adapted from frame deltas rather than timed
 * in-loop.
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
  sourceRect?: PixelRect,
): LatLngPoint[][] {
  const rect = resolveSourceRect(pixelSize, sourceRect);
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = rect.y + (rect.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = rect.x + (rect.width * col) / gridSize;
      line.push(fromMercator(applyTps(params, x, y)));
    }
    mesh.push(line);
  }
  return mesh;
}
