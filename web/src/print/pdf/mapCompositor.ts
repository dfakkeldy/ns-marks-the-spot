import { buildSrcMesh, drawWarpedImage } from "../../userMaps/render/mesh";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import type { PixelRect } from "../../userMaps/types";
import type { PrintMapBounds } from "../../services/printSnapshot";
import {
  latLngToOutput,
  outputSpaceForBounds,
  tileOutputRect,
  tilesForBounds,
  zoomForOutput,
  type OutputSpace,
  type TileCoords,
} from "./tileMath";

export type CompositorTileLayer = {
  kind: "tile";
  id: string;
  name: string;
  /** Null means the tile is outside this layer's coverage — skip quietly. */
  url: (tile: TileCoords) => string | null;
  opacity: number;
  maxNativeZoom: number;
};

export type CompositorImageRequest = {
  bounds: PrintMapBounds;
  widthPx: number;
  heightPx: number;
};

/**
 * A layer fetched as ONE image covering the whole frame, rather than as a
 * grid of tiles. This is the right shape for an ArcGIS dynamic map service,
 * where every "tile" is a separate server-side render: the spec asked for
 * "one bbox export-image request per service at the exact output size", and
 * the tiled form was issuing ~200 renders per layer instead.
 */
export type CompositorImageLayer = {
  kind: "image";
  id: string;
  name: string;
  /** Null means this layer has nothing to draw here — reported as `empty`. */
  url: (request: CompositorImageRequest) => string | null;
  opacity: number;
};

export type CompositorWarpedLayer = {
  kind: "warped";
  id: string;
  name: string;
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  latLngMesh: LatLngPoint[][];
  sourceRect?: PixelRect;
  opacity: number;
};

export type CompositorVectorRing = {
  kind: "parcel-ring";
  id: string;
  name: string;
  rings: LatLngPoint[][];
  strokeStyle: string;
  lineWidthPx: number;
};

export type CompositorLayer =
  | CompositorTileLayer
  | CompositorImageLayer
  | CompositorWarpedLayer
  | CompositorVectorRing;

export type CompositorLayerStatus = {
  id: string;
  name: string;
  status: "rendered" | "failed" | "empty";
  detail?: string;
};

export type CompositorProgress = {
  completedLayers: number;
  totalLayers: number;
  currentLayer: string;
};

export type CompositorResult = {
  canvas: HTMLCanvasElement;
  statuses: CompositorLayerStatus[];
};

export type FetchImage = (
  url: string,
  signal?: AbortSignal,
) => Promise<CanvasImageSource>;

/**
 * CORS-mode fetch → ImageBitmap. A response the canvas could not read back
 * would taint the whole export, so a non-CORS-readable tile is a fetch
 * failure, not a degraded success.
 */
const defaultFetchImage: FetchImage = async (url, signal) => {
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return createImageBitmap(await response.blob());
};

/**
 * Simultaneous tile fetches per layer.
 *
 * An ordinary parcel-zoom frame (landscape, 300 DPI, ~2.5 km) resolves to
 * z18, an 18x11 grid — about 198 tiles. Issuing all of them at once from a
 * public static site is what the OSM tile usage policy calls bulk
 * downloading, and it is what a browser's own per-host connection limit
 * would queue anyway. Six is the conventional per-host budget.
 */
const TILE_FETCH_CONCURRENCY = 6;

/**
 * ArcGIS Server's default `maxImageWidth`/`maxImageHeight`. Asking beyond it
 * returns an error, not a larger image, so the request is scaled down to fit
 * and the result is drawn back up to the canvas. Letter at 300 DPI
 * (~3067x1808) sits inside this, so the guard normally does nothing.
 */
const MAX_SERVER_IMAGE_PX = 4096;

/**
 * Releases a decoded bitmap the moment it is on the canvas.
 *
 * Buffering every tile until a layer finished retained ~52 MB of
 * `ImageBitmap` per layer at 300 DPI, none of it ever closed. Guarded
 * because `ImageBitmap` is not defined in every environment this runs in
 * (jsdom), and because a test double may hand back a canvas instead.
 */
function releaseImage(image: CanvasImageSource): void {
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    image.close();
  }
}

async function renderTileLayer(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  bounds: PrintMapBounds,
  layer: CompositorTileLayer,
  fetchImage: FetchImage,
  signal?: AbortSignal,
): Promise<CompositorLayerStatus> {
  const zoom = zoomForOutput(bounds, space.widthPx, layer.maxNativeZoom);
  const covered = tilesForBounds(bounds, zoom)
    .map((tile) => ({ tile, url: layer.url(tile) }))
    .filter((entry): entry is { tile: TileCoords; url: string } =>
      entry.url !== null);
  if (covered.length === 0) {
    return { id: layer.id, name: layer.name, status: "empty" };
  }

  // Draw-then-release as each tile lands, instead of awaiting the whole set
  // and holding every decoded bitmap until it settles. Tiles within a layer
  // tile a grid and never overlap, so arrival order does not affect the
  // result. save/restore per tile keeps `globalAlpha` balanced even if one
  // `drawImage` throws (e.g. a tainted source).
  const drawTile = (tile: TileCoords, image: CanvasImageSource) => {
    const rect = tileOutputRect(space, tile);
    ctx.save();
    try {
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    } finally {
      ctx.restore();
      releaseImage(image);
    }
  };

  let failures = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= covered.length) return;
      const { tile, url } = covered[index];
      try {
        drawTile(tile, await fetchImage(url, signal));
      } catch {
        // A tile that will not load or will not draw is a tile failure, not
        // a layer crash: the rest of the layer still composites and the
        // count below is what the dialog shows.
        failures += 1;
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(TILE_FETCH_CONCURRENCY, covered.length) },
    worker,
  ));

  if (failures > 0) {
    return {
      id: layer.id,
      name: layer.name,
      status: "failed",
      detail: `${failures} of ${covered.length} tiles failed to load`,
    };
  }
  return { id: layer.id, name: layer.name, status: "rendered" };
}

