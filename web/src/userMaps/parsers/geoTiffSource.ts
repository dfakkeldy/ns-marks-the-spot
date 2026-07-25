import { fromArrayBuffer } from "geotiff";
import type { GeoTIFFImage, TypedArrayWithDimensions } from "geotiff";
import { UserMapImportError } from "../errors";
import {
  validateCrs,
  type EmbeddedGeoref,
  type PixelSize,
} from "../transform/projection";

export const PREVIEW_MAX_DIMENSION = 4096;

export type MakePreview = (
  rgb: Uint8Array,
  width: number,
  height: number,
) => Promise<Blob>;

export type ParsedGeoTiff = {
  pixelSize: PixelSize;
  georef: EmbeddedGeoref;
  preview: Blob;
  previewSize: PixelSize;
};

/**
 * Smallest image (base or overview) whose longest edge still covers the
 * preview target, so huge rasters decode from an overview instead of the
 * base image. Falls back to index 0 (the base) when nothing covers it —
 * upscaling an overview would fabricate detail.
 */
export function chooseImageIndex(sizes: PixelSize[], target: number): number {
  let best = 0;
  let bestMax = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sizes.length; i += 1) {
    const max = Math.max(sizes[i].width, sizes[i].height);
    if (max >= target && max < bestMax) {
      best = i;
      bestMax = max;
    }
  }
  return best;
}

type GeoTiffDirectory = {
  ModelPixelScale?: number[];
  ModelTiepoint?: number[];
  ModelTransformation?: number[];
};

type GeoKeyBag = {
  ProjectedCSTypeGeoKey?: number;
  GeographicTypeGeoKey?: number;
  GTRasterTypeGeoKey?: number;
  GTCitationGeoKey?: string;
  PCSCitationGeoKey?: string;
};

function geotransformFrom(
  directory: GeoTiffDirectory,
  pixelIsPoint: boolean,
): EmbeddedGeoref["geotransform"] | null {
  const { ModelPixelScale: scale, ModelTiepoint: tie, ModelTransformation: m } =
    directory;
  if (m) {
    if (m.length < 16) {
      // The tag is defined as a full 4x4 matrix; anything shorter is broken.
      return null;
    }
    // Row-major 4x4 affine: x' = m0·x + m1·y + m3; y' = m4·x + m5·y + m7.
    return [m[3], m[0], m[1], m[7], m[4], m[5]];
  }
  if (scale && scale.length >= 2 && tie && tie.length >= 6) {
    if (tie.length > 6) {
      // Multiple tiepoints without a transformation matrix = irregular
      // georeferencing we do not support; treat as ungeoreferenced.
      return null;
    }
    let originX = tie[3] - tie[0] * scale[0];
    let originY = tie[4] + tie[1] * scale[1];
    if (pixelIsPoint) {
      // PixelIsPoint ties the CENTRE of the pixel; area semantics shift the
      // origin back half a pixel (north-up: y resolution is negative).
      originX -= scale[0] / 2;
      originY += scale[1] / 2;
    }
    return [originX, scale[0], 0, originY, 0, -scale[1]];
  }
  return null;
}

function crsFrom(geoKeys: GeoKeyBag): string | null {
  const epsg = geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey;
  if (epsg && epsg !== 32767) {
    return `EPSG:${epsg}`;
  }
  // User-defined CRS: best-effort — some producers put a proj4/WKT string in
  // the citation keys, which proj4 can parse directly. validateCrs decides.
  const citation = geoKeys.PCSCitationGeoKey ?? geoKeys.GTCitationGeoKey;
  return citation ?? null;
}

/** 16-bit samples scale down (>>8); anything else clamps into 8-bit. */
function toUint8Rgb(raw: ArrayLike<number>): Uint8Array {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  const out = new Uint8Array(raw.length);
  const shift = raw instanceof Uint16Array;
  for (let i = 0; i < raw.length; i += 1) {
    const v = shift ? raw[i] >> 8 : raw[i];
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

export async function parseGeoTiff(
  buffer: ArrayBuffer,
  options: { makePreview?: MakePreview } = {},
): Promise<ParsedGeoTiff> {
  const makePreview = options.makePreview ?? domCanvasPreview;

  let width: number;
  let height: number;
  let geoKeys: GeoKeyBag;
  let directory: GeoTiffDirectory;
  let imageSizes: PixelSize[];
  let getImage: (index: number) => Promise<GeoTIFFImage>;
  try {
    const tiff = await fromArrayBuffer(buffer);
    const count = await tiff.getImageCount();
    // Explicitly typed: `images` is captured by the `getImage` closure below,
    // which defeats TS's "evolving array" inference and leaves it implicitly
    // `any[]` (a real noImplicitAny error under this repo's strict config).
    const images: GeoTIFFImage[] = [];
    for (let i = 0; i < count; i += 1) {
      images.push(await tiff.getImage(i));
    }
    const base = images[0];
    width = base.getWidth();
    height = base.getHeight();
    geoKeys = (base.getGeoKeys() ?? {}) as GeoKeyBag;
    directory = base.getFileDirectory() as GeoTiffDirectory;
    imageSizes = images.map((img) => ({
      width: img.getWidth(),
      height: img.getHeight(),
    }));
    getImage = async (index) => images[index];
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "This file could not be read as a GeoTIFF. It may be truncated or corrupt.",
    );
  }

  const pixelIsPoint = geoKeys.GTRasterTypeGeoKey === 2;
  const geotransform = geotransformFrom(directory, pixelIsPoint);
  const crs = crsFrom(geoKeys);
  if (!geotransform || !crs) {
    throw new UserMapImportError(
      "no-georeferencing",
      "No georeferencing found in this file. The georeferencer (next update) " +
        "will handle plain scans.",
    );
  }
  validateCrs(crs); // throws unsupported-crs with the CRS in the message

  const downScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(width, height));
  const previewSize: PixelSize = {
    width: Math.max(1, Math.round(width * downScale)),
    height: Math.max(1, Math.round(height * downScale)),
  };

  let rgb: Uint8Array;
  try {
    // Decode from the smallest sufficient overview. Note: geotiff still
    // materializes that image's source tiles transiently during the read;
    // the cap bounds the RETAINED output, not the decode peak.
    const source = await getImage(chooseImageIndex(imageSizes, PREVIEW_MAX_DIMENSION));
    // geotiff's readRGB return type is a union that also covers the
    // non-interleaved (TypedArray[]) shape, because the type doesn't
    // discriminate on the `interleave` option's literal value. We always
    // pass `interleave: true`, so the result is always a single interleaved
    // typed array — verified against geotiff@2.1.3's runtime behavior.
    const raw = (await source.readRGB({
      interleave: true,
      width: previewSize.width,
      height: previewSize.height,
    })) as TypedArrayWithDimensions;
    rgb = toUint8Rgb(raw);
  } catch {
    throw new UserMapImportError(
      "corrupt-file",
      "The image data in this GeoTIFF could not be decoded.",
    );
  }

  const preview = await makePreview(rgb, previewSize.width, previewSize.height);

  return {
    pixelSize: { width, height },
    georef: { kind: "embedded", crs, geotransform },
    preview,
    previewSize,
  };
}

/** RGB → RGBA bytes; shared by both preview implementations. */
export function rgbToRgba(
  rgb: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255;
  }
  return rgba;
}

/** Main-thread fallback preview maker (DOM canvas). Workers use OffscreenCanvas. */
async function domCanvasPreview(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.putImageData(new ImageData(rgbToRgba(rgb, width, height), width, height), 0, 0);
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
