import { UserMapImportError } from "../errors";
import type { PixelSize } from "../transform/projection";
import { PREVIEW_MAX_DIMENSION } from "./geoTiffSource";

export type DecodedImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
};

export type DecodeImage = (blob: Blob) => Promise<DecodedImage>;
export type RescaleImage = (decoded: DecodedImage, size: PixelSize) => Promise<Blob>;

export type ParsedImage = {
  /** ORIGINAL dimensions. GCPs live in this space, never in preview space. */
  pixelSize: PixelSize;
  preview: Blob;
  previewSize: PixelSize;
};

/** jsdom has neither createImageBitmap nor a canvas by default, so both
 * halves are injectable seams — the same closure-injection convention
 * `geoTiffSource.ts` uses for `makePreview`. */
async function decodeWithImageBitmap(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob);
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    close: () => bitmap.close(),
  };
}

async function rescaleWithCanvas(
  decoded: DecodedImage,
  size: PixelSize,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(
          new UserMapImportError(
            "corrupt-file",
            "This browser could not prepare the map preview.",
          ),
        );
      }
    }, "image/png");
  });
}

/**
 * Decodes a plain scan for the georeferencer. Unlike the GeoTIFF path there
 * is no georeferencing to extract — only pixels and a display-sized preview.
 */
export async function parseImage(
  blob: Blob,
  options: { decode?: DecodeImage; rescale?: RescaleImage } = {},
): Promise<ParsedImage> {
  const decode = options.decode ?? decodeWithImageBitmap;
  const rescale = options.rescale ?? rescaleWithCanvas;

  let decoded: DecodedImage;
  try {
    decoded = await decode(blob);
  } catch {
    throw new UserMapImportError(
      "corrupt-file",
      "This image could not be read. It may be truncated or in an " +
        "unsupported format.",
    );
  }

  try {
    const pixelSize: PixelSize = {
      width: decoded.width,
      height: decoded.height,
    };
    const longestEdge = Math.max(pixelSize.width, pixelSize.height);
    if (longestEdge <= PREVIEW_MAX_DIMENSION) {
      // Already display-sized: the uploaded file is its own preview. Avoids a
      // pointless re-encode and a second full-resolution copy in memory.
      return { pixelSize, preview: blob, previewSize: pixelSize };
    }
    const scale = PREVIEW_MAX_DIMENSION / longestEdge;
    const previewSize: PixelSize = {
      // Math.max(1, ...) guards extreme aspect ratios: a 40000x3 strip would
      // otherwise round its height to 0 and produce an unusable canvas.
      width: Math.max(1, Math.round(pixelSize.width * scale)),
      height: Math.max(1, Math.round(pixelSize.height * scale)),
    };
    const preview = await rescale(decoded, previewSize);
    return { pixelSize, preview, previewSize };
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  } finally {
    // Always release the decoded bitmap: on iOS Safari these count against an
    // aggregate canvas-memory budget, and leaking one per failed import is a
    // fast route to a blank map.
    decoded.close();
  }
}
