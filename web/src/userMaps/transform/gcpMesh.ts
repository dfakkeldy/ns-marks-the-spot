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
 * 32, set by the real-browser measurement that rejected the provisional 64
 * (2026-07-26, Chrome 148 / ANGLE Metal on an Apple M1 Pro — GPU raster
 * confirmed via WEBGL_debug_renderer_info, not SwiftShader). Method: the
 * shipping `drawWarpedImage` copied verbatim into a bench page; source a
 * synthetic 7200x5400 ImageBitmap (Church-sheet dimensions; cost is content-
 * independent), destination the 2560x1600 backing store `WarpedRasterLayer`
 * allocates for a 1280x800 viewport at dpr 2; one-shot redraw timed to TRUE
 * raster completion. `createImageBitmap(canvas)` resolves before raster
 * finishes (2.3 ms vs the real 54 ms at gridSize 16), so completion was
 * forced by reading the 8x8 snapshot back through a second tiny canvas —
 * which, unlike `getImageData` on the big canvas, never demotes the canvas
 * under test to software. Median redraw:
 *
 *     gridSize        8     16     32     64     128
 *     triangles     128    512   2048   8192   32768
 *     redraw ms    15.7     54    210    829    3423
 *
 * LINEAR at ~0.10 ms per clipped drawImage — the node-canvas "sublinear,
 * T ∝ triangles^0.29–0.40" claim this replaces does not survive contact
 * with a real browser (node-canvas also rated the shipping gridSize 8 at
 * 90 ms vs the true 15.7 ms, which is why it could never adjudicate 64).
 * The cost is per-triangle overhead, INDEPENDENT of source dimensions
 * (gridSize 32 measures 213 ms with the source shrunk to 3600x2700), so the
 * table holds for any sheet. Cross-checked on an OffscreenCanvas
 * destination: 225/923 ms at 32/64, within 10%, ruling out hidden-tab
 * raster deprioritisation in the measurement harness.
 *
 * The settled redraw is a post-gesture one-shot (`moveend`/`zoomend`/mesh
 * swap). The bar, fixed before measuring: ~100 ms before a response stops
 * feeling immediate, with 4x headroom for mid-range hardware under this
 * M1 Pro — so ~25 ms measured. 64 misses it 33x over (0.83 s per pan end on
 * a FAST machine) to buy 6.0/1.1/2.0 m of mesh error (max, three real
 * Church control sets) against 32's 17.70–17.78 m — which, per the
 * non-monotonicity note above, is itself not strictly better than 24; 32 is
 * the documented fallback, not a local accuracy optimum. Even 32's 210 ms
 * is noticeable; a materially finer settled tier needs a cheaper renderer
 * (e.g. warp once into an offscreen and re-composite), not a bigger number
 * here. 128 (3.4 s) is in the table only to close the question.
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
