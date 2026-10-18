import { resolveSourceRect } from "../sourceRect";
import type { PixelRect } from "../types";

export type XY = { x: number; y: number };

export const CLIP_OVERDRAW_DEVICE_PX = 2;

/**
 * Exact affine transform mapping source triangle → destination triangle,
 * returned in canvas setTransform(a, b, c, d, e, f) order:
 *   x' = a·x + c·y + e;  y' = b·x + d·y + f
 */
export function affineFromTriangles(
  s0: XY, s1: XY, s2: XY,
  d0: XY, d1: XY, d2: XY,
): [number, number, number, number, number, number] {
  const u1 = s1.x - s0.x;
  const v1 = s1.y - s0.y;
  const u2 = s2.x - s0.x;
  const v2 = s2.y - s0.y;
  const det = u1 * v2 - u2 * v1;
  const a = ((d1.x - d0.x) * v2 - (d2.x - d0.x) * v1) / det;
  const c = ((d2.x - d0.x) * u1 - (d1.x - d0.x) * u2) / det;
  const b = ((d1.y - d0.y) * v2 - (d2.y - d0.y) * v1) / det;
  const d = ((d2.y - d0.y) * u1 - (d1.y - d0.y) * u2) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

/** Pixel-space lattice in the same row/col order as buildLatLngMesh. */
export function buildSrcMesh(
  width: number,
  height: number,
  gridSize = 8,
  sourceRect?: PixelRect,
): XY[][] {
  const rect = resolveSourceRect({ width, height }, sourceRect);
  const mesh: XY[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: XY[] = [];
    for (let col = 0; col <= gridSize; col += 1) {
      line.push({
        x: rect.x + (rect.width * col) / gridSize,
        y: rect.y + (rect.height * row) / gridSize,
      });
    }
    mesh.push(line);
  }
  return mesh;
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  s0: XY, s1: XY, s2: XY,
  d0: XY, d1: XY, d2: XY,
): void {
  // Cull triangles that cannot touch the backing canvas. The clip path grows
  // each vertex up to CLIP_OVERDRAW_DEVICE_PX outward from the centroid, so
  // the bbox must grow by the same amount before the miss test — a triangle
  // whose raw bbox ends 1 px off-canvas still paints its overdraw ring.
  // Nearly all of a viewport-capped walk's cost is per-triangle overhead for
  // triangles that land entirely off-canvas; this skips them before any
  // canvas state is touched.
  const grownMinX = Math.min(d0.x, d1.x, d2.x) - CLIP_OVERDRAW_DEVICE_PX;
  const grownMaxX = Math.max(d0.x, d1.x, d2.x) + CLIP_OVERDRAW_DEVICE_PX;
  const grownMinY = Math.min(d0.y, d1.y, d2.y) - CLIP_OVERDRAW_DEVICE_PX;
  const grownMaxY = Math.max(d0.y, d1.y, d2.y) + CLIP_OVERDRAW_DEVICE_PX;
  if (
    grownMaxX <= 0 ||
    grownMaxY <= 0 ||
    grownMinX >= ctx.canvas.width ||
    grownMinY >= ctx.canvas.height
  ) {
    return;
  }
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (d: XY): XY => {
    const dx = d.x - cx;
    const dy = d.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: d.x + (dx / len) * CLIP_OVERDRAW_DEVICE_PX,
      y: d.y + (dy / len) * CLIP_OVERDRAW_DEVICE_PX,
    };
  };
  const c0 = grow(d0);
  const c1 = grow(d1);
  const c2 = grow(d2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(...affineFromTriangles(s0, s1, s2, d0, d1, d2));
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/**
 * Draws a contiguous run of at most `maxTriangles` mesh triangles, starting
 * at `startTriangle`. Returns the index to resume from — equal to the
 * triangle count when the walk is complete. At least one triangle is always
 * consumed so a chunk sequence cannot stall.
 *
 * The chunk is sized in TRIANGLES, not milliseconds, because a JS clock
 * cannot see this work: clipped drawImage returns as soon as the command is
 * queued, and the raster it triggers lands later (measured on an M1 Pro: a
 * walk reporting 8 ms of elapsed JS time cost 750 ms of completed GPU work).
 * The caller converts its frame budget into a count from observed frame
 * deltas — see WarpedRasterLayer.refineWarp.
 *
 * Triangles are indexed cell-major in the same order drawWarpedImage always
 * used — cell (row, col) owns triangles 2·(row·cols + col) and its
 * successor — so a walk split across calls paints the shared-edge overdraw
 * in the identical order and converges to the same pixels as a one-shot
 * walk. Culled triangles count against the chunk too: skipping them is
 * cheap, but scanning for a quota of DRAWN triangles would let one chunk
 * traverse an unbounded off-canvas remainder.
 */
export function drawWarpedTriangles(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  srcMesh: XY[][],
  dstMesh: XY[][],
  startTriangle: number,
  maxTriangles: number,
): number {
  const rows = srcMesh.length - 1;
  const cols = srcMesh[0].length - 1;
  const total = rows * cols * 2;
  const stop = Math.min(total, startTriangle + Math.max(1, maxTriangles));
  let index = startTriangle;
  while (index < stop) {
    const cell = index >> 1;
    const row = (cell / cols) | 0;
    const col = cell % cols;
    const s00 = srcMesh[row][col];
    const s10 = srcMesh[row][col + 1];
    const s01 = srcMesh[row + 1][col];
    const d00 = dstMesh[row][col];
    const d10 = dstMesh[row][col + 1];
    const d01 = dstMesh[row + 1][col];
    if ((index & 1) === 0) {
      drawTriangle(ctx, image, s00, s10, s01, d00, d10, d01);
    } else {
      const s11 = srcMesh[row + 1][col + 1];
      const d11 = dstMesh[row + 1][col + 1];
      drawTriangle(ctx, image, s10, s11, s01, d10, d11, d01);
    }
    index += 1;
  }
  return index;
}

/**
 * Draws `image` through the mesh: each cell splits into two triangles, each
 * drawn with an exact affine transform under a clip path. Grid density (not
 * this function) controls how closely the warp tracks projection curvature.
 */
export function drawWarpedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  srcMesh: XY[][],
  dstMesh: XY[][],
): void {
  const total = (srcMesh.length - 1) * (srcMesh[0].length - 1) * 2;
  drawWarpedTriangles(ctx, image, srcMesh, dstMesh, 0, total);
}

/**
 * Floor on a mip level's longest edge. Below this the interpolation cost of
 * another halving outweighs any drawImage saving, and a level this small is
 * already far under every measured cost cliff.
 */
export const MIP_MIN_SOURCE_DIM = 256;

/**
 * Power-of-two downscale for the warp's SOURCE bitmap.
 *
 * Each clipped drawImage samples the whole source, and the per-triangle cost
 * is dominated by source size, not triangle size — measured ~0.007 ms per
 * triangle from a 3072x2304 source against ~0.3 ms from a 7200x5400 one
 * (~45x) once the source stops fitting the GPU image cache around 7-10 Mpx.
 * At far-out zooms the drape covers a few hundred device pixels while every
 * triangle still sampled the full preview; drawing from a mip level whose
 * resolution just covers the destination removes that cliff without visible
 * quality loss.
 *
 * `destPerSourceRatio` is destination device pixels per source pixel across
 * the drape. The chosen scale is the smallest power of two that still keeps
 * source resolution at or above destination resolution, floored so a level
 * never shrinks below MIP_MIN_SOURCE_DIM on its longest edge.
 */
export function mipScaleFor(
  destPerSourceRatio: number,
  sourceMaxDim: number,
): number {
  if (!Number.isFinite(destPerSourceRatio) || destPerSourceRatio <= 0) {
    return 1;
  }
  let scale = 1;
  while (
    scale / 2 >= destPerSourceRatio &&
    sourceMaxDim * (scale / 2) >= MIP_MIN_SOURCE_DIM
  ) {
    scale /= 2;
  }
  return scale;
}
