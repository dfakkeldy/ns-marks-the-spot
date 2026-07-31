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
  const settled = await Promise.allSettled(
    covered.map(async ({ tile, url }) => ({
      tile,
      image: await fetchImage(url, signal),
    })),
  );
  let failures = 0;
  ctx.save();
  try {
    ctx.globalAlpha = layer.opacity;
    for (const result of settled) {
      if (result.status === "rejected") {
        failures += 1;
        continue;
      }
      const rect = tileOutputRect(space, result.value.tile);
      ctx.drawImage(
        result.value.image, rect.x, rect.y, rect.width, rect.height,
      );
    }
  } finally {
    ctx.restore();
  }
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