/**
 * One request, one draw. The image is asked for at the frame's own bbox and
 * output size, so it lands on the canvas 1:1 with no resampling — the frame
 * and the page share an aspect ratio by construction (the on-screen frame is
 * locked to the paper template, and Leaflet's screen space is linear in Web
 * Mercator), so `space`'s independent x/y scales agree to within rounding.
 */
async function renderImageLayer(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  bounds: PrintMapBounds,
  layer: CompositorImageLayer,
  fetchImage: FetchImage,
  signal?: AbortSignal,
): Promise<CompositorLayerStatus> {
  const fit = Math.min(
    1, MAX_SERVER_IMAGE_PX / Math.max(space.widthPx, space.heightPx),
  );
  const url = layer.url({
    bounds,
    widthPx: Math.max(1, Math.round(space.widthPx * fit)),
    heightPx: Math.max(1, Math.round(space.heightPx * fit)),
  });
  if (!url) {
    return { id: layer.id, name: layer.name, status: "empty" };
  }
  const image = await fetchImage(url, signal);
  ctx.save();
  try {
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(image, 0, 0, space.widthPx, space.heightPx);
  } finally {
    ctx.restore();
    releaseImage(image);
  }
  return { id: layer.id, name: layer.name, status: "rendered" };
}

function renderWarpedLayer(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  layer: CompositorWarpedLayer,
): CompositorLayerStatus {
  const gridSize = layer.latLngMesh.length - 1;
  const srcMesh = buildSrcMesh(
    layer.imageWidth, layer.imageHeight, gridSize, layer.sourceRect,
  );
  const dstMesh = layer.latLngMesh.map((row) =>
    row.map((point) => latLngToOutput(space, point)));
  ctx.save();
  try {
    ctx.globalAlpha = layer.opacity;
    drawWarpedImage(ctx, layer.image, srcMesh, dstMesh);
  } finally {
    ctx.restore();
  }
  return { id: layer.id, name: layer.name, status: "rendered" };
}

function renderVectorRing(
  ctx: CanvasRenderingContext2D,
  space: OutputSpace,
  layer: CompositorVectorRing,
): CompositorLayerStatus {
  if (layer.rings.length === 0) {
    return { id: layer.id, name: layer.name, status: "empty" };
  }
  ctx.save();
  try {
    ctx.strokeStyle = layer.strokeStyle;
    ctx.lineWidth = layer.lineWidthPx;
    ctx.lineJoin = "round";
    for (const ring of layer.rings) {
      ctx.beginPath();
      ring.forEach((point, index) => {
        const { x, y } = latLngToOutput(space, point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
  return { id: layer.id, name: layer.name, status: "rendered" };
}

/**
 * Extracts a human-readable message from a caught render failure. Native
 * `DOMException` (e.g. from a tainted-canvas `getImageData`/`drawImage`
 * failure) is not `instanceof Error` in browsers, so it needs its own
 * shape check to avoid falling through to the generic fallback string.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "render failed";
}

/**
 * Headless bounds→canvas renderer. Layers draw in array order (bottom
 * first) with their on-screen opacity. A layer failure is REPORTED, never
 * thrown: the dialog owns the proceed-or-cancel decision, and an export
 * must never silently omit a layer.
 */
export async function composeMapImage(
  bounds: PrintMapBounds,
  size: { widthPx: number; heightPx: number },
  layers: CompositorLayer[],
  options: {
    fetchImage?: FetchImage;
    onProgress?: (progress: CompositorProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CompositorResult> {
  const fetchImage = options.fetchImage ?? defaultFetchImage;
  const canvas = document.createElement("canvas");
  canvas.width = size.widthPx;
  canvas.height = size.heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Export canvas is unavailable in this browser.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.widthPx, size.heightPx);
  const space = outputSpaceForBounds(bounds, size.widthPx, size.heightPx);
  const statuses: CompositorLayerStatus[] = [];
  for (const [index, layer] of layers.entries()) {
    options.onProgress?.({
      completedLayers: index,
      totalLayers: layers.length,
      currentLayer: layer.name,
    });
    try {
      if (layer.kind === "tile") {
        statuses.push(await renderTileLayer(
          ctx, space, bounds, layer, fetchImage, options.signal,
        ));
      } else if (layer.kind === "image") {
        statuses.push(await renderImageLayer(
          ctx, space, bounds, layer, fetchImage, options.signal,
        ));
      } else if (layer.kind === "warped") {
        statuses.push(renderWarpedLayer(ctx, space, layer));
      } else {
        statuses.push(renderVectorRing(ctx, space, layer));
      }
    } catch (error) {
      statuses.push({
        id: layer.id,
        name: layer.name,
        status: "failed",
        detail: extractErrorMessage(error),
      });
    }
  }
  options.onProgress?.({
    completedLayers: layers.length,
    totalLayers: layers.length,
    currentLayer: "",
  });
  return { canvas, statuses };
}
