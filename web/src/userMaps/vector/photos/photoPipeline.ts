import { UserMapImportError } from "../../errors";
import { MAX_PHOTO_FILE_BYTES } from "./types";

/**
 * The contract's photo processing, identical on both surfaces: decode with
 * the camera's EXIF orientation applied, downscale to a 2048 px long edge,
 * re-encode as JPEG 0.8 with a 256 px 0.7 thumbnail. Re-encoding is also the
 * privacy mechanism — every stored and exported byte stream leaves the EXIF
 * behind, GPS included; the only location that survives is feature geometry
 * the user confirmed. Decode and encode are injectable seams because jsdom
 * has neither createImageBitmap nor canvas encoding; the dimension math is
 * exported pure for the same reason.
 */

export const FULL_LONG_EDGE_PX = 2_048;
export const FULL_JPEG_QUALITY = 0.8;
export const THUMB_LONG_EDGE_PX = 256;
export const THUMB_JPEG_QUALITY = 0.7;

export type ProcessedPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

export type PhotoPipelineDeps = {
  decodeImage: (file: File) => Promise<ImageBitmap>;
  encodeJpeg: (
    image: ImageBitmap,
    width: number,
    height: number,
    quality: number,
  ) => Promise<Blob>;
};

/** Never upscales; rounds to whole pixels; preserves aspect. */
export function targetDimensions(
  width: number,
  height: number,
  longEdgePx: number,
): { width: number; height: number } {
  const scale = Math.min(1, longEdgePx / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function defaultDecode(file: File): Promise<ImageBitmap> {
  // "from-image" applies the EXIF orientation before we re-encode — the
  // re-encode drops the orientation tag along with everything else, so the
  // pixels must already be upright.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

async function defaultEncode(
  image: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas 2d context unavailable");
  }
  // PNG alpha flattens onto white rather than JPEG's default black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("jpeg encoding failed")),
      "image/jpeg",
      quality,
    );
  });
}

export async function processPhoto(
  file: File,
  deps: PhotoPipelineDeps = { decodeImage: defaultDecode, encodeJpeg: defaultEncode },
): Promise<ProcessedPhoto> {
  if (file.size > MAX_PHOTO_FILE_BYTES) {
    throw new UserMapImportError(
      "too-large",
      "This photo is over 50 MB — far past any camera output. It wasn't added.",
    );
  }
  let image: ImageBitmap;
  try {
    image = await deps.decodeImage(file);
  } catch {
    // Distinct from a storage failure: the browser cannot show these pixels.
    // HEIC decodes in Safari only; EXIF still reads elsewhere.
    throw new UserMapImportError(
      "unsupported-image",
      "This photo format can't be displayed in this browser — HEIC works in Safari; elsewhere convert to JPEG first. It wasn't added.",
    );
  }
  try {
    const full = targetDimensions(image.width, image.height, FULL_LONG_EDGE_PX);
    const thumb = targetDimensions(image.width, image.height, THUMB_LONG_EDGE_PX);
    return {
      full: await deps.encodeJpeg(image, full.width, full.height, FULL_JPEG_QUALITY),
      thumb: await deps.encodeJpeg(
        image,
        thumb.width,
        thumb.height,
        THUMB_JPEG_QUALITY,
      ),
      width: full.width,
      height: full.height,
    };
  } finally {
    image.close?.();
  }
}
